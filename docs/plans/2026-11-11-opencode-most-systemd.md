# OpenCode Most Linux user-service implementation plan

> **For agentic workers:** Use the host's available task-by-task implementation workflow. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Install and verify a login-scoped systemd user daemon that starts the OpenCode Most MCP bridge and its existing tunnel client, restarts failures, and stops at graphical-session logout.

**Architecture:** Keep Linux service management in dedicated systemd assets and shell installers, separate from the existing macOS LaunchAgent implementation. Use systemd user units attached to `graphical-session.target`, `LoadCredential=` for the existing tunnel key, and a small wrapper that exports the credential only to the tunnel process. The installer must refuse to overwrite pre-existing units and uninstall only files bearing the OpenCode Most ownership marker.

**Tech Stack:** Bash, systemd 262, Node.js 22, pnpm/Vitest, existing tunnel-client binary.

## Global Constraints

- Repository directory is the local OpenCode Most project root.
- Preserve all pre-existing staged, unstaged, and untracked repository work; do not reset, clean, or overwrite unrelated files.
- Do not create commits or push.
- Do not modify OpenCode configuration, `.env`, tunnel key contents, tunnel profile, or other projects.
- The ChatGPT plugin and tunnel profile remain named `opencode-bridge`.
- Do not modify `most-mcp`, `opencode-gemini-live-bridge`, `gemini-browser-bridge`, or any other service.
- The existing `most` launcher is kept operational; only its repository path reference is updated to the renamed directory.
- Use the existing tunnel-client binary and key from `TUNNEL_DIR` (default: `$HOME/Projekty/OmniCommanderMCP/tunnel-client-v0.0.16-linux-amd64/`).
- Do not expose the tunnel key in unit files, logs, tests, or command output.
- User service starts after graphical login and stops with graphical-session logout; do not change linger.
- Keep rollback available using the verified backup created outside the repository before installation.

---

### Task 1: Credential-safe tunnel wrapper and service-unit assets

**Files:**
- Create: `scripts/systemd/run-tunnel-with-credential.sh`
- Create: `systemd/opencode-most.service.in`
- Create: `systemd/opencode-most-tunnel.service.in`
- Create: `systemd/opencode-most.target`
- Test: `tests/systemd-user.test.ts`

**Interfaces:**
- Wrapper consumes `CREDENTIALS_DIRECTORY/control-plane-api-key` and forwards all arguments to the tunnel binary.
- Bridge unit runs `node dist/cli.js start` in the repository directory with the existing `.env`.
- Tunnel unit requires and follows the bridge, waits for the bridge health URL, loads the key with `LoadCredential=`, and restarts on failure.
- Target groups both services and is installable under `graphical-session.target`.

- [x] **Step 1: Add the focused failing tests**

Test that the wrapper refuses to start without the credential directory or credential file; with a credential file, it invokes the requested executable and passes the credential only through `CONTROL_PLANE_API_KEY`. Test unit templates for correct unit names, dependency ordering, restart policy, health wait, credential directive, target grouping, and graphical-session binding.

- [x] **Step 2: Verify the relevant failure**

Run: `pnpm exec vitest run tests/systemd-user.test.ts`
Expected: the test fails because the wrapper and unit templates do not yet exist.

- [x] **Step 3: Implement the minimum behavior**

Create the wrapper with strict shell mode, read one line from the systemd credential file without printing it, export it, and `exec` the supplied tunnel command. Add the three unit assets with ownership markers and the approved service graph.

- [x] **Step 4: Verify the focused pass**

Run: `pnpm exec vitest run tests/systemd-user.test.ts`
Expected: all wrapper and unit-contract tests pass.

- [x] **Step 5: Run the affected integration check**

Run: `bash -n scripts/systemd/run-tunnel-with-credential.sh`
Expected: no shell syntax errors.

### Task 2: Safe installer, uninstaller, and project identity

**Files:**
- Create: `scripts/systemd/install-user.sh`
- Create: `scripts/systemd/uninstall-user.sh`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/specs/2026-11-11-linux-systemd-user-service-design.md`
- Modify: the former local manual launcher (later retired; not part of the repository)
- Test: `tests/systemd-user.test.ts`

**Interfaces:**
- Installer discovers repository root, Node binary, configured bridge port, tunnel binary, and key path; writes only the three named user units; verifies them; reloads systemd; enables and starts `opencode-most.target`.
- Uninstaller disables/stops only `opencode-most.target` and removes only the three unit files containing the ownership marker.
- Package identity becomes `opencode-most`; the ChatGPT plugin identity remains `opencode-bridge`.

- [x] **Step 1: Add the focused failing tests**

Test installer output using a temporary unit directory and stubbed systemd commands; assert all generated paths and values, correct bridge port, credential source, no secret contents, and no unrelated files changed. Test that an existing same-name unit causes a refusal before any overwrite. Test uninstaller removes only owned units and leaves unrelated units intact. Test the package name and the `most` path reference.

- [x] **Step 2: Verify the relevant failure**

Run: `pnpm exec vitest run tests/systemd-user.test.ts`
Expected: the tests fail because installer/uninstaller and renamed project metadata are not implemented.

- [x] **Step 3: Implement the minimum behavior**

Implement atomic unit installation, preflight refusal on any conflicting target/service file, `systemd-analyze --user verify`, `daemon-reload`, and `enable --now`. Implement marker-guarded uninstall. Update only package identity, README project name/fork attribution/Linux daemon instructions, approved spec paths, and the single stale path in the manual `most` launcher.

- [x] **Step 4: Verify the focused pass**

Run: `pnpm exec vitest run tests/systemd-user.test.ts`
Expected: all installer, uninstaller, and project-identity tests pass.

- [x] **Step 5: Run the affected integration check**

Run: `bash -n scripts/systemd/install-user.sh scripts/systemd/uninstall-user.sh`
Expected: no shell syntax errors.

### Task 3: Install and exercise the real user daemon

**Files:**
- Runtime artifacts: `~/.config/systemd/user/opencode-most.service`, `opencode-most-tunnel.service`, `opencode-most.target`

**Interfaces:**
- Installed bridge endpoint: `http://127.0.0.1:8790/health` (read from the existing `.env` at install time).
- Tunnel readiness endpoint: `http://127.0.0.1:8081/readyz`.
- Service group: `opencode-most.target`.

- [x] **Step 1: Preserve current process state and install**

Record the current service/process status, stop only the processes belonging to the manual `most` launcher to release the bridge/tunnel endpoints, then run the installer.

- [x] **Step 2: Verify the real unit graph**

Run: `systemd-analyze --user verify ~/.config/systemd/user/opencode-most.service ~/.config/systemd/user/opencode-most-tunnel.service ~/.config/systemd/user/opencode-most.target`
Expected: no unit verification errors.

- [x] **Step 3: Verify readiness**

Run: `systemctl --user --no-pager --full status opencode-most.target opencode-most.service opencode-most-tunnel.service` and probe both HTTP endpoints.
Expected: all three units active; bridge health returns HTTP 200; tunnel readiness contains `ready`.

- [x] **Step 4: Verify restart behavior**

Terminate only the Bridge service process and verify systemd restarts it and restores health; repeat for the tunnel service and verify `/readyz` returns to ready.

- [x] **Step 5: Verify logout target semantics and rollback**

Stop `opencode-most.target`, verify both managed processes stop, and verify the unrelated Gemini/OmniCommander services remain unchanged. Then start the target again for the final running state. Confirm rollback commands and backup paths without executing rollback.

- [x] **Step 6: Run complete repository verification**

Run: `pnpm run typecheck && pnpm test && pnpm run build && git diff --check`
Expected: all checks pass; existing user changes remain present; no commits or pushes are created.

## Unresolved product decisions

None. The project name, service names, startup target, credential handling, tunnel profile, and isolation boundaries have been approved.

## Post-implementation decision

On 2026-11-11 the user retired the former local manual `most` launcher after confirming that the systemd user daemon is active and replaces its operational role. The local launcher was backed up outside the repository and removed; the systemd installer, uninstaller, credential wrapper, unit templates, and tests remain required. The original no-commit constraint in this plan was superseded by the user's later explicit authorization to review, clean, and commit the necessary repository files.
