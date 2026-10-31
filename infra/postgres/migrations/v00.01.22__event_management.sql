-- Events roll up into one open alert per fingerprint. A definition chooses the action.

CREATE SEQUENCE IF NOT EXISTS alert_number_seq START 1000;

CREATE TABLE IF NOT EXISTS events (
  id                     uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id              uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source                 text        NOT NULL,
  external_event_id      text,
  fingerprint            text        NOT NULL,
  status                 text        NOT NULL CHECK (status IN ('firing', 'resolved')),
  severity               text        NOT NULL,
  title                  text        NOT NULL,
  labels                 jsonb       NOT NULL DEFAULT '{}',
  payload                jsonb       NOT NULL DEFAULT '{}',
  source_url             text,
  configuration_item_id  uuid        REFERENCES configuration_items(id) ON DELETE SET NULL,
  alert_id               uuid,
  occurred_at            timestamptz,
  received_at            timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS events_external_id
  ON events (tenant_id, source, external_event_id)
  WHERE external_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_received
  ON events (tenant_id, received_at DESC);

CREATE TABLE IF NOT EXISTS alerts (
  id                     uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id              uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  number                 text        NOT NULL,
  source                 text        NOT NULL,
  fingerprint            text        NOT NULL,
  status                 text        NOT NULL CHECK (status IN ('firing', 'resolved')),
  severity               text        NOT NULL,
  title                  text        NOT NULL,
  labels                 jsonb       NOT NULL DEFAULT '{}',
  source_url             text,
  configuration_item_id  uuid        REFERENCES configuration_items(id) ON DELETE SET NULL,
  event_count            integer     NOT NULL DEFAULT 1,
  first_seen_at          timestamptz NOT NULL DEFAULT now(),
  last_seen_at           timestamptz NOT NULL DEFAULT now(),
  resolved_at            timestamptz,
  definition_id          uuid,
  incident_id            uuid        REFERENCES incidents(id) ON DELETE SET NULL,
  workflow_id            text,
  suppressed_reason      text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, number)
);

CREATE UNIQUE INDEX IF NOT EXISTS alerts_one_firing_episode
  ON alerts (tenant_id, source, fingerprint)
  WHERE status = 'firing';
CREATE INDEX IF NOT EXISTS idx_alerts_ci
  ON alerts (tenant_id, configuration_item_id, first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_status
  ON alerts (tenant_id, status, last_seen_at DESC);

DROP TRIGGER IF EXISTS trg_alerts_updated_at ON alerts;
CREATE TRIGGER trg_alerts_updated_at
  BEFORE UPDATE ON alerts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_alert_id_fkey;
ALTER TABLE events
  ADD CONSTRAINT events_alert_id_fkey
  FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_events_alert ON events (alert_id);

CREATE TABLE IF NOT EXISTS alert_definitions (
  id                   uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id            uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                 text        NOT NULL,
  description          text,
  is_active            boolean     NOT NULL DEFAULT true,
  sort_order           integer     NOT NULL DEFAULT 100,
  source               text,
  severity             text,
  match_labels         jsonb       NOT NULL DEFAULT '{}',
  severity_map         jsonb,
  action               text        NOT NULL DEFAULT 'none'
                       CHECK (action IN ('none', 'incident', 'workflow')),
  assignment_group_id  uuid        REFERENCES assignment_groups(id) ON DELETE SET NULL,
  impact               text        CHECK (impact IS NULL OR impact IN ('low', 'medium', 'high')),
  urgency              text        CHECK (urgency IS NULL OR urgency IN ('low', 'medium', 'high')),
  workflow_key         text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE alerts
  DROP CONSTRAINT IF EXISTS alerts_definition_id_fkey;
ALTER TABLE alerts
  ADD CONSTRAINT alerts_definition_id_fkey
  FOREIGN KEY (definition_id) REFERENCES alert_definitions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_alert_definitions_active
  ON alert_definitions (tenant_id, is_active, sort_order);

DROP TRIGGER IF EXISTS trg_alert_definitions_updated_at ON alert_definitions;
CREATE TRIGGER trg_alert_definitions_updated_at
  BEFORE UPDATE ON alert_definitions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO alert_definitions (tenant_id, name, severity, action, impact, urgency, sort_order)
SELECT t.id, 'Critical alert opens an incident', 'critical', 'incident', 'high', 'high', 10
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM alert_definitions d
  WHERE d.tenant_id = t.id AND d.name = 'Critical alert opens an incident'
);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_events ON events;
CREATE POLICY tenant_isolation_events ON events
  FOR ALL USING (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'event_operator', 'event_manager', 'system')
  )
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'event_operator', 'event_manager', 'system')
  );

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_alerts ON alerts;
CREATE POLICY tenant_isolation_alerts ON alerts
  FOR ALL USING (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'event_operator', 'event_manager', 'system')
  )
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'event_operator', 'event_manager', 'system')
  );

ALTER TABLE alert_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_definitions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_alert_definitions ON alert_definitions;
CREATE POLICY tenant_isolation_alert_definitions ON alert_definitions
  FOR ALL USING (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'event_manager', 'system')
  )
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'event_manager', 'system')
  );

INSERT INTO roles (tenant_id, name, description)
SELECT t.id, r.name, r.description
FROM tenants t
CROSS JOIN (VALUES
  ('event_operator', 'Can view and work monitoring alerts'),
  ('event_manager', 'Can manage alert definitions and work monitoring alerts')
) AS r(name, description)
WHERE NOT EXISTS (
  SELECT 1 FROM roles existing
  WHERE existing.tenant_id = t.id AND existing.name = r.name
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nova_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON events, alerts, alert_definitions TO nova_runtime;
    GRANT USAGE, SELECT ON SEQUENCE alert_number_seq TO nova_runtime;
  END IF;
END
$$;
