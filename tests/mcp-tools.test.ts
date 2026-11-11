import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBridgeMcpServer } from "../src/mcp/tools.js";
import type { BridgeConfig } from "../src/types.js";
import { Client } from "@modelcontextprotocol/sdk/client";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory";

let allowedRoot: string;
let repoPath: string;

beforeAll(async () => {
  allowedRoot = await mkdtemp(join(tmpdir(), "opencode-bridge-mcp-tools-"));
  repoPath = join(allowedRoot, "my-repo");
  await mkdir(repoPath, { recursive: true });
});

afterAll(async () => {
  await rm(allowedRoot, { recursive: true, force: true });
});

function makeConfig(): BridgeConfig {
  return {
    host: "127.0.0.1",
    port: 4096,
    autoPort: false,
    allowedHosts: ["127.0.0.1", "localhost"],
    allowedRoots: [allowedRoot],
    bridgeToken: "test-token",
    opencodeBaseUrl: "http://127.0.0.1:4096",
    opencodeBin: "opencode",
    opencodeHost: "127.0.0.1",
    opencodePortStart: 4096,
    opencodeUsername: "opencode",
    opencodePassword: "secret",
    stateDir: join(allowedRoot, "state"),
    tunnel: "none",
    cloudflaredBin: "cloudflared",
    tailscaleBin: "tailscale"
  };
}

function makeMockState() {
  const sessions = new Map<string, any>();
  const activeSessions = new Map<string, string>();
  return {
    getSession: vi.fn(async (bridgeSessionId: string) => {
      const session = sessions.get(bridgeSessionId);
      if (!session) throw new Error(`Unknown bridge session: ${bridgeSessionId}`);
      return { ...session };
    }),
    createSession: vi.fn(async (input: { opencodeSessionId: string; repoPath: string; baseUrl: string; title?: string }) => {
      const id = `bridge_${sessions.size + 1}`;
      const entry = { bridgeSessionId: id, ...input, createdAt: Date.now(), updatedAt: Date.now() };
      sessions.set(id, entry);
      return entry;
    }),
    setActiveSession: vi.fn(async (path: string, bridgeSessionId: string) => {
      activeSessions.set(path, bridgeSessionId);
      return sessions.get(bridgeSessionId)!;
    }),
    removeSession: vi.fn(),
    listSessions: vi.fn(async () => Array.from(sessions.values()))
  };
}

function makeMockProcessManager(getSessionReturn: any = { id: "ses_new", location: { directory: repoPath } }) {
  const client = {
    createSession: vi.fn(async (_title?: string, _parentID?: string, directory?: string) => ({
      id: "ses_new",
      opencodeSessionId: "ses_new",
      directory
    })),
    getSession: vi.fn(async (_id: string) => getSessionReturn)
  };
  return {
    client,
    ensure: vi.fn(async (path: string) => ({
      repoPath: path,
      baseUrl: "http://127.0.0.1:4096",
      username: "opencode",
      password: "secret",
      startedAt: new Date().toISOString()
    })),
    clientFor: vi.fn(() => client)
  };
}

describe("opencode_create_session MCP tool", () => {
  it("creates a session and confirms its directory before mapping", async () => {
    const state = makeMockState();
    const processManager = makeMockProcessManager({ id: "ses_new", location: { directory: repoPath } });
    const ctx = { config: makeConfig(), processManager, state } as any;
    const server = createBridgeMcpServer(ctx);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const mcpClient = new Client({ name: "test-client", version: "1.0.0" } as any);
    await server.connect(serverTransport);
    await mcpClient.connect(clientTransport);

    const result = await mcpClient.callTool({
      name: "opencode_create_session",
      arguments: { repoPath, title: "Test session" }
    } as any);

    const structured = result.structuredContent as any;
    expect(structured.ok).toBe(true);
    expect(structured.active).toBe(true);
    expect(processManager.client.createSession).toHaveBeenCalledWith("Test session", undefined, repoPath);
    expect(processManager.client.getSession).toHaveBeenCalledWith("ses_new");
    expect(state.createSession).toHaveBeenCalled();
    expect(state.setActiveSession).toHaveBeenCalledWith(repoPath, expect.any(String));
  });

  it("does not map a session when OpenCode reports a different directory", async () => {
    const state = makeMockState();
    const processManager = makeMockProcessManager({ id: "ses_new", location: { directory: join(allowedRoot, "other-repo") } });
    const ctx = { config: makeConfig(), processManager, state } as any;
    const server = createBridgeMcpServer(ctx);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const mcpClient = new Client({ name: "test-client", version: "1.0.0" } as any);
    await server.connect(serverTransport);
    await mcpClient.connect(clientTransport);

    const result = await mcpClient.callTool({
      name: "opencode_create_session",
      arguments: { repoPath, title: "Test session" }
    } as any);

    const structured = result.structuredContent as any;
    expect(structured.ok).toBe(false);
    expect(structured.error).toContain(`expected ${repoPath}`);
    expect(processManager.client.createSession).toHaveBeenCalledWith("Test session", undefined, repoPath);
    expect(processManager.client.getSession).toHaveBeenCalledWith("ses_new");
    expect(state.createSession).not.toHaveBeenCalled();
    expect(state.setActiveSession).not.toHaveBeenCalled();
  });

  it("does not map a session when OpenCode omits the directory", async () => {
    const state = makeMockState();
    const processManager = makeMockProcessManager({ id: "ses_new", location: {} });
    const ctx = { config: makeConfig(), processManager, state } as any;
    const server = createBridgeMcpServer(ctx);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const mcpClient = new Client({ name: "test-client", version: "1.0.0" } as any);
    await server.connect(serverTransport);
    await mcpClient.connect(clientTransport);

    const result = await mcpClient.callTool({
      name: "opencode_create_session",
      arguments: { repoPath, title: "Test session" }
    } as any);

    const structured = result.structuredContent as any;
    expect(structured.ok).toBe(false);
    expect(processManager.client.createSession).toHaveBeenCalledWith("Test session", undefined, repoPath);
    expect(processManager.client.getSession).toHaveBeenCalledWith("ses_new");
    expect(state.createSession).not.toHaveBeenCalled();
    expect(state.setActiveSession).not.toHaveBeenCalled();
  });
});
