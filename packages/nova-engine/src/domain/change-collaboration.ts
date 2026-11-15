/* SPDX-License-Identifier: AGPL-3.0-only */
import type { PoolClient } from 'pg';
import { AppError } from '../middleware/errorHandler';

export type ChangeJournalEntryType = 'comment' | 'work_note' | 'state_change' | 'assignment';

export type ChangeJournalEntry = {
  id: string;
  change_id: string;
  author_id: string;
  entry_type: ChangeJournalEntryType;
  content: string;
  is_customer_visible: boolean;
  created_at: string;
  author_name?: string;
};

export type ChangeAuditEntry = {
  id: string;
  change_id: string;
  actor_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  actor_name?: string;
};

/** Fields covered by change_audit (stage/status/risk/schedule/assignment). */
export const CHANGE_AUDIT_FIELDS = [
  'stage',
  'status',
  'risk_level',
  'risk_score',
  'scheduled_start',
  'scheduled_end',
  'actual_start',
  'actual_end',
  'assigned_to',
  'assignment_group_id',
] as const;

export type ChangeAuditField = (typeof CHANGE_AUDIT_FIELDS)[number];

function normalizeAuditValue(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export async function listChangeJournal(
  client: PoolClient,
  changeId: string,
): Promise<ChangeJournalEntry[]> {
  const r = await client.query(
    `SELECT j.*, u.display_name AS author_name
     FROM change_journal j
     JOIN users u ON u.id = j.author_id
     WHERE j.change_id = $1
     ORDER BY j.created_at DESC`,
    [changeId],
  );
  return r.rows as ChangeJournalEntry[];
}

export async function addChangeJournalEntry(
  client: PoolClient,
  input: {
    changeId: string;
    authorId: string;
    entryType: ChangeJournalEntryType;
    content: string;
    isCustomerVisible?: boolean;
  },
): Promise<ChangeJournalEntry> {
  const content = input.content.trim();
  if (!content) throw new AppError(400, 'Journal content is required');

  const r = await client.query(
    `INSERT INTO change_journal (
       tenant_id, change_id, author_id, entry_type, content, is_customer_visible
     ) VALUES (
       current_tenant_id(), $1, $2, $3, $4, $5
     )
     RETURNING *`,
    [
      input.changeId,
      input.authorId,
      input.entryType,
      content,
      input.isCustomerVisible ?? false,
    ],
  );
  const author = await client.query(
    `SELECT display_name FROM users WHERE id = $1`,
    [input.authorId],
  );
  return {
    ...(r.rows[0] as ChangeJournalEntry),
    author_name: author.rows[0]?.display_name,
  };
}

export async function listChangeAudit(
  client: PoolClient,
  changeId: string,
): Promise<ChangeAuditEntry[]> {
  const r = await client.query(
    `SELECT a.*, u.display_name AS actor_name
     FROM change_audit a
     JOIN users u ON u.id = a.actor_id
     WHERE a.change_id = $1
     ORDER BY a.created_at DESC`,
    [changeId],
  );
  return r.rows as ChangeAuditEntry[];
}

export async function writeChangeAuditDiff(
  client: PoolClient,
  changeId: string,
  actorId: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Promise<void> {
  for (const field of CHANGE_AUDIT_FIELDS) {
    const oldValue = normalizeAuditValue(before[field]);
    const newValue = normalizeAuditValue(after[field]);
    if (oldValue === newValue) continue;
    await client.query(
      `INSERT INTO change_audit (
         tenant_id, change_id, actor_id, field_name, old_value, new_value
       ) VALUES (
         current_tenant_id(), $1, $2, $3, $4, $5
       )`,
      [changeId, actorId, field, oldValue, newValue],
    );
  }
}

export async function writeChangeStateJournal(
  client: PoolClient,
  input: {
    changeId: string;
    authorId: string;
    before: { status?: unknown; stage?: unknown };
    after: { status?: unknown; stage?: unknown };
    notes?: string | null;
  },
): Promise<void> {
  const parts: string[] = [];
  if (String(input.before.status ?? '') !== String(input.after.status ?? '')) {
    parts.push(`Status: ${input.before.status ?? '—'} → ${input.after.status ?? '—'}`);
  }
  if (String(input.before.stage ?? '') !== String(input.after.stage ?? '')) {
    parts.push(`Stage: ${input.before.stage ?? '—'} → ${input.after.stage ?? '—'}`);
  }
  if (parts.length > 0) {
    await addChangeJournalEntry(client, {
      changeId: input.changeId,
      authorId: input.authorId,
      entryType: 'state_change',
      content: parts.join('; '),
      isCustomerVisible: false,
    });
  }
  const notes = input.notes?.trim();
  if (notes) {
    await addChangeJournalEntry(client, {
      changeId: input.changeId,
      authorId: input.authorId,
      entryType: 'work_note',
      content: notes,
      isCustomerVisible: false,
    });
  }
}
