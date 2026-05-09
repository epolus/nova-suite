/* SPDX-License-Identifier: AGPL-3.0-only */
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
  db: {
    host: env('POSTGRES_HOST', 'localhost'),
    port: envInt('POSTGRES_PORT', 5432),
    database: env('POSTGRES_DB', 'nova'),
    user: env('POSTGRES_USER', 'nova_app'),
    password: env('POSTGRES_PASSWORD', 'changeme'),
    expectedSchemaVersion: env('DB_SCHEMA_VERSION', 'v00.01.00'),
  },
  temporal: {
    address: env('TEMPORAL_ADDRESS', 'localhost:7233'),
    namespace: env('TEMPORAL_NAMESPACE', 'default'),
    taskQueue: env('TEMPORAL_TASK_QUEUE', 'nova-itsm'),
    retentionDays: envInt('TEMPORAL_RETENTION_DAYS', 30),
  },
  /** Must match nova-engine CREDENTIALS_MASTER_KEY for pgp_sym_decrypt. */
  credentials: {
    masterKey: env('CREDENTIALS_MASTER_KEY', ''),
  },
  notifications: {
    emailEnabled: env('MAIL_NOTIFICATIONS_ENABLED', 'false') === 'true',
    sender: env('MAIL_FROM', 'no-reply@nova.local'),
    smtp: {
      host: env('SMTP_HOST', ''),
      port: envInt('SMTP_PORT', 587),
      user: env('SMTP_USER', ''),
      pass: env('SMTP_PASS', ''),
      secure: env('SMTP_SECURE', 'false') === 'true',
    },
  },
} as const;
