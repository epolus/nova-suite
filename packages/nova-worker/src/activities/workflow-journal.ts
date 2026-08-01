/* SPDX-License-Identifier: AGPL-3.0-only */
import { log } from '@temporalio/activity';
import type { PoolClient } from 'pg';

/** Resolve a real users.id for automated workflow journal entries (FK-safe). */
export async function resolveWorkflowJournalAuthorId(
  client: PoolClient,
  tenantId: string,
  preferredUserId?: string | null,
): Promise<string | null> {
  if (preferredUserId) {
    const preferred = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE id = $1 AND tenant_id = $2 AND is_active = true`,
      [preferredUserId, tenantId],
    );
    if (preferred.rows.length > 0) return preferredUserId;
  }

  const roleMatch = await client.query<{ id: string }>(
    `SELECT u.id
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id AND ur.tenant_id = u.tenant_id
     JOIN roles r ON r.id = ur.role_id AND r.tenant_id = u.tenant_id
     WHERE u.tenant_id = $1
       AND u.is_active = true
       AND r.name IN ('admin', 'fulfiller')
     ORDER BY CASE r.name WHEN 'admin' THEN 0 ELSE 1 END, u.created_at
     LIMIT 1`,
    [tenantId],
  );
  if (roleMatch.rows.length > 0) return roleMatch.rows[0].id;

  const anyUser = await client.query<{ id: string }>(
    `SELECT id FROM users WHERE tenant_id = $1 AND is_active = true ORDER BY created_at LIMIT 1`,
    [tenantId],
  );
  return anyUser.rows[0]?.id ?? null;
}

export async function insertWorkflowJournalEntry(
  client: PoolClient,
  params: {
    tenantId: string;
    incidentId: string;
    entryType: 'comment' | 'work_note' | 'state_change' | 'assignment';
    content: string;
    preferredAuthorId?: string | null;
  },
): Promise<void> {
  const authorId = await resolveWorkflowJournalAuthorId(
    client,
    params.tenantId,
    params.preferredAuthorId,
  );
  if (!authorId) {
    log.warn('Skipping workflow journal entry — no valid author in tenant', {
      tenantId: params.tenantId,
      incidentId: params.incidentId,
      entryType: params.entryType,
    });
    return;
  }

  await client.query(
    `INSERT INTO incident_journal (tenant_id, incident_id, author_id, entry_type, content)
     VALUES ($1, $2, $3, $4, $5)`,
    [params.tenantId, params.incidentId, authorId, params.entryType, params.content],
  );
}

export async function getIncidentJournalAuthorHint(
  client: PoolClient,
  incidentId: string,
): Promise<string | null> {
  const result = await client.query<{ assigned_to: string | null; manager_id: string | null }>(
    `SELECT i.assigned_to, ag.manager_id
     FROM incidents i
     LEFT JOIN assignment_groups ag ON ag.id = i.assignment_group_id
     WHERE i.id = $1`,
    [incidentId],
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return row.assigned_to ?? row.manager_id ?? null;
}
