-- Add portable identity key for configuration package export/import of data sources.
ALTER TABLE data_sources ADD COLUMN IF NOT EXISTS external_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_data_sources_tenant_external_key
  ON data_sources(tenant_id, external_key);
