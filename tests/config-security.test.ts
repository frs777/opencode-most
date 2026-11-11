import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";
import { initEnv } from "../src/config/bootstrap.js";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("Security: allowedHosts defaults", () => {
  it("defaults to loopback-only allowedHosts without a public hostname", () => {
    delete process.env.OPENCODE_BRIDGE_ALLOWED_HOSTS;
    const config = loadConfig([]);
    expect(config.allowedHosts).toEqual(["127.0.0.1", "localhost"]);
    expect(config.allowedHosts).not.toContain("bridge.example.ts.net");
  });

  it("allows overriding allowedHosts via CLI", () => {
    const config = loadConfig(["--allowed-hosts", "example.com,127.0.0.1"]);
    expect(config.allowedHosts).toContain("example.com");
    expect(config.allowedHosts).toContain("127.0.0.1");
  });

  it("allows overriding allowedHosts via env", () => {
    const orig = process.env.OPENCODE_BRIDGE_ALLOWED_HOSTS;
    process.env.OPENCODE_BRIDGE_ALLOWED_HOSTS = "custom.example.com";
    try {
      const config = loadConfig([]);
      expect(config.allowedHosts).toContain("custom.example.com");
    } finally {
      if (orig === undefined) delete process.env.OPENCODE_BRIDGE_ALLOWED_HOSTS;
      else process.env.OPENCODE_BRIDGE_ALLOWED_HOSTS = orig;
    }
  });
});

describe("Security: TAILSCALE_BIN default", () => {
  it("defaults TAILSCALE_BIN to 'tailscale' (PATH lookup, not macOS app path)", () => {
    const config = loadConfig([]);
    expect(config.tailscaleBin).toBe("tailscale");
    expect(config.tailscaleBin).not.toContain("/Applications/Tailscale.app");
  });

  it("allows overriding TAILSCALE_BIN via CLI", () => {
    const config = loadConfig(["--tailscale-bin", "/usr/bin/tailscale"]);
    expect(config.tailscaleBin).toBe("/usr/bin/tailscale");
  });
});

describe("Security: init default tunnel is none", () => {
  it("generates .env with OPENCODE_BRIDGE_TUNNEL=none", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bridge-sec-"));
    const envPath = join(dir, ".env");
    const result = await initEnv({ envPath, allowedRoots: [dir] });
    const content = await readFile(envPath, "utf8");
    expect(content).toContain("OPENCODE_BRIDGE_TUNNEL=none");
    expect(content).not.toContain("OPENCODE_BRIDGE_TUNNEL=tailscale");
  });

  it("does not include hardcoded macOS TAILSCALE_BIN path in .env", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bridge-sec-"));
    const envPath = join(dir, ".env");
    await initEnv({ envPath, allowedRoots: [dir] });
    const content = await readFile(envPath, "utf8");
    expect(content).not.toContain("/Applications/Tailscale.app");
    expect(content).toContain("TAILSCALE_BIN=tailscale");
  });
});

describe("Security: bridgeToken required for tunnel/non-loopback", () => {
  const origToken = process.env.OPENCODE_BRIDGE_TOKEN;
  const origTunnel = process.env.OPENCODE_BRIDGE_TUNNEL;
  const origHost = process.env.OPENCODE_BRIDGE_HOST;
  const origAllowedHosts = process.env.OPENCODE_BRIDGE_ALLOWED_HOSTS;

  beforeEach(() => {
    process.env.OPENCODE_BRIDGE_TOKEN = "";
    process.env.OPENCODE_BRIDGE_TUNNEL = "";
    process.env.OPENCODE_BRIDGE_HOST = "";
    delete process.env.OPENCODE_BRIDGE_ALLOWED_HOSTS;
  });

  afterEach(() => {
    if (origToken === undefined) process.env.OPENCODE_BRIDGE_TOKEN = "";
    else process.env.OPENCODE_BRIDGE_TOKEN = origToken;
    if (origTunnel === undefined) process.env.OPENCODE_BRIDGE_TUNNEL = "";
    else process.env.OPENCODE_BRIDGE_TUNNEL = origTunnel;
    if (origHost === undefined) process.env.OPENCODE_BRIDGE_HOST = "";
    else process.env.OPENCODE_BRIDGE_HOST = origHost;
    if (origAllowedHosts === undefined) process.env.OPENCODE_BRIDGE_ALLOWED_HOSTS = "";
    else process.env.OPENCODE_BRIDGE_ALLOWED_HOSTS = origAllowedHosts;
  });

  it("throws when tunnel=cloudflare without bridgeToken", () => {
    expect(() => loadConfig(["--tunnel", "cloudflare"])).toThrow(/OPENCODE_BRIDGE_TOKEN/);
  });

  it("throws when tunnel=tailscale without bridgeToken", () => {
    expect(() => loadConfig(["--tunnel", "tailscale"])).toThrow(/OPENCODE_BRIDGE_TOKEN/);
  });

  it("throws when host=0.0.0.0 without bridgeToken", () => {
    expect(() => loadConfig(["--host", "0.0.0.0"])).toThrow(/OPENCODE_BRIDGE_TOKEN/);
  });

  it("allows tunnel=none without bridgeToken", () => {
    const config = loadConfig(["--tunnel", "none"]);
    expect(config.tunnel).toBe("none");
  });

  it("allows loopback host with bridgeToken", () => {
    const config = loadConfig(["--host", "127.0.0.1", "--token", "secret"]);
    expect(config.host).toBe("127.0.0.1");
    expect(config.bridgeToken).toBe("secret");
  });
});

describe("Security: path.delimiter for allowedRoots", () => {
  it("splits allowedRoots by path.delimiter on this platform", () => {
    const sep = require("node:path").delimiter;
    const config = loadConfig(["--allowed-roots", `/tmp${sep}/var/tmp`]);
    expect(config.allowedRoots).toContain("/tmp");
    expect(config.allowedRoots).toContain("/var/tmp");
  });

  it("path.delimiter is used for platform-native path separation", () => {
    const sep = require("node:path").delimiter;
    expect(sep).toBeDefined();
    expect(typeof sep).toBe("string");
    expect(sep.length).toBeGreaterThan(0);
  });
});
