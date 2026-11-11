#!/usr/bin/env bash
set -euo pipefail

UNIT_DIR="${SYSTEMD_USER_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user}"
SYSTEMCTL_BIN="${SYSTEMCTL_BIN:-systemctl}"
MARKER="# Managed by OpenCode Most systemd installer."
UNIT_NAMES=(opencode-most.service opencode-most-tunnel.service opencode-most.target)

for name in "${UNIT_NAMES[@]}"; do
  path="$UNIT_DIR/$name"
  if [[ -e "$path" ]] && ! grep -Fq "$MARKER" "$path"; then
    printf 'opencode-most uninstaller: refusing to remove unowned unit: %s\n' "$path" >&2
    exit 1
  fi
done

"$SYSTEMCTL_BIN" --user stop opencode-most.target opencode-most.service opencode-most-tunnel.service 2>/dev/null || true
"$SYSTEMCTL_BIN" --user disable --now opencode-most.target
for name in "${UNIT_NAMES[@]}"; do
  path="$UNIT_DIR/$name"
  if [[ -e "$path" ]]; then rm -- "$path"; fi
done
"$SYSTEMCTL_BIN" --user daemon-reload

printf '%s\n' "OpenCode Most user service removed."
