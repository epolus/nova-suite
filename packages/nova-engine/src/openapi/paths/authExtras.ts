/* SPDX-License-Identifier: AGPL-3.0-only */
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { jsonBody, registerOp } from '../helpers';

const timeFormatSchema = z.object({
  time_format: z.enum(['12h', '24h']),
});

const dateFormatSchema = z.object({
  date_format: z.enum(['DD.MM.YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']),
});

const preferenceScopeParams = z.object({
  scope: z.string().min(1).max(120).regex(/^[a-zA-Z0-9:_-]+$/),
});

const preferenceValueSchema = z.object({
  value: z.record(z.string(), z.unknown()),
});

const ssoExchangeSchema = z.object({
  code: z.string().min(1),
});

const ssoCallbackQuery = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

export function registerAuthExtras(registry: OpenAPIRegistry): void {
  registerOp(registry, 'patch', '/auth/me/time-format', 'Auth', 'Update preferred time format', {
    200: { description: 'Updated user' },
    400: { description: 'Invalid time_format' },
  }, jsonBody(timeFormatSchema));

  registerOp(registry, 'patch', '/auth/me/date-format', 'Auth', 'Update preferred date format', {
    200: { description: 'Updated user' },
    400: { description: 'Invalid date_format' },
  }, jsonBody(dateFormatSchema));

  registerOp(registry, 'get', '/auth/me/preferences/{scope}', 'Auth', 'Get user preference for a scope', {
    200: { description: 'Preference value or null' },
    400: { description: 'Invalid scope' },
  }, { params: preferenceScopeParams });

  registerOp(registry, 'put', '/auth/me/preferences/{scope}', 'Auth', 'Upsert user preference for a scope', {
    200: { description: 'Preference saved' },
    400: { description: 'Invalid scope or value' },
  }, { params: preferenceScopeParams, ...jsonBody(preferenceValueSchema) });

  registerOp(registry, 'get', '/auth/users', 'Auth', 'List active users (picker)', {
    200: { description: 'Active users with roles' },
  });

  registerOp(
    registry,
    'get',
    '/auth/sso/config',
    'Auth',
    'SSO availability',
    { 200: { description: 'OIDC enabled flag, provider name, local login flag' } },
    undefined,
    {
      security: [],
      description: 'Public endpoint. Returns whether OIDC/SSO is configured for this deployment.',
    },
  );

  registerOp(
    registry,
    'get',
    '/auth/sso/authorize',
    'Auth',
    'Start OIDC authorization (redirect)',
    {
      302: { description: 'Redirect to identity provider' },
      400: { description: 'SSO not configured' },
    },
    undefined,
    {
      security: [],
      description: 'Browser redirect into the configured OIDC IdP using PKCE.',
    },
  );

  registerOp(
    registry,
    'get',
    '/auth/sso/callback',
    'Auth',
    'OIDC callback',
    {
      302: { description: 'Redirect to /login with sso_code or sso_error' },
    },
    { query: ssoCallbackQuery },
    {
      security: [],
      description: 'Exchanges the authorization code, issues a Nova JWT, and redirects with a one-time SSO code.',
    },
  );

  registerOp(
    registry,
    'post',
    '/auth/sso/exchange',
    'Auth',
    'Exchange one-time SSO code for JWT',
    {
      200: { description: 'JWT token + user info' },
      400: { description: 'Missing, invalid, or expired code' },
    },
    jsonBody(ssoExchangeSchema),
    { security: [] },
  );
}
