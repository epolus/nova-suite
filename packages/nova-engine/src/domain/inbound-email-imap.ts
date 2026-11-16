/* SPDX-License-Identifier: AGPL-3.0-only */
import { ImapFlow } from 'imapflow';

export type ImapAuth = { user: string; pass: string };

export type ImapLoginProbe = {
  ok: boolean;
  message: string;
  host?: string;
  port?: number;
  folder?: string;
  message_count?: number;
};

export function parseMailboxConfig(raw: unknown): Record<string, unknown> {
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
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

export function parseImapAuth(secret: string, cfg: Record<string, unknown>): ImapAuth {
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

/** Connect, select folder, report message count, disconnect. Does not fetch mail. */
export async function probeImapLogin(opts: {
  host: string;
  port: number;
  secure: boolean;
  folder: string;
  auth: ImapAuth;
}): Promise<ImapLoginProbe> {
  const client = new ImapFlow({
    host: opts.host,
    port: opts.port,
    secure: opts.secure,
    auth: opts.auth,
    logger: false,
  });
  try {
    await client.connect();
    const lock = await client.getMailboxLock(opts.folder);
    try {
      const exists = typeof client.mailbox === 'object' && client.mailbox
        ? Number(client.mailbox.exists || 0)
        : 0;
      return {
        ok: true,
        message: `Login OK — folder "${opts.folder}" has ${exists} message(s)`,
        host: opts.host,
        port: opts.port,
        folder: opts.folder,
        message_count: Number.isFinite(exists) ? exists : 0,
      };
    } finally {
      lock.release();
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'IMAP login failed';
    return {
      ok: false,
      message,
      host: opts.host,
      port: opts.port,
      folder: opts.folder,
    };
  } finally {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }
}
