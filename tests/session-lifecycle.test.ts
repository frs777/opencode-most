import { describe, expect, it, vi } from "vitest";
import { deleteCompletedSession } from "../src/mcp/session-lifecycle.js";

describe("deleteCompletedSession", () => {
  it("refuses to delete a session that is still running", async () => {
    const client = {
      getSession: vi.fn().mockResolvedValue({ id: "ses_1" }),
      getSessionStatus: vi.fn().mockResolvedValue({ ses_1: { type: "running" } }),
      deleteSession: vi.fn()
    };
    const state = {
      getSession: vi.fn().mockResolvedValue({ bridgeSessionId: "bridge_1", opencodeSessionId: "ses_1", repoPath: "/repo" }),
      removeSession: vi.fn()
    };

    await expect(deleteCompletedSession("bridge_1", client, state)).rejects.toThrow("still running");
    expect(client.deleteSession).not.toHaveBeenCalled();
    expect(state.removeSession).not.toHaveBeenCalled();
  });

  it("deletes an idle OpenCode session and removes its Bridge mapping", async () => {
    const client = {
      getSession: vi.fn().mockResolvedValue({ id: "ses_1" }),
      getSessionStatus: vi.fn().mockResolvedValue({ ses_1: { type: "idle" } }),
      deleteSession: vi.fn().mockResolvedValue(true)
    };
    const state = {
      getSession: vi.fn().mockResolvedValue({ bridgeSessionId: "bridge_1", opencodeSessionId: "ses_1", repoPath: "/repo" }),
      removeSession: vi.fn().mockResolvedValue({ removed: true, wasActive: true })
    };

    await expect(deleteCompletedSession("bridge_1", client, state)).resolves.toMatchObject({
      deleted: true,
      opencodeSessionId: "ses_1",
      mappingRemoved: true,
      activeSelectionCleared: true
    });
    expect(client.deleteSession).toHaveBeenCalledWith("ses_1");
    expect(state.removeSession).toHaveBeenCalledWith("bridge_1");
  });

  it("keeps the Bridge mapping when OpenCode does not confirm deletion", async () => {
    const client = {
      getSession: vi.fn().mockResolvedValue({ id: "ses_1" }),
      getSessionStatus: vi.fn().mockResolvedValue({}),
      deleteSession: vi.fn().mockResolvedValue(false)
    };
    const state = {
      getSession: vi.fn().mockResolvedValue({ bridgeSessionId: "bridge_1", opencodeSessionId: "ses_1", repoPath: "/repo" }),
      removeSession: vi.fn()
    };

    await expect(deleteCompletedSession("bridge_1", client, state)).rejects.toThrow("did not confirm");
    expect(state.removeSession).not.toHaveBeenCalled();
  });

  it("removes the mapping when OpenCode returns 404 (session already gone)", async () => {
    const client = {
      getSession: vi.fn().mockRejectedValue(new Error("opencode GET /api/session/ses_1 failed: 404 Not Found - SessionNotFoundError")),
      getSessionStatus: vi.fn(),
      deleteSession: vi.fn()
    };
    const state = {
      getSession: vi.fn().mockResolvedValue({ bridgeSessionId: "bridge_1", opencodeSessionId: "ses_1", repoPath: "/repo" }),
      removeSession: vi.fn().mockResolvedValue({ removed: true, wasActive: true })
    };

    await expect(deleteCompletedSession("bridge_1", client, state)).resolves.toMatchObject({
      deleted: true,
      opencodeSessionId: "ses_1",
      mappingRemoved: true,
      activeSelectionCleared: true
    });
    expect(client.getSession).toHaveBeenCalledWith("ses_1");
    expect(client.deleteSession).not.toHaveBeenCalled();
    expect(state.removeSession).toHaveBeenCalledWith("bridge_1");
  });

  it("removes the mapping when deleteSession returns 404 (session vanished meanwhile)", async () => {
    const client = {
      getSession: vi.fn().mockResolvedValue({ id: "ses_1" }),
      getSessionStatus: vi.fn().mockResolvedValue({}),
      deleteSession: vi.fn().mockRejectedValue(new Error("opencode DELETE /api/session/ses_1 failed: 404 Not Found - SessionNotFoundError"))
    };
    const state = {
      getSession: vi.fn().mockResolvedValue({ bridgeSessionId: "bridge_1", opencodeSessionId: "ses_1", repoPath: "/repo" }),
      removeSession: vi.fn().mockResolvedValue({ removed: true, wasActive: false })
    };

    await expect(deleteCompletedSession("bridge_1", client, state)).resolves.toMatchObject({
      deleted: true,
      opencodeSessionId: "ses_1",
      mappingRemoved: true,
      activeSelectionCleared: false
    });
    expect(client.deleteSession).toHaveBeenCalledWith("ses_1");
    expect(state.removeSession).toHaveBeenCalledWith("bridge_1");
  });

  it("keeps the mapping and rethrows on a non-404 OpenCode error", async () => {
    const client = {
      getSession: vi.fn().mockRejectedValue(new Error("opencode GET /api/session/ses_1 failed: 500 Internal Server Error")),
      getSessionStatus: vi.fn(),
      deleteSession: vi.fn()
    };
    const state = {
      getSession: vi.fn().mockResolvedValue({ bridgeSessionId: "bridge_1", opencodeSessionId: "ses_1", repoPath: "/repo" }),
      removeSession: vi.fn()
    };

    await expect(deleteCompletedSession("bridge_1", client, state)).rejects.toThrow("500");
    expect(state.removeSession).not.toHaveBeenCalled();
  });

  it("clears the active selection only for the deleted session, leaving another session's active mapping", async () => {
    const sessions: Array<{ bridgeSessionId: string; opencodeSessionId: string; repoPath: string }> = [
      { bridgeSessionId: "bridge_1", opencodeSessionId: "ses_1", repoPath: "/repo" },
      { bridgeSessionId: "bridge_2", opencodeSessionId: "ses_2", repoPath: "/repo2" }
    ];
    const activeSessions: Record<string, string> = { "/repo": "bridge_1", "/repo2": "bridge_2" };
    const client = {
      getSession: vi.fn().mockRejectedValue(new Error("opencode GET /api/session/ses_1 failed: 404 Not Found - SessionNotFoundError")),
      getSessionStatus: vi.fn(),
      deleteSession: vi.fn()
    };
    const state = {
      getSession: vi.fn().mockImplementation((id: string) => {
        const s = sessions.find((x) => x.bridgeSessionId === id);
        if (!s) throw new Error(`Unknown bridge session: ${id}`);
        return Promise.resolve(s);
      }),
      removeSession: vi.fn().mockImplementation((bridgeSessionId: string) => {
        const index = sessions.findIndex((s) => s.bridgeSessionId === bridgeSessionId);
        if (index < 0) return Promise.resolve({ removed: false, wasActive: false });
        const session = sessions[index];
        const wasActive = activeSessions[session.repoPath] === bridgeSessionId;
        sessions.splice(index, 1);
        if (wasActive) activeSessions[session.repoPath] = "";
        return Promise.resolve({ removed: true, wasActive });
      })
    };

    await expect(deleteCompletedSession("bridge_1", client, state)).resolves.toMatchObject({
      mappingRemoved: true,
      activeSelectionCleared: true
    });
    expect(activeSessions["/repo"]).toBe("");
    expect(activeSessions["/repo2"]).toBe("bridge_2");
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.bridgeSessionId).toBe("bridge_2");
  });
});
