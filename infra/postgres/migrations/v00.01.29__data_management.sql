-- Retention jobs: data_manager role, incident access, and job history.

INSERT INTO roles (tenant_id, name, description)
SELECT t.id, r.name, r.description
FROM tenants t
CROSS JOIN (VALUES
  ('data_manager', 'Can run retention jobs on allowlisted records')
) AS r(name, description)
WHERE NOT EXISTS (
  SELECT 1 FROM roles existing
  WHERE existing.tenant_id = t.id AND existing.name = r.name
);

DROP POLICY IF EXISTS tenant_isolation_incidents ON incidents;
CREATE POLICY tenant_isolation_incidents ON incidents
  FOR ALL USING (
    tenant_id = current_tenant_id()
    AND (
      current_user_has_role('admin', 'fulfiller', 'system', 'data_manager')
      OR caller_id = current_user_id()
      OR EXISTS (
        SELECT 1
        FROM incident_journal j
        WHERE j.incident_id = incidents.id
          AND j.author_id = current_user_id()
          AND j.entry_type = 'state_change'
          AND j.content LIKE 'Incident created with priority%'
      )
    )
  );

CREATE TABLE IF NOT EXISTS data_management_jobs (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_user_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  target          text NOT NULL CHECK (target IN ('incidents')),
  action          text NOT NULL CHECK (action IN ('delete', 'archive')),
  filters         jsonb NOT NULL,
  include_open    boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  match_count     integer,
  affected_count  integer NOT NULL DEFAULT 0,
  error           text,
  workflow_id     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  started_at      timestamptz,
  completed_at    timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_data_management_jobs_tenant
  ON data_management_jobs(tenant_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_data_management_jobs_updated_at ON data_management_jobs;
CREATE TRIGGER trg_data_management_jobs_updated_at
  BEFORE UPDATE ON data_management_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE data_management_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_management_jobs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_data_management_jobs ON data_management_jobs;
CREATE POLICY tenant_isolation_data_management_jobs ON data_management_jobs
  FOR ALL
  USING (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'data_manager', 'system')
  )
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'data_manager', 'system')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON data_management_jobs TO nova_runtime;
