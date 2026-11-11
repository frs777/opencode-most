import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config/env.js";

const originalHome = process.env.HOME;
const originalPassword = process.env.OPENCODE_SERVER_PASSWORD;
let tempHome: string | undefined;

afterEach(async () => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  if (originalPassword === undefined) delete process.env.OPENCODE_SERVER_PASSWORD;
  else process.env.OPENCODE_SERVER_PASSWORD = originalPassword;
  if (tempHome) await rm(tempHome, { recursive: true, force: true });
  tempHome = undefined;
});

async function useTemporaryHome(): Promise<string> {
  tempHome = await mkdtemp(join(tmpdir(), "bridge-service-password-"));
  process.env.HOME = tempHome;
  const stateDir = join(tempHome, ".local", "state", "opencode");
  const legacyConfigDir = join(tempHome, ".config", "opencode");
  await mkdir(stateDir, { recursive: true });
  await mkdir(legacyConfigDir, { recursive: true });
  return join(stateDir, "service.json");
}

describe("OpenCode service password", () => {
  it("prefers the current password from service.json over a stale .env value", async () => {
    const servicePath = await useTemporaryHome();
    await writeFile(servicePath, JSON.stringify({ password: "password-from-service-file" }));
    await writeFile(join(tempHome!, ".config", "opencode", "service.json"), JSON.stringify({ password: "stale-config-password" }));
    process.env.OPENCODE_SERVER_PASSWORD = "stale-env-password";

    expect(loadConfig([]).opencodePassword).toBe("password-from-service-file");
  });

  it("falls back to the configured environment password when service.json is absent", async () => {
    await useTemporaryHome();
    process.env.OPENCODE_SERVER_PASSWORD = "legacy-env-password";

    expect(loadConfig([]).opencodePassword).toBe("legacy-env-password");
  });

  it("rejects malformed service.json instead of silently using a stale password", async () => {
    const servicePath = await useTemporaryHome();
    await writeFile(servicePath, "{invalid json");
    process.env.OPENCODE_SERVER_PASSWORD = "stale-env-password";

    expect(() => loadConfig([])).toThrow(/service\.json/);
  });

  it("rejects a missing or empty password in an existing service.json", async () => {
    const servicePath = await useTemporaryHome();
    await writeFile(servicePath, JSON.stringify({ password: "  " }));

    expect(() => loadConfig([])).toThrow(/password/);
  });
});
