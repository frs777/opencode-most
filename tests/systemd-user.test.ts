import { afterEach, describe, expect, it } from "vitest";
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const SYSTEMD_DIR = join(ROOT, "systemd");
const WRAPPER = join(ROOT, "scripts", "systemd", "run-tunnel-with-credential.sh");
const INSTALLER = join(ROOT, "scripts", "systemd", "install-user.sh");
const UNINSTALLER = join(ROOT, "scripts", "systemd", "uninstall-user.sh");
const tempDirs: string[] = [];

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; }
  catch { return false; }
}

async function tempDir(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "opencode-most-systemd-"));
  tempDirs.push(path);
  return path;
}

async function createCommandStub(path: string, logPath: string): Promise<void> {
  await writeFile(logPath, "", { flag: "a" });
  await writeFile(path, `#!/bin/sh
printf '%s\\n' "$*" >> "${logPath}"
exit 0
`);
  await chmod(path, 0o700);
}

async function installerEnvironment(directory: string): Promise<NodeJS.ProcessEnv> {
  const bin = join(directory, "bin");
  const unitDir = join(directory, "units");
  await mkdir(bin, { recursive: true });
  await mkdir(unitDir, { recursive: true });
  const key = join(directory, "tunnel.key");
  const log = join(directory, "commands.log");
  await writeFile(key, "test-only-secret-not-a-real-key\n", { mode: 0o600 });
  await createCommandStub(join(bin, "systemctl"), log);
  await createCommandStub(join(bin, "systemd-analyze"), log);
  return {
    ...process.env,
    OPENCODE_MOST_REPO_DIR: ROOT,
    SYSTEMD_USER_DIR: unitDir,
    NODE_BIN: "/usr/bin/node",
    TUNNEL_BIN: "/bin/true",
    TUNNEL_KEY: key,
    BRIDGE_PORT: "19090",
    SYSTEMCTL_BIN: join(bin, "systemctl"),
    SYSTEMD_ANALYZE_BIN: join(bin, "systemd-analyze"),
    TEST_COMMAND_LOG: log
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("OpenCode Most systemd assets", () => {
  it("uses the OpenCode Most package name while preserving the ChatGPT plugin name", async () => {
    const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
    expect(pkg.name).toBe("opencode-most");
    expect(pkg.bin["opencode-most"]).toBe("dist/cli.js");
    expect(pkg.scripts["install-user-service"]).toBe("bash scripts/systemd/install-user.sh");
    const readme = await readFile(join(ROOT, "README.md"), "utf8");
    expect(readme).toContain("heavily modified fork");
    expect(readme).toContain("without switching between ChatGPT and OpenCode");
    const manifest = JSON.parse(await readFile(join(ROOT, "plugin-source", "opencode-bridge", ".codex-plugin", "plugin.json"), "utf8"));
    expect(manifest.name).toBe("opencode-bridge");
  });

  it("provides the credential wrapper", async () => {
    expect(await exists(WRAPPER)).toBe(true);
  });

  it("passes the systemd credential only to the tunnel child process", async () => {
    if (!(await exists(WRAPPER))) return;
    const directory = await tempDir();
    const credentials = join(directory, "credentials");
    const fakeTunnel = join(directory, "fake-tunnel.sh");
    await mkdir(credentials);
    await writeFile(join(credentials, "control-plane-api-key"), "test-secret-value\n", { mode: 0o600 });
    await writeFile(fakeTunnel, '#!/bin/sh\nprintf "%s|%s\\n" "$CONTROL_PLANE_API_KEY" "$*"\n');
    await chmod(fakeTunnel, 0o700);

    const output = execFileSync("bash", [WRAPPER, fakeTunnel, "run", "--profile", "opencode-bridge"], {
      encoding: "utf8",
      env: { ...process.env, CREDENTIALS_DIRECTORY: credentials }
    });

    expect(output).toBe("test-secret-value|run --profile opencode-bridge\n");
  });

  it("fails closed when the systemd credential is unavailable", async () => {
    if (!(await exists(WRAPPER))) return;
    const directory = await tempDir();
    const result = spawnSync("bash", [WRAPPER, "/bin/true"], {
      encoding: "utf8",
      env: { ...process.env, CREDENTIALS_DIRECTORY: join(directory, "missing") }
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
  });

  it("defines the bridge service with restart policy and the repository working directory", async () => {
    const path = join(SYSTEMD_DIR, "opencode-most.service.in");
    expect(await exists(path)).toBe(true);
    if (!(await exists(path))) return;
    const unit = await readFile(path, "utf8");
    expect(unit).toContain("WorkingDirectory=@REPO_DIR@");
    expect(unit).toContain("ExecStart=@NODE_BIN@ @REPO_DIR@/dist/cli.js start");
    expect(unit).toContain("Restart=on-failure");
    expect(unit).toContain("WantedBy=opencode-most.target");
    expect(unit).toContain("PartOf=opencode-most.target");
  });

  it("orders the tunnel after the bridge and loads the key through systemd credentials", async () => {
    const path = join(SYSTEMD_DIR, "opencode-most-tunnel.service.in");
    expect(await exists(path)).toBe(true);
    if (!(await exists(path))) return;
    const unit = await readFile(path, "utf8");
    expect(unit).toContain("Requires=opencode-most.service");
    expect(unit).toContain("After=opencode-most.service");
    expect(unit).toContain("PartOf=opencode-most.service");
    expect(unit).toContain("PartOf=opencode-most.service opencode-most.target");
    expect(unit).toContain("LoadCredential=control-plane-api-key:@TUNNEL_KEY@");
    expect(unit).toContain("ExecStart=@REPO_DIR@/scripts/systemd/run-tunnel-with-credential.sh");
    expect(unit).toContain("Restart=on-failure");
    expect(unit).toContain("@BRIDGE_HEALTH_URL@");
    expect(unit).not.toContain("test-secret-value");
  });

  it("attaches the grouped services to the graphical login session", async () => {
    const path = join(SYSTEMD_DIR, "opencode-most.target");
    expect(await exists(path)).toBe(true);
    if (!(await exists(path))) return;
    const unit = await readFile(path, "utf8");
    expect(unit).toContain("Requires=opencode-most.service opencode-most-tunnel.service");
    expect(unit).toContain("WantedBy=graphical-session.target");
    expect(unit).toContain("PartOf=graphical-session.target");
  });

  it("installs rendered units and starts only the OpenCode Most target", async () => {
    expect(await exists(INSTALLER)).toBe(true);
    if (!(await exists(INSTALLER))) return;
    const directory = await tempDir();
    const env = await installerEnvironment(directory);
    const result = spawnSync("bash", [INSTALLER], { encoding: "utf8", env });
    expect(result.status, result.stderr).toBe(0);

    const unitDir = env.SYSTEMD_USER_DIR!;
    const bridge = await readFile(join(unitDir, "opencode-most.service"), "utf8");
    const tunnel = await readFile(join(unitDir, "opencode-most-tunnel.service"), "utf8");
    expect(bridge).toContain(`WorkingDirectory=${ROOT}`);
    expect(bridge).toContain("ExecStart=/usr/bin/node");
    expect(tunnel).toContain("http://127.0.0.1:19090/health");
    expect(tunnel).toContain(`LoadCredential=control-plane-api-key:${env.TUNNEL_KEY}`);
    expect(tunnel).not.toContain("test-only-secret-not-a-real-key");
    expect(await readFile(join(unitDir, "opencode-most.target"), "utf8")).toContain("graphical-session.target");

    const commands = await readFile(env.TEST_COMMAND_LOG!, "utf8");
    expect(commands).toContain("--user verify");
    expect(commands).toContain("--user daemon-reload");
    expect(commands).toContain("--user enable --now opencode-most.target");
  });

  it("refreshes previously installed OpenCode Most units", async () => {
    expect(await exists(INSTALLER)).toBe(true);
    if (!(await exists(INSTALLER))) return;
    const directory = await tempDir();
    const env = await installerEnvironment(directory);
    const unitDir = env.SYSTEMD_USER_DIR!;
    await writeFile(join(unitDir, "opencode-most.service"), "# Managed by OpenCode Most systemd installer.\\nold unit\\n");
    const result = spawnSync("bash", [INSTALLER], { encoding: "utf8", env });
    expect(result.status, result.stderr).toBe(0);
    const bridge = await readFile(join(unitDir, "opencode-most.service"), "utf8");
    expect(bridge).toContain(`WorkingDirectory=${ROOT}`);
    expect(bridge).not.toContain("old unit");
    expect(await exists(join(unitDir, "opencode-most-tunnel.service"))).toBe(true);
    expect(await exists(join(unitDir, "opencode-most.target"))).toBe(true);
  });

  it("refuses to overwrite a pre-existing unit", async () => {
    expect(await exists(INSTALLER)).toBe(true);
    if (!(await exists(INSTALLER))) return;
    const directory = await tempDir();
    const env = await installerEnvironment(directory);
    const unitDir = env.SYSTEMD_USER_DIR!;
    const existing = join(unitDir, "opencode-most.service");
    await writeFile(existing, "user-owned unit\n");
    const result = spawnSync("bash", [INSTALLER], { encoding: "utf8", env });
    expect(result.status).not.toBe(0);
    expect(await readFile(existing, "utf8")).toBe("user-owned unit\n");
    expect(await exists(join(unitDir, "opencode-most-tunnel.service"))).toBe(false);
    expect(await exists(env.TEST_COMMAND_LOG!)).toBe(true);
    expect(await readFile(env.TEST_COMMAND_LOG!, "utf8")).toBe("");
  });

  it("uninstalls only units bearing the OpenCode Most ownership marker", async () => {
    expect(await exists(UNINSTALLER)).toBe(true);
    if (!(await exists(UNINSTALLER))) return;
    const directory = await tempDir();
    const env = await installerEnvironment(directory);
    const unitDir = env.SYSTEMD_USER_DIR!;
    for (const name of ["opencode-most.service", "opencode-most-tunnel.service", "opencode-most.target"]) {
      await writeFile(join(unitDir, name), "# Managed by OpenCode Most systemd installer.\n[Unit]\n");
    }
    const unrelated = join(unitDir, "opencode-gemini-live-bridge.service");
    await writeFile(unrelated, "unrelated unit\n");
    const result = spawnSync("bash", [UNINSTALLER], { encoding: "utf8", env });
    expect(result.status, result.stderr).toBe(0);
    for (const name of ["opencode-most.service", "opencode-most-tunnel.service", "opencode-most.target"]) {
      expect(await exists(join(unitDir, name))).toBe(false);
    }
    expect(await readFile(unrelated, "utf8")).toBe("unrelated unit\n");
    const commands = await readFile(env.TEST_COMMAND_LOG!, "utf8");
    expect(commands).toContain("--user stop opencode-most.target opencode-most.service opencode-most-tunnel.service");
    expect(commands).toContain("--user disable --now opencode-most.target");
    expect(commands).toContain("--user daemon-reload");
  });

  it("refuses to remove a unit without the OpenCode Most ownership marker", async () => {
    expect(await exists(UNINSTALLER)).toBe(true);
    if (!(await exists(UNINSTALLER))) return;
    const directory = await tempDir();
    const env = await installerEnvironment(directory);
    const unitDir = env.SYSTEMD_USER_DIR!;
    const existing = join(unitDir, "opencode-most.service");
    await writeFile(existing, "user-owned unit\n");
    const result = spawnSync("bash", [UNINSTALLER], { encoding: "utf8", env });
    expect(result.status).not.toBe(0);
    expect(await readFile(existing, "utf8")).toBe("user-owned unit\n");
    expect(await readFile(env.TEST_COMMAND_LOG!, "utf8")).toBe("");
  });
});
