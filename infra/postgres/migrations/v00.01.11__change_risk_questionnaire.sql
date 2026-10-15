-- Change risk questionnaire + dependency-aware collision detection support.
-- Adds scored risk questions/answers, risk_score on changes, and dependency_conflict type.

ALTER TABLE changes
  ADD COLUMN IF NOT EXISTS risk_score numeric(10, 2);

CREATE TABLE IF NOT EXISTS change_risk_questions (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  prompt      text NOT NULL,
  weight      numeric(8, 2) NOT NULL DEFAULT 1 CHECK (weight > 0),
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS change_risk_answers (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  change_id    uuid NOT NULL REFERENCES changes(id) ON DELETE CASCADE,
  question_id  uuid NOT NULL REFERENCES change_risk_questions(id) ON DELETE CASCADE,
  score        integer NOT NULL CHECK (score >= 0 AND score <= 5),
  answer_text  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, change_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_change_risk_questions_tenant
  ON change_risk_questions(tenant_id, is_active, sort_order);

CREATE INDEX IF NOT EXISTS idx_change_risk_answers_change
  ON change_risk_answers(tenant_id, change_id);

CREATE INDEX IF NOT EXISTS idx_changes_risk_score
  ON changes(tenant_id, risk_score);

DROP TRIGGER IF EXISTS trg_change_risk_questions_updated_at ON change_risk_questions;
CREATE TRIGGER trg_change_risk_questions_updated_at
  BEFORE UPDATE ON change_risk_questions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_change_risk_answers_updated_at ON change_risk_answers;
CREATE TRIGGER trg_change_risk_answers_updated_at
  BEFORE UPDATE ON change_risk_answers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Extend conflict_type to include dependency-tree collisions.
ALTER TABLE change_conflicts DROP CONSTRAINT IF EXISTS change_conflicts_conflict_type_check;
ALTER TABLE change_conflicts
  ADD CONSTRAINT change_conflicts_conflict_type_check
  CHECK (conflict_type IN ('schedule_overlap', 'ci_overlap', 'blackout_window', 'dependency_conflict'));

-- Seed default questions for tenants that have none yet.
INSERT INTO change_risk_questions (tenant_id, prompt, weight, sort_order, is_active)
SELECT t.id, q.prompt, q.weight, q.sort_order, true
FROM tenants t
CROSS JOIN (
  VALUES
    ('How severe is the business impact if this change fails?', 2.0, 10),
    ('How many users or services are affected?', 1.5, 20),
    ('How complex or novel is the implementation?', 1.5, 30),
    ('How weak is the backout / test coverage? (0 = strong, 5 = none)', 1.0, 40),
    ('How risky is the timing (peak hours, freeze window, dependencies)?', 1.0, 50)
) AS q(prompt, weight, sort_order)
WHERE NOT EXISTS (
  SELECT 1
  FROM change_risk_questions existing
  WHERE existing.tenant_id = t.id
);

ALTER TABLE change_risk_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_risk_answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_change_risk_questions ON change_risk_questions;
CREATE POLICY tenant_isolation_change_risk_questions ON change_risk_questions
  FOR ALL USING (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_change_risk_answers ON change_risk_answers;
CREATE POLICY tenant_isolation_change_risk_answers ON change_risk_answers
  FOR ALL USING (tenant_id = current_tenant_id());

ALTER TABLE change_risk_questions FORCE ROW LEVEL SECURITY;
ALTER TABLE change_risk_answers FORCE ROW LEVEL SECURITY;
