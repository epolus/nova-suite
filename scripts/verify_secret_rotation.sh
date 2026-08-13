#!/usr/bin/env bash
# Validate required secrets in .env and JWT key files on the host.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"

errors=0

check_required() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "${value}" ]]; then
    echo "[ERROR] ${name} is not set"
    errors=$((errors + 1))
    return
  fi
  echo "[OK] ${name} is set"
}

check_not_default() {
  local name="$1"
  local disallowed="$2"
  local value="${!name:-}"
  if [[ "${value}" == "${disallowed}" ]]; then
    echo "[ERROR] ${name} is using default value"
    errors=$((errors + 1))
    return
  fi
  echo "[OK] ${name} is not default"
}

check_min_length() {
  local name="$1"
  local min_len="$2"
  local value="${!name:-}"
  if [[ ${#value} -lt ${min_len} ]]; then
    echo "[ERROR] ${name} must be at least ${min_len} characters"
    errors=$((errors + 1))
    return
  fi
  echo "[OK] ${name} length is >= ${min_len}"
}

check_file_readable() {
  local label="$1"
  local path="$2"
  if [[ -z "${path}" ]]; then
    echo "[ERROR] ${label} path is empty"
    errors=$((errors + 1))
    return
  fi
  if [[ ! -r "${path}" ]]; then
    echo "[ERROR] ${label} file is missing or unreadable: ${path}"
    errors=$((errors + 1))
    return
  fi
  echo "[OK] ${label} file is readable (${path})"
}

resolve_jwt_path() {
  local path="$1"
  case "${path}" in
    /secrets/*)
      echo "${ROOT_DIR}/secrets/${path#/secrets/}"
      ;;
    ./secrets/*|./secrets/*)
      echo "${ROOT_DIR}/${path#./}"
      ;;
    secrets/*)
      echo "${ROOT_DIR}/${path}"
      ;;
    /*)
      echo "${path}"
      ;;
    *)
      echo "${ROOT_DIR}/${path}"
      ;;
  esac
}

load_env_file() {
  if [[ ! -f "${ENV_FILE}" ]]; then
    echo "[ERROR] ${ENV_FILE} not found. Run: ./scripts/setup.sh"
    exit 1
  fi

  # Export KEY=value pairs from .env without shell-expanding values.
  eval "$(
    python3 - "${ENV_FILE}" <<'PY'
import re
import shlex
import sys

path = sys.argv[1]
pattern = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$")
for raw in open(path, encoding="utf-8"):
    line = raw.strip()
    if not line or line.startswith("#"):
        continue
    match = pattern.match(line)
    if not match:
        continue
    key, value = match.group(1), match.group(2)
    print(f"export {key}={shlex.quote(value)}")
PY
  )"
}

load_env_file

if [[ -n "${JWT_PRIVATE_KEY:-}" && -n "${JWT_PUBLIC_KEY:-}" ]]; then
  echo "[OK] JWT_PRIVATE_KEY and JWT_PUBLIC_KEY are set"
elif [[ -n "${JWT_PRIVATE_KEY_PATH:-}" || -n "${JWT_PUBLIC_KEY_PATH:-}" ]]; then
  check_required JWT_PRIVATE_KEY_PATH
  check_required JWT_PUBLIC_KEY_PATH
  jwt_private_path="$(resolve_jwt_path "${JWT_PRIVATE_KEY_PATH}")"
  jwt_public_path="$(resolve_jwt_path "${JWT_PUBLIC_KEY_PATH}")"
  check_file_readable JWT_PRIVATE_KEY_PATH "${jwt_private_path}"
  check_file_readable JWT_PUBLIC_KEY_PATH "${jwt_public_path}"
else
  echo "[ERROR] Configure RS256 keys via JWT_PRIVATE_KEY/JWT_PUBLIC_KEY or JWT_PRIVATE_KEY_PATH/JWT_PUBLIC_KEY_PATH"
  errors=$((errors + 1))
fi

check_required CREDENTIALS_MASTER_KEY
check_min_length CREDENTIALS_MASTER_KEY 24

check_required CATALOG_AUTOMATION_SHARED_KEY
check_min_length CATALOG_AUTOMATION_SHARED_KEY 24

check_not_default POSTGRES_PASSWORD "CHANGE_ME_TO_RANDOM_SECRET"
POSTGRES_APP_USER="${POSTGRES_APP_USER:-nova_runtime}"
if [[ "${POSTGRES_APP_USER}" == "${POSTGRES_USER:-nova_app}" ]]; then
  echo "[ERROR] POSTGRES_APP_USER must not be the bootstrap superuser (${POSTGRES_USER:-nova_app})"
  errors=$((errors + 1))
else
  echo "[OK] POSTGRES_APP_USER (${POSTGRES_APP_USER}) is distinct from POSTGRES_USER"
fi
APP_PASSWORD="${POSTGRES_APP_PASSWORD:-${POSTGRES_PASSWORD:-}}"
if [[ "${APP_PASSWORD}" == "CHANGE_ME_TO_RANDOM_SECRET" || -z "${APP_PASSWORD}" ]]; then
  echo "[ERROR] POSTGRES_APP_PASSWORD (or POSTGRES_PASSWORD fallback) is missing or default"
  errors=$((errors + 1))
else
  echo "[OK] application DB password is set"
fi

if [[ ${errors} -gt 0 ]]; then
  echo
  echo "Secret validation failed with ${errors} error(s)."
  echo "Run ./scripts/setup.sh to generate secrets and JWT keys from .env.example."
  exit 1
fi

echo "All secret rotation checks passed."
