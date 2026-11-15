/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – SSO / OIDC Routes ───
// GET /api/auth/sso/config    – public; returns SSO availability
// GET /api/auth/sso/authorize – redirects to IdP authorization endpoint
// GET /api/auth/sso/callback  – handles IdP callback, issues Nova JWT

import { Router, Request, Response as ExpressResponse, NextFunction } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import { config } from '../../config';
import { db } from '../../data/db';
import { logger } from '../../logger';
import { AuthUser } from '../../middleware/auth';
import { issueSession, setSessionCookie } from '../../auth/session';
import { recordAuditEvent } from '../../audit/events';
import { getClientIp } from '../../middleware/client-ip';
import { evaluateSsoEmail } from './sso-policy';
import { OneTimeStore } from '../../auth/one-time-store';

const router = Router();

if (config.oidc.enabled && config.oidc.allowedEmailDomains.length === 0) {
  logger.warn('OIDC_ALLOWED_EMAIL_DOMAINS is empty: only users already linked to SSO can sign in; new SSO users are refused');
}

// ─── OIDC Discovery Cache ───
interface OidcMetadata {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri?: string;
  issuer: string;
}

type OidcClaims = JWTPayload & {
  sub: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  preferred_username?: string;
  upn?: string;
  unique_name?: string;
  email_verified?: boolean | string;
  nonce?: string;
};

let cachedMetadata: OidcMetadata | null = null;
let metadataFetchedAt = 0;
const METADATA_TTL = 300_000; // 5 min
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function normalizeClaims(claims: OidcClaims): OidcClaims {
  const fallbackEmail = claims.email || claims.preferred_username || claims.upn || claims.unique_name;
  return {
    ...claims,
    email: fallbackEmail,
  };
}

async function getOidcMetadata(): Promise<OidcMetadata> {
  if (cachedMetadata && Date.now() - metadataFetchedAt < METADATA_TTL) {
    return cachedMetadata;
  }

  const issuer = config.oidc.issuer.replace(/\/$/, '');
  const url = `${issuer}/.well-known/openid-configuration`;
  logger.info({ url }, 'Fetching OIDC discovery document');

  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`OIDC discovery failed: ${resp.status} ${resp.statusText}`);
  }
  cachedMetadata = await resp.json() as OidcMetadata;
  metadataFetchedAt = Date.now();
  return cachedMetadata;
}

function getJwks(metadata: OidcMetadata) {
  if (!metadata.jwks_uri) {
    throw new Error('OIDC metadata does not include jwks_uri');
  }
  const existing = jwksCache.get(metadata.jwks_uri);
  if (existing) return existing;
  const jwks = createRemoteJWKSet(new URL(metadata.jwks_uri));
  jwksCache.set(metadata.jwks_uri, jwks);
  return jwks;
}

async function verifyIdToken(idToken: string, metadata: OidcMetadata, expectedNonce: string): Promise<OidcClaims> {
  const verified = await jwtVerify(idToken, getJwks(metadata), {
    issuer: metadata.issuer || config.oidc.issuer,
    audience: config.oidc.clientId,
  });
  const claims = normalizeClaims(verified.payload as OidcClaims);
  if (!claims.nonce || claims.nonce !== expectedNonce) {
    throw new Error('Invalid OIDC nonce');
  }
  if (!claims.sub) {
    throw new Error('Missing sub claim in id_token');
  }
  return claims;
}

// ─── PKCE Helpers ───
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return hash.toString('base64url');
}

// ─── Pending OIDC state and one-time exchange codes ───
const pendingStates = new OneTimeStore<{ codeVerifier: string; nonce: string }>('sso:state', 600_000);
const pendingSsoCodes = new OneTimeStore<{ token: string; expiresAt: string; user: AuthUser }>('sso:code', 120_000);

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

// ─── GET /sso/config ───
router.get('/config', (_req: Request, res: ExpressResponse) => {
  res.json({
    enabled: config.oidc.enabled,
    provider_name: config.oidc.providerName,
    local_login_enabled: config.auth.localLoginEnabled,
  });
});

// ─── GET /sso/authorize ───
router.get('/authorize', async (_req: Request, res: ExpressResponse, next: NextFunction) => {
  try {
    if (!config.oidc.enabled) {
      res.status(400).json({ error: 'SSO is not configured' });
      return;
    }

    const metadata = await getOidcMetadata();
    const state = crypto.randomBytes(16).toString('hex');
    const codeVerifier = generateCodeVerifier();
    const nonce = crypto.randomBytes(16).toString('hex');
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    await pendingStates.put(state, { codeVerifier, nonce });

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.oidc.clientId,
      redirect_uri: config.oidc.redirectUri,
      scope: config.oidc.scope,
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const authUrl = `${metadata.authorization_endpoint}?${params.toString()}`;
    logger.info({ authUrl: authUrl.slice(0, 120) }, 'Redirecting to OIDC authorize');
    res.redirect(authUrl);
  } catch (err) {
    next(err);
  }
});

// ─── GET /sso/callback ───
router.get('/callback', async (req: Request, res: ExpressResponse, next: NextFunction) => {
  try {
    const { code, state, error, error_description } = req.query;

    if (error) {
      logger.warn({ error, error_description }, 'OIDC callback error');
      res.redirect(`/login?sso_error=${encodeURIComponent(String(error_description || error))}`);
      return;
    }

    if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
      res.redirect('/login?sso_error=Missing+code+or+state');
      return;
    }

    const pending = await pendingStates.take(state);
    if (!pending) {
      res.redirect('/login?sso_error=Invalid+or+expired+state');
      return;
    }

    const metadata = await getOidcMetadata();

    // Exchange code for tokens
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.oidc.redirectUri,
      client_id: config.oidc.clientId,
      code_verifier: pending.codeVerifier,
    });
    if (config.oidc.clientSecret) {
      tokenBody.set('client_secret', config.oidc.clientSecret);
    }

    const tokenResp = await fetch(metadata.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
    });

    if (!tokenResp.ok) {
      const body = await tokenResp.text();
      logger.error({ status: tokenResp.status, body: body.slice(0, 500) }, 'Token exchange failed');
      res.redirect('/login?sso_error=Token+exchange+failed');
      return;
    }

    const tokens = await tokenResp.json() as {
      access_token: string;
      id_token?: string;
      token_type: string;
    };

    if (!tokens.id_token) {
      res.redirect('/login?sso_error=Missing+id_token+in+SSO+response');
      return;
    }
    let claims: OidcClaims = await verifyIdToken(tokens.id_token, metadata, pending.nonce);

    // Fetch userinfo when key claims are missing from ID token
    if (!claims.sub || !claims.email || !claims.name) {
      const userinfoResp = await fetch(metadata.userinfo_endpoint, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (userinfoResp.ok) {
        const userinfo = await userinfoResp.json() as OidcClaims;
        claims = normalizeClaims({ ...claims, ...userinfo });
      }
    }

    logger.info({ sub: claims.sub, email: claims.email, name: claims.name }, 'SSO claims received');

    if (!claims.sub) {
      res.redirect('/login?sso_error=No+subject+in+SSO+response');
      return;
    }

    if (!claims.email) {
      res.redirect('/login?sso_error=No+email+in+SSO+response');
      return;
    }
    const ssoEmail = claims.email;
    const ssoSubject = claims.sub;

    type SsoUser = {
      id: string;
      tenant_id: string;
      email: string;
      display_name: string;
      time_format: '12h' | '24h';
      date_format: 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
      is_active: boolean;
      locked_out: boolean;
    };

    const ssoUserColumns = 'id, tenant_id, email, display_name, time_format, date_format, is_active, locked_out';

    // Pre-auth subject lookup must bypass RLS (no tenant context yet).
    const tenantId = config.tenancy.primaryTenantId;
    let user = await db.getOne<SsoUser>(
      `SELECT ${ssoUserColumns} FROM lookup_user_for_sso($1, $2)`,
      [ssoSubject, tenantId],
    );

    if (!user) {
      const decision = evaluateSsoEmail(ssoEmail, claims.email_verified, config.oidc.allowedEmailDomains);
      if (!decision.allowed) {
        logger.warn({ sub: ssoSubject, email: ssoEmail, reason: decision.reason }, 'SSO link/provision refused');
        res.redirect('/login?sso_error=Your+account+is+not+enabled+for+SSO.+Contact+your+administrator.');
        return;
      }
      const linkEmail = decision.email;
      let linkConflict = false;
      user = await db.withTenantContext(tenantId, SYSTEM_USER_ID, 'admin', async () => {
        const matched = await db.getOne<SsoUser>(
          `SELECT ${ssoUserColumns} FROM users
           WHERE lower(email) = $1 AND tenant_id = $2
           ORDER BY created_at
           LIMIT 1`,
          [linkEmail, tenantId],
        );

        if (matched) {
          const linked = await db.getOne<{ id: string }>(
            `UPDATE users SET sso_provider_id = $1
             WHERE id = $2 AND sso_provider_id IS NULL
             RETURNING id`,
            [ssoSubject, matched.id],
          );
          if (!linked) {
            logger.warn({ userId: matched.id, sub: ssoSubject }, 'SSO link refused: account already linked to another identity');
            linkConflict = true;
            return null;
          }
          logger.info({ userId: matched.id, sub: ssoSubject }, 'Linked SSO to existing user');
          return matched;
        }

        const displayName = claims.name || ssoEmail.split('@')[0];
        const randomHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), config.auth.bcryptRounds);
        const newUser = await db.getOne<{ id: string }>(
          `INSERT INTO users (
            tenant_id, email, password_hash, display_name,
            first_name, last_name, sso_provider_id, time_format, date_format, is_active, source
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, '24h', 'YYYY-MM-DD', true, 'sso')
          RETURNING id`,
          [
            tenantId,
            ssoEmail,
            randomHash,
            displayName,
            claims.given_name || null,
            claims.family_name || null,
            ssoSubject,
          ],
        );

        const userRole = await db.getOne<{ id: string }>(
          "SELECT id FROM roles WHERE tenant_id = $1 AND name = 'user'",
          [tenantId],
        );
        if (userRole && newUser) {
          await db.query(
            'INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES ($1, $2, $3)',
            [tenantId, newUser.id, userRole.id],
          );
        }

        const created = await db.getOne<SsoUser>(
          `SELECT ${ssoUserColumns} FROM users WHERE id = $1`,
          [newUser!.id],
        );
        logger.info({ userId: created!.id, email: ssoEmail }, 'Auto-provisioned SSO user');
        return created;
      });
      if (linkConflict) {
        res.redirect('/login?sso_error=Your+account+is+not+enabled+for+SSO.+Contact+your+administrator.');
        return;
      }
    }

    if (!user || !user.is_active) {
      res.redirect('/login?sso_error=Account+is+disabled');
      return;
    }

    if (user.locked_out) {
      res.redirect('/login?sso_error=Account+is+locked');
      return;
    }

    await db.withTenantContext(user.tenant_id, user.id, 'user', () => db.query(
      `UPDATE users
       SET last_login_at = now(),
           failed_login_count = 0
       WHERE id = $1`,
      [user!.id],
    ));

    const roles = (await db.resolveUserAccess(user.id, user.tenant_id))?.roles ?? [];

    // Issue Nova JWT
    const payload: AuthUser = {
      id: user.id,
      tenant_id: user.tenant_id,
      email: user.email,
      display_name: user.display_name,
      time_format: user.time_format || '24h',
      date_format: user.date_format || 'YYYY-MM-DD',
      roles: roles.length > 0 ? roles : ['user'],
    };

    const session = await issueSession(req, payload, 'sso');

    logger.info({ userId: user.id, roles }, 'SSO login successful');
    void db.withTenantContext(user.tenant_id, user.id, roles.join(',') || 'user', () => recordAuditEvent({
      tenantId: user.tenant_id,
      actorUserId: user.id,
      category: 'auth',
      action: 'auth.login.success',
      clientIp: getClientIp(req),
      metadata: { method: 'sso', provider: config.oidc.providerName },
    }));

    // Redirect via one-time code (avoid token in URL/query logs).
    const ssoCode = crypto.randomBytes(24).toString('hex');
    await pendingSsoCodes.put(ssoCode, {
      token: session.token,
      expiresAt: session.expiresAt.toISOString(),
      user: payload,
    });
    res.redirect(`/login?sso_code=${encodeURIComponent(ssoCode)}`);
  } catch (err) {
    logger.error({ err }, 'SSO callback error');
    next(err);
  }
});

router.post('/exchange', async (req: Request, res: ExpressResponse) => {
  const code = String(req.body?.code || '').trim();
  if (!code) {
    res.status(400).json({ error: 'code is required' });
    return;
  }

  const pending = await pendingSsoCodes.take(code);
  if (!pending) {
    res.status(400).json({ error: 'invalid or expired SSO code' });
    return;
  }
  setSessionCookie(req, res, { token: pending.token, expiresAt: new Date(pending.expiresAt) });
  res.json({ user: pending.user });
});

export default router;
