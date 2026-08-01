/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Tenant credentials (encrypted mini-vault) ─────────────────

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireRole, getRequestClient, setTenantRLS, releaseTenantClient } from '../../middleware/auth';
import { NotFound, BadRequest } from '../../middleware/errorHandler';
import { config } from '../../config';

const router = Router();

router.use(authenticate, setTenantRLS, releaseTenantClient);

const SLUG_RE = /^[a-z][a-z0-9_]*$/;
type CredentialSecretType = 'plain' | 'oauth2_client_credentials';
interface OAuth2CredentialSecret {
  token_url: string;
  client_id: string;
  client_secret: string;
  scope?: string;
  audience?: string;
  grant_type?: string;
}
interface OAuth2CredentialUpdateInput {
  token_url?: string;
  client_id?: string;
  scope?: string | null;
  audience?: string | null;
}

function validateSlug(slug: unknown): slug is string {
  return typeof slug === 'string' && slug.length <= 64 && SLUG_RE.test(slug);
}

function requireVaultKey(req: Request, res: Response, next: NextFunction): void {
  if (!config.credentials.masterKey || config.credentials.masterKey.length < 16) {
    res.status(503).json({
      error: 'Credentials vault is not configured',
      hint: 'Set CREDENTIALS_MASTER_KEY (≥16 chars) on the API server and restart.',
    });
    return;
  }
  next();
}

function parseCredentialSecretMetadata(secret: string): {
  secret_type: CredentialSecretType;
  oauth2?: { token_url: string; client_id: string; scope: string | null; audience: string | null };
} {
  try {
    const parsed = JSON.parse(secret) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { secret_type: 'plain' };
    }
    const authType = String(parsed.auth_type ?? parsed.type ?? '').trim().toLowerCase();
    if (authType !== 'oauth2_client_credentials' && authType !== 'oauth2') {
      return { secret_type: 'plain' };
    }
    return {
      secret_type: 'oauth2_client_credentials',
      oauth2: {
        token_url: typeof parsed.token_url === 'string' ? parsed.token_url : '',
        client_id: typeof parsed.client_id === 'string' ? parsed.client_id : '',
        scope: typeof parsed.scope === 'string' ? parsed.scope : null,
        audience: typeof parsed.audience === 'string' ? parsed.audience : null,
      },
    };
  } catch {
    return { secret_type: 'plain' };
  }
}

function parseOAuth2CredentialSecret(secret: string): OAuth2CredentialSecret | null {
  try {
    const parsed = JSON.parse(secret) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const authType = String(parsed.auth_type ?? parsed.type ?? '').trim().toLowerCase();
    if (authType !== 'oauth2_client_credentials' && authType !== 'oauth2') return null;
    const token_url = typeof parsed.token_url === 'string' ? parsed.token_url.trim() : '';
    const client_id = typeof parsed.client_id === 'string' ? parsed.client_id.trim() : '';
    const client_secret = typeof parsed.client_secret === 'string' ? parsed.client_secret.trim() : '';
    if (!token_url || !client_id || !client_secret) return null;
    return {
      token_url,
      client_id,
      client_secret,
      scope: typeof parsed.scope === 'string' ? parsed.scope.trim() : undefined,
      audience: typeof parsed.audience === 'string' ? parsed.audience.trim() : undefined,
      grant_type: typeof parsed.grant_type === 'string' ? parsed.grant_type.trim() : undefined,
    };
  } catch {
    return null;
  }
}

// ─── GET /api/credentials ─── list metadata (no secrets)
router.get(
  '/',
  requireRole('admin', 'credential_manager', 'catalog_designer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const result = await client.query(
        `SELECT id, slug, label, description, created_at, updated_at
         FROM tenant_credentials
         ORDER BY slug ASC`,
      );
      res.json({ credentials: result.rows });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/credentials/:id ─── detail (no plaintext secret)
router.get(
  '/:id',
  requireRole('admin', 'credential_manager'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const result = await client.query(
        `SELECT id, slug, label, description,
                (secret_enc IS NOT NULL) AS has_secret,
                created_at, updated_at, created_by
         FROM tenant_credentials
         WHERE id = $1`,
        [req.params.id],
      );
      if (result.rows.length === 0) throw NotFound('Credential not found');
      const credential = result.rows[0] as Record<string, unknown>;
      let secretMeta: { secret_type: CredentialSecretType; oauth2?: { token_url: string; client_id: string; scope: string | null; audience: string | null } } = { secret_type: 'plain' };
      if (config.credentials.masterKey && config.credentials.masterKey.length >= 16) {
        const secretRes = await client.query(
          `SELECT pgp_sym_decrypt(secret_enc, $1)::text AS secret
           FROM tenant_credentials
           WHERE id = $2 AND tenant_id = current_tenant_id()`,
          [config.credentials.masterKey, req.params.id],
        );
        if (secretRes.rows.length > 0 && typeof secretRes.rows[0].secret === 'string') {
          secretMeta = parseCredentialSecretMetadata(secretRes.rows[0].secret as string);
        }
      }
      res.json({ credential: { ...credential, ...secretMeta } });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/credentials ───
router.post(
  '/',
  requireRole('admin', 'credential_manager'),
  requireVaultKey,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const { slug, label, description, secret } = req.body ?? {};
      if (!validateSlug(slug)) {
        throw BadRequest('slug must match ^[a-z][a-z0-9_]*$ and be at most 64 characters');
      }
      if (typeof label !== 'string' || !label.trim()) {
        throw BadRequest('label is required');
      }
      if (typeof secret !== 'string' || secret.length === 0) {
        throw BadRequest('secret is required on create');
      }

      const result = await client.query(
        `INSERT INTO tenant_credentials (
           tenant_id, slug, label, description, secret_enc, created_by
         ) VALUES (
           current_tenant_id(), $1, $2, $3,
           pgp_sym_encrypt($4::text, $5::text),
           current_user_id()
         )
         RETURNING id, slug, label, description, created_at, updated_at`,
        [slug, label.trim(), typeof description === 'string' ? description : null, secret, config.credentials.masterKey],
      );

      res.status(201).json({ credential: result.rows[0] });
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: string }).code : undefined;
      if (code === '23505') {
        next(BadRequest('A credential with this slug already exists'));
        return;
      }
      next(err);
    }
  },
);

// ─── PUT /api/credentials/:id ───
router.put(
  '/:id',
  requireRole('admin', 'credential_manager'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const id = req.params.id;
      const body = req.body ?? {};
      const { label, description, secret, secret_type, oauth2 } = body;

      const exists = await client.query(`SELECT id FROM tenant_credentials WHERE id = $1`, [id]);
      if (exists.rows.length === 0) throw NotFound('Credential not found');

      const requestedOauthUpdate =
        secret_type === 'oauth2_client_credentials' && oauth2 && typeof oauth2 === 'object' && !Array.isArray(oauth2);
      const updatingSecret = typeof secret === 'string' && secret.length > 0;
      const updatingOauth = requestedOauthUpdate || updatingSecret;

      if (updatingOauth) {
        if (!config.credentials.masterKey || config.credentials.masterKey.length < 16) {
          res.status(503).json({
            error: 'Credentials vault is not configured',
            hint: 'Set CREDENTIALS_MASTER_KEY (≥16 chars) on the API server and restart.',
          });
          return;
        }
        let secretToStore = typeof secret === 'string' ? secret : '';
        if (requestedOauthUpdate) {
          const currentSecretRes = await client.query(
            `SELECT pgp_sym_decrypt(secret_enc, $1)::text AS secret
             FROM tenant_credentials
             WHERE id = $2 AND tenant_id = current_tenant_id()`,
            [config.credentials.masterKey, id],
          );
          if (currentSecretRes.rows.length === 0 || typeof currentSecretRes.rows[0].secret !== 'string') {
            throw NotFound('Credential not found');
          }
          const currentOauth = parseOAuth2CredentialSecret(currentSecretRes.rows[0].secret as string);
          if (!currentOauth) {
            throw BadRequest('Existing credential is not OAuth2 client-credentials format');
          }
          const oauthInput = oauth2 as OAuth2CredentialUpdateInput;
          const nextTokenUrl = typeof oauthInput.token_url === 'string' && oauthInput.token_url.trim().length > 0
            ? oauthInput.token_url.trim()
            : currentOauth.token_url;
          const nextClientId = typeof oauthInput.client_id === 'string' && oauthInput.client_id.trim().length > 0
            ? oauthInput.client_id.trim()
            : currentOauth.client_id;
          const nextClientSecret = updatingSecret && secret.trim().length > 0
            ? secret.trim()
            : currentOauth.client_secret;
          if (!nextTokenUrl || !nextClientId || !nextClientSecret) {
            throw BadRequest('OAuth2 credential requires token_url, client_id and client_secret');
          }
          const normalizedScope = typeof oauthInput.scope === 'string' ? oauthInput.scope.trim() : oauthInput.scope;
          const normalizedAudience = typeof oauthInput.audience === 'string' ? oauthInput.audience.trim() : oauthInput.audience;
          secretToStore = JSON.stringify({
            auth_type: 'oauth2_client_credentials',
            token_url: nextTokenUrl,
            client_id: nextClientId,
            client_secret: nextClientSecret,
            ...(normalizedScope ? { scope: normalizedScope } : {}),
            ...(normalizedAudience ? { audience: normalizedAudience } : {}),
          });
        }
        const result = await client.query(
          `UPDATE tenant_credentials SET
             label = COALESCE($1::text, label),
             description = CASE WHEN $2::boolean THEN $3::text ELSE description END,
             secret_enc = pgp_sym_encrypt($4::text, $5::text),
             updated_at = now()
           WHERE id = $6 AND tenant_id = current_tenant_id()
           RETURNING id, slug, label, description, created_at, updated_at`,
          [
            typeof label === 'string' ? label.trim() : null,
            Object.prototype.hasOwnProperty.call(body, 'description'),
            typeof description === 'string' || description === null ? description : null,
            secretToStore,
            config.credentials.masterKey,
            id,
          ],
        );
        res.json({ credential: result.rows[0] });
        return;
      }

      const result = await client.query(
        `UPDATE tenant_credentials SET
           label = COALESCE($1::text, label),
           description = CASE WHEN $2::boolean THEN $3::text ELSE description END,
           updated_at = now()
         WHERE id = $4 AND tenant_id = current_tenant_id()
         RETURNING id, slug, label, description, created_at, updated_at`,
        [
          typeof label === 'string' ? label.trim() : null,
          Object.prototype.hasOwnProperty.call(body, 'description'),
          typeof description === 'string' || description === null ? description : null,
          id,
        ],
      );
      res.json({ credential: result.rows[0] });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/credentials/:id/test-token ───
router.post(
  '/:id/test-token',
  requireRole('admin', 'credential_manager'),
  requireVaultKey,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const secretRes = await client.query(
        `SELECT slug, pgp_sym_decrypt(secret_enc, $1)::text AS secret
         FROM tenant_credentials
         WHERE id = $2 AND tenant_id = current_tenant_id()`,
        [config.credentials.masterKey, req.params.id],
      );
      if (secretRes.rows.length === 0) throw NotFound('Credential not found');
      const row = secretRes.rows[0] as { slug: string; secret: string };
      const oauth = parseOAuth2CredentialSecret(row.secret);
      if (!oauth) {
        res.json({ ok: false, error: 'Credential is not a valid OAuth2 client-credentials secret' });
        return;
      }

      const form = new URLSearchParams({
        grant_type: oauth.grant_type || 'client_credentials',
        client_id: oauth.client_id,
        client_secret: oauth.client_secret,
      });
      if (oauth.scope) form.set('scope', oauth.scope);
      if (oauth.audience) form.set('audience', oauth.audience);

      const tokenRes = await fetch(oauth.token_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
      const raw = await tokenRes.text();
      if (!tokenRes.ok) {
        const preview = raw.slice(0, 300).replace(/\s+/g, ' ').trim();
        res.json({ ok: false, error: `Token request failed: HTTP ${tokenRes.status} (${preview})` });
        return;
      }

      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        res.json({ ok: false, error: 'Token endpoint did not return valid JSON' });
        return;
      }
      const accessToken = typeof payload.access_token === 'string' ? payload.access_token : '';
      if (!accessToken) {
        res.json({ ok: false, error: 'Token response missing access_token' });
        return;
      }
      const tokenType = typeof payload.token_type === 'string' ? payload.token_type : 'Bearer';
      const expiresIn =
        typeof payload.expires_in === 'number' && Number.isFinite(payload.expires_in)
          ? Math.floor(payload.expires_in)
          : null;

      const prefix = accessToken.slice(0, 10);
      const suffix = accessToken.slice(-6);
      const masked = `${prefix}...${suffix}`;

      res.json({
        ok: true,
        credential_slug: row.slug,
        token_type: tokenType,
        expires_in: expiresIn,
        access_token_preview: masked,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── DELETE /api/credentials/:id ───
router.delete(
  '/:id',
  requireRole('admin', 'credential_manager'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const result = await client.query(
        `DELETE FROM tenant_credentials WHERE id = $1 AND tenant_id = current_tenant_id() RETURNING id`,
        [req.params.id],
      );
      if (result.rows.length === 0) throw NotFound('Credential not found');
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

export default router;
