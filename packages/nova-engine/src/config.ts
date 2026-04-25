/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Configuration ───
// Reads environment variables with sensible defaults.

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

export const config = {
  port: envInt('API_PORT', 4000),
  nodeEnv: env('NODE_ENV', 'development'),
  logLevel: env('LOG_LEVEL', 'info'),

  db: {
    host: env('POSTGRES_HOST', 'localhost'),
    port: envInt('POSTGRES_PORT', 5432),
    database: env('POSTGRES_DB', 'nova'),
    user: env('POSTGRES_USER', 'nova_app'),
    password: env('POSTGRES_PASSWORD', 'changeme'),
  },

  jwt: {
    secret: env('JWT_SECRET', 'dev-secret-change-me'),
    expiresIn: env('JWT_EXPIRES_IN', '8h'),
  },

  auth: {
    localLoginEnabled: process.env.AUTH_LOCAL_LOGIN_ENABLED !== 'false',
  },

  cors: {
    origin: env('CORS_ORIGIN', '*'),
  },

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
    get enabled() { return !!(this.issuer && this.clientId); },
  },

  /** Symmetric key for tenant_credentials (pgcrypto); must match nova-worker. */
  credentials: {
    masterKey: env('CREDENTIALS_MASTER_KEY', ''),
  },
} as const;
