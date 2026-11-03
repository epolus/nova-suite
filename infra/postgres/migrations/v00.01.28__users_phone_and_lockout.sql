-- Users: nullable phone, lockout, and identity fields (existing databases).

ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE users ALTER COLUMN phone DROP DEFAULT;

UPDATE users
SET phone = NULL
WHERE btrim(phone) IN ('', '+41');

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS locked_out boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS lock_reason text,
  ADD COLUMN IF NOT EXISTS failed_login_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_failed_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS vip boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS employee_number text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_failed_login_count_check;
ALTER TABLE users
  ADD CONSTRAINT users_failed_login_count_check
  CHECK (failed_login_count >= 0);

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_source_check;
ALTER TABLE users
  ADD CONSTRAINT users_source_check
  CHECK (source IN ('manual', 'sso', 'import', 'datasource'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_employee_number
  ON users(tenant_id, employee_number)
  WHERE employee_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_locked_out
  ON users(tenant_id)
  WHERE locked_out;

-- Return type changes require DROP before CREATE.
DROP FUNCTION IF EXISTS lookup_user_for_login(text);
CREATE FUNCTION lookup_user_for_login(p_email text)
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

DROP FUNCTION IF EXISTS lookup_user_for_sso(text);
CREATE FUNCTION lookup_user_for_sso(p_subject text)
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

REVOKE ALL ON FUNCTION lookup_user_for_login(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION lookup_user_for_sso(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lookup_user_for_login(text) TO nova_runtime;
GRANT EXECUTE ON FUNCTION lookup_user_for_sso(text) TO nova_runtime;
