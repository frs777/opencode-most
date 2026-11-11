import { describe, expect, it, vi } from "vitest";
import { OpencodeSessionCli } from "../src/opencode/session-cli.js";
import { deleteSessionByLocator } from "../src/mcp/session-lifecycle.js";

describe("OpencodeSessionCli", () => {
  it("lists sessions in the selected project using OpenCode's JSON CLI", async () => {
    const run = vi.fn().mockResolvedValue({
      stdout: JSON.stringify([{ id: "ses_1", title: "Example session", directory: "/worktree" }]),
      stderr: ""
    });
    const cli = new OpencodeSessionCli("opencode", run);

    await expect(cli.listSessions("/repo")).resolves.toEqual([
      { id: "ses_1", title: "Example session", directory: "/worktree" }
    ]);
    expect(run).toHaveBeenCalledWith("opencode", ["session", "list", "--max-count", "1000", "--format", "json"], {
      cwd: "/repo",
      timeout: 30_000,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true
    });
  });

  it("deletes a session through the official OpenCode CLI without a shell", async () => {
    const run = vi.fn().mockResolvedValue({ stdout: "Session ses_1 deleted", stderr: "" });
    const cli = new OpencodeSessionCli("/usr/bin/opencode", run);

    await expect(cli.deleteSession("ses_1", "/repo")).resolves.toMatchObject({ output: "Session ses_1 deleted" });
    expect(run).toHaveBeenCalledWith("/usr/bin/opencode", ["session", "delete", "ses_1"], {
      cwd: "/repo",
      timeout: 30_000,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true
    });
  });

  it("rejects malformed session-list output instead of guessing", async () => {
    const cli = new OpencodeSessionCli("opencode", vi.fn().mockResolvedValue({ stdout: "not-json", stderr: "" }));
    await expect(cli.listSessions("/repo")).rejects.toThrow("valid JSON");
  });
});

describe("deleteSessionByLocator", () => {
  const target = { id: "ses_target", title: "Example session", directory: "/workspace/worktrees/sample-session" };

  it("finds by exact directory and title and deletes even when no Bridge mapping exists", async () => {
    const cli = {
      listSessions: vi.fn().mockResolvedValue([target, { id: "ses_other", title: "Example session", directory: "/another/worktree" }]),
      deleteSession: vi.fn().mockResolvedValue({ output: "deleted" })
    };
    const client = { getSessionStatus: vi.fn().mockResolvedValue({}) };
    const state = {
      listSessions: vi.fn().mockResolvedValue([]),
      removeSession: vi.fn()
    };

    await expect(deleteSessionByLocator({
      searchRoot: "/repo",
      sessionDirectory: target.directory,
      title: "Example session"
    }, cli, client, state)).resolves.toMatchObject({
      deleted: true,
      opencodeSessionId: "ses_target",
      mappingRemoved: 0,
      activeSelectionsCleared: 0
    });
    expect(cli.listSessions).toHaveBeenCalledWith("/repo");
    expect(cli.deleteSession).toHaveBeenCalledWith("ses_target", "/repo");
    expect(state.removeSession).not.toHaveBeenCalled();
  });

  it("refuses ambiguous matches and does not delete any session", async () => {
    const cli = {
      listSessions: vi.fn().mockResolvedValue([target, { ...target, id: "ses_duplicate" }]),
      deleteSession: vi.fn()
    };
    const client = { getSessionStatus: vi.fn() };
    const state = { listSessions: vi.fn(), removeSession: vi.fn() };

    await expect(deleteSessionByLocator({
      searchRoot: "/repo",
      sessionDirectory: target.directory,
      title: "Example session"
    }, cli, client, state)).rejects.toThrow("matched 2 sessions");
    expect(cli.deleteSession).not.toHaveBeenCalled();
  });

  it("refuses to delete a session that is still running", async () => {
    const cli = {
      listSessions: vi.fn().mockResolvedValue([target]),
      deleteSession: vi.fn()
    };
    const client = { getSessionStatus: vi.fn().mockResolvedValue({ ses_target: { type: "running" } }) };
    const state = { listSessions: vi.fn(), removeSession: vi.fn() };

    await expect(deleteSessionByLocator({
      searchRoot: "/repo",
      sessionDirectory: target.directory,
      title: "Example session"
    }, cli, client, state)).rejects.toThrow("still running");
    expect(cli.deleteSession).not.toHaveBeenCalled();
  });

  it("removes every matching Bridge mapping only after CLI deletion succeeds", async () => {
    const cli = {
      listSessions: vi.fn().mockResolvedValue([target]),
      deleteSession: vi.fn().mockResolvedValue({ output: "deleted" })
    };
    const client = { getSessionStatus: vi.fn().mockResolvedValue({ ses_target: { type: "idle" } }) };
    const state = {
      listSessions: vi.fn().mockResolvedValue([
        { bridgeSessionId: "bridge_1", opencodeSessionId: "ses_target" },
        { bridgeSessionId: "bridge_2", opencodeSessionId: "ses_other" },
        { bridgeSessionId: "bridge_3", opencodeSessionId: "ses_target" }
      ]),
      removeSession: vi.fn()
        .mockResolvedValueOnce({ removed: true, wasActive: true })
        .mockResolvedValueOnce({ removed: true, wasActive: false })
    };

    await expect(deleteSessionByLocator({
      searchRoot: "/repo",
      sessionDirectory: target.directory,
      title: "Example session"
    }, cli, client, state)).resolves.toMatchObject({
      deleted: true,
      opencodeSessionId: "ses_target",
      mappingRemoved: 2,
      activeSelectionsCleared: 1
    });
    expect(state.removeSession).toHaveBeenNthCalledWith(1, "bridge_1");
    expect(state.removeSession).toHaveBeenNthCalledWith(2, "bridge_3");
  });

  it("retains Bridge mappings if the official CLI deletion fails", async () => {
    const cli = {
      listSessions: vi.fn().mockResolvedValue([target]),
      deleteSession: vi.fn().mockRejectedValue(new Error("CLI delete failed"))
    };
    const client = { getSessionStatus: vi.fn().mockResolvedValue({}) };
    const state = {
      listSessions: vi.fn().mockResolvedValue([{ bridgeSessionId: "bridge_1", opencodeSessionId: "ses_target" }]),
      removeSession: vi.fn()
    };

    await expect(deleteSessionByLocator({
      searchRoot: "/repo",
      sessionDirectory: target.directory,
      title: "Example session"
    }, cli, client, state)).rejects.toThrow("CLI delete failed");
    expect(state.removeSession).not.toHaveBeenCalled();
  });
});

describe("session deletion input contract", () => {
  it("requires all exact locator fields for an unmapped session", async () => {
    const { deleteSessionByLocatorInputSchema } = await import("../src/mcp/tools.js");
    const schema = (await import("zod/v4")).z.object(deleteSessionByLocatorInputSchema).strict();
    expect(schema.safeParse({
      repoPath: "/repo",
      sessionDirectory: "/worktree",
      title: "Example session"
    }).success).toBe(true);
    expect(schema.safeParse({ repoPath: "/repo", title: "Example session" }).success).toBe(false);
    expect(schema.safeParse({
      repoPath: "/repo",
      sessionDirectory: "/worktree"
    }).success).toBe(false);
  });
});
