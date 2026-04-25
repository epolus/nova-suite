/* SPDX-License-Identifier: AGPL-3.0-only */
import { log } from '@temporalio/activity';
import { withTenantContext } from '../db';

export interface IncidentInfo {
  id: string;
  tenantId: string;
  number: string;
  title: string;
  status: string;
  priority: number;
  assignedTo: string | null;
  assignmentGroupId: string | null;
  slaDueAt: string | null;
  slaBreached: boolean;
}

export async function getIncident(incidentId: string, tenantId: string): Promise<IncidentInfo | null> {
  log.info('Fetching incident', { incidentId, tenantId });
  const rows = await withTenantContext(tenantId, async (client) => {
    const result = await client.query(
      `SELECT id, tenant_id, number, title, status, priority,
              assigned_to, assignment_group_id, sla_due_at, sla_breached
       FROM incidents WHERE id = $1`,
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
    slaDueAt: row.sla_due_at ? (row.sla_due_at as Date).toISOString() : null,
    slaBreached: row.sla_breached as boolean,
  };
}

export async function markSlaBreached(incidentId: string, tenantId: string): Promise<void> {
  log.info('Marking SLA breached', { incidentId });
  await withTenantContext(tenantId, async (client) => {
    await client.query(
      'UPDATE incidents SET sla_breached = true WHERE id = $1',
      [incidentId],
    );
    await client.query(
      `INSERT INTO incident_journal (tenant_id, incident_id, author_id, entry_type, content)
       VALUES ($1, $2, '00000000-0000-0000-0000-000000000000', 'system', $3)`,
      [tenantId, incidentId, 'SLA breached — automated escalation triggered'],
    );
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
    await client.query(
      `INSERT INTO incident_journal (tenant_id, incident_id, author_id, entry_type, content)
       VALUES ($1, $2, '00000000-0000-0000-0000-000000000000', 'system', $3)`,
      [tenantId, incidentId, `Priority escalated to P${newPriority} by automated SLA workflow`],
    );
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
    await client.query(
      `INSERT INTO incident_journal (tenant_id, incident_id, author_id, entry_type, content)
       VALUES ($1, $2, '00000000-0000-0000-0000-000000000000', 'system', $3)`,
      [tenantId, incidentId, `Auto-assigned to ${assigneeName} via SLA escalation workflow`],
    );
    return true;
  });
}

export async function sendNotification(
  incidentId: string,
  tenantId: string,
  message: string,
): Promise<void> {
  // In production this would send email/Slack/webhook — for now, log a journal entry
  log.info('Sending notification', { incidentId, message });
  await withTenantContext(tenantId, async (client) => {
    await client.query(
      `INSERT INTO incident_journal (tenant_id, incident_id, author_id, entry_type, content)
       VALUES ($1, $2, '00000000-0000-0000-0000-000000000000', 'notification', $3)`,
      [tenantId, incidentId, `[Notification] ${message}`],
    );
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
    await client.query(
      `INSERT INTO incident_journal (tenant_id, incident_id, author_id, entry_type, content)
       VALUES ($1, $2, '00000000-0000-0000-0000-000000000000', 'state_change', $3)`,
      [tenantId, incidentId, `Status changed from resolved to closed (auto-close after 7 days): ${incidentNumber}`],
    );
    return true;
  });
}
