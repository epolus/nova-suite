#!/usr/bin/env bash
# Generate RSA key pair for Nova Suite RS256 session JWTs.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SECRETS_DIR="${ROOT_DIR}/secrets"
PRIVATE_KEY="${SECRETS_DIR}/jwt-private.pem"
PUBLIC_KEY="${SECRETS_DIR}/jwt-public.pem"

FORCE=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    -f|--force) FORCE=true; shift ;;
    -h|--help)
      echo "Usage: $0 [--force]"
      echo "  --force  Replace existing jwt-*.pem files"
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

mkdir -p "${SECRETS_DIR}"

if [[ -f "${PRIVATE_KEY}" || -f "${PUBLIC_KEY}" ]]; then
  if $FORCE; then
    rm -f "${PRIVATE_KEY}" "${PUBLIC_KEY}"
  else
    echo "JWT key files already exist in ${SECRETS_DIR}."
    echo "Remove them first, or run: $0 --force"
    exit 1
  fi
fi

openssl genrsa -out "${PRIVATE_KEY}" 2048
openssl rsa -in "${PRIVATE_KEY}" -pubout -out "${PUBLIC_KEY}"
# Readable by the non-root container user (uid 1001) when mounted into Docker
chmod 644 "${PRIVATE_KEY}" "${PUBLIC_KEY}"
if command -v chown >/dev/null 2>&1; then
  chown 1001:1001 "${PRIVATE_KEY}" "${PUBLIC_KEY}" 2>/dev/null || true
fi

echo "Created:"
echo "  ${PRIVATE_KEY}"
echo "  ${PUBLIC_KEY}"
echo "Note: private key mode is 644 so the Docker engine user (nova/1001) can read it."