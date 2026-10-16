-- Tenant Slack / Microsoft Teams incoming webhook endpoints for notification delivery.
CREATE TYPE notification_webhook_channel AS ENUM ('slack', 'teams');

CREATE TABLE tenant_notification_webhooks (
  id           uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel      notification_webhook_channel NOT NULL,
  name         text        NOT NULL,
  webhook_url  text        NOT NULL,
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_notification_webhooks_name_nonempty CHECK (char_length(trim(name)) > 0),
  CONSTRAINT tenant_notification_webhooks_url_nonempty CHECK (char_length(trim(webhook_url)) > 0)
);

CREATE INDEX idx_tenant_notification_webhooks_tenant_channel
  ON tenant_notification_webhooks(tenant_id, channel, is_active);

CREATE TRIGGER trg_tenant_notification_webhooks_updated_at
  BEFORE UPDATE ON tenant_notification_webhooks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE tenant_notification_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_tenant_notification_webhooks ON tenant_notification_webhooks
  FOR ALL USING (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'fulfiller', 'system')
  )
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'fulfiller', 'system')
  );

ALTER TABLE tenant_notification_webhooks FORCE ROW LEVEL SECURITY;
