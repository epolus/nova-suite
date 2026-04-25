/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Tenant credentials (encrypted mini-vault) ─────────────────

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireRole, getRequestClient, setTenantRLS, releaseTenantClient } from '../../middleware/auth';
import { NotFound, BadRequest } from '../../middleware/errorHandler';
import { config } from '../../config';

const router = Router();

router.use(authenticate, setTenantRLS, releaseTenantClient);

const SLUG_RE = /^[a-z][a-z0-9_]*$/;

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
      res.json({ credential: result.rows[0] });
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
      const { label, description, secret } = body;

      const exists = await client.query(`SELECT id FROM tenant_credentials WHERE id = $1`, [id]);
      if (exists.rows.length === 0) throw NotFound('Credential not found');

      const updatingSecret =
        typeof secret === 'string' && secret.length > 0;

      if (updatingSecret) {
        if (!config.credentials.masterKey || config.credentials.masterKey.length < 16) {
          res.status(503).json({
            error: 'Credentials vault is not configured',
            hint: 'Set CREDENTIALS_MASTER_KEY (≥16 chars) on the API server and restart.',
          });
          return;
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
            secret,
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
