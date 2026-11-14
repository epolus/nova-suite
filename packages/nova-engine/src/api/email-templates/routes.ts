/* SPDX-License-Identifier: AGPL-3.0-only */
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireRole, setTenantRLS, releaseTenantClient, getRequestClient } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';

const TEMPLATE_COLUMNS = `
  id, name, subject, body, locale, sort_order, is_active, created_at, updated_at
`;

function blankToNull(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function parseSortOrder(raw: unknown, fallback = 100): number {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function parseLocale(raw: unknown, fallback = 'en'): string {
  const locale = String(raw ?? fallback).trim().toLowerCase() || fallback;
  if (locale.length > 16) throw new AppError(400, 'locale is too long');
  return locale;
}

/** Admin CRUD — mounted at /api/admin/email-templates */
const adminRouter = Router();
adminRouter.use(authenticate, requireRole('admin'), setTenantRLS, releaseTenantClient);

adminRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const includeInactive = String(req.query.include_inactive || '') === 'true';
    const r = await client.query(
      `SELECT ${TEMPLATE_COLUMNS}
       FROM email_templates
       WHERE ($1::boolean OR is_active = true)
       ORDER BY sort_order ASC, name ASC`,
      [includeInactive],
    );
    res.json({ email_templates: r.rows });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const name = String(req.body?.name || '').trim();
    if (!name) throw new AppError(400, 'name is required');
    const body = String(req.body?.body ?? '');
    const subject = String(req.body?.subject ?? '');
    const row = await client.query(
      `INSERT INTO email_templates (
         tenant_id, name, subject, body, locale, sort_order, is_active
       ) VALUES (
         current_tenant_id(), $1, $2, $3, $4, $5, $6
       ) RETURNING ${TEMPLATE_COLUMNS}`,
      [
        name,
        subject,
        body,
        parseLocale(req.body?.locale),
        parseSortOrder(req.body?.sort_order, 100),
        req.body?.is_active !== false,
      ],
    );
    res.status(201).json(row.rows[0]);
  } catch (err) {
    next(err);
  }
});

adminRouter.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const id = String(req.params.id);
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;

    if (req.body?.name !== undefined) {
      const name = String(req.body.name || '').trim();
      if (!name) throw new AppError(400, 'name is required');
      sets.push(`name = $${i++}`);
      vals.push(name);
    }
    if (req.body?.subject !== undefined) {
      sets.push(`subject = $${i++}`);
      vals.push(String(req.body.subject ?? ''));
    }
    if (req.body?.body !== undefined) {
      sets.push(`body = $${i++}`);
      vals.push(String(req.body.body ?? ''));
    }
    if (req.body?.locale !== undefined) {
      sets.push(`locale = $${i++}`);
      vals.push(parseLocale(req.body.locale));
    }
    if (req.body?.sort_order !== undefined) {
      sets.push(`sort_order = $${i++}`);
      vals.push(parseSortOrder(req.body.sort_order));
    }
    if (req.body?.is_active !== undefined) {
      sets.push(`is_active = $${i++}`);
      vals.push(Boolean(req.body.is_active));
    }
    if (sets.length === 0) {
      res.json({ success: true });
      return;
    }
    vals.push(id);
    const result = await client.query(
      `UPDATE email_templates SET ${sets.join(', ')}
       WHERE id = $${i} AND tenant_id = current_tenant_id()
       RETURNING id`,
      vals,
    );
    if (result.rowCount === 0) throw new AppError(404, 'Email template not found');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const id = String(req.params.id);
    const result = await client.query(
      `DELETE FROM email_templates WHERE id = $1 AND tenant_id = current_tenant_id() RETURNING id`,
      [id],
    );
    if (result.rowCount === 0) throw new AppError(404, 'Email template not found');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/** Agent-readable list — mounted at /api/email-templates */
const agentRouter = Router();
agentRouter.use(authenticate, setTenantRLS, releaseTenantClient);

agentRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const locale = blankToNull(req.query.locale);
    const r = locale
      ? await client.query(
          `SELECT ${TEMPLATE_COLUMNS}
           FROM email_templates
           WHERE is_active = true
             AND (locale = $1 OR locale = 'en')
           ORDER BY CASE WHEN locale = $1 THEN 0 ELSE 1 END, sort_order ASC, name ASC`,
          [locale],
        )
      : await client.query(
          `SELECT ${TEMPLATE_COLUMNS}
           FROM email_templates
           WHERE is_active = true
           ORDER BY sort_order ASC, name ASC`,
        );
    res.json({ email_templates: r.rows });
  } catch (err) {
    next(err);
  }
});

/** Current user signature — mounted at /api/email-signatures */
const signatureRouter = Router();
signatureRouter.use(authenticate, setTenantRLS, releaseTenantClient);

signatureRouter.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const r = await client.query(
      `SELECT id, body, updated_at
       FROM user_email_signatures
       WHERE user_id = current_user_id()
       LIMIT 1`,
    );
    res.json({
      signature: r.rows[0] || { id: null, body: '', updated_at: null },
    });
  } catch (err) {
    next(err);
  }
});

signatureRouter.put('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const body = String(req.body?.body ?? '');
    const r = await client.query(
      `INSERT INTO user_email_signatures (tenant_id, user_id, body)
       VALUES (current_tenant_id(), current_user_id(), $1)
       ON CONFLICT (tenant_id, user_id) DO UPDATE
         SET body = EXCLUDED.body, updated_at = now()
       RETURNING id, body, updated_at`,
      [body],
    );
    res.json({ signature: r.rows[0] });
  } catch (err) {
    next(err);
  }
});

export {
  adminRouter as emailTemplatesAdminRoutes,
  agentRouter as emailTemplatesAgentRoutes,
  signatureRouter as emailSignatureRoutes,
};
