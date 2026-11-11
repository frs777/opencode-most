# OpenCode Bridge — session lifecycle

This document records the intended lifecycle for sessions managed through the ChatGPT MCP bridge.

## Persistent session per repository

1. Call `opencode_get_active_session` with `repoPath` before sending work.
2. If no active mapping exists, inspect `opencode_list_sessions` and attach the intended existing session with `opencode_attach_session`.
3. Create a session only when explicitly requested, using `opencode_create_session`.
4. Send subsequent requests with `repoPath` so the bridge resolves the repository's active session. Use `bridgeSessionId` only when deliberately targeting a different session.
5. For asynchronous work, call `opencode_wait_for_completion`. It listens to OpenCode's native SSE event stream and returns the latest assistant message after the matching session becomes idle.

## Model and agent selection

Use `opencode_capabilities` to inspect providers, enabled models, tool-calling support, variants, context/output limits and pricing. Use `opencode_select_model_agent` to validate and select a compatible model and primary agent for the active repository session. OpenCode does not expose remaining account-level provider quotas; actual rate-limit responses and `Retry-After` information are forwarded instead of estimated.

## Deleting a completed session

`opencode_list_sessions` merges the OpenCode HTTP API list with the official CLI's `opencode session list --max-count 1000 --format json` output. This includes sessions created in Git worktrees that may not appear in the API list for the current directory. Each result exposes its stored worktree directory in `location.directory`.

### Mapped session

Call `opencode_delete_session` with the exact `bridgeSessionId`. The operation resolves the Bridge mapping, checks the session status, and deletes through the OpenCode v2 `DELETE /api/session/{sessionID}` endpoint. The mapping is removed only after confirmed deletion. If that mapping was active, only its active selection is cleared. A 404 means the OpenCode session is already gone, so the stale mapping can be removed; other API errors retain it.

### Unmapped or worktree session

A session can exist in OpenCode even when its Bridge mapping is missing. The local MCP server registers `opencode_delete_session_by_locator` with three exact selectors. The currently installed ChatGPT app does not expose this action. Use it only from an MCP client whose tool catalog includes it:

```json
{
  "repoPath": "/path/to/allowed-root",
  "sessionDirectory": "/path/to/worktree/session-directory",
  "title": "Exact session title"
}
```

- `repoPath` is an existing directory inside an allowed root. It is the CLI search context, not the session's stored worktree path.
- `sessionDirectory` is compared with the exact directory stored in the OpenCode session record. It does not need to exist on disk.
- `title` is an exact, case-sensitive title match.
- The Bridge refuses to delete if there are no matches or more than one match.
- It checks the OpenCode active-status endpoint and refuses a session reported as running.
- It deletes using the official `opencode session delete <sessionID>` CLI command, with an argument array (no shell interpolation).
- After CLI success, it removes every Bridge mapping for that OpenCode session ID. Other mappings and active selections remain untouched.

The official CLI reports that deleting a session also deletes its child sessions. Deletion is permanent: it removes session history, not repository files or Git history. The Bridge does not abort a running session or delete one as a side effect of a timeout.

## State persistence

Bridge mappings and active-session selections are stored in the Bridge state file `sessions.json`. The project source, tests, README and this document are the durable implementation record. Do not use `git reset`, `git clean`, or overwrite unrelated working-tree changes when continuing development.

## Verification

Focused lifecycle tests:

```bash
pnpm exec vitest run tests/opencode-client.test.ts tests/state-store.test.ts tests/session-lifecycle.test.ts
```

Full project validation:

```bash
pnpm validate
git diff --check
```

## Refreshing the ChatGPT tool catalog

The Bridge's live MCP `tools/list` response is not the same thing as the tool catalog already cached by a ChatGPT connection. ChatGPT may keep a snapshot of the tool names, descriptions and input schemas after the server changes. Reloading the browser page or restarting the Bridge alone does not guarantee that the connected app will fetch a new catalog.

When a new Bridge tool is missing in ChatGPT:

1. Confirm the Bridge is running and that its live MCP `tools/list` includes the new tool.
2. In ChatGPT, open the connected custom MCP app/connection in the Plugins settings.
3. Use the connection's **Refresh** action to fetch the current tool metadata.
4. Confirm the new tools appear in the app's advertised action list. If the workspace exposes action controls, newly discovered actions may need to be enabled by an authorized admin/owner.
5. Start a new conversation with the app selected and test the new tool names.

This is a ChatGPT-side metadata refresh, not a Bridge code fix. Do not delete/recreate the connector as the first response; use Refresh first. Exact refresh controls depend on the ChatGPT app/plan/workspace experience.
