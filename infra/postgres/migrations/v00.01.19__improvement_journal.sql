-- Activity journal on continual improvement records.

CREATE TABLE IF NOT EXISTS improvement_journal (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  improvement_id  uuid NOT NULL REFERENCES improvements(id) ON DELETE CASCADE,
  author_id       uuid NOT NULL REFERENCES users(id),
  entry_type      text NOT NULL DEFAULT 'comment'
                  CHECK (entry_type IN ('comment', 'work_note', 'state_change')),
  content         text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_improvement_journal_improvement
  ON improvement_journal(improvement_id, created_at DESC);

ALTER TABLE improvement_journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE improvement_journal FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_improvement_journal ON improvement_journal;
CREATE POLICY tenant_isolation_improvement_journal ON improvement_journal
  FOR ALL USING (tenant_id = current_tenant_id());
