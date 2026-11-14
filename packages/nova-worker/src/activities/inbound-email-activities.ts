/* SPDX-License-Identifier: AGPL-3.0-only */
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { loadCredentialSecretsBySlugs } from '@nova-suite/shared/node';
import { config } from '../config';
import { query, withTenantContext } from '../db';

type MailboxPollRow = {
  id: string;
  address: string;
  credential_slug: string;
  protocol: string;
  config: Record<string, unknown> | string | null;
  poll_interval_seconds: number;
  last_polled_at: string | null;
  last_uid: string | number | null;
};

type ImapAuth = { user: string; pass: string };

function parseMailboxConfig(raw: MailboxPollRow['config']): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return raw;
}

function parseImapAuth(secret: string, cfg: Record<string, unknown>): ImapAuth {
  const raw = secret.trim();
  let username = typeof cfg.user === 'string' ? cfg.user : typeof cfg.username === 'string' ? cfg.username : '';
  let password = '';
  if (raw.startsWith('{')) {
    try {
      const o = JSON.parse(raw) as Record<string, unknown>;
      if (typeof o.username === 'string' && o.username) username = o.username;
      if (typeof o.user === 'string' && o.user) username = o.user;
      if (typeof o.password === 'string') password = o.password;
      if (typeof o.pass === 'string' && !password) password = o.pass;
    } catch {
      throw new Error('IMAP credential secret is not valid JSON');
    }
  } else {
    const idx = raw.indexOf(':');
    if (idx > 0) {
      if (!username) username = raw.slice(0, idx);
      password = raw.slice(idx + 1);
    } else {
      password = raw;
    }
  }
  if (!username || !password) {
    throw new Error('IMAP credential requires username and password (user:pass or JSON)');
  }
  return { user: username, pass: password };
}

function addressesToString(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((v) => {
        if (!v || typeof v !== 'object') return String(v || '');
        const o = v as { text?: string; address?: string; name?: string };
        return o.text || o.address || '';
      })
      .filter(Boolean)
      .join(', ');
  }
  if (typeof value === 'object') {
    const o = value as { text?: string; value?: Array<{ address?: string }> };
    if (o.text) return o.text;
    if (Array.isArray(o.value)) {
      return o.value.map((v) => v.address || '').filter(Boolean).join(', ');
    }
  }
  return String(value);
}

async function postInboundMessage(
  tenantId: string,
  mailboxId: string,
  message: {
    message_id: string | null;
    in_reply_to: string | null;
    from_address: string;
    to_addresses: string;
    subject: string;
    body_text: string | null;
    body_html: string | null;
  },
): Promise<void> {
  const key = config.engine.automationKey;
  if (!key) throw new Error('CATALOG_AUTOMATION_SHARED_KEY is not configured');
  const res = await fetch(`${config.engine.baseUrl}/api/internal/inbound-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-automation-key': key,
    },
    body: JSON.stringify({ tenant_id: tenantId, mailbox_id: mailboxId, message }),
  });
  if (!res.ok && res.status !== 202) {
    const text = await res.text().catch(() => '');
    throw new Error(`Inbound email ingest failed (${res.status}): ${text.slice(0, 300)}`);
  }
}

async function pollOneMailbox(tenantId: string, mailbox: MailboxPollRow): Promise<{ fetched: number; errors: number }> {
  const cfg = parseMailboxConfig(mailbox.config);
  const host = String(cfg.host || cfg.imap_host || '').trim();
  if (!host) throw new Error(`Mailbox ${mailbox.address} config.host is required`);
  const port = Number(cfg.port || cfg.imap_port || 993);
  const secure = cfg.secure !== false && cfg.tls !== false;
  const folder = String(cfg.mailbox || cfg.folder || 'INBOX');

  const secrets = await withTenantContext(tenantId, async (client) =>
    loadCredentialSecretsBySlugs(client, config.credentials.masterKey, tenantId, [mailbox.credential_slug]),
  );
  const secret = secrets[mailbox.credential_slug];
  if (!secret) throw new Error(`Credential slug "${mailbox.credential_slug}" not found`);
  const auth = parseImapAuth(secret, cfg);

  const client = new ImapFlow({
    host,
    port: Number.isFinite(port) ? port : 993,
    secure,
    auth,
    logger: false,
  });

  let fetched = 0;
  let errors = 0;
  let maxUid = mailbox.last_uid != null ? Number(mailbox.last_uid) : 0;
  if (!Number.isFinite(maxUid)) maxUid = 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock(folder);
    try {
      const exists = typeof client.mailbox === 'object' && client.mailbox ? client.mailbox.exists : 0;
      if (!exists) {
        await withTenantContext(tenantId, async (dbClient) => {
          await dbClient.query(
            `UPDATE mailboxes SET last_polled_at = now() WHERE id = $1`,
            [mailbox.id],
          );
        });
        return { fetched: 0, errors: 0 };
      }

      // First poll: baseline at uidNext-1 so we do not ingest historical mail.
      if (maxUid <= 0) {
        const uidNext = typeof client.mailbox === 'object' && client.mailbox
          ? Number(client.mailbox.uidNext || 1)
          : 1;
        const baseline = Number.isFinite(uidNext) && uidNext > 1 ? uidNext - 1 : 0;
        await withTenantContext(tenantId, async (dbClient) => {
          await dbClient.query(
            `UPDATE mailboxes SET last_polled_at = now(), last_uid = $2 WHERE id = $1`,
            [mailbox.id, baseline > 0 ? baseline : null],
          );
        });
        return { fetched: 0, errors: 0 };
      }

      const sinceUid = maxUid + 1;
      for await (const msg of client.fetch(`${sinceUid}:*`, {
        uid: true,
        source: true,
        envelope: true,
      })) {
        const uid = Number(msg.uid);
        if (!Number.isFinite(uid) || uid <= maxUid) continue;
        try {
          const source = msg.source;
          if (!source) continue;
          const parsed = await simpleParser(source);
          const fromAddress = addressesToString(parsed.from) || addressesToString(msg.envelope?.from) || 'unknown@unknown';
          const toAddresses =
            addressesToString(parsed.to)
            || addressesToString(msg.envelope?.to)
            || mailbox.address;
          await postInboundMessage(tenantId, mailbox.id, {
            message_id: parsed.messageId || null,
            in_reply_to: parsed.inReplyTo
              ? (Array.isArray(parsed.inReplyTo) ? parsed.inReplyTo[0] : parsed.inReplyTo)
              : null,
            from_address: fromAddress,
            to_addresses: toAddresses,
            subject: parsed.subject || msg.envelope?.subject || '(no subject)',
            body_text: typeof parsed.text === 'string' ? parsed.text : null,
            body_html: typeof parsed.html === 'string' ? parsed.html : null,
          });
          fetched += 1;
        } catch (err) {
          errors += 1;
          console.warn(`[inbound-email] failed message uid=${uid} mailbox=${mailbox.id}:`, err);
        }
        if (uid > maxUid) maxUid = uid;
      }
    } finally {
      lock.release();
    }
  } finally {
    try {
      await client.logout();
    } catch {
      // ignore
    }
  }

  await withTenantContext(tenantId, async (dbClient) => {
    await dbClient.query(
      `UPDATE mailboxes
       SET last_polled_at = now(), last_uid = $2
       WHERE id = $1`,
      [mailbox.id, maxUid > 0 ? maxUid : mailbox.last_uid],
    );
  });

  return { fetched, errors };
}

export async function pollInboundEmailMailboxes(): Promise<{
  tenants: number;
  mailboxes: number;
  fetched: number;
  errors: number;
}> {
  if (!config.credentials.masterKey) {
    console.warn('[inbound-email] CREDENTIALS_MASTER_KEY not set; skipping poll');
    return { tenants: 0, mailboxes: 0, fetched: 0, errors: 0 };
  }

  const tenants = await query<{ id: string }>('SELECT id FROM tenants');
  let mailboxes = 0;
  let fetched = 0;
  let errors = 0;

  for (const tenant of tenants) {
    const due = await withTenantContext(tenant.id, async (client) => {
      const r = await client.query<MailboxPollRow>(
        `SELECT id, address, credential_slug, protocol, config,
                poll_interval_seconds, last_polled_at, last_uid
         FROM mailboxes
         WHERE is_active = true
           AND (
             last_polled_at IS NULL
             OR last_polled_at <= now() - make_interval(secs => poll_interval_seconds)
           )
         ORDER BY last_polled_at NULLS FIRST
         LIMIT 20`,
      );
      return r.rows;
    });

    for (const mailbox of due) {
      mailboxes += 1;
      try {
        const result = await pollOneMailbox(tenant.id, mailbox);
        fetched += result.fetched;
        errors += result.errors;
      } catch (err) {
        errors += 1;
        console.warn(`[inbound-email] poll failed mailbox=${mailbox.id}:`, err);
        await withTenantContext(tenant.id, async (client) => {
          await client.query(
            `UPDATE mailboxes SET last_polled_at = now() WHERE id = $1`,
            [mailbox.id],
          );
        }).catch(() => {});
      }
    }
  }

  return { tenants: tenants.length, mailboxes, fetched, errors };
}
