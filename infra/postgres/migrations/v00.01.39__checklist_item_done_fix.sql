-- Relax checklist item completion state; app logic owns done_at/done_by consistency.
ALTER TABLE checklist_instance_items
  DROP CONSTRAINT IF EXISTS checklist_instance_items_done_chk;
