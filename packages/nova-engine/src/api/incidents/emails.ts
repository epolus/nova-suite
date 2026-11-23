/* SPDX-License-Identifier: AGPL-3.0-only */
import type { PoolClient } from 'pg';
import { getIncident } from './mutations';
import type { IncidentActor, IncidentServiceResult } from './types';

export type IncidentEmailRow = {
  id: string;
  direction: string;
  from_address: string;
  to_addresses: string;
  subject: string;
  body_text: string | null;
  created_at: Date | string;
};

export async function listIncidentEmails(
  client: PoolClient,
  actor: IncidentActor,
  incidentId: string,
): Promise<IncidentServiceResult<{ emails: IncidentEmailRow[] }>> {
  const access = await getIncident(client, actor, incidentId);
  if (!access.ok) return access;

  const result = await client.query(
    `SELECT id, direction, from_address, to_addresses, subject, body_text, created_at
       FROM email_messages
      WHERE incident_id = $1
        AND tenant_id = current_tenant_id()
      ORDER BY created_at ASC`,
    [incidentId],
  );
  return { ok: true, data: { emails: result.rows as IncidentEmailRow[] } };
}
