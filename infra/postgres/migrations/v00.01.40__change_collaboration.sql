-- Change collaboration: journal stream + field-level audit for stage/status/risk/schedule/assignment.

CREATE TABLE IF NOT EXISTS change_journal (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  change_id   uuid NOT NULL REFERENCES changes(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES users(id),
  entry_type  text NOT NULL DEFAULT 'comment'
              CHECK (entry_type IN ('comment', 'work_note', 'state_change', 'assignment')),
  content     text NOT NULL,
  is_customer_visible boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_change_journal_change
  ON change_journal(tenant_id, change_id, created_at DESC);

CREATE TABLE IF NOT EXISTS change_audit (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  change_id   uuid NOT NULL REFERENCES changes(id) ON DELETE CASCADE,
  actor_id    uuid NOT NULL REFERENCES users(id),
  field_name  text NOT NULL,
  old_value   text,
  new_value   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_change_audit_change
  ON change_audit(tenant_id, change_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_change_audit_field
  ON change_audit(tenant_id, change_id, field_name, created_at DESC);

ALTER TABLE change_journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_journal FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_change_journal ON change_journal;
CREATE POLICY tenant_isolation_change_journal ON change_journal
  FOR ALL USING (tenant_id = current_tenant_id());

ALTER TABLE change_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_audit FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_change_audit ON change_audit;
CREATE POLICY tenant_isolation_change_audit ON change_audit
  FOR ALL USING (tenant_id = current_tenant_id());
