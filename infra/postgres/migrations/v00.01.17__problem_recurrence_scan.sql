-- Scheduled problem recurrence candidates written by the Temporal scan.

CREATE TABLE IF NOT EXISTS problem_recurrence_scans (
  tenant_id        uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  scanned_at       timestamptz NOT NULL,
  candidate_count  integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS problem_recurrence_candidates (
  id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id               uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  seed_incident_id        uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  representative_title    text NOT NULL,
  configuration_item_id   uuid REFERENCES configuration_items(id) ON DELETE SET NULL,
  service_id              uuid REFERENCES services(id) ON DELETE SET NULL,
  incident_ids            uuid[] NOT NULL,
  incidents               jsonb NOT NULL,
  incident_count          integer NOT NULL,
  avg_similarity          double precision NOT NULL,
  scanned_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, seed_incident_id)
);

CREATE INDEX IF NOT EXISTS idx_problem_recurrence_candidates_tenant
  ON problem_recurrence_candidates(tenant_id, incident_count DESC, avg_similarity DESC);

ALTER TABLE problem_recurrence_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE problem_recurrence_scans FORCE ROW LEVEL SECURITY;
ALTER TABLE problem_recurrence_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE problem_recurrence_candidates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_problem_recurrence_scans ON problem_recurrence_scans;
CREATE POLICY tenant_isolation_problem_recurrence_scans ON problem_recurrence_scans
  FOR ALL USING (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_problem_recurrence_candidates ON problem_recurrence_candidates;
CREATE POLICY tenant_isolation_problem_recurrence_candidates ON problem_recurrence_candidates
  FOR ALL USING (tenant_id = current_tenant_id());
