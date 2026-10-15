/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Inbound webhooks (phase-2 bi-directional stub) ───
// POST /api/webhooks/inbound/journal – add an incident journal comment
// Auth: X-Nova-Webhook-Secret matching tenant_settings.inbound_webhook_secret
//       (or NOVA_INBOUND_WEBHOOK_SECRET env fallback)

import { Router, Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { db } from '../../data/db';
import { AppError } from '../../middleware/errorHandler';

const router = Router();
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

function secretsEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

router.post('/inbound/journal', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = String(req.body?.tenant_id || req.headers['x-nova-tenant-id'] || '').trim();
    const incidentNumber = String(req.body?.incident_number || '').trim();
    const text = String(req.body?.text || req.body?.content || '').trim();
    const providedSecret = String(
      req.body?.secret
      || req.headers['x-nova-webhook-secret']
      || '',
    ).trim();

    if (!tenantId) throw new AppError(400, 'tenant_id is required');
    if (!incidentNumber) throw new AppError(400, 'incident_number is required');
    if (!text) throw new AppError(400, 'text is required');
    if (!providedSecret) throw new AppError(401, 'webhook secret is required');

    const envSecret = process.env.NOVA_INBOUND_WEBHOOK_SECRET || '';

    await db.withTenantContext(tenantId, SYSTEM_USER_ID, 'system', async () => {
      const setting = await db.getOne<{ value: string }>(
        `SELECT value FROM tenant_settings
         WHERE tenant_id = $1 AND key = 'inbound_webhook_secret'
         LIMIT 1`,
        [tenantId],
      );
      const expected = (setting?.value || envSecret).trim();
      if (!expected) {
        throw new AppError(503, 'Inbound webhook secret is not configured for this tenant');
      }
      if (!secretsEqual(providedSecret, expected)) {
        throw new AppError(401, 'Invalid webhook secret');
      }

      const incident = await db.getOne<{ id: string; number: string }>(
        `SELECT id, number FROM incidents
         WHERE tenant_id = $1 AND number = $2
         LIMIT 1`,
        [tenantId, incidentNumber],
      );
      if (!incident) throw new AppError(404, `Incident ${incidentNumber} not found`);

      const author = await db.getOne<{ id: string }>(
        `SELECT u.id
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id AND ur.tenant_id = u.tenant_id
         JOIN roles r ON r.id = ur.role_id AND r.tenant_id = u.tenant_id
         WHERE u.tenant_id = $1
           AND u.is_active = true
           AND r.name IN ('admin', 'fulfiller', 'system')
         ORDER BY CASE r.name WHEN 'admin' THEN 0 WHEN 'fulfiller' THEN 1 ELSE 2 END, u.created_at
         LIMIT 1`,
        [tenantId],
      );
      if (!author) throw new AppError(500, 'No author available to attribute inbound journal entry');

      const entry = await db.getOne(
        `INSERT INTO incident_journal (
          tenant_id, incident_id, author_id, entry_type, content, is_customer_visible
        ) VALUES (
          $1, $2, $3, 'comment', $4, true
        ) RETURNING id, incident_id, entry_type, content, created_at`,
        [tenantId, incident.id, author.id, `[Inbound webhook] ${text}`],
      );

      res.status(201).json({
        success: true,
        incident_number: incident.number,
        entry,
      });
    });
  } catch (err) {
    next(err);
  }
});

export default router;
