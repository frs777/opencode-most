#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${CREDENTIALS_DIRECTORY:-}" ]]; then
  printf '%s\n' "systemd credential directory is unavailable" >&2
  exit 1
fi

credential_file="$CREDENTIALS_DIRECTORY/control-plane-api-key"
if [[ ! -r "$credential_file" ]]; then
  printf '%s\n' "systemd tunnel credential is unavailable" >&2
  exit 1
fi

if [[ $# -lt 1 ]]; then
  printf '%s\n' "usage: run-tunnel-with-credential.sh <tunnel-client> [arguments...]" >&2
  exit 2
fi

IFS= read -r CONTROL_PLANE_API_KEY < "$credential_file" || [[ -n "$CONTROL_PLANE_API_KEY" ]]
if [[ -z "$CONTROL_PLANE_API_KEY" ]]; then
  printf '%s\n' "systemd tunnel credential is empty" >&2
  exit 1
fi
export CONTROL_PLANE_API_KEY

exec "$@"
