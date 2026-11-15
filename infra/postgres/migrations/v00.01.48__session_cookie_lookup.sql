-- v00.01.48: Look up a browser session by its id.
--
-- The `nova_session` cookie holds this id, not the access token. Authentication
-- runs before any tenant context exists, so the lookup is SECURITY DEFINER,
-- same as resolve_session_access.

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
