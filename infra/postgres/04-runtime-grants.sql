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
  is_active boolean,
  locked_out boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.tenant_id, u.email, u.password_hash, u.display_name,
         u.time_format, u.date_format, u.is_active, u.locked_out
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
  is_active boolean,
  locked_out boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.tenant_id, u.email, u.display_name,
         u.time_format, u.date_format, u.is_active, u.locked_out
  FROM users u
  WHERE u.sso_provider_id = p_subject
  ORDER BY u.created_at
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION lookup_user_for_login(p_email text, p_tenant_id uuid)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  email text,
  password_hash text,
  display_name text,
  time_format text,
  date_format text,
  is_active boolean,
  locked_out boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.tenant_id, u.email, u.password_hash, u.display_name,
         u.time_format, u.date_format, u.is_active, u.locked_out
  FROM users u
  WHERE lower(u.email) = lower(p_email)
    AND u.tenant_id = p_tenant_id
  ORDER BY u.created_at
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION lookup_user_for_sso(p_subject text, p_tenant_id uuid)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  email text,
  display_name text,
  time_format text,
  date_format text,
  is_active boolean,
  locked_out boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.tenant_id, u.email, u.display_name,
         u.time_format, u.date_format, u.is_active, u.locked_out
  FROM users u
  WHERE u.sso_provider_id = p_subject
    AND u.tenant_id = p_tenant_id
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

CREATE OR REPLACE FUNCTION lookup_satisfaction_by_token(p_token text)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  incident_id uuid,
  score integer,
  comment text,
  submitted_at timestamptz,
  incident_number text,
  incident_title text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    sr.id,
    sr.tenant_id,
    sr.incident_id,
    sr.score,
    sr.comment,
    sr.submitted_at,
    i.number::text AS incident_number,
    i.title AS incident_title
  FROM satisfaction_responses sr
  JOIN incidents i ON i.id = sr.incident_id
  WHERE sr.token = p_token
  LIMIT 1;
$$;

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

CREATE OR REPLACE FUNCTION resolve_session_access(p_session_id uuid, p_user_id uuid, p_tenant_id uuid)
RETURNS TABLE (is_active boolean, roles text[], session_valid boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.is_active,
         a.roles,
         EXISTS (
           SELECT 1
           FROM user_sessions s
           WHERE s.id = p_session_id
             AND s.user_id = p_user_id
             AND s.tenant_id = p_tenant_id
             AND s.revoked_at IS NULL
             AND s.expires_at > now()
         )
  FROM resolve_user_access(p_user_id, p_tenant_id) a;
$$;

REVOKE ALL ON FUNCTION resolve_session_access(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_session_access(uuid, uuid, uuid) TO nova_runtime;

-- Browser sessions: the cookie is the session id, so the user is loaded from that id alone.
CREATE OR REPLACE FUNCTION lookup_session_user(p_session_id uuid)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  email text,
  display_name text,
  time_format text,
  date_format text,
  is_active boolean,
  roles text[],
  session_valid boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id,
         u.tenant_id,
         u.email,
         u.display_name,
         u.time_format,
         u.date_format,
         u.is_active,
         COALESCE((SELECT a.roles FROM resolve_user_access(u.id, u.tenant_id) a), ARRAY[]::text[]),
         (s.revoked_at IS NULL AND s.expires_at > now())
  FROM user_sessions s
  JOIN users u ON u.id = s.user_id AND u.tenant_id = s.tenant_id
  WHERE s.id = p_session_id;
$$;

REVOKE ALL ON FUNCTION lookup_session_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lookup_session_user(uuid) TO nova_runtime;
REVOKE ALL ON FUNCTION lookup_user_for_login(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION lookup_user_for_sso(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION lookup_user_for_login(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION lookup_user_for_sso(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lookup_user_for_login(text, uuid) TO nova_runtime;
GRANT EXECUTE ON FUNCTION lookup_user_for_sso(text, uuid) TO nova_runtime;
REVOKE ALL ON FUNCTION lookup_request_tenant(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION lookup_satisfaction_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lookup_user_for_login(text) TO nova_runtime;
GRANT EXECUTE ON FUNCTION lookup_user_for_sso(text) TO nova_runtime;
GRANT EXECUTE ON FUNCTION lookup_request_tenant(uuid) TO nova_runtime;
GRANT EXECUTE ON FUNCTION lookup_satisfaction_by_token(text) TO nova_runtime;
