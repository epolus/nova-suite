-- v00.01.47: Server-side login sessions.
--
-- Every issued access token carries a session id (`sid` claim). A token is only
-- accepted while its session row exists, is not revoked and has not expired, so
-- logout, deactivation, admin lock and password resets take effect immediately
-- instead of when the JWT expires.

CREATE TABLE IF NOT EXISTS user_sessions (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  auth_method text NOT NULL DEFAULT 'password' CHECK (auth_method IN ('password', 'sso')),
  user_agent  text,
  ip_address  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user
  ON user_sessions(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires
  ON user_sessions(expires_at);

ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_user_sessions ON user_sessions;
CREATE POLICY tenant_isolation_user_sessions ON user_sessions
  FOR ALL USING (tenant_id = current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON user_sessions TO nova_runtime;

-- Per-request lookup used by the authenticate middleware before any tenant
-- context exists (same pre-auth pattern as resolve_user_access).
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
