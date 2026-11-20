/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Incident journal services ───
// Plain-argument services (PoolClient + args). No Request/Response.
import type { PoolClient } from 'pg';
import { NotFound } from '../../middleware/errorHandler';
import { enqueueNotificationDispatchStartJob } from '../../temporal/workflow-start-queue';
import { logger } from '../../logger';
import { replyIncidentStatus } from '../../notifications/chat-threads';
import {
  clearPendingAndResumeSla,
  markIncidentResponded,
  markOlaResponded,
} from './sla-helpers';
import {
  FORBIDDEN_INSUFFICIENT,
  type IncidentActor,
  type IncidentServiceResult,
} from './types';

// ─── GET /api/incidents/:id/journal ───

export async function getJournal(
  client: PoolClient,
  incidentId: string,
): Promise<{ entries: unknown[]; queryMs: number; rowCount: number | null }> {
  const queryStart = Date.now();
  const result = await client.query(
    `SELECT j.*, u.display_name AS author_name
       FROM incident_journal j
       JOIN users u ON u.id = j.author_id
       WHERE j.incident_id = $1
       ORDER BY j.created_at DESC`,
    [incidentId],
  );
  const queryMs = Date.now() - queryStart;
  return { entries: result.rows, queryMs, rowCount: result.rowCount };
}

// ─── POST /api/incidents/:id/journal ───

export async function addJournalEntry(
  client: PoolClient,
  actor: IncidentActor,
  incidentId: string,
  body: { entry_type: string; content: string; is_customer_visible?: boolean },
): Promise<IncidentServiceResult<Record<string, unknown>>> {
  const { entry_type, content, is_customer_visible } = body;

  // Verify incident exists and check permissions
  const incident = await client.query(
    `SELECT id, caller_id, number, title, status, resolution_code, pending_reason,
                assigned_to, assignment_group_id, responded_at,
                sla_paused_at, sla_paused_ms, response_due_at, sla_due_at,
                ola_paused_at, ola_paused_ms, ola_response_due_at, ola_resolution_due_at
         FROM incidents
         WHERE id = $1`,
    [incidentId],
  );
  if (incident.rows.length === 0) {
    throw NotFound('Incident not found');
  }

  const isFulfiller = actor.isFulfiller;
  const isCaller = incident.rows[0].caller_id === actor.id;
  if (!isFulfiller && !isCaller) {
    return FORBIDDEN_INSUFFICIENT;
  }

  const result = await client.query(
    `INSERT INTO incident_journal (
          tenant_id, incident_id, author_id, entry_type, content, is_customer_visible
        ) VALUES (
          current_tenant_id(), $1, $2, $3, $4, $5
        ) RETURNING *`,
    [incidentId, actor.id, entry_type, content, is_customer_visible],
  );

  if (entry_type !== 'state_change') {
    enqueueNotificationDispatchStartJob({
      tenantId: actor.tenant_id,
      entityType: 'incident',
      triggerKey: 'incident.commented',
      entityId: incidentId,
      actorUserId: actor.id,
    }).catch(() => {});
  }

  // Customer replied while waiting for caller response:
  // move incident back to in_progress and notify current owner.
  if (
    !isFulfiller
    && isCaller
    && entry_type !== 'state_change'
    && incident.rows[0].status === 'pending'
    && (incident.rows[0].pending_reason || incident.rows[0].resolution_code) === 'waiting_for_caller'
  ) {
    await client.query(
      `UPDATE incidents
           SET status = 'in_progress', updated_at = now()
           WHERE id = $1`,
      [incidentId],
    );
    await clearPendingAndResumeSla(client, {
      id: incidentId,
      sla_paused_at: incident.rows[0].sla_paused_at,
      sla_paused_ms: incident.rows[0].sla_paused_ms,
      response_due_at: incident.rows[0].response_due_at,
      sla_due_at: incident.rows[0].sla_due_at,
      ola_paused_at: incident.rows[0].ola_paused_at,
      ola_paused_ms: incident.rows[0].ola_paused_ms,
      ola_response_due_at: incident.rows[0].ola_response_due_at,
      ola_resolution_due_at: incident.rows[0].ola_resolution_due_at,
    });
    await client.query(
      `INSERT INTO incident_journal (tenant_id, incident_id, author_id, entry_type, content)
           VALUES (current_tenant_id(), $1, $2, 'state_change', $3)`,
      [
        incidentId,
        actor.id,
        'Status changed from pending to in_progress after caller response',
      ],
    );
    try {
      await replyIncidentStatus(client, {
        id: incidentId,
        number: String(incident.rows[0].number),
        status: 'in_progress',
      });
    } catch (err) {
      logger.warn({ err, incidentId }, 'Chat status reply failed');
    }

    const assignedTo = incident.rows[0].assigned_to as string | null;
    const assignmentGroupId = incident.rows[0].assignment_group_id as string | null;
    const notifyTitle = `${incident.rows[0].number}: caller responded`;
    const notifyBody = `${incident.rows[0].title}: customer added an update. Status moved to in_progress.`;

    if (assignedTo && assignedTo !== actor.id) {
      await client.query(
        `INSERT INTO notifications (tenant_id, user_id, type, title, body, entity_type, entity_id)
             VALUES (current_tenant_id(), $1, 'assignment', $2, $3, 'incident', $4)`,
        [assignedTo, notifyTitle, notifyBody, incidentId],
      );
    } else if (assignmentGroupId) {
      await client.query(
        `INSERT INTO notifications (tenant_id, user_id, type, title, body, entity_type, entity_id)
             SELECT current_tenant_id(), agm.user_id, 'assignment', $2, $3, 'incident', $4
             FROM assignment_group_members agm
             WHERE agm.group_id = $1
               AND agm.user_id <> $5`,
        [assignmentGroupId, notifyTitle, notifyBody, incidentId, actor.id],
      );
    }
  }

  // Detect @mentions and notify mentioned users
  const mentionMatches = content.match(/@([\w.\- ]+)/g);
  if (mentionMatches && mentionMatches.length > 0) {
    const names = [...new Set(mentionMatches.map((m: string) => m.slice(1).trim()))];
    for (const name of names) {
      const mentionedUser = await client.query(
        `SELECT id FROM users WHERE lower(display_name) = lower($1) LIMIT 1`,
        [name],
      );
      if (mentionedUser.rows.length > 0 && mentionedUser.rows[0].id !== actor.id) {
        await client.query(
          `INSERT INTO notifications (tenant_id, user_id, type, title, body, entity_type, entity_id)
               VALUES (current_tenant_id(), $1, 'mention', $2, $3, 'incident', $4)`,
          [
            mentionedUser.rows[0].id,
            `You were mentioned in a journal entry`,
            `${incident.rows[0].number}: ${incident.rows[0].title}`,
            incidentId,
          ],
        );
      }
    }
  }

  // Work note means active processing has started.
  if (entry_type === 'work_note') {
    const current = await client.query(
      `SELECT status, sla_paused_at, sla_paused_ms, response_due_at, sla_due_at, pending_reason,
                  ola_paused_at, ola_paused_ms, ola_response_due_at, ola_resolution_due_at
           FROM incidents WHERE id = $1`,
      [incidentId],
    );
    const status = current.rows[0]?.status as string | undefined;
    if (status && !['in_progress', 'resolved', 'closed', 'cancelled'].includes(status)) {
      await client.query(
        `UPDATE incidents
             SET status = 'in_progress'
             WHERE id = $1`,
        [incidentId],
      );
      await client.query(
        `INSERT INTO incident_journal (tenant_id, incident_id, author_id, entry_type, content)
             VALUES (current_tenant_id(), $1, $2, 'state_change', $3)`,
        [incidentId, actor.id, `Status changed from ${status} to in_progress`],
      );
      try {
        await replyIncidentStatus(client, {
          id: incidentId,
          number: String(incident.rows[0].number),
          status: 'in_progress',
        });
      } catch (err) {
        logger.warn({ err, incidentId }, 'Chat status reply failed');
      }
    }
    if (status === 'pending' || current.rows[0]?.sla_paused_at) {
      await clearPendingAndResumeSla(client, {
        id: incidentId,
        sla_paused_at: current.rows[0]?.sla_paused_at,
        sla_paused_ms: current.rows[0]?.sla_paused_ms,
        response_due_at: current.rows[0]?.response_due_at,
        sla_due_at: current.rows[0]?.sla_due_at,
        ola_paused_at: current.rows[0]?.ola_paused_at,
        ola_paused_ms: current.rows[0]?.ola_paused_ms,
        ola_response_due_at: current.rows[0]?.ola_response_due_at,
        ola_resolution_due_at: current.rows[0]?.ola_resolution_due_at,
      });
    }
  }

  const visibleToCaller = Boolean(is_customer_visible) && entry_type !== 'state_change';
  const workNoteLeavesNew = entry_type === 'work_note' && incident.rows[0].status === 'new';
  if (isFulfiller && !incident.rows[0].responded_at && (visibleToCaller || workNoteLeavesNew)) {
    await markIncidentResponded(client, incidentId);
  }
  if (isFulfiller && (entry_type === 'work_note' || visibleToCaller)) {
    await markOlaResponded(client, incidentId);
  }

  return { ok: true, data: result.rows[0] };
}
