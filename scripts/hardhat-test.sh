#!/usr/bin/env bash
set -euo pipefail

log() {
  echo "==> $*"
}

tmp_output="$(mktemp)"
trap 'rm -f "$tmp_output"' EXIT

log "Running Hardhat tests (online if compiler cache is available)..."
if npx hardhat test 2>&1 | tee "$tmp_output"; then
  exit 0
fi

status=$?

if grep -q "HHE905" "$tmp_output"; then
  if ls artifacts/build-info/solc-0_8_24-*.json >/dev/null 2>&1; then
    log "Detected cached solc 0.8.24 build-info. Retrying with --no-compile."
    npx hardhat test --no-compile
    exit $?
  fi

  log "Hardhat compiler list download failed and no cached solc 0.8.24 artifacts were found."
  log "Run an online compile first to populate caches:"
  log "  npx hardhat compile"
  exit $status
fi

exit $status
