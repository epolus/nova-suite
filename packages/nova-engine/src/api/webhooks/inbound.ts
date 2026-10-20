/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Inbound webhooks (phase-2 bi-directional stub) ───
// POST /api/webhooks/inbound/journal – add an incident journal comment
// Auth: X-Nova-Webhook-Secret matching tenant_settings.inbound_webhook_secret
//       (or NOVA_INBOUND_WEBHOOK_SECRET env fallback)

import { Router, Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { parseChatInbound, parseInboundAlerts } from '@nova-suite/shared';
import { db } from '../../data/db';
import { AppError } from '../../middleware/errorHandler';
import { recordChatInbound, replyIncidentStatus } from '../../notifications/chat-threads';
import { logger } from '../../logger';
import { slackSignatureValid } from '../../notifications/slack-signature';
import { ingestAlerts } from '../../domain/alerts';
import { signalIncidentResolved } from '../../temporal/workflows';

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

function readTenantId(req: Request): string {
  const query = req.query.tenant_id;
  const fromQuery = Array.isArray(query) ? query[0] : query;
  return String(req.body?.tenant_id || fromQuery || req.headers['x-nova-tenant-id'] || '').trim();
}

async function chatRequestAuthorized(req: Request): Promise<boolean> {
  const raw = (req as Request & { rawBody?: Buffer }).rawBody?.toString('utf8') || '';
  const signature = String(req.headers['x-slack-signature'] || '');
  const timestamp = String(req.headers['x-slack-request-timestamp'] || '');
  if (signature && timestamp && raw) {
    const secrets = await db.getMany<{ signing_secret: string }>(
      `SELECT signing_secret
       FROM tenant_notification_webhooks
       WHERE tenant_id = current_tenant_id()
         AND channel = 'slack'
         AND is_active = true
         AND signing_secret IS NOT NULL`,
    );
    if (secrets.some((row) => slackSignatureValid(raw, timestamp, signature, row.signing_secret))) {
      return true;
    }
  }

  const provided = String(req.body?.secret || req.headers['x-nova-webhook-secret'] || '').trim();
  if (!provided) return false;
  const setting = await db.getOne<{ value: string }>(
    `SELECT value FROM tenant_settings
     WHERE tenant_id = current_tenant_id() AND key = 'inbound_webhook_secret'
     LIMIT 1`,
  );
  const expected = (setting?.value || process.env.NOVA_INBOUND_WEBHOOK_SECRET || '').trim();
  if (!expected) return false;
  return secretsEqual(provided, expected);
}

async function sharedSecretAuthorized(req: Request): Promise<boolean> {
  const provided = String(
    req.body?.secret
    || req.headers['x-nova-webhook-secret']
    || (String(req.headers.authorization || '').toLowerCase().startsWith('bearer ')
      ? String(req.headers.authorization).slice(7)
      : '')
    || '',
  ).trim();
  if (!provided) return false;
  const setting = await db.getOne<{ value: string }>(
    `SELECT value FROM tenant_settings
     WHERE tenant_id = current_tenant_id() AND key = 'inbound_webhook_secret'
     LIMIT 1`,
  );
  const expected = (setting?.value || process.env.NOVA_INBOUND_WEBHOOK_SECRET || '').trim();
  if (!expected) return false;
  return secretsEqual(provided, expected);
}

router.post('/inbound/events', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const alerts = parseInboundAlerts(req.body);
    if (!alerts) throw new AppError(400, 'Unrecognized alert payload');
    const tenantId = readTenantId(req);
    if (!tenantId) throw new AppError(400, 'tenant_id is required');
    const allowed = await db.withTenantContext(tenantId, SYSTEM_USER_ID, 'system', () => sharedSecretAuthorized(req));
    if (!allowed) throw new AppError(401, 'Invalid webhook secret');
    const results = await ingestAlerts(tenantId, alerts);
    for (const row of results) {
      if (row.resolvedIncidentId) signalIncidentResolved(row.resolvedIncidentId).catch(() => {});
    }
    res.status(202).json({
      results: results.map((row) => ({
        fingerprint: row.fingerprint,
        duplicate: row.duplicate,
        alert_number: row.alertNumber,
        incident_number: row.incidentNumber,
        resolved: Boolean(row.resolvedIncidentId),
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/inbound/chat', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = parseChatInbound(req.body);
    if (!parsed) throw new AppError(400, 'Unrecognized chat payload');
    const tenantId = readTenantId(req);
    if (!tenantId) throw new AppError(400, 'tenant_id is required');

    const outcome = await db.withTenantTransaction(tenantId, SYSTEM_USER_ID, 'system', async () => {
      if (!(await chatRequestAuthorized(req))) {
        throw new AppError(401, 'Invalid webhook signature or secret');
      }
      if ('challenge' in parsed) return { kind: 'challenge' as const, challenge: parsed.challenge };
      if (parsed.fromBot || !parsed.text) return { kind: 'ignored' as const };

      const author = await db.getOne<{ id: string }>(
        `SELECT u.id
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id AND ur.tenant_id = u.tenant_id
         JOIN roles r ON r.id = ur.role_id AND r.tenant_id = u.tenant_id
         WHERE u.tenant_id = current_tenant_id()
           AND u.is_active = true
           AND r.name IN ('admin', 'fulfiller', 'system')
         ORDER BY CASE r.name WHEN 'admin' THEN 0 WHEN 'fulfiller' THEN 1 ELSE 2 END, u.created_at
         LIMIT 1`,
      );
      if (!author) throw new AppError(500, 'No author available to attribute inbound journal entry');
      return recordChatInbound(parsed, author.id);
    });

    if (outcome.kind === 'challenge') {
      res.json({ challenge: outcome.challenge });
      return;
    }
    if (outcome.kind === 'ignored') {
      res.json({ success: true, ignored: true });
      return;
    }
    if (outcome.kind === 'duplicate') {
      res.json({ success: true, already_processed: true });
      return;
    }
    if (outcome.kind === 'missing') {
      throw new AppError(404, 'No incident matches this chat message');
    }

    try {
      await db.withTenantContext(tenantId, SYSTEM_USER_ID, 'system', async (client) => {
        await replyIncidentStatus(client, {
          id: outcome.incidentId,
          number: outcome.incidentNumber,
          status: outcome.status,
        });
      });
    } catch (err) {
      logger.warn({ err, incidentId: outcome.incidentId }, 'Chat status reply failed');
    }
    res.status(201).json({
      success: true,
      incident_number: outcome.incidentNumber,
      status: outcome.status,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
