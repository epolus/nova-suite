-- SPDX-License-Identifier: AGPL-3.0-only
-- Privileges and SECURITY DEFINER helpers for the nova_runtime application role.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nova_runtime') THEN
    RAISE EXCEPTION 'Role nova_runtime does not exist. Run 00-runtime-role.sh first.';
  END IF;
END
$$;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO nova_runtime', current_database());
END
$$;

GRANT USAGE ON SCHEMA public TO nova_runtime;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nova_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nova_runtime;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO nova_runtime;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nova_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO nova_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO nova_runtime;

DO $$
BEGIN
  GRANT SELECT ON pg_stat_statements TO nova_runtime;
  GRANT SELECT ON pg_stat_statements_info TO nova_runtime;
EXCEPTION
  WHEN undefined_table THEN
    NULL;
  WHEN invalid_schema_name THEN
    NULL;
END
$$;

-- Pre-auth lookups must bypass RLS: the caller has no tenant context yet.
-- Owned by the bootstrap superuser so SECURITY DEFINER actually bypasses RLS.
CREATE OR REPLACE FUNCTION lookup_user_for_login(p_email text)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  email text,
  password_hash text,
  display_name text,
  time_format text,
  date_format text,
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.tenant_id, u.email, u.password_hash, u.display_name,
         u.time_format, u.date_format, u.is_active
  FROM users u
  WHERE lower(u.email) = lower(p_email)
  ORDER BY u.created_at
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION lookup_user_for_sso(p_subject text)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  email text,
  display_name text,
  time_format text,
  date_format text,
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.tenant_id, u.email, u.display_name,
         u.time_format, u.date_format, u.is_active
  FROM users u
  WHERE u.sso_provider_id = p_subject
  ORDER BY u.created_at
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION lookup_request_tenant(p_request_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM requests WHERE id = p_request_id
$$;

REVOKE ALL ON FUNCTION lookup_user_for_login(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION lookup_user_for_sso(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION lookup_request_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lookup_user_for_login(text) TO nova_runtime;
GRANT EXECUTE ON FUNCTION lookup_user_for_sso(text) TO nova_runtime;
GRANT EXECUTE ON FUNCTION lookup_request_tenant(uuid) TO nova_runtime;
