-- Inbound email: mailboxes, messages, and ordered rule sets.

CREATE TABLE IF NOT EXISTS mailboxes (
  id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id               uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                    text NOT NULL,
  address                 text NOT NULL,
  credential_slug         text NOT NULL,
  protocol                text NOT NULL DEFAULT 'imap'
                          CHECK (protocol IN ('imap')),
  config                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  assignment_group_id     uuid REFERENCES assignment_groups(id) ON DELETE SET NULL,
  default_service_id      uuid REFERENCES services(id) ON DELETE SET NULL,
  poll_interval_seconds   integer NOT NULL DEFAULT 60
                          CHECK (poll_interval_seconds BETWEEN 30 AND 86400),
  last_polled_at          timestamptz,
  last_uid                bigint,
  is_active               boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, address)
);

CREATE INDEX IF NOT EXISTS idx_mailboxes_tenant_active
  ON mailboxes(tenant_id, is_active);

DROP TRIGGER IF EXISTS trg_mailboxes_updated_at ON mailboxes;
CREATE TRIGGER trg_mailboxes_updated_at
  BEFORE UPDATE ON mailboxes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS email_messages (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mailbox_id          uuid REFERENCES mailboxes(id) ON DELETE SET NULL,
  direction           text NOT NULL
                      CHECK (direction IN ('inbound', 'outbound')),
  message_id          text,
  in_reply_to         text,
  from_address        text NOT NULL DEFAULT '',
  to_addresses        text NOT NULL DEFAULT '',
  subject             text NOT NULL DEFAULT '',
  body_text           text,
  body_html           text,
  incident_id         uuid REFERENCES incidents(id) ON DELETE SET NULL,
  processing_status   text NOT NULL DEFAULT 'received'
                      CHECK (processing_status IN (
                        'received', 'matched', 'created', 'updated',
                        'ignored', 'skipped_closed', 'error'
                      )),
  processing_notes    text,
  matched_rule_id     uuid,
  processed_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_email_messages_tenant_message_id
  ON email_messages(tenant_id, message_id)
  WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_messages_mailbox
  ON email_messages(tenant_id, mailbox_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_messages_incident
  ON email_messages(tenant_id, incident_id)
  WHERE incident_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS inbound_email_rules (
  id                        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id                 uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mailbox_id                uuid REFERENCES mailboxes(id) ON DELETE CASCADE,
  name                      text NOT NULL,
  sort_order                integer NOT NULL DEFAULT 0,
  is_active                 boolean NOT NULL DEFAULT true,
  stop_on_match             boolean NOT NULL DEFAULT true,
  match_from_contains       text,
  match_from_regex          text,
  match_subject_contains    text,
  match_subject_regex       text,
  match_body_contains       text,
  match_has_ticket_ref      boolean NOT NULL DEFAULT false,
  match_in_reply_to_known   boolean NOT NULL DEFAULT false,
  action                    text NOT NULL
                            CHECK (action IN ('create_incident', 'update_incident', 'ignore')),
  require_open_incident     boolean NOT NULL DEFAULT true,
  journal_entry_type        text NOT NULL DEFAULT 'comment'
                            CHECK (journal_entry_type IN ('comment', 'work_note')),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inbound_email_rules_mailbox
  ON inbound_email_rules(tenant_id, mailbox_id, is_active, sort_order);

DROP TRIGGER IF EXISTS trg_inbound_email_rules_updated_at ON inbound_email_rules;
CREATE TRIGGER trg_inbound_email_rules_updated_at
  BEFORE UPDATE ON inbound_email_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE email_messages
  DROP CONSTRAINT IF EXISTS email_messages_matched_rule_id_fkey;
ALTER TABLE email_messages
  ADD CONSTRAINT email_messages_matched_rule_id_fkey
  FOREIGN KEY (matched_rule_id) REFERENCES inbound_email_rules(id) ON DELETE SET NULL;

ALTER TABLE mailboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mailboxes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_mailboxes ON mailboxes;
CREATE POLICY tenant_isolation_mailboxes ON mailboxes
  FOR ALL USING (tenant_id = current_tenant_id());

ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_messages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_email_messages ON email_messages;
CREATE POLICY tenant_isolation_email_messages ON email_messages
  FOR ALL USING (tenant_id = current_tenant_id());

ALTER TABLE inbound_email_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_email_rules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_inbound_email_rules ON inbound_email_rules;
CREATE POLICY tenant_isolation_inbound_email_rules ON inbound_email_rules
  FOR ALL USING (tenant_id = current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON mailboxes TO nova_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON email_messages TO nova_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON inbound_email_rules TO nova_runtime;
