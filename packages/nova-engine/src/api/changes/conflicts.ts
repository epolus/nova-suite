/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Change conflict detection services ───
// Plain-argument services (PoolClient + args). No Request/Response.
import type { PoolClient } from 'pg';

export async function writeChangeConflictSummary(client: PoolClient, changeId: string): Promise<number> {
  await client.query(
    `UPDATE changes
     SET conflict_summary = COALESCE((
       SELECT jsonb_agg(
         jsonb_build_object(
           'id', cc.id,
           'conflict_type', cc.conflict_type,
           'severity', cc.severity,
           'details', cc.details,
           'conflicting_change_id', cc.conflicting_change_id
         )
         ORDER BY cc.severity DESC, cc.conflict_type
       )
       FROM change_conflicts cc
       WHERE cc.tenant_id = current_tenant_id()
         AND cc.change_id = $1::uuid
     ), '[]'::jsonb)
     WHERE tenant_id = current_tenant_id()
       AND id = $1::uuid`,
    [changeId],
  );
  const blocking = await client.query(
    `SELECT count(*)::int AS blocking
     FROM change_conflicts
     WHERE tenant_id = current_tenant_id()
       AND change_id = $1::uuid
       AND severity = 'blocking'`,
    [changeId],
  );
  return Number(blocking.rows[0]?.blocking || 0);
}

export async function refreshChangeConflicts(
  client: PoolClient,
  changeId: string,
  windowOverride?: { start?: string | null; end?: string | null },
): Promise<number> {
  const changeRes = await client.query(
    `SELECT c.id, c.scheduled_start, c.scheduled_end, c.risk_level
     FROM changes c
     WHERE c.tenant_id = current_tenant_id()
       AND c.id = $1`,
    [changeId],
  );
  if (changeRes.rows.length === 0) return 0;
  const c = changeRes.rows[0];
  const start = windowOverride && 'start' in windowOverride ? windowOverride.start : c.scheduled_start;
  const end = windowOverride && 'end' in windowOverride ? windowOverride.end : c.scheduled_end;
  await client.query(
    `DELETE FROM change_conflicts
     WHERE tenant_id = current_tenant_id()
       AND change_id = $1::uuid`,
    [changeId],
  );
  if (!start || !end) return writeChangeConflictSummary(client, changeId);
  if (new Date(start).getTime() > new Date(end).getTime()) return writeChangeConflictSummary(client, changeId);

  await client.query(
    `INSERT INTO change_conflicts (tenant_id, change_id, conflicting_change_id, conflict_type, severity, details)
     SELECT
       current_tenant_id(),
       $1::uuid,
       c2.id,
       'schedule_overlap',
       CASE
         WHEN $2::change_risk_enum IN ('high'::change_risk_enum, 'very_high'::change_risk_enum) THEN 'blocking'
         ELSE 'warning'
       END,
       'Overlapping schedule windows'
     FROM changes c2
     WHERE c2.tenant_id = current_tenant_id()
       AND c2.id <> $1::uuid
       AND c2.status IN ('approved', 'scheduled', 'implementing', 'implemented', 'reviewing')
       AND tstzrange(c2.scheduled_start, c2.scheduled_end, '[)') && tstzrange($3::timestamptz, $4::timestamptz, '[)')`,
    [changeId, c.risk_level, start, end],
  );

  await client.query(
    `INSERT INTO change_conflicts (tenant_id, change_id, conflict_type, severity, details)
     SELECT current_tenant_id(), $1::uuid, 'blackout_window', 'blocking', 'Scheduled window intersects blackout period: ' || b.name
     FROM change_blackouts b
     WHERE b.tenant_id = current_tenant_id()
       AND tstzrange(b.start_date, b.end_date, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)')`,
    [changeId, start, end],
  );

  await client.query(
    `INSERT INTO change_conflicts (tenant_id, change_id, conflicting_change_id, conflict_type, severity, details)
     SELECT DISTINCT
       current_tenant_id(),
       $1::uuid,
       c2.id,
       'ci_overlap',
       CASE
         WHEN $2::change_risk_enum = 'very_high'::change_risk_enum THEN 'blocking'
         ELSE 'warning'
       END,
       'Multiple changes impact the same CI in overlapping windows'
     FROM change_cis cc
     JOIN change_cis cc2 ON cc2.ci_id = cc.ci_id AND cc2.change_id <> cc.change_id
     JOIN changes c2 ON c2.id = cc2.change_id
     WHERE cc.tenant_id = current_tenant_id()
       AND cc.change_id = $1::uuid
       AND c2.tenant_id = current_tenant_id()
       AND c2.status IN ('approved', 'scheduled', 'implementing', 'implemented', 'reviewing')
       AND tstzrange(c2.scheduled_start, c2.scheduled_end, '[)') && tstzrange($3::timestamptz, $4::timestamptz, '[)')`,
    [changeId, c.risk_level, start, end],
  );

  // Dependency-aware collisions: overlapping changes on related CIs
  // (depends_on / runs_on / part_of via cmdb_impact_analysis + reverse edges).
  await client.query(
    `WITH change_ci_ids AS (
       SELECT cc.ci_id
       FROM change_cis cc
       WHERE cc.tenant_id = current_tenant_id()
         AND cc.change_id = $1::uuid
     ),
     related_cis AS (
       SELECT ci_id FROM change_ci_ids
       UNION
       SELECT ia.ci_id
       FROM change_ci_ids cci
       CROSS JOIN LATERAL cmdb_impact_analysis(cci.ci_id, 5) ia
       UNION
       SELECT r.source_ci_id AS ci_id
       FROM ci_relationships r
       JOIN change_ci_ids cci ON cci.ci_id = r.target_ci_id
       WHERE r.tenant_id = current_tenant_id()
         AND r.relationship_type IN ('depends_on', 'runs_on', 'part_of')
       UNION
       SELECT r.target_ci_id AS ci_id
       FROM ci_relationships r
       JOIN change_ci_ids cci ON cci.ci_id = r.source_ci_id
       WHERE r.tenant_id = current_tenant_id()
         AND r.relationship_type IN ('depends_on', 'runs_on', 'part_of', 'used_by')
     )
     INSERT INTO change_conflicts (tenant_id, change_id, conflicting_change_id, conflict_type, severity, details)
     SELECT DISTINCT
       current_tenant_id(),
       $1::uuid,
       c2.id,
       'dependency_conflict',
       CASE
         WHEN $2::change_risk_enum IN ('high'::change_risk_enum, 'very_high'::change_risk_enum) THEN 'blocking'
         ELSE 'warning'
       END,
       'Overlapping change on a related CI (dependency tree)'
     FROM related_cis rel
     JOIN change_cis cc2 ON cc2.ci_id = rel.ci_id AND cc2.change_id <> $1::uuid
     JOIN changes c2 ON c2.id = cc2.change_id
     WHERE c2.tenant_id = current_tenant_id()
       AND c2.status IN ('approved', 'scheduled', 'implementing', 'implemented', 'reviewing')
       AND c2.scheduled_start IS NOT NULL
       AND c2.scheduled_end IS NOT NULL
       AND tstzrange(c2.scheduled_start, c2.scheduled_end, '[)') && tstzrange($3::timestamptz, $4::timestamptz, '[)')
       AND NOT EXISTS (
         SELECT 1
         FROM change_cis own
         JOIN change_cis other ON other.ci_id = own.ci_id AND other.change_id = c2.id
         WHERE own.tenant_id = current_tenant_id()
           AND own.change_id = $1::uuid
       )`,
    [changeId, c.risk_level, start, end],
  );

  return writeChangeConflictSummary(client, changeId);
}

// ─── GET /api/changes/conflicts/:id ───

export async function listChangeConflicts(client: PoolClient, changeId: string): Promise<unknown[]> {
  const rows = await client.query(
    `SELECT cc.*, c2.number AS conflicting_change_number, c2.title AS conflicting_change_title
       FROM change_conflicts cc
       LEFT JOIN changes c2 ON c2.id = cc.conflicting_change_id
       WHERE cc.tenant_id = current_tenant_id()
         AND cc.change_id = $1
       ORDER BY cc.severity DESC, cc.created_at DESC`,
    [changeId],
  );
  return rows.rows;
}
