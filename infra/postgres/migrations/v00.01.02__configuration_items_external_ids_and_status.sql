-- CMDB CI fields: external system IDs + status enum (installed/in_stock).
ALTER TABLE configuration_items ADD COLUMN IF NOT EXISTS external_id_1 text;
ALTER TABLE configuration_items ADD COLUMN IF NOT EXISTS external_id_2 text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ci_tenant_external_id_1
  ON configuration_items(tenant_id, external_id_1)
  WHERE external_id_1 IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ci_tenant_external_id_2
  ON configuration_items(tenant_id, external_id_2)
  WHERE external_id_2 IS NOT NULL;

-- Replace CI status 'active' with 'installed' and add 'in_stock'.
-- Drop the status trigger first; Postgres forbids altering a column used by a trigger.
DROP TRIGGER IF EXISTS trg_ci_is_active_sync ON configuration_items;

ALTER TABLE configuration_items ALTER COLUMN status DROP DEFAULT;

ALTER TABLE configuration_items
  ALTER COLUMN status TYPE text
  USING status::text;

UPDATE configuration_items
SET status = 'installed'
WHERE status = 'active';

DROP TYPE ci_status_enum;

CREATE TYPE ci_status_enum AS ENUM (
  'installed',
  'in_stock',
  'maintenance',
  'retired',
  'planned'
);

ALTER TABLE configuration_items
  ALTER COLUMN status TYPE ci_status_enum
  USING status::ci_status_enum;

ALTER TABLE configuration_items
  ALTER COLUMN status SET DEFAULT 'installed'::ci_status_enum;

CREATE TRIGGER trg_ci_is_active_sync
  BEFORE INSERT OR UPDATE OF status ON configuration_items
  FOR EACH ROW EXECUTE FUNCTION sync_is_active_from_status();
