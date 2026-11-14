-- Agent reply email templates and per-user signatures.

CREATE TABLE IF NOT EXISTS email_templates (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  subject     text NOT NULL DEFAULT '',
  body        text NOT NULL DEFAULT '',
  locale      text NOT NULL DEFAULT 'en',
  sort_order  integer NOT NULL DEFAULT 100,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name, locale)
);

CREATE INDEX IF NOT EXISTS idx_email_templates_tenant_active
  ON email_templates(tenant_id, is_active, sort_order);

DROP TRIGGER IF EXISTS trg_email_templates_updated_at ON email_templates;
CREATE TRIGGER trg_email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS user_email_signatures (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_email_signatures_user
  ON user_email_signatures(tenant_id, user_id);

DROP TRIGGER IF EXISTS trg_user_email_signatures_updated_at ON user_email_signatures;
CREATE TRIGGER trg_user_email_signatures_updated_at
  BEFORE UPDATE ON user_email_signatures
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_email_templates ON email_templates;
CREATE POLICY tenant_isolation_email_templates ON email_templates
  FOR ALL USING (tenant_id = current_tenant_id());

ALTER TABLE user_email_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_email_signatures FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_user_email_signatures ON user_email_signatures;
CREATE POLICY tenant_isolation_user_email_signatures ON user_email_signatures
  FOR ALL
  USING (
    tenant_id = current_tenant_id()
    AND (
      user_id = current_user_id()
      OR current_user_has_role('admin', 'system')
    )
  )
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND (
      user_id = current_user_id()
      OR current_user_has_role('admin', 'system')
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON email_templates TO nova_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_email_signatures TO nova_runtime;
