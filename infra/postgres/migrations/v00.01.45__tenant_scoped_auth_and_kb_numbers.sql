-- Tenant-scoped pre-auth lookups and per-tenant knowledge article numbers.

-- ─── Pre-auth lookups scoped to a tenant ───
-- The single-argument versions stay so engine instances still running older
-- code keep working during a rolling deploy.

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

REVOKE ALL ON FUNCTION lookup_user_for_login(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION lookup_user_for_sso(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lookup_user_for_login(text, uuid) TO nova_runtime;
GRANT EXECUTE ON FUNCTION lookup_user_for_sso(text, uuid) TO nova_runtime;

-- ─── Knowledge article numbers: own sequence, unique per tenant ───

CREATE SEQUENCE IF NOT EXISTS kb_number_seq START 1000;

-- Articles were numbered from incident_number_seq; continue above the highest one.
SELECT setval(
  'kb_number_seq',
  GREATEST(
    1000,
    COALESCE(
      (SELECT max(substring(number FROM '^KB0*([0-9]+)')::bigint)
       FROM knowledge_articles
       WHERE number ~ '^KB[0-9]+'),
      0
    ) + 1
  ),
  false
);

GRANT USAGE, SELECT ON SEQUENCE kb_number_seq TO nova_runtime;

ALTER TABLE knowledge_articles DROP CONSTRAINT IF EXISTS knowledge_articles_number_key;
ALTER TABLE knowledge_articles DROP CONSTRAINT IF EXISTS knowledge_articles_tenant_number_key;
ALTER TABLE knowledge_articles
  ADD CONSTRAINT knowledge_articles_tenant_number_key UNIQUE (tenant_id, number);
