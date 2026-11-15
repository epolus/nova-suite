/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { validateEnv } from './env-schema';

describe('validateEnv', () => {
  it('accepts an empty environment (all defaults)', () => {
    expect(validateEnv({})).toEqual([]);
  });

  it('treats blank values as unset', () => {
    expect(validateEnv({ API_PORT: '', REDIS_ENABLED: '', OIDC_ISSUER: '' })).toEqual([]);
  });

  it('rejects malformed numbers, booleans and enums, reporting every problem', () => {
    const problems = validateEnv({
      API_PORT: '40OO',
      REDIS_ENABLED: 'True',
      AI_DEFAULT_PROVIDER: 'anthropic',
      BCRYPT_ROUNDS: '4',
    });
    expect(problems).toHaveLength(4);
    expect(problems.join('\n')).toMatch(/API_PORT must be a whole number/);
    expect(problems.join('\n')).toMatch(/REDIS_ENABLED must be "true" or "false"/);
    expect(problems.join('\n')).toMatch(/BCRYPT_ROUNDS must be between 10 and 15/);
  });

  it('accepts the seeded non-RFC tenant id', () => {
    expect(validateEnv({ NOVA_PRIMARY_TENANT_ID: 'a0000000-0000-0000-0000-000000000001' })).toEqual([]);
    expect(validateEnv({ NOVA_PRIMARY_TENANT_ID: 'tenant-1' })).toEqual(['NOVA_PRIMARY_TENANT_ID must be a UUID']);
  });

  it('requires OIDC client credentials when an issuer is set', () => {
    expect(validateEnv({ OIDC_ISSUER: 'https://login.example.com' })).toEqual([
      'OIDC_CLIENT_ID is required when OIDC_ISSUER is set',
      'OIDC_CLIENT_SECRET is required when OIDC_ISSUER is set',
    ]);
  });

  it('requires JWT keys in production only', () => {
    expect(validateEnv({ NODE_ENV: 'development' })).toEqual([]);
    expect(validateEnv({ NODE_ENV: 'production' })[0]).toMatch(/^JWT_PRIVATE_KEY RS256 keys are required/);
    expect(validateEnv({
      NODE_ENV: 'production',
      JWT_PRIVATE_KEY_PATH: '/secrets/jwt.key',
      JWT_PUBLIC_KEY_PATH: '/secrets/jwt.pub',
    })).toEqual([]);
  });

  it('rejects a short credentials master key', () => {
    expect(validateEnv({ CREDENTIALS_MASTER_KEY: 'short' })).toEqual([
      'CREDENTIALS_MASTER_KEY must be at least 16 characters',
    ]);
  });
});
