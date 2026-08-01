/* SPDX-License-Identifier: AGPL-3.0-only */
import type { PoolClient } from 'pg';
import { createIncidentSchema } from '../domain/schemas';
import { createEssIncident } from '../domain/incidents/create-ess-incident';
import { AppError } from '../middleware/errorHandler';
import type { AiPendingActionType } from './types';

export async function confirmPendingAction(
  client: PoolClient,
  userId: string,
  tenantId: string,
  actionType: AiPendingActionType,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  switch (actionType) {
    case 'propose_create_incident': {
      const parsed = createIncidentSchema.parse(payload);
      const incident = await createEssIncident(client, userId, tenantId, parsed);
      return { incident, path: `/incidents/${incident.id}` };
    }
    case 'propose_work_note': {
      const incidentId = String(payload.incident_id ?? '');
      const content = String(payload.content ?? '').trim();
      const entryType = payload.entry_type === 'work_note' ? 'work_note' : 'comment';
      const isCustomerVisible = payload.is_customer_visible !== false;
      if (!incidentId || !content) throw new AppError(400, 'Invalid work note payload');

      const inc = await client.query('SELECT id FROM incidents WHERE id = $1', [incidentId]);
      if (inc.rows.length === 0) throw new AppError(404, 'Incident not found');

      const result = await client.query(
        `INSERT INTO incident_journal (
          tenant_id, incident_id, author_id, entry_type, content, is_customer_visible
        ) VALUES (current_tenant_id(), $1, $2, $3, $4, $5) RETURNING *`,
        [incidentId, userId, entryType, content, isCustomerVisible],
      );
      return { journal_entry: result.rows[0] };
    }
    case 'propose_automation_config':
    case 'propose_catalog_task_patch':
      return {
        acknowledged: true,
        payload,
        message: 'Apply this configuration in the catalog task editor and save.',
      };
    default:
      throw new AppError(400, `Unsupported action type: ${actionType}`);
  }
}
