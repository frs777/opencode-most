import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { isAbsolute, resolve } from "node:path";
import { z } from "zod/v4";
import type { BridgeConfig, JsonValue } from "../types.js";
import { listProjects, validateRepoPath } from "../security/paths.js";
import { OpencodeProcessManager } from "../opencode/process.js";
import { StateStore } from "../state/store.js";
import { validateModelAgentSelection } from "../opencode/selection.js";
import { OpencodeSessionCli } from "../opencode/session-cli.js";
import { deleteCompletedSession, deleteSessionByLocator } from "./session-lifecycle.js";
import { safeTool } from "./results.js";

type RegisterContext = {
  config: BridgeConfig;
  processManager: OpencodeProcessManager;
  state: StateStore;
};

export const deleteSessionByLocatorInputSchema = {
  repoPath: z.string().min(1),
  sessionDirectory: z.string().min(1),
  title: z.string().min(1)
};

function json(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function sessionSummary(session: Record<string, unknown>) {
  return {
    id: session.id ?? null,
    title: session.title ?? null,
    agent: session.agent ?? null,
    model: session.model ?? null,
    outcome: session.outcome ?? null,
    time: session.time ?? null,
    location: session.location ?? (typeof session.directory === "string" ? { directory: session.directory } : null)
  };
}

export function createBridgeMcpServer(ctx: RegisterContext): McpServer {
  const sessionCli = new OpencodeSessionCli(ctx.config.opencodeBin);
  const server = new McpServer(
    { name: "opencode-chatgpt-bridge", version: "1.0.0-beta.1" },
    {
      capabilities: { logging: {} },
      instructions:
        "Use this server to control local OpenCode sessions. Keep one persistent active session per repository: call opencode_get_active_session(repoPath), then send subsequent messages with repoPath (do not create a session per request). Attach an existing session only when no active mapping exists. After async sends, use opencode_wait_for_completion instead of repeated polling. Select only enabled models and compatible primary agents using opencode_capabilities and opencode_select_model_agent. Delete mapped sessions with opencode_delete_session. For unmapped worktree sessions, use opencode_delete_session_by_locator with the exact title and directory; both paths refuse active sessions and clean matching Bridge mappings. Review get_diff before claiming code changes are complete."
    }
  );

  server.registerTool(
    "bridge_health",
    {
      title: "Bridge health",
      description: "Check the bridge configuration and managed opencode processes.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () =>
      safeTool(async () => ({
        ok: true,
        allowedRoots: ctx.config.allowedRoots,
        opencodeBaseUrl: ctx.config.opencodeBaseUrl ?? null,
        managedProcesses: json(ctx.processManager.list()),
        tokenAuthEnabled: Boolean(ctx.config.bridgeToken)
      }))
  );

  server.registerTool(
    "list_projects",
    {
      title: "List local projects",
      description: "List Git repositories under the configured allowed roots.",
      inputSchema: { depth: z.number().int().min(0).max(5).default(2) },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ depth }) => safeTool(async () => ({ projects: json(await listProjects(ctx.config.allowedRoots, depth)) }))
  );

  server.registerTool(
    "opencode_start",
    {
      title: "Start opencode server",
      description: "Start or reuse a local opencode server for a repo path within the allowed roots.",
      inputSchema: { repoPath: z.string().min(1) },
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ repoPath }) =>
      safeTool(async () => {
        const validated = await validateRepoPath(repoPath, ctx.config.allowedRoots);
        const managed = await ctx.processManager.ensure(validated);
        const client = ctx.processManager.clientFor(managed);
        return { ok: true, repoPath: validated, baseUrl: managed.baseUrl, health: json(await client.health()) };
      })
  );

  server.registerTool(
    "opencode_stop",
    {
      title: "Stop opencode server",
      description: "Stop managed opencode servers spawned by the bridge. Omitting repoPath stops all managed servers.",
      inputSchema: { repoPath: z.string().optional() },
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ repoPath }) =>
      safeTool(async () => {
        const validated = repoPath ? await validateRepoPath(repoPath, ctx.config.allowedRoots) : undefined;
        return { ok: true, ...(await ctx.processManager.stop(validated)) };
      })
  );

  server.registerTool(
    "opencode_create_session",
    {
      title: "Create opencode session",
      description: "Create an opencode session for a repo. Returns a bridgeSessionId used by other tools.",
      inputSchema: {
        repoPath: z.string().min(1),
        title: z.string().optional(),
        parentID: z.string().optional()
      },
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ repoPath, title, parentID }) =>
      safeTool(async () => {
        const validated = await validateRepoPath(repoPath, ctx.config.allowedRoots);
        const managed = await ctx.processManager.ensure(validated);
        const client = ctx.processManager.clientFor(managed);
        const session = await client.createSession(title, parentID, validated);
        const opencodeSessionId = String(session.id ?? session.ID ?? session.sessionID ?? "");
        if (!opencodeSessionId) throw new Error(`opencode returned a session without an id: ${JSON.stringify(session)}`);
        const confirmed = await client.getSession(opencodeSessionId);
        if (confirmed.location?.directory !== validated) {
          throw new Error(`OpenCode created session in ${confirmed.location?.directory ?? "<none>"}, expected ${validated}. Bridge mapping was not created.`);
        }
        const bridge = await ctx.state.createSession({
          opencodeSessionId,
          repoPath: validated,
          baseUrl: managed.baseUrl,
          title
        });
        await ctx.state.setActiveSession(validated, bridge.bridgeSessionId);
        return { ok: true, active: true, bridgeSession: json(bridge), opencodeSession: json(session) };
      })
  );

  server.registerTool(
    "opencode_list_sessions",
    {
      title: "List opencode sessions",
      description: "List bridge mappings, or live OpenCode sessions for a repoPath when supplied.",
      inputSchema: { repoPath: z.string().optional() },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ repoPath }) =>
      safeTool(async () => {
        if (!repoPath) return { repoPath: null, sessions: json(await ctx.state.listSessions()) };
        const validated = await validateRepoPath(repoPath, ctx.config.allowedRoots);
        const managed = await ctx.processManager.ensure(validated);
        const client = ctx.processManager.clientFor(managed);
        const [apiSessions, cliSessions, mappings] = await Promise.all([
          client.listSessions(),
          sessionCli.listSessions(validated),
          ctx.state.listSessions()
        ]);
        const sessionsById = new Map<string, Record<string, unknown>>();
        for (const session of cliSessions) {
          if (session.id) sessionsById.set(session.id, session);
        }
        for (const session of apiSessions) {
          if (session.id) sessionsById.set(session.id, { ...sessionsById.get(session.id), ...session });
        }
        return {
          repoPath: validated,
          sessions: json([...sessionsById.values()].map((session) => ({
            ...sessionSummary(session),
            bridgeSessionId: mappings.find(
              (mapping) => mapping.opencodeSessionId === session.id
            )?.bridgeSessionId ?? null
          })))
        };
      })
  );

  server.registerTool(
    "opencode_attach_session",
    {
      title: "Attach existing opencode session",
      description: "Attach an existing OpenCode session to the bridge without creating a new OpenCode session.",
      inputSchema: { repoPath: z.string().min(1), opencodeSessionId: z.string().min(1) },
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ repoPath, opencodeSessionId }) =>
      safeTool(async () => {
        const validated = await validateRepoPath(repoPath, ctx.config.allowedRoots);
        const managed = await ctx.processManager.ensure(validated);
        const client = ctx.processManager.clientFor(managed);
        const session = await client.getSession(opencodeSessionId);
        const existing = await ctx.state.findSession(validated, opencodeSessionId);
        const bridgeSession = existing ?? await ctx.state.createSession({
          opencodeSessionId,
          repoPath: validated,
          baseUrl: managed.baseUrl,
          title: typeof session.title === "string" ? session.title : undefined
        });
        await ctx.state.setActiveSession(validated, bridgeSession.bridgeSessionId);
        return { ok: true, attached: true, active: true, bridgeSession: json(bridgeSession), opencodeSession: json(sessionSummary(session)) };
      })
  );

  server.registerTool(
    "opencode_get_active_session",
    {
      title: "Get active opencode session",
      description: "Get the persistent active OpenCode session for a repository. Use this to continue the same session across separate ChatGPT requests.",
      inputSchema: { repoPath: z.string().min(1) },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ repoPath }) =>
      safeTool(async () => {
        const validated = await validateRepoPath(repoPath, ctx.config.allowedRoots);
        const session = await ctx.state.getActiveSession(validated);
        return { repoPath: validated, activeSession: session ? json(session) : null };
      })
  );

  server.registerTool(
    "opencode_set_active_session",
    {
      title: "Set active opencode session",
      description: "Select which existing Bridge session should receive future messages for this repository.",
      inputSchema: { repoPath: z.string().min(1), bridgeSessionId: z.string().min(1) },
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ repoPath, bridgeSessionId }) =>
      safeTool(async () => {
        const validated = await validateRepoPath(repoPath, ctx.config.allowedRoots);
        const session = await ctx.state.setActiveSession(validated, bridgeSessionId);
        return { ok: true, repoPath: validated, activeSession: json(session) };
      })
  );

  server.registerTool(
    "opencode_get_session_status",
    {
      title: "Get opencode session status",
      description: "Get status for an opencode session or all sessions in that repo.",
      inputSchema: { bridgeSessionId: z.string().min(1) },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ bridgeSessionId }) =>
      safeTool(async () => {
        const bridge = await ctx.state.getSession(bridgeSessionId);
        const managed = await ctx.processManager.ensure(bridge.repoPath);
        const client = ctx.processManager.clientFor(managed);
        const statuses = await client.getSessionStatus();
        return {
          bridgeSession: json(bridge),
          opencodeStatus: json(statuses[bridge.opencodeSessionId] ?? null),
          allStatuses: json(statuses)
        };
      })
  );

  server.registerTool(
    "opencode_delete_session",
    {
      title: "Delete completed OpenCode session",
      description: "Permanently delete an idle/completed OpenCode session by its exact Bridge session ID. Refuses running sessions and removes the Bridge mapping only after OpenCode confirms deletion.",
      inputSchema: { bridgeSessionId: z.string().min(1) },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
    },
    async ({ bridgeSessionId }) =>
      safeTool(async () => {
        const bridge = await ctx.state.getSession(bridgeSessionId);
        const managed = await ctx.processManager.ensure(bridge.repoPath);
        const client = ctx.processManager.clientFor(managed);
        return await deleteCompletedSession(bridgeSessionId, client, ctx.state);
      })
  );

  server.registerTool(
    "opencode_delete_session_by_locator",
    {
      title: "Delete unmapped OpenCode session by exact locator",
      description: "Find and permanently delete an idle OpenCode session without a Bridge ID. Requires repoPath (an existing allowed CLI search root), sessionDirectory (the exact stored session directory; it need not still exist), and title (exact, case-sensitive). Refuses missing or ambiguous matches and running sessions. Uses the official opencode session delete CLI command and removes any Bridge mappings only after deletion succeeds.",
      inputSchema: deleteSessionByLocatorInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
    },
    async ({ repoPath, sessionDirectory, title }) =>
      safeTool(async () => {
        if (!isAbsolute(sessionDirectory) || resolve(sessionDirectory) !== sessionDirectory) {
          throw new Error("sessionDirectory must be a normalized absolute path");
        }
        const validated = await validateRepoPath(repoPath, ctx.config.allowedRoots);
        const managed = await ctx.processManager.ensure(validated);
        const client = ctx.processManager.clientFor(managed);
        return await deleteSessionByLocator({
          searchRoot: validated,
          sessionDirectory,
          title
        }, sessionCli, client, ctx.state);
      })
  );

  server.registerTool(
    "opencode_send_message",
    {
      title: "Send opencode message",
      description: "Send a prompt to the persistent active session for repoPath. Pass bridgeSessionId only when deliberately targeting a different session; do not create a new session per message.",
      inputSchema: {
        bridgeSessionId: z.string().min(1).optional(),
        repoPath: z.string().min(1).optional(),
        text: z.string().min(1),
        async: z.boolean().default(true),
        providerID: z.string().optional(),
        modelID: z.string().optional(),
        variant: z.string().optional(),
        agent: z.string().optional(),
        noReply: z.boolean().optional()
      },
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async (input) =>
      safeTool(async () => {
        if (!input.bridgeSessionId && !input.repoPath) throw new Error("Provide repoPath to continue its active session, or bridgeSessionId to target a specific session");
        const validatedRepo = input.repoPath ? await validateRepoPath(input.repoPath, ctx.config.allowedRoots) : undefined;
        const bridge = input.bridgeSessionId
          ? await ctx.state.getSession(input.bridgeSessionId)
          : await ctx.state.getActiveSession(validatedRepo!);
        if (!bridge) throw new Error(`No active Bridge session for repository ${validatedRepo}. Attach or create a session first.`);
        if (validatedRepo && bridge.repoPath !== validatedRepo) throw new Error("bridgeSessionId does not belong to repoPath");
        if (input.bridgeSessionId) await ctx.state.setActiveSession(bridge.repoPath, bridge.bridgeSessionId);
        const managed = await ctx.processManager.ensure(bridge.repoPath);
        const client = ctx.processManager.clientFor(managed);
        const response = await client.sendMessage({
          sessionId: bridge.opencodeSessionId,
          text: input.text,
          async: input.async,
          providerID: input.providerID,
          modelID: input.modelID,
          variant: input.variant,
          agent: input.agent,
          noReply: input.noReply
        });
        await ctx.state.updateSession(bridge.bridgeSessionId, {});
        return { ok: true, async: input.async, bridgeSession: json(bridge), response: json(response ?? null) };
      })
  );

  server.registerTool(
    "opencode_wait_for_completion",
    {
      title: "Wait for opencode completion",
      description: "Wait on OpenCode's native SSE event stream until the active session for repoPath becomes idle. If it already finished, return immediately. Prefer repoPath to continue the same repository session across requests; use bridgeSessionId only to target a different session.",
      inputSchema: {
        bridgeSessionId: z.string().min(1).optional(),
        repoPath: z.string().min(1).optional(),
        timeoutSeconds: z.number().int().min(1).max(600).default(180)
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ bridgeSessionId, repoPath, timeoutSeconds }) =>
      safeTool(async () => {
        if (!bridgeSessionId && !repoPath) throw new Error("Provide repoPath to wait for its active session, or bridgeSessionId to target a specific session");
        const validatedRepo = repoPath ? await validateRepoPath(repoPath, ctx.config.allowedRoots) : undefined;
        const bridge = bridgeSessionId
          ? await ctx.state.getSession(bridgeSessionId)
          : await ctx.state.getActiveSession(validatedRepo!);
        if (!bridge) throw new Error(`No active Bridge session for repository ${validatedRepo}. Attach or create a session first.`);
        if (validatedRepo && bridge.repoPath !== validatedRepo) throw new Error("bridgeSessionId does not belong to repoPath");
        const managed = await ctx.processManager.ensure(bridge.repoPath);
        const client = ctx.processManager.clientFor(managed);
        const event = await client.waitForSessionIdle(bridge.opencodeSessionId, timeoutSeconds * 1000);
        await server.server.notification({
          method: "notifications/message",
          params: {
            level: "info",
            logger: "opencode.session",
            data: { type: "session.completed", bridgeSessionId, opencodeSessionId: bridge.opencodeSessionId, event }
          }
        });
        const messages = await client.getMessages(bridge.opencodeSessionId, 30);
        const latestAssistant = messages.find((message) => message.type === "assistant");
        const latestTerminal = messages.find((message) => message.type === "idle");
        return {
          completed: true,
          alreadyIdle: event.type === "already_idle",
          event: json(event),
          bridgeSession: json(bridge),
          latestAssistant: json(latestAssistant ?? null),
          latestTerminal: json(latestTerminal ?? null),
          messages: json(messages)
        };
      })
  );

  server.registerTool(
    "opencode_get_messages",
    {
      title: "Get opencode messages",
      description: "Fetch messages from a bridge session.",
      inputSchema: { bridgeSessionId: z.string().min(1), limit: z.number().int().min(1).max(200).optional() },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ bridgeSessionId, limit }) =>
      safeTool(async () => {
        const bridge = await ctx.state.getSession(bridgeSessionId);
        const managed = await ctx.processManager.ensure(bridge.repoPath);
        const client = ctx.processManager.clientFor(managed);
        return { bridgeSession: json(bridge), messages: json(await client.getMessages(bridge.opencodeSessionId, limit)) };
      })
  );

  server.registerTool(
    "opencode_get_diff",
    {
      title: "Get opencode diff",
      description: "Fetch file diffs for a bridge session. Call this before summarizing completed code work.",
      inputSchema: { bridgeSessionId: z.string().min(1), messageID: z.string().optional() },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ bridgeSessionId, messageID }) =>
      safeTool(async () => {
        const bridge = await ctx.state.getSession(bridgeSessionId);
        const managed = await ctx.processManager.ensure(bridge.repoPath);
        const client = ctx.processManager.clientFor(managed);
        return { bridgeSession: json(bridge), diff: json(await client.getDiff(bridge.opencodeSessionId, messageID)) };
      })
  );

  server.registerTool(
    "opencode_abort",
    {
      title: "Abort opencode session",
      description: "Abort a running opencode session.",
      inputSchema: { bridgeSessionId: z.string().min(1) },
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ bridgeSessionId }) =>
      safeTool(async () => {
        const bridge = await ctx.state.getSession(bridgeSessionId);
        const managed = await ctx.processManager.ensure(bridge.repoPath);
        const client = ctx.processManager.clientFor(managed);
        return { ok: await client.abortSession(bridge.opencodeSessionId) };
      })
  );

  server.registerTool(
    "opencode_respond_permission",
    {
      title: "Respond to opencode permission",
      description: "Allow or deny an opencode permission request surfaced in the session messages/status.",
      inputSchema: {
        bridgeSessionId: z.string().min(1),
        permissionId: z.string().min(1),
        response: z.enum(["allow", "deny", "once", "always"]),
        remember: z.boolean().default(false)
      },
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ bridgeSessionId, permissionId, response, remember }) =>
      safeTool(async () => {
        const bridge = await ctx.state.getSession(bridgeSessionId);
        const managed = await ctx.processManager.ensure(bridge.repoPath);
        const client = ctx.processManager.clientFor(managed);
        return { ok: await client.respondPermission(bridge.opencodeSessionId, permissionId, response, remember) };
      })
  );

  server.registerTool(
    "opencode_read_file",
    {
      title: "Read project file through opencode",
      description: "Read a file using opencode's server API.",
      inputSchema: { bridgeSessionId: z.string().min(1), path: z.string().min(1) },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ bridgeSessionId, path }) =>
      safeTool(async () => {
        const bridge = await ctx.state.getSession(bridgeSessionId);
        const managed = await ctx.processManager.ensure(bridge.repoPath);
        const client = ctx.processManager.clientFor(managed);
        return { file: await client.readFile(path) };
      })
  );

  server.registerTool(
    "opencode_find_files",
    {
      title: "Find project files through opencode",
      description: "Fuzzy find files in the current opencode project.",
      inputSchema: {
        bridgeSessionId: z.string().min(1),
        query: z.string().min(1),
        limit: z.number().int().min(1).max(200).default(50),
        directory: z.string().optional()
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ bridgeSessionId, query, limit, directory }) =>
      safeTool(async () => {
        const bridge = await ctx.state.getSession(bridgeSessionId);
        const managed = await ctx.processManager.ensure(bridge.repoPath);
        const client = ctx.processManager.clientFor(managed);
        return { files: json(await client.findFiles(query, limit, directory)) };
      })
  );

  server.registerTool(
    "opencode_vcs_status",
    {
      title: "Get VCS status",
      description: "Get opencode VCS and tracked file status for a bridge session.",
      inputSchema: { bridgeSessionId: z.string().min(1) },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ bridgeSessionId }) =>
      safeTool(async () => {
        const bridge = await ctx.state.getSession(bridgeSessionId);
        const managed = await ctx.processManager.ensure(bridge.repoPath);
        const client = ctx.processManager.clientFor(managed);
        return { vcs: json(await client.vcs()), files: json(await client.fileStatus()) };
      })
  );

  server.registerTool(
    "opencode_capabilities",
    {
      title: "List opencode capabilities",
      description: "List agents, slash commands, providers and the model catalog for the active session in repoPath, including enabled state, tool support, variants, context/output limits and pricing. Remaining provider-account quotas are not exposed by OpenCode.",
      inputSchema: { bridgeSessionId: z.string().min(1).optional(), repoPath: z.string().min(1).optional() },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ bridgeSessionId, repoPath }) =>
      safeTool(async () => {
        if (!bridgeSessionId && !repoPath) throw new Error("Provide repoPath to inspect its active session capabilities, or bridgeSessionId to target a specific session");
        const validatedRepo = repoPath ? await validateRepoPath(repoPath, ctx.config.allowedRoots) : undefined;
        const bridge = bridgeSessionId
          ? await ctx.state.getSession(bridgeSessionId)
          : await ctx.state.getActiveSession(validatedRepo!);
        if (!bridge) throw new Error(`No active Bridge session for repository ${validatedRepo}. Attach or create a session first.`);
        if (validatedRepo && bridge.repoPath !== validatedRepo) throw new Error("bridgeSessionId does not belong to repoPath");
        const managed = await ctx.processManager.ensure(bridge.repoPath);
        const client = ctx.processManager.clientFor(managed);
        const [agents, commands, providers, models] = await Promise.all([
          client.listAgents(),
          client.listCommands(),
          client.listProviders(),
          client.listModels()
        ]);
        return {
          agents: json(agents),
          commands: json(commands),
          providers: json(providers),
          models: json(models),
          quotaNote: "OpenCode exposes model context/input/output limits and pricing, but not remaining provider-account quota. Actual 429/rate-limit errors and Retry-After headers are forwarded from provider responses."
        };
      })
  );

  server.registerTool(
    "opencode_select_model_agent",
    {
      title: "Select OpenCode model and agent",
      description: "Validate and select a compatible enabled provider/model/agent combination for the active session in repoPath. Returns context and output limits, cost metadata and tool capabilities.",
      inputSchema: {
        bridgeSessionId: z.string().min(1).optional(),
        repoPath: z.string().min(1).optional(),
        providerID: z.string().min(1),
        modelID: z.string().min(1),
        variant: z.string().optional(),
        agent: z.string().min(1)
      },
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ bridgeSessionId, repoPath, providerID, modelID, variant, agent }) =>
      safeTool(async () => {
        if (!bridgeSessionId && !repoPath) throw new Error("Provide repoPath to select a model for its active session, or bridgeSessionId to target a specific session");
        const validatedRepo = repoPath ? await validateRepoPath(repoPath, ctx.config.allowedRoots) : undefined;
        const bridge = bridgeSessionId
          ? await ctx.state.getSession(bridgeSessionId)
          : await ctx.state.getActiveSession(validatedRepo!);
        if (!bridge) throw new Error(`No active Bridge session for repository ${validatedRepo}. Attach or create a session first.`);
        if (validatedRepo && bridge.repoPath !== validatedRepo) throw new Error("bridgeSessionId does not belong to repoPath");
        if (bridgeSessionId) await ctx.state.setActiveSession(bridge.repoPath, bridge.bridgeSessionId);
        const managed = await ctx.processManager.ensure(bridge.repoPath);
        const client = ctx.processManager.clientFor(managed);
        const [models, providers, agents] = await Promise.all([
          client.listModels(),
          client.listProviders(),
          client.listAgents()
        ]);
        const { model, provider, agent: selectedAgent } = validateModelAgentSelection({
          models: models as Array<Record<string, unknown>>,
          providers: providers as Array<Record<string, unknown>>,
          agents: agents as Array<Record<string, unknown>>,
          providerID,
          modelID,
          variant,
          agentID: agent
        });
        await client.selectModelAgent(bridge.opencodeSessionId, { providerID, modelID, variant, agent });
        return json({
          ok: true,
          bridgeSession: json(bridge),
          selection: { provider: { id: provider.id, name: provider.name, activation: provider.activation }, model: {
            id: model.id, modelID: model.modelID, name: model.name, status: model.status,
            enabled: model.enabled, limit: model.limit, cost: model.cost,
            capabilities: model.capabilities, variants: model.variants
          }, agent: { id: selectedAgent.id, name: selectedAgent.name, mode: selectedAgent.mode } },
          quotaNote: "OpenCode's model catalog exposes context/input/output limits and pricing, but not remaining provider-account quota. Actual 429/rate-limit responses must be treated as temporary provider limits."
        }) as { [key: string]: JsonValue };
      })
  );

  // ChatGPT Connector creation can be stricter than raw MCP clients.
 // The current MCP SDK adds experimental task execution metadata to every
 // registerTool() descriptor. We do not use task-augmented execution, so omit
 // it from tools/list for maximum Apps SDK compatibility.
 const registeredTools = (server as unknown as { _registeredTools?: Record<string, { execution?: unknown }> })._registeredTools;
 if (registeredTools) {
 for (const tool of Object.values(registeredTools)) {
 tool.execution = undefined;
 }
 }

 return server;
}
