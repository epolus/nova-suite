-- Checklist templates + per-entity instances (snapshot items).
-- Required open items block incident resolve / change → implemented.

INSERT INTO roles (tenant_id, name, description)
SELECT t.id, r.name, r.description
FROM tenants t
CROSS JOIN (VALUES
  ('checklist_admin', 'Can manage checklist templates for incidents and changes')
) AS r(name, description)
WHERE NOT EXISTS (
  SELECT 1 FROM roles existing
  WHERE existing.tenant_id = t.id AND existing.name = r.name
);

CREATE TABLE IF NOT EXISTS checklist_templates (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  entity_type   text NOT NULL
                CHECK (entity_type IN ('incident', 'change')),
  description   text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT checklist_templates_name_unique UNIQUE (tenant_id, entity_type, name)
);

CREATE INDEX IF NOT EXISTS idx_checklist_templates_entity
  ON checklist_templates(tenant_id, entity_type, is_active);

DROP TRIGGER IF EXISTS trg_checklist_templates_updated_at ON checklist_templates;
CREATE TRIGGER trg_checklist_templates_updated_at
  BEFORE UPDATE ON checklist_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS checklist_template_items (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id   uuid NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  label         text NOT NULL,
  sort_order    integer NOT NULL DEFAULT 0,
  required      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checklist_template_items_template
  ON checklist_template_items(tenant_id, template_id, sort_order);

DROP TRIGGER IF EXISTS trg_checklist_template_items_updated_at ON checklist_template_items;
CREATE TRIGGER trg_checklist_template_items_updated_at
  BEFORE UPDATE ON checklist_template_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS checklist_instances (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type    text NOT NULL
                 CHECK (entity_type IN ('incident', 'change')),
  entity_id      uuid NOT NULL,
  template_id    uuid REFERENCES checklist_templates(id) ON DELETE SET NULL,
  template_name  text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT checklist_instances_entity_template_unique
    UNIQUE (tenant_id, entity_type, entity_id, template_id)
);

CREATE INDEX IF NOT EXISTS idx_checklist_instances_entity
  ON checklist_instances(tenant_id, entity_type, entity_id);

DROP TRIGGER IF EXISTS trg_checklist_instances_updated_at ON checklist_instances;
CREATE TRIGGER trg_checklist_instances_updated_at
  BEFORE UPDATE ON checklist_instances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS checklist_instance_items (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  instance_id       uuid NOT NULL REFERENCES checklist_instances(id) ON DELETE CASCADE,
  template_item_id  uuid REFERENCES checklist_template_items(id) ON DELETE SET NULL,
  label             text NOT NULL,
  sort_order        integer NOT NULL DEFAULT 0,
  required          boolean NOT NULL DEFAULT false,
  is_done           boolean NOT NULL DEFAULT false,
  done_by           uuid REFERENCES users(id) ON DELETE SET NULL,
  done_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT checklist_instance_items_done_chk CHECK (
    (is_done = false AND done_at IS NULL)
    OR (is_done = true AND done_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_checklist_instance_items_instance
  ON checklist_instance_items(tenant_id, instance_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_checklist_instance_items_open_required
  ON checklist_instance_items(tenant_id, instance_id)
  WHERE required = true AND is_done = false;

DROP TRIGGER IF EXISTS trg_checklist_instance_items_updated_at ON checklist_instance_items;
CREATE TRIGGER trg_checklist_instance_items_updated_at
  BEFORE UPDATE ON checklist_instance_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_checklist_templates ON checklist_templates;
CREATE POLICY tenant_isolation_checklist_templates ON checklist_templates
  FOR ALL USING (tenant_id = current_tenant_id());

ALTER TABLE checklist_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_template_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_checklist_template_items ON checklist_template_items;
CREATE POLICY tenant_isolation_checklist_template_items ON checklist_template_items
  FOR ALL USING (tenant_id = current_tenant_id());

ALTER TABLE checklist_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_instances FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_checklist_instances ON checklist_instances;
CREATE POLICY tenant_isolation_checklist_instances ON checklist_instances
  FOR ALL USING (tenant_id = current_tenant_id());

ALTER TABLE checklist_instance_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_instance_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_checklist_instance_items ON checklist_instance_items;
CREATE POLICY tenant_isolation_checklist_instance_items ON checklist_instance_items
  FOR ALL USING (tenant_id = current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON checklist_templates TO nova_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON checklist_template_items TO nova_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON checklist_instances TO nova_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON checklist_instance_items TO nova_runtime;
