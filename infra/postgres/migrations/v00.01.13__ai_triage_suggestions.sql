-- AI triage suggestions + ESS deflection tenant settings

CREATE TABLE IF NOT EXISTS incident_ai_suggestions (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_id         uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  suggested_category  text,
  suggested_impact    text CHECK (suggested_impact IS NULL OR suggested_impact IN ('low', 'medium', 'high')),
  suggested_urgency   text CHECK (suggested_urgency IS NULL OR suggested_urgency IN ('low', 'medium', 'high')),
  suggested_tags      text[] NOT NULL DEFAULT '{}',
  sentiment           text,
  confidence          numeric(5, 4) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  raw_json            jsonb NOT NULL DEFAULT '{}'::jsonb,
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incident_ai_suggestions_incident
  ON incident_ai_suggestions(incident_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incident_ai_suggestions_tenant_status
  ON incident_ai_suggestions(tenant_id, status, created_at DESC);

ALTER TABLE incident_ai_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_ai_suggestions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_incident_ai_suggestions ON incident_ai_suggestions;
CREATE POLICY tenant_isolation_incident_ai_suggestions ON incident_ai_suggestions
  FOR ALL USING (tenant_id = current_tenant_id());

-- Tenant settings keys (text values; defaults documented in product)
INSERT INTO tenant_settings (tenant_id, key, value)
SELECT t.id, k.key, k.value
FROM tenants t
CROSS JOIN (VALUES
  ('ai_triage_on_create', 'true'),
  ('ai_auto_apply_priority', 'false'),
  ('ess_auto_deflect', 'false'),
  ('ess_deflect_confidence_threshold', '0.65')
) AS k(key, value)
ON CONFLICT (tenant_id, key) DO NOTHING;
