/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Change journal / audit services ───
// Plain-argument services (PoolClient + args). No Request/Response.
// Thin wrappers around domain/change-collaboration.
import type { PoolClient } from 'pg';
import { AppError, NotFound } from '../../middleware/errorHandler';
import {
  addChangeJournalEntry,
  listChangeAudit,
  listChangeJournal,
} from '../../domain/change-collaboration';
import { canWorkOnChange } from './permissions';
import type { ChangeActor } from './types';

async function assertChangeExists(client: PoolClient, changeId: string): Promise<void> {
  const exists = await client.query(
    `SELECT 1 FROM changes WHERE tenant_id = current_tenant_id() AND id = $1`,
    [changeId],
  );
  if (exists.rowCount === 0) throw NotFound('Change not found');
}

// ─── GET /api/changes/:id/journal ───

export async function getJournal(client: PoolClient, changeId: string): Promise<unknown[]> {
  await assertChangeExists(client, changeId);
  return listChangeJournal(client, changeId);
}

// ─── POST /api/changes/:id/journal ───

export async function addJournalEntry(
  client: PoolClient,
  actor: ChangeActor,
  changeId: string,
  body: { entry_type: string; content: string; is_customer_visible?: boolean },
): Promise<unknown> {
  const changeRes = await client.query(
    `SELECT * FROM changes WHERE tenant_id = current_tenant_id() AND id = $1`,
    [changeId],
  );
  if (changeRes.rowCount === 0) throw NotFound('Change not found');
  const canWork = await canWorkOnChange(client, actor, changeRes.rows[0]);
  if (!canWork) throw new AppError(403, 'Insufficient permissions');

  return addChangeJournalEntry(client, {
    changeId,
    authorId: actor.id,
    entryType: body.entry_type as any,
    content: body.content,
    isCustomerVisible: Boolean(body.is_customer_visible),
  });
}

// ─── GET /api/changes/:id/audit ───

export async function getAudit(client: PoolClient, changeId: string): Promise<unknown[]> {
  await assertChangeExists(client, changeId);
  return listChangeAudit(client, changeId);
}
