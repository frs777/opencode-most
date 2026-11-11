# OpenCode Most change log

## 2026-11-11 — Linux systemd user daemon

- Added a login-scoped systemd target with separate Bridge and Secure MCP Tunnel services.
- Added guarded installer/uninstaller scripts, a systemd credential wrapper, unit templates, and 12 regression tests.
- The tunnel key is delivered with `LoadCredential=` and exposed only to the tunnel process through the wrapper.
- Verified unit syntax, automatic restart behavior, readiness endpoints, and target stop/start behavior. The current user target and both services are active.
- Retired the redundant manual `most` launcher after the systemd daemon replaced its operational role. Its recovery copy remains outside the repository.
- Made the tunnel directory configurable through `TUNNEL_DIR`, `TUNNEL_BIN`, and `TUNNEL_KEY`; no machine-specific absolute home path is committed.
- The user subsequently authorized committing the reviewed repository state; no push is authorized.

## 2026-11-11 — 1.0.0-beta.1 repository cleanup and release preparation

### Changes

- Aligned the npm package and MCP server metadata on `1.0.0-beta.1`; pinned pnpm `11.18.0` in `package.json`. The ChatGPT app uses independent plugin versioning.
- Replaced outdated installation instructions and the stale TODO list with the current defaults, supported service mode and outstanding verification items.
- Added a documentation index and grouped implementation notes, roadmap proposals and research separately under `docs/`.
- Moved the reverse-bridge, Gemini, model-fallback and universal-gateway planning documents out of the repository root without discarding their contents.
- Removed two obsolete, unregistered `opencode-client` test drafts. Their MCP cases remain covered through the real in-memory MCP server tests.
- Made MCP session-creation tests use an isolated temporary directory instead of a developer-specific absolute path; replaced machine-specific paths and session labels in test fixtures.
- Removed private machine paths, Tailscale hostname and App ID references from publishable documentation/examples. Added ignore rules for local agent configuration and private plugin snapshots; `.env` remains excluded.
- Corrected the tunnel defaults: foreground mode is local-only unless explicitly configured; the macOS LaunchAgent configures Tailscale Funnel separately.
- Added a GitHub Actions workflow to run the frozen install and `pnpm validate` on pushes and pull requests to `main`.
- Replaced the obsolete Agent Plugin manifest with a ChatGPT App-compatible `.codex-plugin/plugin.json` template and a private-ID placeholder example.
- Synchronized five plugin skills with the installed ChatGPT app and documented its exact 22-action catalog. The local MCP server registers 23 tools; `opencode_delete_session_by_locator` is not exposed by the ChatGPT app.
- Updated the installed private ChatGPT app in place through Plugin Creator from version `1.0.0` to `1.0.1`. The existing App binding and private discoverability were preserved.

### Verification

- Runtime: Node.js `v22.23.4`; pnpm `11.18.0`.
- `pnpm install --frozen-lockfile` — passed.
- `pnpm validate` — passed: TypeScript typecheck, 14 test files / 107 tests, production build.
- `git diff --check` — passed.
- Relative Markdown links — passed.
- npm package and MCP server version — `1.0.0-beta.1`.
- Installed private ChatGPT app version — `1.0.1`.
- `pnpm pack --dry-run` — passed; package contains compiled `dist/`, package metadata, README and LICENSE. No private local files are included.

### Not yet verified

- The new GitHub Actions workflow has not run on GitHub; no push was performed.
- The user confirmed that the installed ChatGPT app has already operated in production against OpenCode, including simultaneous work by several agents. This production validation was not repeated during this documentation pass.
- Automatic resumption triggered solely by an unsolicited MCP completion notification was not separately observed in this pass; the supported explicit completion path is `opencode_wait_for_completion`.
- The separate Gemini bridge is not treated as a supported feature; the available evidence did not confirm successful generation.

---

## 2026-11-07 — persistent sessions, completion events, model selection and lifecycle

This entry records the current implementation state so later work can continue from the repository rather than relying on chat history.

### Implemented

- Migrated the Bridge OpenCode client to the server's v2 `/api/*` routes.
- Added persistent active-session mapping per repository. Subsequent prompts resolve the existing session by `repoPath`; creating a new session remains an explicit operation.
- Added attaching and switching existing sessions without creating a replacement session.
- Added native OpenCode SSE waiting for the matching session completion/idle event, with reconnect behavior and an MCP `notifications/message` completion notification.
- Added model/agent discovery and selection with provider/model availability, tool-calling compatibility, agent restrictions, variants, context/output limits and pricing metadata.
- Added `opencode_delete_session`: verifies the session exists, refuses non-idle sessions, deletes through the OpenCode v2 API, then removes the Bridge mapping only after a positive server confirmation.
- Clearing a deleted active session does not silently reactivate an older mapping.
- Added session lifecycle documentation and regression tests.

### Verification at this revision

- `pnpm validate` — passed (TypeScript typecheck, all tests, production build).
- `git diff --check` — passed.
- Test suite — 9 files, 43 tests passed.
- MCP `tools/list` — `opencode_delete_session` is advertised with a required `bridgeSessionId` and destructive-operation annotation.
- Bridge health endpoint — HTTP 200 after restart.

### Known limitation / follow-up

The Bridge emits MCP completion notifications and exposes `opencode_wait_for_completion`. Automatic ChatGPT model resumption triggered solely by an unsolicited MCP notification has not been verified; this depends on connector/client notification handling and must be tested separately.

### Working-tree policy

Changes are saved in the project working tree but are not committed. Preserve all existing modified and untracked files. Do not use `git reset`, `git clean`, or destructive overwrite operations while continuing this work.

### ChatGPT tool catalog refresh finding

The installed ChatGPT app currently exposes 22 actions. The local Bridge MCP server registers 23 tools; `opencode_delete_session_by_locator` is the additional server-side tool and is not exposed by the ChatGPT app. The plugin source documents the app's exact action catalog in `plugin-source/opencode-bridge/CHATGPT-TOOLS.md`. This is an app/server surface difference, not a missing server registration.


## 2026-11-07 — orphaned worktree session discovery and cleanup

### Implemented

- `opencode_list_sessions` merges the OpenCode HTTP API list with the official CLI session list so sessions in Git worktrees are visible, including their stored `directory`.
- Kept `opencode_delete_session` mapped-session contract unchanged.
- Added `opencode_delete_session_by_locator` for sessions without a Bridge mapping. It requires an allowed search root, exact stored session directory, and exact title; it refuses missing or ambiguous matches and refuses sessions reported as running.
- Uses `opencode session delete <sessionID>` through `execFile` (no shell interpolation). Matching Bridge mappings are removed only after CLI deletion succeeds; unrelated mappings and active selections are preserved.
- Added CLI adapter, lifecycle tests, README guidance, and the session-lifecycle procedure.

### Verification

- TDD: new CLI/locator tests failed before implementation, then passed after implementation.
- `pnpm validate` — passed: TypeScript typecheck, 10 test files / 56 tests, production build.
- `git diff --check` — passed.
- Real CLI discovery confirmed that sessions stored in a Git worktree can be found with their stored directory.
- Integration smoke test created and deleted a disposable session through the new locator lifecycle; OpenCode confirmed deletion, one Bridge mapping was removed, and the previously active Bridge session remained active.
- Local MCP `tools/list` — 23 tools, including the server-only locator deletion action. The installed ChatGPT app exposes 22 actions; see the 2026-11-11 plugin synchronization entry.
