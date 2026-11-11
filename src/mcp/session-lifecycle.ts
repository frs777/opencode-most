import type { BridgeSession, OpencodeStatus } from "../types.js";

type SessionClient = {
  getSession(id: string): Promise<unknown>;
  getSessionStatus(): Promise<Record<string, OpencodeStatus>>;
  deleteSession(id: string): Promise<boolean>;
};
type SessionState = {
  getSession(bridgeSessionId: string): Promise<Pick<BridgeSession, "opencodeSessionId">>;
  removeSession(bridgeSessionId: string): Promise<{ removed: boolean; wasActive: boolean }>;
};

// OpenCode odpowiada 404 (SessionNotFoundError), gdy sesja już nie istnieje.
// Takie błąd oznacza, że sesja jest już po drugiej stronie usunięta — Bridge
// może wtedy bezpiecznie usunąć własne mapowanie. Każdy inny błąd musi
// zostawić mapowanie nienaruszone.
function isOpenCodeNotFound(error: unknown): boolean {
  return (
    error instanceof Error &&
    (/failed: 404 /.test(error.message) || error.message.includes("SessionNotFoundError"))
  );
}

export async function deleteCompletedSession(
  bridgeSessionId: string,
  client: SessionClient,
  state: SessionState
): Promise<{
  deleted: true;
  opencodeSessionId: string;
  mappingRemoved: boolean;
  activeSelectionCleared: boolean;
}> {
  const bridge = await state.getSession(bridgeSessionId);

  // 404 oznacza, że sesja OpenCode już nie istnieje: sprząta się tylko mapowanie
  // Bridge, a aktywne przypisanie zostaje wyczyszczone tylko wtedy, gdy nadal
  // wskazuje na tę sesję. Każdy inny błąd zostawia mapowanie nienaruszone.
  let sessionExists = true;
  try {
    // Confirm that the OpenCode session still exists before checking its runtime state.
    await client.getSession(bridge.opencodeSessionId);
  } catch (error) {
    if (!isOpenCodeNotFound(error)) throw error;
    sessionExists = false;
  }

  if (sessionExists) {
    const statuses = await client.getSessionStatus();
    const status = statuses?.[bridge.opencodeSessionId];
    if (status && status.type !== "idle") {
      throw new Error(`Cannot delete OpenCode session ${bridge.opencodeSessionId}: session is still running (status: ${status.type})`);
    }
    try {
      const deleted = await client.deleteSession(bridge.opencodeSessionId);
      if (!deleted) throw new Error(`OpenCode did not confirm deletion of session ${bridge.opencodeSessionId}; Bridge mapping was retained`);
    } catch (error) {
      if (!isOpenCodeNotFound(error)) throw error;
      // Sesja zniknęła między sprawdzeniem stanu a DELETE — traktuje jako już usuniętą.
    }
  }

  const mapping = await state.removeSession(bridgeSessionId);
  return {
    deleted: true,
    opencodeSessionId: bridge.opencodeSessionId,
    mappingRemoved: mapping.removed,
    activeSelectionCleared: mapping.wasActive
  };
}

export type SessionDeletionLocator = {
  searchRoot: string;
  sessionDirectory: string;
  title: string;
};

type SessionCli = {
  listSessions(cwd: string): Promise<Array<{ id?: string; title?: string; directory?: string }>>;
  deleteSession(id: string, cwd: string): Promise<{ output: string }>;
};

type LocatorSessionClient = {
  getSessionStatus(): Promise<Record<string, OpencodeStatus>>;
};

type LocatorSessionState = {
  listSessions(): Promise<BridgeSession[]>;
  removeSession(bridgeSessionId: string): Promise<{ removed: boolean; wasActive: boolean }>;
};

export async function deleteSessionByLocator(
  locator: SessionDeletionLocator,
  cli: SessionCli,
  client: LocatorSessionClient,
  state: LocatorSessionState
): Promise<{
  deleted: true;
  opencodeSessionId: string;
  title: string;
  directory: string;
  cliOutput: string;
  mappingRemoved: number;
  activeSelectionsCleared: number;
}> {
  const matches = (await cli.listSessions(locator.searchRoot)).filter(
    (session) => session.directory === locator.sessionDirectory && session.title === locator.title
  );
  if (matches.length === 0) {
    throw new Error(
      `No OpenCode session matched exact directory "${locator.sessionDirectory}" and title "${locator.title}"`
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `OpenCode session locator matched ${matches.length} sessions; refusing ambiguous deletion`
    );
  }

  const session = matches[0];
  if (!session?.id) throw new Error("OpenCode session list returned a match without an ID");

  const statuses = await client.getSessionStatus();
  const status = statuses?.[session.id];
  if (status && status.type !== "idle") {
    throw new Error(
      `Cannot delete OpenCode session ${session.id}: session is still running (status: ${String(status.type)})`
    );
  }

  const deletion = await cli.deleteSession(session.id, locator.searchRoot);
  const mappings = (await state.listSessions()).filter(
    (mapping) => mapping.opencodeSessionId === session.id
  );
  let mappingRemoved = 0;
  let activeSelectionsCleared = 0;
  for (const mapping of mappings) {
    const result = await state.removeSession(mapping.bridgeSessionId);
    if (result.removed) mappingRemoved += 1;
    if (result.wasActive) activeSelectionsCleared += 1;
  }

  return {
    deleted: true,
    opencodeSessionId: session.id,
    title: locator.title,
    directory: locator.sessionDirectory,
    cliOutput: deletion.output,
    mappingRemoved,
    activeSelectionsCleared
  };
}
