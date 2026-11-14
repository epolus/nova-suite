-- Time entries on incidents, request tasks, problem tasks, and changes.

CREATE TABLE IF NOT EXISTS work_logs (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type          text NOT NULL
                       CHECK (entity_type IN ('incident', 'request_task', 'problem_task', 'change')),
  entity_id            uuid NOT NULL,
  user_id              uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  minutes              integer NOT NULL CHECK (minutes > 0 AND minutes <= 24 * 60),
  worked_on            date NOT NULL DEFAULT (CURRENT_DATE),
  note                 text,
  is_customer_visible  boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_logs_entity
  ON work_logs(tenant_id, entity_type, entity_id, worked_on DESC);
CREATE INDEX IF NOT EXISTS idx_work_logs_user
  ON work_logs(tenant_id, user_id, worked_on DESC);

DROP TRIGGER IF EXISTS trg_work_logs_updated_at ON work_logs;
CREATE TRIGGER trg_work_logs_updated_at
  BEFORE UPDATE ON work_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE work_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_work_logs ON work_logs;
CREATE POLICY tenant_isolation_work_logs ON work_logs
  FOR ALL USING (tenant_id = current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON work_logs TO nova_runtime;
