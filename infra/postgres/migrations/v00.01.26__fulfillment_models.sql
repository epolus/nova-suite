-- Reusable fulfillment models for simple catalog items.

CREATE TABLE IF NOT EXISTS fulfillment_models (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  external_key text,
  name         text NOT NULL,
  description  text,
  config       jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fulfillment_models_tenant ON fulfillment_models(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fulfillment_models_tenant_external_key
  ON fulfillment_models(tenant_id, external_key);

DROP TRIGGER IF EXISTS trg_fulfillment_models_updated_at ON fulfillment_models;
CREATE TRIGGER trg_fulfillment_models_updated_at
  BEFORE UPDATE ON fulfillment_models
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE service_items
  ADD COLUMN IF NOT EXISTS fulfillment_model_id uuid REFERENCES fulfillment_models(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_service_items_fulfillment_model
  ON service_items(fulfillment_model_id);

ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS provisioned_ci_id uuid REFERENCES configuration_items(id) ON DELETE SET NULL;

ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS provisioned_asset_id uuid REFERENCES assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_requests_provisioned_ci ON requests(provisioned_ci_id);
CREATE INDEX IF NOT EXISTS idx_requests_provisioned_asset ON requests(provisioned_asset_id);

ALTER TABLE fulfillment_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE fulfillment_models FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_fulfillment_models ON fulfillment_models;
CREATE POLICY tenant_isolation_fulfillment_models ON fulfillment_models
  FOR ALL USING (tenant_id = current_tenant_id());
