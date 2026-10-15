-- ITAM discovery: asset external IDs + Intune data-source type.
-- Asset status remains free-text (no CHECK); Zod enforces lifecycle enum.

ALTER TABLE assets ADD COLUMN IF NOT EXISTS external_id_1 text;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS external_id_2 text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_assets_tenant_external_id_1
  ON assets(tenant_id, external_id_1)
  WHERE external_id_1 IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_assets_tenant_external_id_2
  ON assets(tenant_id, external_id_2)
  WHERE external_id_2 IS NOT NULL;

ALTER TABLE data_sources DROP CONSTRAINT IF EXISTS data_sources_source_type_check;
ALTER TABLE data_sources
  ADD CONSTRAINT data_sources_source_type_check
  CHECK (source_type IN ('csv_url', 'json_url', 'rest_api', 'sftp', 'intune'));
