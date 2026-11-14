-- Bidirectional record links across ITSM entities (unique undirected pair per tenant).

CREATE TABLE IF NOT EXISTS record_links (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_type   text NOT NULL
                CHECK (source_type IN (
                  'incident', 'request', 'problem', 'change',
                  'configuration_item', 'asset'
                )),
  source_id     uuid NOT NULL,
  target_type   text NOT NULL
                CHECK (target_type IN (
                  'incident', 'request', 'problem', 'change',
                  'configuration_item', 'asset'
                )),
  target_id     uuid NOT NULL,
  link_type     text NOT NULL
                CHECK (link_type IN ('related', 'parent', 'duplicate')),
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT (source_type = target_type AND source_id = target_id))
);

-- One undirected pair per tenant regardless of stored direction.
CREATE UNIQUE INDEX IF NOT EXISTS idx_record_links_undirected_pair
  ON record_links (
    tenant_id,
    LEAST(source_type || ':' || source_id::text, target_type || ':' || target_id::text),
    GREATEST(source_type || ':' || source_id::text, target_type || ':' || target_id::text)
  );

CREATE INDEX IF NOT EXISTS idx_record_links_source
  ON record_links(tenant_id, source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_record_links_target
  ON record_links(tenant_id, target_type, target_id);

ALTER TABLE record_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE record_links FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_record_links ON record_links;
CREATE POLICY tenant_isolation_record_links ON record_links
  FOR ALL USING (tenant_id = current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON record_links TO nova_runtime;
