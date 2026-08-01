#!/usr/bin/env bash
set -euo pipefail

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

check_required JWT_SECRET
check_not_default JWT_SECRET "dev-secret-change-me"
check_min_length JWT_SECRET 32

check_required CREDENTIALS_MASTER_KEY
check_min_length CREDENTIALS_MASTER_KEY 24

check_required CATALOG_AUTOMATION_SHARED_KEY
check_min_length CATALOG_AUTOMATION_SHARED_KEY 24

if [[ ${errors} -gt 0 ]]; then
  echo "Secret validation failed with ${errors} error(s)."
  exit 1
fi

echo "All secret rotation checks passed."
