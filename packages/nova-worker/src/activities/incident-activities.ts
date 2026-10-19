/* SPDX-License-Identifier: AGPL-3.0-only */
import { log } from '@temporalio/activity';
import { withTenantContext } from '../db';
import { getIncidentJournalAuthorHint, insertWorkflowJournalEntry } from './workflow-journal';
import { dispatchTenantWebhookNotifications } from './webhook-dispatcher';

export interface IncidentInfo {
  id: string;
  tenantId: string;
  number: string;
  title: string;
  status: string;
  priority: number;
  assignedTo: string | null;
  assignmentGroupId: string | null;
  callerId: string | null;
  slaDueAt: string | null;
  slaBreached: boolean;
  responseDueAt: string | null;
  responseBreached: boolean;
  respondedAt: string | null;
  slaPausedAt: string | null;
  slaPausedMs: number;
  slaDefinitionId: string | null;
  warningPct: number | null;
  onWarning: string[];
  onBreach: string[];
}

function asActionList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function getIncident(incidentId: string, tenantId: string): Promise<IncidentInfo | null> {
  log.info('Fetching incident', { incidentId, tenantId });
  const rows = await withTenantContext(tenantId, async (client) => {
    const result = await client.query(
      `SELECT i.id, i.tenant_id, i.number, i.title, i.status, i.priority,
              i.assigned_to, i.assignment_group_id, i.caller_id,
              i.sla_due_at, i.sla_breached,
              i.response_due_at, i.response_breached, i.responded_at,
              i.sla_paused_at, i.sla_paused_ms, i.sla_definition_id,
              sd.warning_pct, sd.on_warning, sd.on_breach
       FROM incidents i
       LEFT JOIN sla_definitions sd ON sd.id = i.sla_definition_id
       WHERE i.id = $1`,
      [incidentId],
    );
    return result.rows;
  });

  if (rows.length === 0) return null;

  const row = rows[0] as Record<string, unknown>;
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    number: row.number as string,
    title: row.title as string,
    status: row.status as string,
    priority: row.priority as number,
    assignedTo: row.assigned_to as string | null,
    assignmentGroupId: row.assignment_group_id as string | null,
    callerId: (row.caller_id as string | null) ?? null,
    slaDueAt: toIso(row.sla_due_at),
    slaBreached: row.sla_breached as boolean,
    responseDueAt: toIso(row.response_due_at),
    responseBreached: Boolean(row.response_breached),
    respondedAt: toIso(row.responded_at),
    slaPausedAt: toIso(row.sla_paused_at),
    slaPausedMs: Number(row.sla_paused_ms ?? 0),
    slaDefinitionId: (row.sla_definition_id as string | null) ?? null,
    warningPct: row.warning_pct == null ? null : Number(row.warning_pct),
    onWarning: asActionList(row.on_warning),
    onBreach: asActionList(row.on_breach),
  };
}

export async function markSlaBreached(incidentId: string, tenantId: string): Promise<void> {
  log.info('Marking resolution SLA breached', { incidentId });
  await withTenantContext(tenantId, async (client) => {
    await client.query(
      'UPDATE incidents SET sla_breached = true WHERE id = $1',
      [incidentId],
    );
    const preferredAuthorId = await getIncidentJournalAuthorHint(client, incidentId);
    await insertWorkflowJournalEntry(client, {
      tenantId,
      incidentId,
      entryType: 'state_change',
      content: 'Resolution SLA breached — automated escalation triggered',
      preferredAuthorId,
    });
  });
}

export async function markResponseBreached(incidentId: string, tenantId: string): Promise<void> {
  log.info('Marking response SLA breached', { incidentId });
  await withTenantContext(tenantId, async (client) => {
    await client.query(
      'UPDATE incidents SET response_breached = true WHERE id = $1',
      [incidentId],
    );
    const preferredAuthorId = await getIncidentJournalAuthorHint(client, incidentId);
    await insertWorkflowJournalEntry(client, {
      tenantId,
      incidentId,
      entryType: 'state_change',
      content: 'Response SLA breached',
      preferredAuthorId,
    });
  });
}

export async function escalateIncident(
  incidentId: string,
  tenantId: string,
  newPriority: number,
): Promise<void> {
  log.info('Escalating incident', { incidentId, newPriority });
  await withTenantContext(tenantId, async (client) => {
    await client.query(
      'UPDATE incidents SET priority = $1 WHERE id = $2 AND priority > $1',
      [newPriority, incidentId],
    );
    const preferredAuthorId = await getIncidentJournalAuthorHint(client, incidentId);
    await insertWorkflowJournalEntry(client, {
      tenantId,
      incidentId,
      entryType: 'state_change',
      content: `Priority escalated to P${newPriority} by automated SLA workflow`,
      preferredAuthorId,
    });
  });
}

export async function autoAssignIncident(
  incidentId: string,
  tenantId: string,
): Promise<boolean> {
  log.info('Attempting auto-assignment', { incidentId });
  return await withTenantContext(tenantId, async (client) => {
    // Find the first active assignment group that covers "Incident Management"
    const groupResult = await client.query(
      `SELECT ag.id, ag.manager_id
       FROM assignment_groups ag
       JOIN assignment_group_processes agp ON agp.group_id = ag.id
       JOIN processes p ON p.id = agp.process_id
       WHERE ag.is_active = true AND p.name ILIKE '%incident%'
       LIMIT 1`,
    );

    if (groupResult.rows.length === 0) return false;

    const group = groupResult.rows[0] as Record<string, unknown>;
    const groupId = group.id as string;
    const managerId = group.manager_id as string | null;

    await client.query(
      `UPDATE incidents SET assignment_group_id = $1, assigned_to = $2,
              status = CASE WHEN status = 'new' THEN 'assigned' ELSE status END
       WHERE id = $3`,
      [groupId, managerId, incidentId],
    );

    const assigneeName = managerId ? 'group manager' : 'assignment group';
    await insertWorkflowJournalEntry(client, {
      tenantId,
      incidentId,
      entryType: 'assignment',
      content: `Auto-assigned to ${assigneeName} via SLA escalation workflow`,
      preferredAuthorId: managerId,
    });
    return true;
  });
}

const NOTIFY_ACTIONS = new Set(['notify_assignee', 'notify_group_manager', 'notify_requester']);

/**
 * Run the SLA definition's configured warning or breach actions.
 * Breach flags and priority escalation are applied by the workflow before this runs.
 */
export async function applySlaActions(
  incidentId: string,
  tenantId: string,
  actions: string[],
  message: string,
  phase: 'warn' | 'breach',
): Promise<void> {
  const wanted = new Set(actions);
  log.info('Applying SLA policy actions', { incidentId, phase, actions });

  await withTenantContext(tenantId, async (client) => {
    if (wanted.has('auto_assign')) {
      const current = await client.query(
        `SELECT assigned_to FROM incidents WHERE id = $1`,
        [incidentId],
      );
      if (current.rows.length > 0 && !current.rows[0].assigned_to) {
        await autoAssignIncident(incidentId, tenantId);
      }
    }

    if (wanted.has('reassign')) {
      const current = await client.query(
        `SELECT i.assigned_to, i.assignment_group_id, ag.manager_id
         FROM incidents i
         LEFT JOIN assignment_groups ag ON ag.id = i.assignment_group_id
         WHERE i.id = $1`,
        [incidentId],
      );
      const row = current.rows[0] as Record<string, unknown> | undefined;
      const managerId = (row?.manager_id as string | null) ?? null;
      const assignedTo = (row?.assigned_to as string | null) ?? null;
      if (managerId && managerId !== assignedTo) {
        await client.query(
          `UPDATE incidents
           SET assigned_to = $1,
               status = CASE WHEN status = 'new' THEN 'assigned' ELSE status END
           WHERE id = $2`,
          [managerId, incidentId],
        );
        await insertWorkflowJournalEntry(client, {
          tenantId,
          incidentId,
          entryType: 'assignment',
          content: 'Reassigned to assignment group manager by SLA policy',
          preferredAuthorId: managerId,
        });
      } else if (!assignedTo) {
        await autoAssignIncident(incidentId, tenantId);
      }
    }

    if (![...wanted].some((action) => NOTIFY_ACTIONS.has(action))) return;

    await sendNotification(incidentId, tenantId, message);

    const incidentRes = await client.query(
      `SELECT i.number, i.title, i.assigned_to, i.caller_id, ag.manager_id
       FROM incidents i
       LEFT JOIN assignment_groups ag ON ag.id = i.assignment_group_id
       WHERE i.id = $1`,
      [incidentId],
    );
    const incident = incidentRes.rows[0] as Record<string, unknown> | undefined;
    if (!incident) return;

    const recipients = new Set<string>();
    if (wanted.has('notify_assignee') && incident.assigned_to) {
      recipients.add(String(incident.assigned_to));
    }
    if (wanted.has('notify_group_manager') && incident.manager_id) {
      recipients.add(String(incident.manager_id));
    }
    if (wanted.has('notify_requester') && incident.caller_id) {
      recipients.add(String(incident.caller_id));
    }

    const title = `Incident ${incident.number}`;
    const notifType = phase === 'breach' ? 'sla_breach' : 'sla_warning';
    for (const userId of recipients) {
      await client.query(
        `INSERT INTO notifications (tenant_id, user_id, type, title, body, entity_type, entity_id)
         VALUES (current_tenant_id(), $1, $2, $3, $4, 'incident', $5)`,
        [userId, notifType, title, message, incidentId],
      );
    }
  });
}

export async function sendNotification(
  incidentId: string,
  tenantId: string,
  message: string,
): Promise<void> {
  log.info('Sending notification', { incidentId, message });
  await withTenantContext(tenantId, async (client) => {
    const preferredAuthorId = await getIncidentJournalAuthorHint(client, incidentId);
    await insertWorkflowJournalEntry(client, {
      tenantId,
      incidentId,
      entryType: 'work_note',
      content: `[Notification] ${message}`,
      preferredAuthorId,
    });

    const incidentRes = await client.query<{ number: string; title: string }>(
      `SELECT number, title FROM incidents WHERE id = $1::uuid`,
      [incidentId],
    );
    const incident = incidentRes.rows[0];
    const title = incident
      ? `Incident ${incident.number}`
      : 'Nova Suite notification';
    const text = incident
      ? `${message}\n${incident.title}`
      : message;

    const webhookResults = await dispatchTenantWebhookNotifications(
      client,
      ['slack', 'teams'],
      { title, text },
      incident ? { entityId: incidentId, entityNumber: incident.number } : undefined,
    );
    log.info('Webhook notification dispatch complete', {
      incidentId,
      attempted: webhookResults.length,
      succeeded: webhookResults.filter((r) => r.ok).length,
    });
  });
}

export async function autoCloseIncident(
  incidentId: string,
  tenantId: string,
): Promise<boolean> {
  log.info('Auto-closing incident if still resolved', { incidentId });
  return await withTenantContext(tenantId, async (client) => {
    const updated = await client.query(
      `UPDATE incidents
       SET status = 'closed',
           closed_at = COALESCE(closed_at, NOW())
       WHERE id = $1 AND status = 'resolved'
       RETURNING number`,
      [incidentId],
    );

    if (updated.rows.length === 0) return false;

    const incidentNumber = String((updated.rows[0] as Record<string, unknown>).number ?? incidentId);
    const preferredAuthorId = await getIncidentJournalAuthorHint(client, incidentId);
    await insertWorkflowJournalEntry(client, {
      tenantId,
      incidentId,
      entryType: 'state_change',
      content: `Status changed from resolved to closed (auto-close after 7 days): ${incidentNumber}`,
      preferredAuthorId,
    });
    return true;
  });
}
