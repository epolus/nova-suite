/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Configuration ───
// Reads environment variables with sensible defaults.

import { assertValidEnv } from './env-schema';

function env(name: string, fallback: string): string {
  const value = process.env[name];
  return value !== undefined && value !== '' ? value : fallback;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envTrustProxy(name: string, fallback: number | boolean): number | boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isFinite(parsed)) return parsed;
  return fallback;
}

function envList(name: string): string[] {
  return (process.env[name] || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

assertValidEnv();
const nodeEnv = env('NODE_ENV', 'development');

export const config = {
  port: envInt('API_PORT', 4000),
  nodeEnv,
  logLevel: env('LOG_LEVEL', 'info'),

  db: {
    host: env('POSTGRES_HOST', 'localhost'),
    port: envInt('POSTGRES_PORT', 5432),
    database: env('POSTGRES_DB', 'nova'),
    user: env('POSTGRES_APP_USER', 'nova_runtime'),
    password: env('POSTGRES_APP_PASSWORD', env('POSTGRES_PASSWORD', 'changeme')),
    expectedSchemaVersion: env('DB_SCHEMA_VERSION', 'v00.01.47'),
    poolMax: envInt('DB_POOL_MAX', 20),
    statementTimeoutMs: envInt('DB_STATEMENT_TIMEOUT_MS', 60_000),
    idleInTransactionTimeoutMs: envInt('DB_IDLE_IN_TRANSACTION_TIMEOUT_MS', 300_000),
  },

  jwt: {
    expiresIn: env('JWT_EXPIRES_IN', '8h'),
  },

  /** One tenant per install: login, SSO, public branding and the env webhook secret all resolve to it. */
  tenancy: {
    primaryTenantId: env('NOVA_PRIMARY_TENANT_ID', 'a0000000-0000-0000-0000-000000000001').toLowerCase(),
  },

  auth: {
    localLoginEnabled: process.env.AUTH_LOCAL_LOGIN_ENABLED !== 'false',
    bcryptRounds: envInt('BCRYPT_ROUNDS', 12),
  },

  cors: {
    origin: env('CORS_ORIGIN', '*'),
  },

  session: {
    /** `auto` marks the cookie Secure when the request arrived over HTTPS (needs TRUST_PROXY behind a proxy). */
    cookieSecure: env('SESSION_COOKIE_SECURE', 'auto') as 'auto' | 'true' | 'false',
    /** Extra origins allowed to make cookie-authenticated writes; the API's own host is always allowed. */
    trustedOrigins: env('TRUSTED_ORIGINS', '')
      .split(',')
      .map((origin) => origin.trim().replace(/\/+$/, '').toLowerCase())
      .filter(Boolean),
  },

  /** Express `trust proxy` hops (set to proxy count when behind nginx/caddy). */
  trustProxy: envTrustProxy('TRUST_PROXY', 1),

  temporal: {
    address: env('TEMPORAL_ADDRESS', 'localhost:7233'),
    namespace: env('TEMPORAL_NAMESPACE', 'default'),
    retentionDays: envInt('TEMPORAL_RETENTION_DAYS', 30),
    taskQueue: env('TEMPORAL_TASK_QUEUE', 'nova-itsm'),
  },

  redis: {
    enabled: process.env.REDIS_ENABLED === 'true',
    url: env('REDIS_URL', 'redis://localhost:6379'),
    defaultTtlSeconds: envInt('REDIS_DEFAULT_TTL_SECONDS', 300),
  },

  uploads: {
    dir: env('UPLOAD_DIR', '/data/uploads'),
    maxFileSize: envInt('UPLOAD_MAX_FILE_SIZE_MB', 20) * 1024 * 1024,
  },

  oidc: {
    issuer: env('OIDC_ISSUER', ''),
    clientId: env('OIDC_CLIENT_ID', ''),
    clientSecret: env('OIDC_CLIENT_SECRET', ''),
    redirectUri: env('OIDC_REDIRECT_URI', 'http://localhost/api/auth/sso/callback'),
    providerName: env('OIDC_PROVIDER_NAME', 'OpenID'),
    scope: env('OIDC_SCOPE', 'openid email profile'),
    /** Email domains allowed to auto-provision or link to an existing account. Empty = neither. */
    allowedEmailDomains: envList('OIDC_ALLOWED_EMAIL_DOMAINS'),
    get enabled() { return !!(this.issuer && this.clientId); },
  },

  /** Symmetric key for tenant_credentials (pgcrypto); must match nova-worker. */
  credentials: {
    masterKey: env('CREDENTIALS_MASTER_KEY', ''),
  },

  catalogAutomation: {
    sharedKey: env('CATALOG_AUTOMATION_SHARED_KEY', ''),
  },

  ai: {
    enabled: process.env.AI_ENABLED === 'true',
    defaultProvider: env('AI_DEFAULT_PROVIDER', 'openai') as 'openai' | 'azure_openai' | 'ollama',
    essEnabled: process.env.AI_ESS_ENABLED !== 'false',
    agentEnabled: process.env.AI_AGENT_ENABLED !== 'false',
    maxContextArticles: envInt('AI_MAX_CONTEXT_ARTICLES', 6),
    rateLimitPerUserPerMin: envInt('AI_RATE_LIMIT_PER_USER_PER_MIN', 20),
    pendingActionTtlMinutes: envInt('AI_PENDING_ACTION_TTL_MINUTES', 60),
    maxToolRounds: envInt('AI_MAX_TOOL_ROUNDS', 8),
    openai: {
      apiKey: env('OPENAI_API_KEY', ''),
      baseUrl: env('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
      model: env('OPENAI_MODEL', 'gpt-4o-mini'),
    },
    azureOpenai: {
      endpoint: env('AZURE_OPENAI_ENDPOINT', ''),
      apiKey: env('AZURE_OPENAI_API_KEY', ''),
      deployment: env('AZURE_OPENAI_DEPLOYMENT', ''),
      apiVersion: env('AZURE_OPENAI_API_VERSION', '2024-08-01-preview'),
    },
    ollama: {
      baseUrl: env('OLLAMA_BASE_URL', 'http://localhost:11434'),
      model: env('OLLAMA_MODEL', 'llama3.1'),
    },
  },
} as const;
