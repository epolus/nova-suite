-- Continual improvement register linked from postmortems, failed changes, and problem fixes.

CREATE SEQUENCE IF NOT EXISTS improvement_number_seq START 1;

CREATE TABLE IF NOT EXISTS improvements (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  number              text NOT NULL,
  title               text NOT NULL,
  description         text,
  status              text NOT NULL DEFAULT 'registered'
                      CHECK (status IN ('registered', 'in_progress', 'done', 'cancelled')),
  source_type         text NOT NULL DEFAULT 'manual'
                      CHECK (source_type IN ('manual', 'postmortem', 'change', 'problem')),
  major_incident_id   uuid REFERENCES major_incidents(id) ON DELETE SET NULL,
  action_item_id      uuid,
  change_id           uuid REFERENCES changes(id) ON DELETE SET NULL,
  problem_id          uuid REFERENCES problems(id) ON DELETE SET NULL,
  owner_user_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by          uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, number)
);

CREATE INDEX IF NOT EXISTS idx_improvements_tenant_status
  ON improvements(tenant_id, status, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_improvements_postmortem_action
  ON improvements(tenant_id, major_incident_id, action_item_id)
  WHERE source_type = 'postmortem' AND action_item_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_improvements_change
  ON improvements(tenant_id, change_id)
  WHERE source_type = 'change' AND change_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_improvements_problem
  ON improvements(tenant_id, problem_id)
  WHERE source_type = 'problem' AND problem_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_improvements_updated_at ON improvements;
CREATE TRIGGER trg_improvements_updated_at
  BEFORE UPDATE ON improvements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE improvements ENABLE ROW LEVEL SECURITY;
ALTER TABLE improvements FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_improvements ON improvements;
CREATE POLICY tenant_isolation_improvements ON improvements
  FOR ALL USING (tenant_id = current_tenant_id());
