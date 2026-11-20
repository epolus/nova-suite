/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Environment validation ───
// Fails startup on malformed values instead of silently falling back to defaults.

import { z } from 'zod';

const blankToUndefined = (value: unknown) => (value === '' ? undefined : value);

function optional<T extends z.ZodType>(schema: T) {
  return z.preprocess(blankToUndefined, schema.optional());
}

function int(min: number, max = Number.MAX_SAFE_INTEGER) {
  return optional(
    z.string().superRefine((value, ctx) => {
      if (!/^\d+$/.test(value)) {
        ctx.addIssue({ code: 'custom', message: 'must be a whole number' });
      } else if (Number(value) < min || Number(value) > max) {
        ctx.addIssue({ code: 'custom', message: `must be between ${min} and ${max}` });
      }
    }),
  );
}

const bool = optional(z.enum(['true', 'false'], { error: 'must be "true" or "false"' }));
const url = optional(z.url({ error: 'must be an absolute URL' }));
const port = int(1, 65_535);

const envSchema = z.looseObject({
  NODE_ENV: optional(z.enum(['development', 'production', 'test'])),
  LOG_LEVEL: optional(z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])),
  API_PORT: port,
  TRUST_PROXY: optional(z.string().regex(/^(true|false|\d+)$/, 'must be true, false, or a hop count')),

  POSTGRES_PORT: port,
  DB_SCHEMA_VERSION: optional(z.string().regex(/^v\d{2}\.\d{2}\.\d{2}$/, 'must look like v00.01.46')),
  DB_POOL_MAX: int(1, 500),
  DB_STATEMENT_TIMEOUT_MS: int(0),
  DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: int(0),

  // z.guid(): seeded ids like a0000000-…-000000000001 are not RFC 4122 versioned.
  NOVA_PRIMARY_TENANT_ID: optional(z.guid({ error: 'must be a UUID' })),
  AUTH_LOCAL_LOGIN_ENABLED: bool,
  BCRYPT_ROUNDS: int(10, 15),
  SESSION_COOKIE_SECURE: optional(z.enum(['auto', 'true', 'false'], { error: 'must be "auto", "true" or "false"' })),
  TRUSTED_ORIGINS: optional(
    z.string().refine(
      (value) => value.split(',').map((o) => o.trim()).filter(Boolean).every((o) => URL.canParse(o)),
      'must be a comma-separated list of absolute origins (https://host[:port])',
    ),
  ),

  TEMPORAL_RETENTION_DAYS: int(1, 3650),
  /** 0 disables purge; default in config is 365. */
  AUDIT_RETENTION_DAYS: int(0, 3650),
  REDIS_ENABLED: bool,
  REDIS_URL: url,
  REDIS_DEFAULT_TTL_SECONDS: int(1),
  UPLOAD_MAX_FILE_SIZE_MB: int(1, 1024),

  OIDC_ISSUER: url,
  OIDC_REDIRECT_URI: url,

  CREDENTIALS_MASTER_KEY: optional(z.string().min(16, 'must be at least 16 characters')),

  AI_ENABLED: bool,
  AI_ESS_ENABLED: bool,
  AI_AGENT_ENABLED: bool,
  AI_DEFAULT_PROVIDER: optional(z.enum(['openai', 'azure_openai', 'ollama'])),
  AI_MAX_CONTEXT_ARTICLES: int(1, 50),
  AI_RATE_LIMIT_PER_USER_PER_MIN: int(1),
  AI_PENDING_ACTION_TTL_MINUTES: int(1),
  AI_MAX_TOOL_ROUNDS: int(1, 50),
  OPENAI_BASE_URL: url,
  AZURE_OPENAI_ENDPOINT: url,
  OLLAMA_BASE_URL: url,

  MAIL_NOTIFICATIONS_ENABLED: bool,
  SMTP_PORT: port,
  SMTP_SECURE: bool,
}).superRefine((env, ctx) => {
  const raw = (name: string) => (typeof env[name] === 'string' ? env[name] : '');
  if (env.OIDC_ISSUER) {
    for (const name of ['OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET']) {
      if (!raw(name)) ctx.addIssue({ code: 'custom', path: [name], message: 'is required when OIDC_ISSUER is set' });
    }
  }
  if (env.NODE_ENV === 'production') {
    const inline = raw('JWT_PRIVATE_KEY') && raw('JWT_PUBLIC_KEY');
    const paths = raw('JWT_PRIVATE_KEY_PATH') && raw('JWT_PUBLIC_KEY_PATH');
    if (!inline && !paths) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_PRIVATE_KEY'],
        message: 'RS256 keys are required in production (JWT_PRIVATE_KEY + JWT_PUBLIC_KEY, '
          + 'or JWT_PRIVATE_KEY_PATH + JWT_PUBLIC_KEY_PATH)',
      });
    }
  }
});

/** Returns one message per invalid variable; empty when the environment is usable. */
export function validateEnv(env: NodeJS.ProcessEnv): string[] {
  const result = envSchema.safeParse(env);
  if (result.success) return [];
  return result.error.issues.map((issue) => `${issue.path.join('.') || 'env'} ${issue.message}`);
}

export function assertValidEnv(env: NodeJS.ProcessEnv = process.env): void {
  const problems = validateEnv(env);
  if (problems.length > 0) {
    throw new Error(`Invalid environment configuration:\n  - ${problems.join('\n  - ')}`);
  }
}
