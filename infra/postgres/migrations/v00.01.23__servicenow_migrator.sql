-- ServiceNow catalog migrator runs and approval checkpoints for suspended catalog automations.
ALTER TABLE request_tasks
  ADD COLUMN IF NOT EXISTS automation_checkpoint jsonb,
  ADD COLUMN IF NOT EXISTS parent_task_id uuid REFERENCES request_tasks(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS migration_runs (
  id                     uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id              uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source                 text        NOT NULL CHECK (source IN ('servicenow')),
  instance_url           text        NOT NULL,
  credential_slug        text        NOT NULL,
  options                jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status                 text        NOT NULL DEFAULT 'queued'
                         CHECK (status IN ('queued', 'extracting', 'transforming', 'ready', 'applying', 'applied', 'failed')),
  progress               jsonb       NOT NULL DEFAULT '{}'::jsonb,
  snapshot               jsonb,
  package                jsonb,
  report                 jsonb,
  error                  text,
  config_package_run_id  uuid        REFERENCES config_deployment_runs(id) ON DELETE SET NULL,
  created_by             uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  completed_at           timestamptz
);

CREATE INDEX IF NOT EXISTS idx_migration_runs_tenant_created
  ON migration_runs (tenant_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_migration_runs_updated_at ON migration_runs;
CREATE TRIGGER trg_migration_runs_updated_at
  BEFORE UPDATE ON migration_runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE migration_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_migration_runs ON migration_runs;
CREATE POLICY tenant_isolation_migration_runs ON migration_runs
  FOR ALL USING (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'system')
  )
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'system')
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nova_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON migration_runs TO nova_runtime;
  END IF;
END
$$;
