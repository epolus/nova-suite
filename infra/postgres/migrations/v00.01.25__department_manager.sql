-- Department manager (existing databases).

ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_departments_manager
  ON departments(manager_id);
