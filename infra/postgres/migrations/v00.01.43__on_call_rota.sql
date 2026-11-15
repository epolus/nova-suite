-- On-call rota: roles + rota_shifts for assignment-group coverage windows.

INSERT INTO roles (tenant_id, name, description)
SELECT t.id, r.name, r.description
FROM tenants t
CROSS JOIN (VALUES
  ('on_call_admin', 'Can manage on-call rota shifts for assignment groups'),
  ('on_call', 'Can view the on-call rota and be scheduled for shifts')
) AS r(name, description)
WHERE NOT EXISTS (
  SELECT 1 FROM roles existing
  WHERE existing.tenant_id = t.id AND existing.name = r.name
);

CREATE TABLE IF NOT EXISTS rota_shifts (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  assignment_group_id  uuid NOT NULL REFERENCES assignment_groups(id) ON DELETE CASCADE,
  user_id              uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starts_at            timestamptz NOT NULL,
  ends_at              timestamptz NOT NULL,
  notes                text,
  created_by           uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rota_shifts_range_chk CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_rota_shifts_group_window
  ON rota_shifts(tenant_id, assignment_group_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_rota_shifts_user_window
  ON rota_shifts(tenant_id, user_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_rota_shifts_covering
  ON rota_shifts(tenant_id, assignment_group_id, starts_at, ends_at);

DROP TRIGGER IF EXISTS trg_rota_shifts_updated_at ON rota_shifts;
CREATE TRIGGER trg_rota_shifts_updated_at
  BEFORE UPDATE ON rota_shifts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE rota_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rota_shifts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_rota_shifts ON rota_shifts;
CREATE POLICY tenant_isolation_rota_shifts ON rota_shifts
  FOR ALL USING (tenant_id = current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON rota_shifts TO nova_runtime;
