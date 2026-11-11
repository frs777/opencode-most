import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { BridgeSession } from "../types.js";

type StateFile = {
  sessions: BridgeSession[];
  activeSessions: Record<string, string>;
};

export class StateStore {
  private readonly file: string;

  constructor(private readonly stateDir: string) {
    this.file = join(stateDir, "sessions.json");
  }

  async listSessions(): Promise<BridgeSession[]> {
    return (await this.read()).sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async createSession(input: Omit<BridgeSession, "bridgeSessionId" | "createdAt" | "updatedAt">): Promise<BridgeSession> {
    const now = new Date().toISOString();
    const session: BridgeSession = {
      ...input,
      bridgeSessionId: randomUUID(),
      createdAt: now,
      updatedAt: now
    };
    const state = await this.read();
    state.sessions.push(session);
    await this.write(state);
    return session;
  }

  async findSession(repoPath: string, opencodeSessionId: string): Promise<BridgeSession | undefined> {
    return (await this.read()).sessions.find(
      (item) => item.repoPath === repoPath && item.opencodeSessionId === opencodeSessionId
    );
  }

  async getSession(bridgeSessionId: string): Promise<BridgeSession> {
    const session = (await this.read()).sessions.find((item) => item.bridgeSessionId === bridgeSessionId);
    if (!session) throw new Error(`Unknown bridge session: ${bridgeSessionId}`);
    return session;
  }

  async getActiveSession(repoPath: string): Promise<BridgeSession | undefined> {
    const state = await this.read();
    const bridgeSessionId = state.activeSessions[repoPath];
    const active = bridgeSessionId
      ? state.sessions.find((item) => item.bridgeSessionId === bridgeSessionId && item.repoPath === repoPath)
      : undefined;
    if (active) return active;
    if (Object.hasOwn(state.activeSessions, repoPath)) return undefined;

    // Migrate legacy state files by adopting the most recently used mapping once.
    const recent = state.sessions
      .filter((item) => item.repoPath === repoPath)
      .reverse()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    if (!recent) return undefined;
    state.activeSessions[repoPath] = recent.bridgeSessionId;
    await this.write(state);
    return recent;
  }

  async setActiveSession(repoPath: string, bridgeSessionId: string): Promise<BridgeSession> {
    const state = await this.read();
    const session = state.sessions.find((item) => item.bridgeSessionId === bridgeSessionId);
    if (!session) throw new Error(`Unknown bridge session: ${bridgeSessionId}`);
    if (session.repoPath !== repoPath) throw new Error(`Bridge session ${bridgeSessionId} does not belong to repository ${repoPath}`);
    state.activeSessions[repoPath] = bridgeSessionId;
    await this.write(state);
    return session;
  }

  async removeSession(bridgeSessionId: string): Promise<{ removed: boolean; wasActive: boolean }> {
    const state = await this.read();
    const index = state.sessions.findIndex((item) => item.bridgeSessionId === bridgeSessionId);
    if (index < 0) return { removed: false, wasActive: false };
    const session = state.sessions[index];
    if (!session) return { removed: false, wasActive: false };
    const wasActive = state.activeSessions[session.repoPath] === bridgeSessionId;
    state.sessions.splice(index, 1);
    if (wasActive) state.activeSessions[session.repoPath] = "";
    await this.write(state);
    return { removed: true, wasActive };
  }

  async updateSession(bridgeSessionId: string, patch: Partial<Omit<BridgeSession, "bridgeSessionId" | "createdAt">>): Promise<BridgeSession> {
    const state = await this.read();
    const index = state.sessions.findIndex((item) => item.bridgeSessionId === bridgeSessionId);
    if (index < 0) throw new Error(`Unknown bridge session: ${bridgeSessionId}`);
    const existing = state.sessions[index];
    if (!existing) throw new Error(`Unknown bridge session: ${bridgeSessionId}`);
    const updated: BridgeSession = {
      bridgeSessionId: existing.bridgeSessionId,
      createdAt: existing.createdAt,
      opencodeSessionId: patch.opencodeSessionId ?? existing.opencodeSessionId,
      repoPath: patch.repoPath ?? existing.repoPath,
      baseUrl: patch.baseUrl ?? existing.baseUrl,
      title: patch.title ?? existing.title,
      updatedAt: new Date().toISOString()
    };
    state.sessions[index] = updated;
    await this.write(state);
    return updated;
  }

  private async read(): Promise<StateFile> {
    await mkdir(this.stateDir, { recursive: true });
    try {
      const raw = await readFile(this.file, "utf8");
      const parsed = JSON.parse(raw) as StateFile;
      return { sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [], activeSessions: parsed.activeSessions && typeof parsed.activeSessions === "object" ? parsed.activeSessions : {} };
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
      if (code === "ENOENT") return { sessions: [], activeSessions: {} };
      throw error;
    }
  }

  private async write(state: StateFile): Promise<void> {
    await mkdir(this.stateDir, { recursive: true });
    await writeFile(this.file, JSON.stringify(state, null, 2) + "\n", "utf8");
  }
}
