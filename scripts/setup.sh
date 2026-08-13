#!/usr/bin/env bash
# Interactive local setup: .env from example + generated secrets + JWT keys.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_EXAMPLE="${ROOT_DIR}/.env.example"
ENV_FILE="${ROOT_DIR}/.env"
SECRETS_DIR="${ROOT_DIR}/secrets"

AUTO_YES=false
FORCE_ENV=false
FORCE_JWT=false

usage() {
  cat <<'EOF'
Usage: ./scripts/setup.sh [options]

Bootstrap Nova Suite for Docker Compose or local development:
  - Copy .env.example → .env (unless .env already exists)
  - Generate POSTGRES_PASSWORD, CREDENTIALS_MASTER_KEY, CATALOG_AUTOMATION_SHARED_KEY
  - Generate RS256 JWT key pair in secrets/

Options:
  -y, --yes       Accept defaults (skip prompts; overwrite nothing without --force-*)
  --force-env     Overwrite existing .env
  --force-jwt     Regenerate JWT keys even if they already exist
  -h, --help      Show this help

After setup: docker compose up -d --build
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -y|--yes) AUTO_YES=true; shift ;;
    --force-env) FORCE_ENV=true; shift ;;
    --force-jwt) FORCE_JWT=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

prompt() {
  local question="$1"
  local default="${2:-}"
  if $AUTO_YES; then
    REPLY="${default}"
    echo "${question} [${default}] (auto)"
    return
  fi
  if [[ -n "${default}" ]]; then
    read -r -p "${question} [${default}]: " REPLY
    REPLY="${REPLY:-$default}"
  else
    read -r -p "${question}: " REPLY
  fi
}

confirm() {
  local question="$1"
  local default="${2:-y}"
  if $AUTO_YES; then
    REPLY="${default}"
    return
  fi
  read -r -p "${question} [${default}]: " REPLY
  REPLY="${REPLY:-$default}"
  [[ "${REPLY}" =~ ^[Yy] ]]
}

random_hex() {
  openssl rand -hex 24
}

set_env_var() {
  local key="$1"
  local value="$2"
  python3 - "${ENV_FILE}" "${key}" "${value}" <<'PY'
import re
import sys

path, key, value = sys.argv[1], sys.argv[2], sys.argv[3]
try:
    text = open(path, encoding="utf-8").read()
except FileNotFoundError:
    text = ""

pattern = re.compile(rf"^{re.escape(key)}=.*$", re.MULTILINE)
replacement = f"{key}={value}"
if pattern.search(text):
    text = pattern.sub(replacement, text, count=1)
else:
    if text and not text.endswith("\n"):
        text += "\n"
    text += replacement + "\n"

open(path, "w", encoding="utf-8").write(text)
PY
}

generate_jwt_keys() {
  mkdir -p "${SECRETS_DIR}"
  local private_key="${SECRETS_DIR}/jwt-private.pem"
  local public_key="${SECRETS_DIR}/jwt-public.pem"

  if [[ -f "${private_key}" || -f "${public_key}" ]]; then
    if $FORCE_JWT || confirm "JWT keys already exist. Regenerate?" "n"; then
      rm -f "${private_key}" "${public_key}"
    else
      echo "Keeping existing JWT keys."
      return
    fi
  fi

  echo "Generating RS256 JWT key pair..."
  openssl genrsa -out "${private_key}" 2048
  openssl rsa -in "${private_key}" -pubout -out "${public_key}"
  chmod 644 "${private_key}" "${public_key}"
  if command -v chown >/dev/null 2>&1; then
    chown 1001:1001 "${private_key}" "${public_key}" 2>/dev/null || true
  fi
  echo "  ${private_key}"
  echo "  ${public_key}"
}

echo "Nova Suite setup"
echo "================"
echo

if ! command -v openssl >/dev/null 2>&1; then
  echo "Error: openssl is required." >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "Error: python3 is required." >&2
  exit 1
fi

if [[ ! -f "${ENV_EXAMPLE}" ]]; then
  echo "Error: ${ENV_EXAMPLE} not found." >&2
  exit 1
fi

# ─── .env ───
if [[ -f "${ENV_FILE}" && ! $FORCE_ENV ]]; then
  if confirm ".env already exists. Create a fresh copy from .env.example?" "n"; then
    cp "${ENV_EXAMPLE}" "${ENV_FILE}"
    echo "Created ${ENV_FILE}"
  else
    echo "Using existing ${ENV_FILE}"
  fi
else
  cp "${ENV_EXAMPLE}" "${ENV_FILE}"
  echo "Created ${ENV_FILE}"
fi

# ─── Deployment profile ───
echo
echo "Deployment profile:"
echo "  1) Docker Compose (recommended) — NODE_ENV=production, JWT paths under /secrets"
echo "  2) Local engine dev — NODE_ENV=development, JWT paths under ./secrets"
if $AUTO_YES; then
  profile="1"
  echo "Choose profile [1]: (auto)"
else
  prompt "Choose profile" "1"
  profile="${REPLY}"
fi

case "${profile}" in
  2|local|dev|development)
    set_env_var NODE_ENV development
    set_env_var JWT_PRIVATE_KEY_PATH "./secrets/jwt-private.pem"
    set_env_var JWT_PUBLIC_KEY_PATH "./secrets/jwt-public.pem"
    echo "Configured for local development."
    ;;
  *)
    set_env_var NODE_ENV production
    set_env_var JWT_PRIVATE_KEY_PATH "/secrets/jwt-private.pem"
    set_env_var JWT_PUBLIC_KEY_PATH "/secrets/jwt-public.pem"
    echo "Configured for Docker Compose."
    ;;
esac

# ─── Host / OIDC redirect (optional) ───
echo
if $AUTO_YES; then
  host="localhost"
else
  prompt "Public host for SSO redirect (OIDC_REDIRECT_URI)" "localhost"
  host="${REPLY:-localhost}"
fi
set_env_var OIDC_REDIRECT_URI "http://${host}/api/auth/sso/callback"

if confirm "Hide demo login quick-fill buttons on the login page?" "n"; then
  set_env_var VITE_HIDE_DEMO_LOGIN_CREDENTIALS true
else
  set_env_var VITE_HIDE_DEMO_LOGIN_CREDENTIALS false
fi

# ─── Secrets ───
echo
if confirm "Generate random secrets (Postgres password, credential keys)?" "y"; then
  pg_pass="$(random_hex)"
  cred_key="$(random_hex)"
  catalog_key="$(random_hex)"
  set_env_var POSTGRES_PASSWORD "${pg_pass}"
  set_env_var POSTGRES_APP_USER nova_runtime
  set_env_var POSTGRES_APP_PASSWORD "${pg_pass}"
  set_env_var CREDENTIALS_MASTER_KEY "${cred_key}"
  set_env_var CATALOG_AUTOMATION_SHARED_KEY "${catalog_key}"
  echo "Generated POSTGRES_PASSWORD, POSTGRES_APP_PASSWORD, CREDENTIALS_MASTER_KEY, CATALOG_AUTOMATION_SHARED_KEY"
else
  echo "Skipped secret generation — edit ${ENV_FILE} manually."
fi

# ─── JWT keys ───
echo
if confirm "Generate RS256 JWT signing keys in secrets/?" "y"; then
  generate_jwt_keys
else
  echo "Skipped JWT key generation."
fi

# ─── Done ───
echo
echo "Setup complete."
echo
echo "Next steps:"
echo "  1. Review ${ENV_FILE} (optional SSO, AI, mail settings)"
echo "  2. Start stack:  docker compose up -d --build"
echo "  3. Verify:       curl http://localhost:4000/health"
echo "  4. Open UI:      http://${host}/"
echo
echo "Validate secrets:  ./scripts/verify_secret_rotation.sh"
echo
if ! "${ROOT_DIR}/scripts/verify_secret_rotation.sh"; then
  echo
  echo "Validation failed — review ${ENV_FILE} or re-run: ./scripts/setup.sh --force-env"
  exit 1
fi
