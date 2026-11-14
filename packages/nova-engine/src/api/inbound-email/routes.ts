/* SPDX-License-Identifier: AGPL-3.0-only */
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireRole, setTenantRLS, releaseTenantClient, getRequestClient } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import {
  INBOUND_EMAIL_ACTIONS,
  type InboundEmailAction,
  getMailbox,
  ingestAndProcessInboundEmail,
} from '../../domain/inbound-email';
import { db } from '../../data/db';
import { config } from '../../config';

const MAILBOX_COLUMNS = `
  id, name, address, credential_slug, protocol, config,
  assignment_group_id, default_service_id, poll_interval_seconds,
  last_polled_at, last_uid, is_active, created_at, updated_at
`;

const RULE_COLUMNS = `
  id, mailbox_id, name, sort_order, is_active, stop_on_match,
  match_from_contains, match_from_regex, match_subject_contains, match_subject_regex,
  match_body_contains, match_has_ticket_ref, match_in_reply_to_known,
  action, require_open_incident, journal_entry_type, created_at, updated_at
`;

function blankToNull(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function parsePollInterval(raw: unknown, fallback = 60): number {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(86400, Math.max(30, Math.trunc(n)));
}

function parseSortOrder(raw: unknown, fallback = 100): number {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function parseAction(raw: unknown): InboundEmailAction {
  const action = String(raw || '').trim() as InboundEmailAction;
  if (!(INBOUND_EMAIL_ACTIONS as readonly string[]).includes(action)) {
    throw new AppError(400, `action must be one of: ${INBOUND_EMAIL_ACTIONS.join(', ')}`);
  }
  return action;
}

function parseJournalEntryType(raw: unknown): 'comment' | 'work_note' {
  const v = String(raw || 'comment').trim();
  if (v !== 'comment' && v !== 'work_note') {
    throw new AppError(400, 'journal_entry_type must be comment or work_note');
  }
  return v;
}

function parseConfig(raw: unknown): Record<string, unknown> {
  if (raw === undefined || raw === null) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      throw new AppError(400, 'config must be a JSON object');
    }
    throw new AppError(400, 'config must be a JSON object');
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  throw new AppError(400, 'config must be a JSON object');
}

function requireAutomationSharedKey(req: Request, _res: Response, next: NextFunction): void {
  const configured = config.catalogAutomation.sharedKey;
  if (!configured) {
    next(new AppError(503, 'Catalog automation key is not configured'));
    return;
  }
  const provided = req.headers['x-automation-key'];
  const headerKey = typeof provided === 'string' ? provided.trim() : Array.isArray(provided) ? provided[0]?.trim() : '';
  const authHeader = req.headers.authorization;
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const key = headerKey || bearer;
  if (!key || key !== configured) {
    next(new AppError(401, 'Invalid automation key'));
    return;
  }
  next();
}

// ─── Admin CRUD (mounted under /api/admin/mailboxes and /api/admin/inbound-email-rules) ───

const mailboxesRouter = Router();
mailboxesRouter.use(authenticate, requireRole('admin'), setTenantRLS, releaseTenantClient);

mailboxesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const r = await client.query(
      `SELECT ${MAILBOX_COLUMNS} FROM mailboxes ORDER BY name ASC`,
    );
    res.json({ mailboxes: r.rows });
  } catch (err) {
    next(err);
  }
});

mailboxesRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const name = String(req.body?.name || '').trim();
    const address = String(req.body?.address || '').trim().toLowerCase();
    const credentialSlug = String(req.body?.credential_slug || '').trim();
    if (!name) throw new AppError(400, 'name is required');
    if (!address || !address.includes('@')) throw new AppError(400, 'address must be a valid email');
    if (!credentialSlug) throw new AppError(400, 'credential_slug is required');
    const configJson = parseConfig(req.body?.config);
    const row = await client.query(
      `INSERT INTO mailboxes (
         tenant_id, name, address, credential_slug, protocol, config,
         assignment_group_id, default_service_id, poll_interval_seconds, is_active
       ) VALUES (
         current_tenant_id(), $1, $2, $3, 'imap', $4::jsonb,
         $5, $6, $7, $8
       ) RETURNING ${MAILBOX_COLUMNS}`,
      [
        name,
        address,
        credentialSlug,
        JSON.stringify(configJson),
        blankToNull(req.body?.assignment_group_id),
        blankToNull(req.body?.default_service_id),
        parsePollInterval(req.body?.poll_interval_seconds),
        req.body?.is_active !== false,
      ],
    );
    res.status(201).json(row.rows[0]);
  } catch (err) {
    next(err);
  }
});

mailboxesRouter.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
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
    if (req.body?.address !== undefined) {
      const address = String(req.body.address || '').trim().toLowerCase();
      if (!address || !address.includes('@')) throw new AppError(400, 'address must be a valid email');
      sets.push(`address = $${i++}`);
      vals.push(address);
    }
    if (req.body?.credential_slug !== undefined) {
      const slug = String(req.body.credential_slug || '').trim();
      if (!slug) throw new AppError(400, 'credential_slug is required');
      sets.push(`credential_slug = $${i++}`);
      vals.push(slug);
    }
    if (req.body?.config !== undefined) {
      sets.push(`config = $${i++}::jsonb`);
      vals.push(JSON.stringify(parseConfig(req.body.config)));
    }
    if (req.body?.assignment_group_id !== undefined) {
      sets.push(`assignment_group_id = $${i++}`);
      vals.push(blankToNull(req.body.assignment_group_id));
    }
    if (req.body?.default_service_id !== undefined) {
      sets.push(`default_service_id = $${i++}`);
      vals.push(blankToNull(req.body.default_service_id));
    }
    if (req.body?.poll_interval_seconds !== undefined) {
      sets.push(`poll_interval_seconds = $${i++}`);
      vals.push(parsePollInterval(req.body.poll_interval_seconds));
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
      `UPDATE mailboxes SET ${sets.join(', ')}
       WHERE id = $${i} AND tenant_id = current_tenant_id()
       RETURNING id`,
      vals,
    );
    if (result.rowCount === 0) throw new AppError(404, 'Mailbox not found');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

mailboxesRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const id = String(req.params.id);
    const result = await client.query(
      `DELETE FROM mailboxes WHERE id = $1 AND tenant_id = current_tenant_id() RETURNING id`,
      [id],
    );
    if (result.rowCount === 0) throw new AppError(404, 'Mailbox not found');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

mailboxesRouter.get('/:id/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const id = String(req.params.id);
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || '50'), 10) || 50));
    const mailbox = await getMailbox(client, id);
    if (!mailbox) throw new AppError(404, 'Mailbox not found');
    const r = await client.query(
      `SELECT id, message_id, from_address, to_addresses, subject, processing_status,
              processing_notes, incident_id, matched_rule_id, processed_at, created_at
       FROM email_messages
       WHERE mailbox_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [id, limit],
    );
    res.json({ messages: r.rows });
  } catch (err) {
    next(err);
  }
});

mailboxesRouter.post('/:id/ingest', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const id = String(req.params.id);
    const mailbox = await getMailbox(client, id);
    if (!mailbox) throw new AppError(404, 'Mailbox not found');
    const fromAddress = String(req.body?.from_address || '').trim();
    const subject = String(req.body?.subject || '').trim();
    if (!fromAddress) throw new AppError(400, 'from_address is required');
    const result = await ingestAndProcessInboundEmail(client, req.user!.tenant_id, mailbox, {
      mailbox_id: mailbox.id,
      message_id: blankToNull(req.body?.message_id),
      in_reply_to: blankToNull(req.body?.in_reply_to),
      from_address: fromAddress,
      to_addresses: String(req.body?.to_addresses || mailbox.address),
      subject: subject || '(no subject)',
      body_text: blankToNull(req.body?.body_text),
      body_html: blankToNull(req.body?.body_html),
    });
    res.status(202).json(result);
  } catch (err) {
    next(err);
  }
});

const rulesRouter = Router();
rulesRouter.use(authenticate, requireRole('admin'), setTenantRLS, releaseTenantClient);

rulesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const mailboxId = blankToNull(req.query.mailbox_id);
    const r = mailboxId
      ? await client.query(
          `SELECT ${RULE_COLUMNS}
           FROM inbound_email_rules
           WHERE mailbox_id IS NULL OR mailbox_id = $1
           ORDER BY sort_order ASC, created_at ASC`,
          [mailboxId],
        )
      : await client.query(
          `SELECT ${RULE_COLUMNS}
           FROM inbound_email_rules
           ORDER BY sort_order ASC, created_at ASC`,
        );
    res.json({ inbound_email_rules: r.rows });
  } catch (err) {
    next(err);
  }
});

rulesRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const name = String(req.body?.name || '').trim();
    if (!name) throw new AppError(400, 'name is required');
    const action = parseAction(req.body?.action);
    const mailboxId = blankToNull(req.body?.mailbox_id);
    if (mailboxId) {
      const mb = await getMailbox(client, mailboxId);
      if (!mb) throw new AppError(400, 'mailbox_id not found');
    }
    const row = await client.query(
      `INSERT INTO inbound_email_rules (
         tenant_id, mailbox_id, name, sort_order, is_active, stop_on_match,
         match_from_contains, match_from_regex, match_subject_contains, match_subject_regex,
         match_body_contains, match_has_ticket_ref, match_in_reply_to_known,
         action, require_open_incident, journal_entry_type
       ) VALUES (
         current_tenant_id(), $1, $2, $3, $4, $5,
         $6, $7, $8, $9,
         $10, $11, $12,
         $13, $14, $15
       ) RETURNING ${RULE_COLUMNS}`,
      [
        mailboxId,
        name,
        parseSortOrder(req.body?.sort_order, 100),
        req.body?.is_active !== false,
        req.body?.stop_on_match !== false,
        blankToNull(req.body?.match_from_contains),
        blankToNull(req.body?.match_from_regex),
        blankToNull(req.body?.match_subject_contains),
        blankToNull(req.body?.match_subject_regex),
        blankToNull(req.body?.match_body_contains),
        Boolean(req.body?.match_has_ticket_ref),
        Boolean(req.body?.match_in_reply_to_known),
        action,
        req.body?.require_open_incident !== false,
        parseJournalEntryType(req.body?.journal_entry_type),
      ],
    );
    res.status(201).json(row.rows[0]);
  } catch (err) {
    next(err);
  }
});

rulesRouter.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
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
    if (req.body?.mailbox_id !== undefined) {
      const mailboxId = blankToNull(req.body.mailbox_id);
      if (mailboxId) {
        const mb = await getMailbox(client, mailboxId);
        if (!mb) throw new AppError(400, 'mailbox_id not found');
      }
      sets.push(`mailbox_id = $${i++}`);
      vals.push(mailboxId);
    }
    if (req.body?.sort_order !== undefined) {
      sets.push(`sort_order = $${i++}`);
      vals.push(parseSortOrder(req.body.sort_order));
    }
    if (req.body?.is_active !== undefined) {
      sets.push(`is_active = $${i++}`);
      vals.push(Boolean(req.body.is_active));
    }
    if (req.body?.stop_on_match !== undefined) {
      sets.push(`stop_on_match = $${i++}`);
      vals.push(Boolean(req.body.stop_on_match));
    }
    for (const key of [
      'match_from_contains',
      'match_from_regex',
      'match_subject_contains',
      'match_subject_regex',
      'match_body_contains',
    ] as const) {
      if (req.body?.[key] !== undefined) {
        sets.push(`${key} = $${i++}`);
        vals.push(blankToNull(req.body[key]));
      }
    }
    if (req.body?.match_has_ticket_ref !== undefined) {
      sets.push(`match_has_ticket_ref = $${i++}`);
      vals.push(Boolean(req.body.match_has_ticket_ref));
    }
    if (req.body?.match_in_reply_to_known !== undefined) {
      sets.push(`match_in_reply_to_known = $${i++}`);
      vals.push(Boolean(req.body.match_in_reply_to_known));
    }
    if (req.body?.action !== undefined) {
      sets.push(`action = $${i++}`);
      vals.push(parseAction(req.body.action));
    }
    if (req.body?.require_open_incident !== undefined) {
      sets.push(`require_open_incident = $${i++}`);
      vals.push(Boolean(req.body.require_open_incident));
    }
    if (req.body?.journal_entry_type !== undefined) {
      sets.push(`journal_entry_type = $${i++}`);
      vals.push(parseJournalEntryType(req.body.journal_entry_type));
    }
    if (sets.length === 0) {
      res.json({ success: true });
      return;
    }
    vals.push(id);
    const result = await client.query(
      `UPDATE inbound_email_rules SET ${sets.join(', ')}
       WHERE id = $${i} AND tenant_id = current_tenant_id()
       RETURNING id`,
      vals,
    );
    if (result.rowCount === 0) throw new AppError(404, 'Inbound email rule not found');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

rulesRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const id = String(req.params.id);
    const result = await client.query(
      `DELETE FROM inbound_email_rules WHERE id = $1 AND tenant_id = current_tenant_id() RETURNING id`,
      [id],
    );
    if (result.rowCount === 0) throw new AppError(404, 'Inbound email rule not found');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─── Internal (worker → engine) ───

const internalRouter = Router();

internalRouter.post('/inbound-email', requireAutomationSharedKey, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = String(req.body?.tenant_id || '').trim();
    const mailboxId = String(req.body?.mailbox_id || '').trim();
    if (!tenantId) throw new AppError(400, 'tenant_id is required');
    if (!mailboxId) throw new AppError(400, 'mailbox_id is required');
    const msg = req.body?.message;
    if (!msg || typeof msg !== 'object') throw new AppError(400, 'message is required');
    const fromAddress = String(msg.from_address || '').trim();
    if (!fromAddress) throw new AppError(400, 'message.from_address is required');

    const result = await db.withTenantTransaction(
      tenantId,
      '00000000-0000-0000-0000-000000000000',
      'system',
      async (client) => {
        const mailbox = await getMailbox(client, mailboxId);
        if (!mailbox) throw new AppError(404, 'Mailbox not found');
        return ingestAndProcessInboundEmail(client, tenantId, mailbox, {
          mailbox_id: mailbox.id,
          message_id: blankToNull(msg.message_id),
          in_reply_to: blankToNull(msg.in_reply_to),
          from_address: fromAddress,
          to_addresses: String(msg.to_addresses || mailbox.address),
          subject: String(msg.subject || '(no subject)'),
          body_text: blankToNull(msg.body_text),
          body_html: blankToNull(msg.body_html),
        });
      },
    );
    res.status(202).json(result);
  } catch (err) {
    next(err);
  }
});

export {
  mailboxesRouter as inboundEmailMailboxesRoutes,
  rulesRouter as inboundEmailRulesRoutes,
  internalRouter as inboundEmailInternalRoutes,
};
