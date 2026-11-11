#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${OPENCODE_MOST_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
UNIT_DIR="${SYSTEMD_USER_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user}"
NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
TUNNEL_DIR="${TUNNEL_DIR:-${HOME}/Projekty/OmniCommanderMCP/tunnel-client-v0.0.16-linux-amd64}"
TUNNEL_BIN="${TUNNEL_BIN:-$TUNNEL_DIR/tunnel-client}"
TUNNEL_KEY="${TUNNEL_KEY:-$TUNNEL_DIR/key}"
SYSTEMCTL_BIN="${SYSTEMCTL_BIN:-systemctl}"
SYSTEMD_ANALYZE_BIN="${SYSTEMD_ANALYZE_BIN:-systemd-analyze}"
PATH_VALUE="${PATH:-/usr/bin:/bin}"

fail() { printf 'opencode-most installer: %s\n' "$1" >&2; exit 1; }
escape_sed() { printf '%s' "$1" | sed -e 's/[\\&|]/\\&/g'; }

[[ -d "$REPO_DIR" ]] || fail "repository directory does not exist: $REPO_DIR"
[[ -x "$NODE_BIN" ]] || fail "Node.js executable not found"
[[ -x "$TUNNEL_BIN" ]] || fail "tunnel-client executable not found: $TUNNEL_BIN"
[[ -r "$TUNNEL_KEY" ]] || fail "tunnel credential file is not readable"
[[ -f "$REPO_DIR/.env" ]] || fail "existing .env file is missing"
[[ -x "$REPO_DIR/scripts/systemd/run-tunnel-with-credential.sh" ]] || fail "credential wrapper is missing or not executable"

if [[ -z "${BRIDGE_PORT:-}" ]]; then
  BRIDGE_PORT=$(node --input-type=module -e 'import dotenv from "dotenv"; import { readFileSync } from "node:fs"; const parsed = dotenv.parse(readFileSync(".env")); process.stdout.write(parsed.OPENCODE_BRIDGE_PORT || "8787");')
fi
[[ "$BRIDGE_PORT" =~ ^[0-9]+$ ]] && (( BRIDGE_PORT > 0 && BRIDGE_PORT < 65536 )) || fail "invalid bridge port"

UNIT_NAMES=(opencode-most.service opencode-most-tunnel.service opencode-most.target)
for name in "${UNIT_NAMES[@]}"; do
  path="$UNIT_DIR/$name"
  if [[ -e "$path" ]]; then
    [[ ! -L "$path" ]] || fail "refusing to replace a symbolic-link unit: $path"
    grep -Fq "# Managed by OpenCode Most systemd installer." "$path" || fail "refusing to overwrite unowned unit: $path"
  fi
done

mkdir -p "$UNIT_DIR"
tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT

repo_escaped=$(escape_sed "$REPO_DIR")
node_escaped=$(escape_sed "$NODE_BIN")
path_escaped=$(escape_sed "$PATH_VALUE")
tunnel_bin_escaped=$(escape_sed "$TUNNEL_BIN")
tunnel_key_escaped=$(escape_sed "$TUNNEL_KEY")
health_escaped=$(escape_sed "http://127.0.0.1:$BRIDGE_PORT/health")

sed \
  -e "s|@REPO_DIR@|$repo_escaped|g" \
  -e "s|@NODE_BIN@|$node_escaped|g" \
  -e "s|@PATH@|$path_escaped|g" \
  "$REPO_DIR/systemd/opencode-most.service.in" > "$tmp_dir/opencode-most.service"

sed \
  -e "s|@REPO_DIR@|$repo_escaped|g" \
  -e "s|@PATH@|$path_escaped|g" \
  -e "s|@TUNNEL_BIN@|$tunnel_bin_escaped|g" \
  -e "s|@TUNNEL_KEY@|$tunnel_key_escaped|g" \
  -e "s|@BRIDGE_HEALTH_URL@|$health_escaped|g" \
  "$REPO_DIR/systemd/opencode-most-tunnel.service.in" > "$tmp_dir/opencode-most-tunnel.service"

cp "$REPO_DIR/systemd/opencode-most.target" "$tmp_dir/opencode-most.target"

"$SYSTEMD_ANALYZE_BIN" --user verify \
  "$tmp_dir/opencode-most.service" \
  "$tmp_dir/opencode-most-tunnel.service" \
  "$tmp_dir/opencode-most.target"

"$SYSTEMCTL_BIN" --user stop opencode-most.target opencode-most.service opencode-most-tunnel.service 2>/dev/null || true

install -m 0644 "$tmp_dir/opencode-most.service" "$UNIT_DIR/opencode-most.service"
install -m 0644 "$tmp_dir/opencode-most-tunnel.service" "$UNIT_DIR/opencode-most-tunnel.service"
install -m 0644 "$tmp_dir/opencode-most.target" "$UNIT_DIR/opencode-most.target"

"$SYSTEMCTL_BIN" --user daemon-reload
"$SYSTEMCTL_BIN" --user enable --now opencode-most.target

printf '%s\n' "OpenCode Most user service installed and started."
