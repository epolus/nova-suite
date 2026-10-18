-- Response-met timestamp, dedicated pending reason, and the SLA definition that applied.

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS responded_at timestamptz;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS pending_reason text;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS sla_definition_id uuid REFERENCES sla_definitions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_incidents_sla_definition ON incidents(sla_definition_id);

-- Move wait reasons off the close-code column for incidents already pending.
UPDATE incidents
SET pending_reason = resolution_code,
    resolution_code = NULL
WHERE status = 'pending'
  AND pending_reason IS NULL
  AND resolution_code IS NOT NULL;

-- Incidents that already left new have been responded to; do not retroactively breach them.
UPDATE incidents
SET responded_at = COALESCE(updated_at, created_at)
WHERE responded_at IS NULL
  AND status <> 'new';
