-- Resumable data source imports: one run row per workflow execution, an attempt
-- fencing token, and the next source row to import after a retry.
ALTER TABLE data_source_runs
  ADD COLUMN IF NOT EXISTS execution_key text,
  ADD COLUMN IF NOT EXISTS attempt integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS next_row integer NOT NULL DEFAULT 0;

ALTER TABLE data_source_runs
  DROP CONSTRAINT IF EXISTS data_source_runs_execution_key_key;
ALTER TABLE data_source_runs
  ADD CONSTRAINT data_source_runs_execution_key_key UNIQUE (data_source_id, execution_key);

-- Per-request access check in one statement: active flag plus direct and
-- assignment-group roles. Callers pass ids from a verified JWT.
CREATE OR REPLACE FUNCTION resolve_user_access(p_user_id uuid, p_tenant_id uuid)
RETURNS TABLE (is_active boolean, roles text[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.is_active,
         COALESCE((
           SELECT array_agg(DISTINCT r.name ORDER BY r.name)
           FROM roles r
           JOIN (
             SELECT ur.role_id
             FROM user_roles ur
             WHERE ur.user_id = u.id AND ur.tenant_id = u.tenant_id
             UNION
             SELECT agr.role_id
             FROM assignment_group_members agm
             JOIN assignment_group_roles agr ON agr.group_id = agm.group_id
             WHERE agm.user_id = u.id AND agm.tenant_id = u.tenant_id AND agr.tenant_id = u.tenant_id
           ) src ON src.role_id = r.id
           WHERE r.tenant_id = u.tenant_id
         ), ARRAY[]::text[])
  FROM users u
  WHERE u.id = p_user_id AND u.tenant_id = p_tenant_id;
$$;

REVOKE ALL ON FUNCTION resolve_user_access(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_user_access(uuid, uuid) TO nova_runtime;

-- nova-migrate also adds this before applying anything; kept here for manual psql upgrades.
ALTER TABLE schema_migrations
  ADD COLUMN IF NOT EXISTS checksum text;
