-- Add external system mapping IDs on configuration items.
ALTER TABLE configuration_items ADD COLUMN IF NOT EXISTS external_id_1 text;
ALTER TABLE configuration_items ADD COLUMN IF NOT EXISTS external_id_2 text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ci_tenant_external_id_1
  ON configuration_items(tenant_id, external_id_1)
  WHERE external_id_1 IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ci_tenant_external_id_2
  ON configuration_items(tenant_id, external_id_2)
  WHERE external_id_2 IS NOT NULL;
