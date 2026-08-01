/* SPDX-License-Identifier: AGPL-3.0-only */
import type { PoolClient } from 'pg';
import type { CreateIncidentInput } from '../schemas';
import {
  enqueueIncidentEscalationStartJob,
  enqueueNotificationDispatchStartJob,
} from '../../temporal/workflow-start-queue';

function normalizeGroupName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function createEssIncident(
  client: PoolClient,
  userId: string,
  tenantId: string,
  input: CreateIncidentInput,
): Promise<Record<string, unknown>> {
  const {
    title, description, impact, urgency,
    caller_id, contact_info, request_id,
  } = input;

  const groups = await client.query(
    `SELECT id, name
     FROM assignment_groups
     WHERE is_active = true
     ORDER BY name`,
  );
  const serviceDesk = groups.rows.find(
    (g: { id: string; name: string }) => normalizeGroupName(g.name) === 'servicedesk',
  );
  if (!serviceDesk) {
    throw new Error('Service Desk assignment group not found');
  }

  const priorityResult = await client.query(
    'SELECT calculate_priority($1, $2) AS priority',
    [impact, urgency],
  );
  const priority = priorityResult.rows[0]?.priority || 3;

  const seqResult = await client.query("SELECT nextval('incident_number_seq')");
  const number = `INC${seqResult.rows[0].nextval.toString().padStart(7, '0')}`;

  const slaHoursMap: Record<number, number> = { 1: 4, 2: 8, 3: 24, 4: 48, 5: 72 };
  const slaDueAt = new Date();
  slaDueAt.setHours(slaDueAt.getHours() + (slaHoursMap[priority] || 24));

  const result = await client.query(
    `INSERT INTO incidents (
      tenant_id, number, request_id, title, description,
      status, impact, urgency, priority,
      assigned_to, assignment_group_id, caller_id,
      contact_info, service_id, configuration_item_id,
      category, subcategory, sla_due_at
    ) VALUES (
      current_tenant_id(), $1, $2, $3, $4,
      $5, $6, $7, $8,
      $9, $10, $11,
      $12, $13, $14,
      $15, $16, $17
    ) RETURNING *`,
    [
      number, request_id || null, title, description || null,
      'new', impact, urgency, priority,
      null, serviceDesk.id, caller_id || userId,
      contact_info || null, null, null,
      null, null, slaDueAt.toISOString(),
    ],
  );

  const incident = result.rows[0];

  await client.query(
    `INSERT INTO incident_journal (tenant_id, incident_id, author_id, entry_type, content)
     VALUES (current_tenant_id(), $1, $2, 'state_change', $3)`,
    [incident.id, userId, `Incident created with priority ${priority}`],
  );

  enqueueIncidentEscalationStartJob({
    incidentId: incident.id,
    tenantId,
    priority,
    slaDueAt: slaDueAt.toISOString(),
  }).catch(() => {});

  enqueueNotificationDispatchStartJob({
    tenantId,
    entityType: 'incident',
    triggerKey: 'incident.created',
    entityId: incident.id,
    actorUserId: userId,
  }).catch(() => {});

  return incident;
}
