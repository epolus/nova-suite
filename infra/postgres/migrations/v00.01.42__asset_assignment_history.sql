-- Asset assignment history: assign/return keeps assets.owner_user_id in sync.

CREATE TABLE IF NOT EXISTS asset_assignments (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  asset_id      uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_by   uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_at   timestamptz NOT NULL DEFAULT now(),
  returned_at   timestamptz,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_assignments_asset
  ON asset_assignments(tenant_id, asset_id, assigned_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_assignments_open
  ON asset_assignments(tenant_id, asset_id)
  WHERE returned_at IS NULL;

DROP TRIGGER IF EXISTS trg_asset_assignments_updated_at ON asset_assignments;
CREATE TRIGGER trg_asset_assignments_updated_at
  BEFORE UPDATE ON asset_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE asset_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_assignments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_asset_assignments ON asset_assignments;
CREATE POLICY tenant_isolation_asset_assignments ON asset_assignments
  FOR ALL USING (tenant_id = current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON asset_assignments TO nova_runtime;
