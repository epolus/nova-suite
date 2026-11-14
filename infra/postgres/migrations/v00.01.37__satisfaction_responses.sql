-- Customer satisfaction (CSAT) responses for resolved incidents.
-- One pending row per incident; public submit via opaque token.

CREATE TABLE IF NOT EXISTS satisfaction_responses (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  incident_id   uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  score         integer CHECK (score IS NULL OR (score >= 1 AND score <= 5)),
  comment       text,
  submitted_at  timestamptz,
  token         text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT satisfaction_responses_incident_unique UNIQUE (incident_id),
  CONSTRAINT satisfaction_responses_token_unique UNIQUE (token),
  CONSTRAINT satisfaction_responses_submitted_chk CHECK (
    (submitted_at IS NULL AND score IS NULL)
    OR (submitted_at IS NOT NULL AND score IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_satisfaction_responses_tenant_incident
  ON satisfaction_responses(tenant_id, incident_id);

DROP TRIGGER IF EXISTS trg_satisfaction_responses_updated_at ON satisfaction_responses;
CREATE TRIGGER trg_satisfaction_responses_updated_at
  BEFORE UPDATE ON satisfaction_responses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE satisfaction_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE satisfaction_responses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_satisfaction_responses ON satisfaction_responses;
CREATE POLICY tenant_isolation_satisfaction_responses ON satisfaction_responses
  FOR ALL USING (tenant_id = current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON satisfaction_responses TO nova_runtime;

-- Pre-auth public CSAT lookup (no tenant context yet).
DROP FUNCTION IF EXISTS lookup_satisfaction_by_token(text);
CREATE FUNCTION lookup_satisfaction_by_token(p_token text)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  incident_id uuid,
  score integer,
  comment text,
  submitted_at timestamptz,
  incident_number text,
  incident_title text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    sr.id,
    sr.tenant_id,
    sr.incident_id,
    sr.score,
    sr.comment,
    sr.submitted_at,
    i.number::text AS incident_number,
    i.title AS incident_title
  FROM satisfaction_responses sr
  JOIN incidents i ON i.id = sr.incident_id
  WHERE sr.token = p_token
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION lookup_satisfaction_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lookup_satisfaction_by_token(text) TO nova_runtime;
