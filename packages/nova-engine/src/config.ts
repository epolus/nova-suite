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

function assertProductionSecurityConfig(nodeEnv: string): void {
  if (nodeEnv !== 'production') return;

  const jwtSecret = process.env.JWT_SECRET || '';
  if (!jwtSecret || jwtSecret === 'dev-secret-change-me' || jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be set to a strong value (>=32 chars) in production');
  }
}

const nodeEnv = env('NODE_ENV', 'development');
assertProductionSecurityConfig(nodeEnv);

export const config = {
  port: envInt('API_PORT', 4000),
  nodeEnv,
  logLevel: env('LOG_LEVEL', 'info'),

  db: {
    host: env('POSTGRES_HOST', 'localhost'),
    port: envInt('POSTGRES_PORT', 5432),
    database: env('POSTGRES_DB', 'nova'),
    user: env('POSTGRES_USER', 'nova_app'),
    password: env('POSTGRES_PASSWORD', 'changeme'),
    expectedSchemaVersion: env('DB_SCHEMA_VERSION', 'v00.01.00'),
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
