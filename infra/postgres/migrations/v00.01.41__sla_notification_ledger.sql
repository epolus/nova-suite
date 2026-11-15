-- Durable once-send ledger for SLA warning/breach notifications.

CREATE TABLE IF NOT EXISTS sla_notifications_sent (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type  text NOT NULL,
  entity_id    uuid NOT NULL,
  target       text NOT NULL CHECK (target IN ('response', 'resolution')),
  "trigger"    text NOT NULL CHECK ("trigger" IN ('warning', 'breach')),
  sent_at      timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sla_notifications_sent_once_unique
    UNIQUE (tenant_id, entity_type, entity_id, target, "trigger")
);

CREATE INDEX IF NOT EXISTS idx_sla_notifications_sent_entity
  ON sla_notifications_sent(tenant_id, entity_type, entity_id, sent_at DESC);

ALTER TABLE sla_notifications_sent ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_notifications_sent FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_sla_notifications_sent ON sla_notifications_sent;
CREATE POLICY tenant_isolation_sla_notifications_sent ON sla_notifications_sent
  FOR ALL USING (tenant_id = current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON sla_notifications_sent TO nova_runtime;
