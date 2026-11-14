-- Typed custom fields for incidents, changes, and assets (EAV).

CREATE TABLE IF NOT EXISTS field_definitions (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type   text NOT NULL
                CHECK (entity_type IN ('incident', 'change', 'asset')),
  field_key     text NOT NULL
                CHECK (
                  char_length(field_key) BETWEEN 1 AND 64
                  AND field_key ~ '^[a-z][a-z0-9_]*$'
                ),
  label         text NOT NULL,
  field_type    text NOT NULL
                CHECK (field_type IN (
                  'text', 'textarea', 'date', 'number', 'email', 'checkbox',
                  'select', 'multiselect', 'cmdb_ref', 'user_ref', 'location_ref'
                )),
  config        jsonb NOT NULL DEFAULT '{}'::jsonb,
  required_on   text NOT NULL DEFAULT ''
                CHECK (required_on IN ('', 'create', 'resolve')),
  sort_order    integer NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, entity_type, field_key)
);

CREATE INDEX IF NOT EXISTS idx_field_definitions_tenant_entity
  ON field_definitions(tenant_id, entity_type, is_active, sort_order);

DROP TRIGGER IF EXISTS trg_field_definitions_updated_at ON field_definitions;
CREATE TRIGGER trg_field_definitions_updated_at
  BEFORE UPDATE ON field_definitions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS field_options (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  field_id      uuid NOT NULL REFERENCES field_definitions(id) ON DELETE CASCADE,
  value         text NOT NULL,
  label         text NOT NULL,
  sort_order    integer NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (field_id, value)
);

CREATE INDEX IF NOT EXISTS idx_field_options_field
  ON field_options(field_id, sort_order);

DROP TRIGGER IF EXISTS trg_field_options_updated_at ON field_options;
CREATE TRIGGER trg_field_options_updated_at
  BEFORE UPDATE ON field_options
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS field_values (
  id                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type        text NOT NULL
                     CHECK (entity_type IN ('incident', 'change', 'asset')),
  entity_id          uuid NOT NULL,
  field_id           uuid NOT NULL REFERENCES field_definitions(id) ON DELETE RESTRICT,
  value_text         text,
  value_number       numeric,
  value_bool         boolean,
  value_timestamptz  timestamptz,
  value_json         jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, entity_type, entity_id, field_id)
);

CREATE INDEX IF NOT EXISTS idx_field_values_entity
  ON field_values(tenant_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_field_values_field
  ON field_values(tenant_id, field_id);

DROP TRIGGER IF EXISTS trg_field_values_updated_at ON field_values;
CREATE TRIGGER trg_field_values_updated_at
  BEFORE UPDATE ON field_values
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_definitions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_field_definitions ON field_definitions;
CREATE POLICY tenant_isolation_field_definitions ON field_definitions
  FOR ALL USING (tenant_id = current_tenant_id());

ALTER TABLE field_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_options FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_field_options ON field_options;
CREATE POLICY tenant_isolation_field_options ON field_options
  FOR ALL USING (tenant_id = current_tenant_id());

ALTER TABLE field_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_values FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_field_values ON field_values;
CREATE POLICY tenant_isolation_field_values ON field_values
  FOR ALL USING (tenant_id = current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON field_definitions TO nova_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON field_options TO nova_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON field_values TO nova_runtime;
