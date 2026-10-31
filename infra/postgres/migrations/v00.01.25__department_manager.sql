-- Department manager and external_id (existing databases).

ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS external_id text;

CREATE INDEX IF NOT EXISTS idx_departments_manager
  ON departments(manager_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_departments_tenant_external_id
  ON departments(tenant_id, external_id)
  WHERE external_id IS NOT NULL;
