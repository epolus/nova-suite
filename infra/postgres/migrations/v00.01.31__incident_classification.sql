-- Tenant-scoped incident categories (tree) and resolution codes; FK columns on incidents.

CREATE TABLE IF NOT EXISTS incident_categories (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text,
  parent_id     uuid REFERENCES incident_categories(id) ON DELETE SET NULL,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, parent_id, name)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_incident_categories_root_name
  ON incident_categories(tenant_id, name)
  WHERE parent_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_incident_categories_tenant
  ON incident_categories(tenant_id, is_active);

DROP TRIGGER IF EXISTS trg_incident_categories_updated_at ON incident_categories;
CREATE TRIGGER trg_incident_categories_updated_at
  BEFORE UPDATE ON incident_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS incident_resolution_codes (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code          text NOT NULL,
  label         text NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_incident_resolution_codes_tenant
  ON incident_resolution_codes(tenant_id, is_active);

DROP TRIGGER IF EXISTS trg_incident_resolution_codes_updated_at ON incident_resolution_codes;
CREATE TRIGGER trg_incident_resolution_codes_updated_at
  BEFORE UPDATE ON incident_resolution_codes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES incident_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closure_category_id uuid REFERENCES incident_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolution_code_id uuid REFERENCES incident_resolution_codes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_incidents_category_id
  ON incidents(tenant_id, category_id);
CREATE INDEX IF NOT EXISTS idx_incidents_closure_category_id
  ON incidents(tenant_id, closure_category_id);
CREATE INDEX IF NOT EXISTS idx_incidents_resolution_code_id
  ON incidents(tenant_id, resolution_code_id);

ALTER TABLE incident_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_categories FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_incident_categories ON incident_categories;
CREATE POLICY tenant_isolation_incident_categories ON incident_categories
  FOR ALL USING (tenant_id = current_tenant_id());

ALTER TABLE incident_resolution_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_resolution_codes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_incident_resolution_codes ON incident_resolution_codes;
CREATE POLICY tenant_isolation_incident_resolution_codes ON incident_resolution_codes
  FOR ALL USING (tenant_id = current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON incident_categories TO nova_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON incident_resolution_codes TO nova_runtime;
