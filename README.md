# OpenCode Most

**Current beta:** `1.0.0-beta.1`

OpenCode Most is a heavily modified fork of [yuga-hashimoto/opencode-chatgpt-bridge](https://github.com/yuga-hashimoto/opencode-chatgpt-bridge). It connects ChatGPT to your local OpenCode environment through an MCP endpoint and a secure tunnel, and supports coordinating multiple OpenCode agents in parallel without switching between ChatGPT and OpenCode.

This repository is not an unmodified upstream release. It adds multi-agent workflows, persistent session handling, richer model/agent selection, diagnostics, and a managed tunnel workflow.

```text
ChatGPT / ChatGPT Mobile
  -> HTTPS tunnel
  -> opencode-most /mcp
  -> local opencode serve
  -> local repository
```

This standalone project is focused on the ChatGPT <-> OpenCode bridge use case.

## Author

**frs** — `59541810+frs777@users.noreply.github.com`

![OpenCode Most logo](assets/images/opencode-most-logo.jpeg)

## Installation

Full installation, configuration, and service setup instructions are in [`INSTALL.md`](INSTALL.md).

## ChatGPT setup

Open ChatGPT Web and go to:

```text
https://chatgpt.com/#settings/Connectors
```

Manual path:

```text
Settings -> Apps & Connectors -> Advanced settings -> enable Developer mode
Settings -> Connectors -> Create
```

Use the values printed by the bridge. They look like this:

```text
Connector name: opencode local bridge
Description: Control local opencode sessions, inspect diffs, and manage local coding tasks.
Connector URL: https://example.trycloudflare.com/mcp?token=<generated-token>
```

If your ChatGPT connector UI supports auth headers, you can use the plain `/mcp` URL and set:

```text
Authorization: Bearer <OPENCODE_BRIDGE_TOKEN>
```

If not, use the printed `?token=` URL fallback.

Once linked on ChatGPT Web, the connector should be available in ChatGPT mobile apps as well.

## opencode setup

No extra opencode project configuration is required by the bridge, but opencode itself must be usable locally.

The bridge starts opencode like this:

```bash
OPENCODE_SERVER_USERNAME=opencode \
OPENCODE_SERVER_PASSWORD=<generated-or-env-password> \
opencode serve --hostname 127.0.0.1 --port <auto>
```

Notes:

- If `OPENCODE_SERVER_PASSWORD` is not set, the bridge generates a random password per managed opencode server.
- If `~/.local/state/opencode/service.json` exists, its `url` and `password` fields are the source of truth and are reread for every OpenCode API request. Port changes and password rotation therefore take effect without restarting the bridge. The legacy `~/.config/opencode/service.json` path is not used.
- If the service file has no `url`, `OPENCODE_BASE_URL` can specify an existing OpenCode server instead of spawning one.
- The opencode server is kept on `127.0.0.1`; only the bridge is exposed to ChatGPT.
- Provider/model login is handled by opencode. Run `opencode` in a terminal first and confirm it can answer/edit before using ChatGPT.

## Features

- Streamable HTTP MCP endpoint at `/mcp` for ChatGPT connectors and MCP clients.
- Per-repository `opencode serve` process management.
- Safe repository allow-listing with realpath checks.
- Bridge bearer token for exposed/tunneled use.
- URL-token fallback for connector UIs that do not support custom headers.
- Persistent bridge session mapping and one active OpenCode session per repository in `~/.opencode-chatgpt-bridge/sessions.json`.
- Event-driven completion waiting over OpenCode v2 SSE (`/api/event`), with immediate return when a response already exists and reconnect handling.
- Model/agent selection validated against provider activation, model availability, tool-calling support, model-pinned agents, variants, context/output limits, and pricing metadata.
- Provider-account remaining quotas are not exposed by OpenCode; HTTP 429 responses and `Retry-After` guidance are surfaced rather than inventing quota estimates.
- Tools for explicit session creation/attachment, persistent active sessions, async prompts, event-driven completion, message retrieval, diff review, abort, permission responses, file reads, file search, VCS status, agents, slash commands, and provider/model diagnostics.
- Optional Cloudflare quick tunnel launcher.
- TypeScript, strict typecheck, and unit tests.

## What you can do with OpenCode Most

- Ask ChatGPT to inspect and work with repositories on your computer through your configured OpenCode environment.
- Delegate independent parts of a task to multiple OpenCode agents and let them work in parallel.
- Keep work attached to existing OpenCode sessions across follow-up requests instead of starting a new session each time.
- Choose compatible models and agents for a task, then compare their results.
- Review changes and diffs, inspect project status, and approve or reject proposed modifications.
- Continue long-running tasks asynchronously and retrieve results when agents finish.
- Inspect available OpenCode providers, models, agents, and local service diagnostics.
- Use the secure tunnel to connect ChatGPT to the local MCP endpoint without exposing the OpenCode server itself.

## Example ChatGPT prompt

```text
Use OpenCode Most to inspect /path/to/my-repo. Reuse the existing OpenCode session for this repository. Identify suitable agents and models, delegate independent subtasks to multiple agents in parallel, and keep me informed of blockers. Do not create a new session unless I ask. When the work is complete, summarize the results and show me the changes for review before any commit or push.
```

## Security model

This bridge can cause local code modifications through opencode. Treat it as a local automation gateway.

Default protections:

- `opencode` itself is bound to `127.0.0.1`.
- Repositories must be under `OPENCODE_BRIDGE_ALLOWED_ROOTS`.
- The bridge supports bearer-token authentication and URL-token fallback.
- No arbitrary shell execution tool is exposed by this bridge.
- Diffs are first-class so clients can inspect changes before committing.

Strongly recommended:

- Always set `OPENCODE_BRIDGE_TOKEN` before exposing through any tunnel.
- Do not bind the bridge to `0.0.0.0` unless you know exactly what network can reach it.
- Keep `OPENCODE_BRIDGE_ALLOWED_ROOTS` narrow.
- Review `opencode_get_diff` before committing or pushing generated changes.

## Development

```bash
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
pnpm run validate
```

## License

MIT

## Documentation

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the architecture overview, component boundaries, request/response flow, session lifecycle, security model, and build/test process.

## Beta notice

This is a beta release (`1.0.0-beta.1`). Not all features may work correctly, and behavior may change between releases.
