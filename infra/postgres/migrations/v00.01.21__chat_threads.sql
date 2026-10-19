-- Slack and Teams thread mapping for incident notifications and inbound replies.
ALTER TABLE tenant_notification_webhooks
  ADD COLUMN IF NOT EXISTS reply_channel_id text,
  ADD COLUMN IF NOT EXISTS api_token text,
  ADD COLUMN IF NOT EXISTS signing_secret text;

CREATE TABLE IF NOT EXISTS chat_threads (
  id                 uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  webhook_id         uuid        NOT NULL REFERENCES tenant_notification_webhooks(id) ON DELETE CASCADE,
  channel            notification_webhook_channel NOT NULL,
  entity_type        text        NOT NULL CHECK (entity_type = 'incident'),
  entity_id          uuid        NOT NULL,
  entity_number      text        NOT NULL,
  external_thread_id text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, webhook_id, entity_type, entity_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_threads_external_thread
  ON chat_threads (tenant_id, channel, external_thread_id)
  WHERE external_thread_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_chat_threads_updated_at ON chat_threads;
CREATE TRIGGER trg_chat_threads_updated_at
  BEFORE UPDATE ON chat_threads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS chat_inbound_receipts (
  tenant_id         uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel           notification_webhook_channel NOT NULL,
  external_event_id text        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, channel, external_event_id)
);

ALTER TABLE chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_threads FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_chat_threads ON chat_threads;
CREATE POLICY tenant_isolation_chat_threads ON chat_threads
  FOR ALL USING (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'fulfiller', 'system')
  )
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'fulfiller', 'system')
  );

ALTER TABLE chat_inbound_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_inbound_receipts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_chat_inbound_receipts ON chat_inbound_receipts;
CREATE POLICY tenant_isolation_chat_inbound_receipts ON chat_inbound_receipts
  FOR ALL USING (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'fulfiller', 'system')
  )
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'fulfiller', 'system')
  );
