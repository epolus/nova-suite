/* SPDX-License-Identifier: AGPL-3.0-only */
import {
  DEFAULT_RECURRENCE_THRESHOLD,
  DEFAULT_TITLE_SIMILARITY,
  PROBLEM_RECURRENCE_CANDIDATE_SQL,
} from '@nova-suite/shared';
import { query, withTenantContext } from '../db';

type CandidateRow = {
  seed_id: string;
  representative_title: string;
  configuration_item_id: string | null;
  service_id: string | null;
  incident_ids: string[];
  incidents: unknown;
  incident_count: number;
  avg_similarity: number;
};

export async function scanProblemRecurrenceForAllTenants(): Promise<{ tenants: number; candidates: number }> {
  const tenants = await query<{ id: string }>('SELECT id FROM tenants');
  let candidates = 0;
  for (const tenant of tenants) {
    candidates += await withTenantContext(tenant.id, async (client) => {
      await client.query('BEGIN');
      try {
        const found = await client.query<CandidateRow>(
          PROBLEM_RECURRENCE_CANDIDATE_SQL,
          [DEFAULT_TITLE_SIMILARITY, DEFAULT_RECURRENCE_THRESHOLD],
        );
        await client.query(
          `DELETE FROM problem_recurrence_candidates WHERE tenant_id = current_tenant_id()`,
        );
        for (const row of found.rows) {
          await client.query(
            `INSERT INTO problem_recurrence_candidates (
               tenant_id, seed_incident_id, representative_title,
               configuration_item_id, service_id, incident_ids, incidents,
               incident_count, avg_similarity, scanned_at
             ) VALUES (
               current_tenant_id(), $1, $2, $3, $4, $5::uuid[], $6::jsonb, $7, $8, now()
             )`,
            [
              row.seed_id,
              row.representative_title,
              row.configuration_item_id,
              row.service_id,
              row.incident_ids,
              JSON.stringify(row.incidents ?? []),
              row.incident_count,
              row.avg_similarity,
            ],
          );
        }
        await client.query(
          `INSERT INTO problem_recurrence_scans (tenant_id, scanned_at, candidate_count)
           VALUES (current_tenant_id(), now(), $1)
           ON CONFLICT (tenant_id) DO UPDATE
             SET scanned_at = EXCLUDED.scanned_at,
                 candidate_count = EXCLUDED.candidate_count`,
          [found.rows.length],
        );
        await client.query('COMMIT');
        return found.rows.length;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    });
  }
  return { tenants: tenants.length, candidates };
}
