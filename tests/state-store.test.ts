import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StateStore } from "../src/state/store.js";

describe("StateStore session lookup", () => {
  it("removes a deleted session mapping and clears its active selection", async () => {
    directory = await mkdtemp(join(tmpdir(), "bridge-state-"));
    const state = new StateStore(directory);
    const session = await state.createSession({
      opencodeSessionId: "ses_done",
      repoPath: "/repo",
      baseUrl: "http://localhost:4096",
      title: "Finished"
    });
    await state.setActiveSession("/repo", session.bridgeSessionId);

    await expect(state.removeSession(session.bridgeSessionId)).resolves.toMatchObject({ removed: true, wasActive: true });
    await expect(state.getSession(session.bridgeSessionId)).rejects.toThrow("Unknown bridge session");
    await expect(state.getActiveSession("/repo")).resolves.toBeUndefined();
    await expect(state.listSessions()).resolves.toHaveLength(0);
  });
  let directory: string;

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it("finds an existing bridge mapping by repo and OpenCode session id", async () => {
    directory = await mkdtemp(join(tmpdir(), "bridge-state-"));
    const state = new StateStore(directory);
    const created = await state.createSession({
      opencodeSessionId: "ses_existing",
      repoPath: "/repo",
      baseUrl: "http://127.0.0.1:4096",
      title: "Existing work"
    });

    await expect(state.findSession("/repo", "ses_existing")).resolves.toMatchObject({
      bridgeSessionId: created.bridgeSessionId,
      opencodeSessionId: "ses_existing"
    });
    await expect(state.findSession("/other-repo", "ses_existing")).resolves.toBeUndefined();
    await expect(state.findSession("/repo", "ses_missing")).resolves.toBeUndefined();
  });

  it("persists one active bridge session per repository", async () => {
    directory = await mkdtemp(join(tmpdir(), "bridge-state-"));
    const state = new StateStore(directory);
    const first = await state.createSession({
      opencodeSessionId: "ses_first",
      repoPath: "/repo",
      baseUrl: "http://127.0.0.1:4096",
      title: "First"
    });
    const second = await state.createSession({
      opencodeSessionId: "ses_second",
      repoPath: "/repo",
      baseUrl: "http://127.0.0.1:4096",
      title: "Second"
    });

    await state.setActiveSession("/repo", first.bridgeSessionId);
    await expect(state.getActiveSession("/repo")).resolves.toMatchObject({
      bridgeSessionId: first.bridgeSessionId
    });

    await state.setActiveSession("/repo", second.bridgeSessionId);
    await expect(state.getActiveSession("/repo")).resolves.toMatchObject({
      bridgeSessionId: second.bridgeSessionId
    });
    await expect(state.getActiveSession("/other-repo")).resolves.toBeUndefined();
  });

  it("adopts the most recently updated existing mapping when migrating legacy state", async () => {
    directory = await mkdtemp(join(tmpdir(), "bridge-state-"));
    const state = new StateStore(directory);
    const first = await state.createSession({
      opencodeSessionId: "ses_legacy_first",
      repoPath: "/repo",
      baseUrl: "http://127.0.0.1:4096",
      title: "Old"
    });
    const second = await state.createSession({
      opencodeSessionId: "ses_legacy_second",
      repoPath: "/repo",
      baseUrl: "http://127.0.0.1:4096",
      title: "Recent"
    });

    await expect(state.getActiveSession("/repo")).resolves.toMatchObject({
      bridgeSessionId: second.bridgeSessionId
    });
    expect(first.bridgeSessionId).not.toBe(second.bridgeSessionId);
  });

  it("rejects setting an active session from another repository", async () => {
    directory = await mkdtemp(join(tmpdir(), "bridge-state-"));
    const state = new StateStore(directory);
    const session = await state.createSession({
      opencodeSessionId: "ses_wrong_repo",
      repoPath: "/repo-a",
      baseUrl: "http://127.0.0.1:4096"
    });

    await expect(state.setActiveSession("/repo-b", session.bridgeSessionId))
      .rejects.toThrow("does not belong to repository");
  });

});
