/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – SSO / OIDC Routes ───
// GET /api/auth/sso/config    – public; returns SSO availability
// GET /api/auth/sso/authorize – redirects to IdP authorization endpoint
// GET /api/auth/sso/callback  – handles IdP callback, issues Nova JWT

import { Router, Request, Response as ExpressResponse, NextFunction } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { config } from '../../config';
import { db } from '../../data/db';
import { logger } from '../../logger';
import { AuthUser } from '../../middleware/auth';

const router = Router();

// ─── OIDC Discovery Cache ───
interface OidcMetadata {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri?: string;
  issuer: string;
}

type OidcClaims = {
  sub: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  preferred_username?: string;
  upn?: string;
  unique_name?: string;
  nonce?: string;
};

let cachedMetadata: OidcMetadata | null = null;
let metadataFetchedAt = 0;
const METADATA_TTL = 300_000; // 5 min

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

// ─── PKCE Helpers ───
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return hash.toString('base64url');
}

// ─── In-memory state store (short-lived) ───
const pendingStates = new Map<string, { codeVerifier: string; nonce: string; createdAt: number }>();
const STATE_TTL = 600_000; // 10 min

function cleanupStates() {
  const now = Date.now();
  for (const [key, val] of pendingStates) {
    if (now - val.createdAt > STATE_TTL) pendingStates.delete(key);
  }
}

// ─── Default tenant for auto-provisioned users ───
const DEFAULT_TENANT = 'a0000000-0000-0000-0000-000000000001';

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

    cleanupStates();
    pendingStates.set(state, { codeVerifier, nonce, createdAt: Date.now() });

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

    const pending = pendingStates.get(state);
    if (!pending) {
      res.redirect('/login?sso_error=Invalid+or+expired+state');
      return;
    }
    pendingStates.delete(state);

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

    // Decode ID token claims
    let claims: OidcClaims = { sub: '' };

    if (tokens.id_token) {
      const parts = tokens.id_token.split('.');
      if (parts.length !== 3) throw new Error('Malformed id_token');
      claims = normalizeClaims(JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as OidcClaims);
      const nonceClaim = claims.nonce;
      if (nonceClaim && nonceClaim !== pending.nonce) {
        res.redirect('/login?sso_error=Invalid+OIDC+nonce');
        return;
      }
    }

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

    // Find or create user
    let user = await db.getOne<{
      id: string;
      tenant_id: string;
      email: string;
      display_name: string;
      time_format: '12h' | '24h';
      date_format: 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
      is_active: boolean;
    }>(
      'SELECT id, tenant_id, email, display_name, time_format, date_format, is_active FROM users WHERE sso_provider_id = $1',
      [claims.sub],
    );

    if (!user) {
      // Try matching by email
      user = await db.getOne(
        'SELECT id, tenant_id, email, display_name, time_format, date_format, is_active FROM users WHERE email = $1',
        [claims.email],
      );

      if (user) {
        // Link SSO to existing user
        await db.query(
          'UPDATE users SET sso_provider_id = $1 WHERE id = $2',
          [claims.sub, user.id],
        );
        logger.info({ userId: user.id, sub: claims.sub }, 'Linked SSO to existing user');
      }
    }

    if (!user) {
      // Auto-provision new user
      const displayName = claims.name || claims.email.split('@')[0];
      const randomHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

      const newUser = await db.getOne<{ id: string }>(
        `INSERT INTO users (
          tenant_id, email, password_hash, display_name,
          first_name, last_name, sso_provider_id, time_format, date_format, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, '24h', 'YYYY-MM-DD', true)
        RETURNING id`,
        [
          DEFAULT_TENANT,
          claims.email,
          randomHash,
          displayName,
          claims.given_name || null,
          claims.family_name || null,
          claims.sub,
        ],
      );

      // Assign default 'user' role
      const userRole = await db.getOne<{ id: string }>(
        "SELECT id FROM roles WHERE tenant_id = $1 AND name = 'user'",
        [DEFAULT_TENANT],
      );
      if (userRole && newUser) {
        await db.query(
          'INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES ($1, $2, $3)',
          [DEFAULT_TENANT, newUser.id, userRole.id],
        );
      }

      user = await db.getOne(
        'SELECT id, tenant_id, email, display_name, time_format, date_format, is_active FROM users WHERE id = $1',
        [newUser!.id],
      );

      logger.info({ userId: user!.id, email: claims.email }, 'Auto-provisioned SSO user');
    }

    if (!user || !user.is_active) {
      res.redirect('/login?sso_error=Account+is+disabled');
      return;
    }

    // Fetch roles
    const roleRows = await db.getMany<{ name: string }>(
      `SELECT r.name FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1`,
      [user.id],
    );
    const roles = roleRows.map((r) => r.name);

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

    const token = jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    } as jwt.SignOptions);

    logger.info({ userId: user.id, roles }, 'SSO login successful');

    // Redirect to frontend with token
    res.redirect(`/login?sso_token=${encodeURIComponent(token)}`);
  } catch (err) {
    logger.error({ err }, 'SSO callback error');
    next(err);
  }
});

export default router;
