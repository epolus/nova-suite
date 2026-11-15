-- Integrity constraints: custom fields, classification FKs, inbound email,
-- SLA ledger entity types, checklist done-state / template FK, asset returns.

-- ─── field_values: entity_type match + exactly one typed value column ───

-- Drop rows that cannot satisfy the new trigger (missing definition, entity
-- mismatch, wrong/empty/multi-column value shape for the field type).
DELETE FROM field_values fv
WHERE NOT EXISTS (
  SELECT 1
  FROM field_definitions fd
  WHERE fd.id = fv.field_id
    AND fd.tenant_id = fv.tenant_id
    AND fd.entity_type = fv.entity_type
    AND (
      (fv.value_text IS NOT NULL)::int
      + (fv.value_number IS NOT NULL)::int
      + (fv.value_bool IS NOT NULL)::int
      + (fv.value_timestamptz IS NOT NULL)::int
      + (fv.value_json IS NOT NULL)::int
    ) = 1
    AND (
      (fd.field_type = 'number' AND fv.value_number IS NOT NULL)
      OR (fd.field_type = 'checkbox' AND fv.value_bool IS NOT NULL)
      OR (fd.field_type = 'date' AND fv.value_timestamptz IS NOT NULL)
      OR (fd.field_type = 'multiselect' AND fv.value_json IS NOT NULL)
      OR (
        fd.field_type NOT IN ('number', 'checkbox', 'date', 'multiselect')
        AND fv.value_text IS NOT NULL
      )
    )
);

CREATE OR REPLACE FUNCTION enforce_field_value_shape()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  def_entity text;
  def_type   text;
  set_count  integer;
  expected   text;
BEGIN
  SELECT fd.entity_type, fd.field_type
    INTO def_entity, def_type
  FROM field_definitions fd
  WHERE fd.id = NEW.field_id
    AND fd.tenant_id = NEW.tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'field_values: field_id % not found for tenant', NEW.field_id;
  END IF;

  IF NEW.entity_type IS DISTINCT FROM def_entity THEN
    RAISE EXCEPTION
      'field_values.entity_type (%) must match field_definitions.entity_type (%)',
      NEW.entity_type, def_entity;
  END IF;

  set_count :=
    (NEW.value_text IS NOT NULL)::int
    + (NEW.value_number IS NOT NULL)::int
    + (NEW.value_bool IS NOT NULL)::int
    + (NEW.value_timestamptz IS NOT NULL)::int
    + (NEW.value_json IS NOT NULL)::int;

  IF set_count <> 1 THEN
    RAISE EXCEPTION 'field_values: exactly one value column must be set (got %)', set_count;
  END IF;

  expected := CASE def_type
    WHEN 'number' THEN 'value_number'
    WHEN 'checkbox' THEN 'value_bool'
    WHEN 'date' THEN 'value_timestamptz'
    WHEN 'multiselect' THEN 'value_json'
    ELSE 'value_text'
  END;

  IF (expected = 'value_text' AND NEW.value_text IS NULL)
     OR (expected = 'value_number' AND NEW.value_number IS NULL)
     OR (expected = 'value_bool' AND NEW.value_bool IS NULL)
     OR (expected = 'value_timestamptz' AND NEW.value_timestamptz IS NULL)
     OR (expected = 'value_json' AND NEW.value_json IS NULL)
  THEN
    RAISE EXCEPTION 'field_values: field_type % requires %', def_type, expected;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_field_values_shape ON field_values;
CREATE TRIGGER trg_field_values_shape
  BEFORE INSERT OR UPDATE ON field_values
  FOR EACH ROW EXECUTE FUNCTION enforce_field_value_shape();

-- ─── Incident classification: RESTRICT instead of SET NULL ───

ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_category_id_fkey;
ALTER TABLE incidents
  ADD CONSTRAINT incidents_category_id_fkey
  FOREIGN KEY (category_id) REFERENCES incident_categories(id) ON DELETE RESTRICT;

ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_closure_category_id_fkey;
ALTER TABLE incidents
  ADD CONSTRAINT incidents_closure_category_id_fkey
  FOREIGN KEY (closure_category_id) REFERENCES incident_categories(id) ON DELETE RESTRICT;

ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_resolution_code_id_fkey;
ALTER TABLE incidents
  ADD CONSTRAINT incidents_resolution_code_id_fkey
  FOREIGN KEY (resolution_code_id) REFERENCES incident_resolution_codes(id) ON DELETE RESTRICT;

-- ─── Inbound email: per-mailbox message-id uniqueness + in_reply_to index ───

DROP INDEX IF EXISTS uq_email_messages_tenant_message_id;
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_messages_tenant_mailbox_message_id
  ON email_messages(tenant_id, mailbox_id, message_id)
  WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_messages_in_reply_to
  ON email_messages(tenant_id, in_reply_to)
  WHERE in_reply_to IS NOT NULL;

-- ─── SLA notification ledger: constrain entity_type ───

DELETE FROM sla_notifications_sent
WHERE entity_type NOT IN ('incident', 'request', 'task', 'problem', 'change');

ALTER TABLE sla_notifications_sent
  DROP CONSTRAINT IF EXISTS sla_notifications_sent_entity_type_chk;
ALTER TABLE sla_notifications_sent
  ADD CONSTRAINT sla_notifications_sent_entity_type_chk
  CHECK (entity_type IN ('incident', 'request', 'task', 'problem', 'change'));

-- ─── Checklist instance items: done-state consistency ───

UPDATE checklist_instance_items
SET is_done = false, done_at = NULL, done_by = NULL
WHERE is_done = false AND (done_at IS NOT NULL OR done_by IS NOT NULL);

UPDATE checklist_instance_items
SET is_done = false, done_at = NULL, done_by = NULL
WHERE is_done = true AND (done_at IS NULL OR done_by IS NULL);

ALTER TABLE checklist_instance_items
  DROP CONSTRAINT IF EXISTS checklist_instance_items_done_chk;
ALTER TABLE checklist_instance_items
  ADD CONSTRAINT checklist_instance_items_done_chk CHECK (
    (is_done = false AND done_at IS NULL AND done_by IS NULL)
    OR (is_done = true AND done_at IS NOT NULL AND done_by IS NOT NULL)
  );

-- ─── Checklist instances: keep template_id attached ───

ALTER TABLE checklist_instances DROP CONSTRAINT IF EXISTS checklist_instances_template_id_fkey;
ALTER TABLE checklist_instances
  ADD CONSTRAINT checklist_instances_template_id_fkey
  FOREIGN KEY (template_id) REFERENCES checklist_templates(id) ON DELETE RESTRICT;

-- ─── Asset assignments: returned_at cannot precede assigned_at ───

UPDATE asset_assignments
SET returned_at = assigned_at
WHERE returned_at IS NOT NULL AND returned_at < assigned_at;

ALTER TABLE asset_assignments
  DROP CONSTRAINT IF EXISTS asset_assignments_return_chk;
ALTER TABLE asset_assignments
  ADD CONSTRAINT asset_assignments_return_chk
  CHECK (returned_at IS NULL OR returned_at >= assigned_at);
