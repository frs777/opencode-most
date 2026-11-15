# Installation and Setup

Local MCP bridge connecting ChatGPT to an OpenCode server running on your computer. MCP transport is Streamable HTTP under the `/mcp` endpoint.

## Requirements

- Node.js version 20 or newer
- pnpm version 11.18.0 (pinned in `package.json`; Corepack recommended)
- OpenCode installed and configured locally
- HTTPS endpoint/tunnel only when the bridge must be reachable remotely
- `cloudflared` when using the Cloudflare tunnel, or Tailscale when using Tailscale Funnel (both optional if you provide your own HTTPS endpoint)

## Installation

```bash
git clone https://github.com/frs777/opencode-most.git
cd opencode-most
pnpm install
pnpm run build
```

## Configuration

Create a local `.env` file in the repository directory:

```bash
pnpm run init -- --allowed-roots /path/to/your/projects
```

The command generates a random `OPENCODE_BRIDGE_TOKEN`, saves the allowed directory roots, and enables automatic fallback to the next free port if the default is occupied. It does not overwrite an existing `.env` without the `--force` flag.

Default settings:
- host: `127.0.0.1`
- port: `8787`
- automatic port fallback: enabled
- tunnel: disabled (`OPENCODE_BRIDGE_TUNNEL=none`)
- state directory: `~/.opencode-chatgpt-bridge`

Enable the tunnel explicitly in `.env` by setting `OPENCODE_BRIDGE_TUNNEL=cloudflare` or `OPENCODE_BRIDGE_TUNNEL=tailscale`. The required token is created by `init`. Install and configure the appropriate tunneling program before starting.

## Running

```bash
pnpm start
```

After startup, verify:
- `http://127.0.0.1:8787/health` — HTTP status (use the port printed by the process if fallback occurred)
- `http://127.0.0.1:8787/mcp` — MCP endpoint

The bridge prints connection instructions, including the public address if a tunnel is enabled. For ChatGPT, use the MCP address and Bearer authentication. If the client does not support the `Authorization` header, use the generated URL variant with the token.

## ChatGPT connection

In ChatGPT settings, enable Developer mode, create an MCP connection, and paste the address printed by the bridge. Availability and screen names depend on the current ChatGPT interface.

After connecting, check tools via `bridge_health` and `list_projects`. Before sending a task to a repository:
1. check the active session;
2. attach an existing session if it should be continued;
3. create a new session only if intended;
4. after work, check the diff via `opencode_get_diff`.

Full description of features, tools, and security model is in [`README.md`](README.md).

## Background service mode (macOS LaunchAgent)

The project contains LaunchAgent integration for macOS:

```bash
pnpm run build
pnpm run install-service
pnpm run service-status
```

Service uninstallation:

```bash
pnpm run uninstall-service
```

The LaunchAgent installer also configures Tailscale Funnel on public HTTPS port 10000. It requires Tailscale installed, logged in, and Funnel enabled. This command is not a service installer for Linux or Windows. On those platforms, run the bridge as a user process or configure your own supervised process.

## Linux background service (systemd --user)

On Linux, OpenCode Most can start automatically after you log in to your graphical session. The user service starts the local MCP bridge, waits for its health endpoint, then starts the existing Secure MCP Tunnel client. systemd restarts either process after a failure and stops both services when the graphical session ends.

From the repository root:

```bash
pnpm install
pnpm run build
pnpm run install-user-service
systemctl --user status opencode-most.target opencode-most.service opencode-most-tunnel.service
```

The installer uses the existing `.env`, tunnel-client binary, and tunnel key. By default it looks in `$HOME/Projekty/OmniCommanderMCP/tunnel-client-v0.0.16-linux-amd64/`; set `TUNNEL_DIR`, `TUNNEL_BIN`, or `TUNNEL_KEY` to override those paths. The key is supplied to systemd through `LoadCredential=`; it is not copied into this repository or embedded in a unit file. The installer refuses to overwrite units it does not own, but can safely refresh units previously installed by OpenCode Most.

To remove only the OpenCode Most user units:

```bash
pnpm run uninstall-user-service
```

The former manual `most` launcher has been retired. Use the systemd target to manage the Linux bridge and tunnel.

## Windows

Windows is **not supported natively** as a service platform. There are no Windows service scripts in this repository (only `systemd --user` for Linux and LaunchAgent for macOS).

To run OpenCode Most on Windows, use **WSL (Windows Subsystem for Linux)**:

1. Install WSL and a Linux distribution (e.g., Ubuntu) from the Microsoft Store.
2. Inside WSL, follow the Linux installation instructions above (Node.js, pnpm, OpenCode, `pnpm install`, `pnpm run build`).
3. The bridge can be run as a regular process with `pnpm start`.
4. systemd user services and LaunchAgent are not available in WSL by default; manage the bridge process manually or configure your own process supervisor.

The OpenCode server must be installed and authenticated inside the same WSL environment where the bridge runs.

## Diagnostics and tests

```bash
pnpm run doctor
pnpm run typecheck
pnpm test
pnpm run build
pnpm run validate
```

## Security

- Do not expose the bridge on a public interface without a token.
- Keep host `127.0.0.1` unless you consciously configure another network boundary.
- Limit `OPENCODE_BRIDGE_ALLOWED_ROOTS` to repositories ChatGPT may access.
- Do not publish `.env`, tokens, or credentials.
- The OpenCode server runs locally on loopback; only the bridge is exposed remotely.
- The bridge enables local code operations through OpenCode. Review diffs before committing or pushing changes.

## Credentials (OpenCode service.json)

The bridge reads OpenCode credentials from `~/.local/state/opencode/service.json` (fields `url` and `password`). This file is managed by OpenCode itself, not by the bridge.

- If `service.json` exists, its `url` and `password` fields are the source of truth and are reread for every OpenCode API request. Port changes and password rotation therefore take effect without restarting the bridge.
- The legacy `~/.config/opencode/service.json` path is not used.
- If `OPENCODE_SERVER_PASSWORD` is not set and `service.json` has no password, the bridge generates a random password per managed opencode server.
- If `OPENCODE_SERVER_AUTH_DISABLED=1`, credentials are not loaded from `service.json`.
- Credentials are never written to logs in plain form; the bridge masks tokens in HTTP responses (e.g., `/health` shows only the first and last 4 characters).