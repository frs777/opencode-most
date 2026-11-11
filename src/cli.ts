#!/usr/bin/env node
import process from "node:process";
import { execPath } from "node:process";
import { ChildProcess } from "node:child_process";
import { loadConfig } from "./config/env.js";
import { initEnv } from "./config/bootstrap.js";
import { createRuntime, startHttpServer } from "./server/http.js";
import { checkOpencodeCli } from "./opencode/setup.js";
import { getSetupGuide } from "./setupGuide.js";
import { startCloudflareTunnel } from "./tunnel/cloudflare.js";
import { startTailscaleFunnel } from "./tunnel/tailscale.js";
import { getServiceStatus, installService, uninstallService } from "./service/launchd.js";

function hasFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

function getArgValue(name: string): string | undefined {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === name) return argv[i + 1];
    if (item?.startsWith(`${name}=`)) return item.slice(name.length + 1);
  }
  return undefined;
}

function printHelp(): void {
  console.log(`opencode-most

Usage:
  opencode-most init [--allowed-roots <path:path>]
  opencode-most start [options]
  opencode-most doctor [options]
  opencode-most install-service
  opencode-most uninstall-service
  opencode-most service-status

Common options:
  --host <host>                  Bridge host, default 127.0.0.1
  --port <port>                  Bridge port, default 8787
  --allowed-roots <path:path>    Colon-separated repo roots ChatGPT may access
  --token <token>                Bearer token for /mcp
  --tunnel cloudflare|tailscale|none
                                  Start Cloudflare quick tunnel or Tailscale Funnel
  --tailscale-bin <bin>          Tailscale CLI path, default tailscale
  --opencode-bin <bin>           opencode binary, default opencode

Background mode on macOS:
  opencode-most install-service
  opencode-most service-status
  opencode-most uninstall-service

Recommended first run:
  opencode-most init --allowed-roots /path/to/repos
  opencode-most install-service
`);
}

function printServiceStatus(status: Awaited<ReturnType<typeof getServiceStatus>>): void {
  console.log(JSON.stringify(status, null, 2));
  if (status.loaded) {
    console.log(`Service is loaded${status.pid ? ` with pid ${status.pid}` : ""}.`);
  } else if (status.installed) {
    console.log("Service plist exists but is not loaded.");
  } else {
    console.log("Service is not installed.");
  }
  console.log(`Logs: ${status.stdoutPath}`);
  console.log(`Errors: ${status.stderrPath}`);
}

async function main(): Promise<void> {
  const command = process.argv[2]?.startsWith("--") ? "start" : process.argv[2] ?? "start";

  if (command === "help" || hasFlag("--help") || hasFlag("-h")) {
    printHelp();
    return;
  }

  if (command === "init") {
    const roots = getArgValue("--allowed-roots")?.split(":").filter(Boolean);
    const result = await initEnv({ allowedRoots: roots, force: hasFlag("--force") });
    if (result.created) {
      console.log(`Created ${result.path}`);
      console.log("Next: run `pnpm run build && pnpm run install-service` or `opencode-most install-service`.");
    } else {
      console.log(`${result.path} already exists. Use --force to overwrite.`);
    }
    return;
  }

  if (command === "install-service") {
    const config = loadConfig(process.argv.slice(3));
 const status = await installService({ repoDir: process.cwd(), nodeBin: execPath, tailscaleBin: config.tailscaleBin, bridgeToken: config.bridgeToken });
    printServiceStatus(status);
    return;
  }

  if (command === "uninstall-service") {
    const status = await uninstallService();
    printServiceStatus(status);
    return;
  }

  if (command === "service-status") {
    const status = await getServiceStatus();
    printServiceStatus(status);
    return;
  }

  const config = loadConfig(command === "start" || command === "doctor" ? process.argv.slice(3) : process.argv.slice(2));
  const opencodeStatus = await checkOpencodeCli(config);

  if (command === "doctor") {
    console.log(getSetupGuide({ config, localUrl: `http://${config.host}:${config.port}`, opencodeStatus }));
    return;
  }

  let tunnelProcess: { process: ChildProcess; url: Promise<string> } | undefined;
  let publicUrl: string | undefined;

  if (config.tunnel !== "none") {
    // Disable auto-port fallback when tunneling: tunnel must point to a stable port
    config.autoPort = false;
    const localUrl = `http://${config.host}:${config.port}`;

    if (config.tunnel === "cloudflare") {
      console.log("Starting Cloudflare quick tunnel...");
      tunnelProcess = startCloudflareTunnel(config.cloudflaredBin, localUrl);
    } else if (config.tunnel === "tailscale") {
      console.log("Starting Tailscale Funnel...");
      tunnelProcess = startTailscaleFunnel(config.tailscaleBin, localUrl);
    }

    publicUrl = await tunnelProcess!.url;
    const hostname = new URL(publicUrl).hostname;
    if (!config.allowedHosts.includes(hostname)) {
      config.allowedHosts.push(hostname);
    }
    process.once("exit", () => {
      if (tunnelProcess) tunnelProcess.process.kill("SIGTERM");
    });
  }

  const runtime = createRuntime(config);
  const localUrl = `http://${config.host}:${config.port}`;

  try {
    await startHttpServer(runtime);
  } catch (error) {
    tunnelProcess?.process.kill("SIGTERM");
    throw error;
  }

  console.log(getSetupGuide({ config, localUrl, publicUrl, opencodeStatus }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
