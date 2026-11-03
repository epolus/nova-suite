-- Responsible person on cost centers (existing databases).

ALTER TABLE cost_centers
  ADD COLUMN IF NOT EXISTS responsible_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cost_centers_responsible
  ON cost_centers(responsible_user_id);
