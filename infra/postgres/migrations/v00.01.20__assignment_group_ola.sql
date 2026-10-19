-- OLA targets on assignment groups, and the incident handoff clock they start.

ALTER TABLE assignment_groups
  ADD COLUMN IF NOT EXISTS ola_response_hours integer
    CHECK (ola_response_hours IS NULL OR ola_response_hours BETWEEN 1 AND 8760),
  ADD COLUMN IF NOT EXISTS ola_resolution_hours integer
    CHECK (ola_resolution_hours IS NULL OR ola_resolution_hours BETWEEN 1 AND 8760);

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS ola_group_id uuid REFERENCES assignment_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ola_response_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS ola_resolution_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS ola_responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS ola_paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS ola_paused_ms bigint NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_incidents_ola_resolution
  ON incidents(tenant_id, ola_resolution_due_at)
  WHERE ola_resolution_due_at IS NOT NULL;
