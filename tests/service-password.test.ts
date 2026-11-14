import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config/env.js";

const originalHome = process.env.HOME;
const originalPassword = process.env.OPENCODE_SERVER_PASSWORD;
const originalAuthDisabled = process.env.OPENCODE_SERVER_AUTH_DISABLED;
let tempHome: string | undefined;

afterEach(async () => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  if (originalPassword === undefined) delete process.env.OPENCODE_SERVER_PASSWORD;
  else process.env.OPENCODE_SERVER_PASSWORD = originalPassword;
  if (originalAuthDisabled === undefined) delete process.env.OPENCODE_SERVER_AUTH_DISABLED;
  else process.env.OPENCODE_SERVER_AUTH_DISABLED = originalAuthDisabled;
  if (tempHome) await rm(tempHome, { recursive: true, force: true });
  tempHome = undefined;
});

async function useTemporaryHome(): Promise<string> {
  tempHome = await mkdtemp(join(tmpdir(), "opencode-most-service-password-"));
  process.env.HOME = tempHome;
  const stateDir = join(tempHome, ".local", "state", "opencode");
  await mkdir(stateDir, { recursive: true });
  return join(stateDir, "service.json");
}

describe("OpenCode service password", () => {
  it("uses service.json as the authoritative credential source and exposes its path for live reads", async () => {
    const servicePath = await useTemporaryHome();
    await writeFile(servicePath, JSON.stringify({ password: "password-from-service-file" }));
    process.env.OPENCODE_SERVER_PASSWORD = "stale-env-password";

    const config = loadConfig([]);
    expect(config.opencodePassword).toBe("password-from-service-file");
    expect(config.opencodePasswordFile).toBe(servicePath);
  });

  it("does not fall back to OPENCODE_SERVER_PASSWORD when service.json is absent", async () => {
    await useTemporaryHome();
    process.env.OPENCODE_SERVER_PASSWORD = "legacy-env-password";

    const config = loadConfig([]);
    expect(config.opencodePassword).toBeUndefined();
    expect(config.opencodePasswordFile).toBe(join(tempHome!, ".local", "state", "opencode", "service.json"));
  });

  it("does not load or expose service credentials when OpenCode auth is explicitly disabled", async () => {
    const servicePath = await useTemporaryHome();
    await writeFile(servicePath, JSON.stringify({ password: "stale-service-password" }));
    process.env.OPENCODE_SERVER_AUTH_DISABLED = "1";

    const config = loadConfig([]);
    expect(config.opencodePassword).toBeUndefined();
    expect(config.opencodePasswordFile).toBeUndefined();
  });

  it("rejects malformed service.json instead of silently using a stale password", async () => {
    const servicePath = await useTemporaryHome();
    await writeFile(servicePath, "{invalid json");
    process.env.OPENCODE_SERVER_PASSWORD = "stale-env-password";

    expect(() => loadConfig([])).toThrow(/service\.json/);
  });

  it("allows service.json without a password field", async () => {
    const servicePath = await useTemporaryHome();
    await writeFile(servicePath, JSON.stringify({ remote: { route: "route-id" } }));

    expect(loadConfig([]).opencodePassword).toBeUndefined();
  });
});
