-- SPDX-License-Identifier: AGPL-3.0-only
-- ============================================================
-- Nova Suite – Database Schema
-- PostgreSQL 18 with multi-tenant support
-- ============================================================

-- ─── Extensions ───
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Grant CREATEDB so Temporal auto-setup can create its databases
ALTER USER current_user CREATEDB;

-- ============================================================
-- Session variables for Row-Level Security
-- ============================================================
-- These GUC variables are set per-connection by the app layer.
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid AS $$
  SELECT COALESCE(
    NULLIF(current_setting('app.current_tenant_id', true), '')::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid
  );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION current_user_id() RETURNS uuid AS $$
  SELECT COALESCE(
    NULLIF(current_setting('app.current_user_id', true), '')::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid
  );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION current_user_roles() RETURNS text[] AS $$
  SELECT COALESCE(
    string_to_array(NULLIF(current_setting('app.current_user_roles', true), ''), ','),
    ARRAY['user']
  );
$$ LANGUAGE sql STABLE;

-- Convenience: check if the current user has any of the given roles
CREATE OR REPLACE FUNCTION current_user_has_role(VARIADIC p_roles text[]) RETURNS boolean AS $$
  SELECT current_user_roles() && p_roles;
$$ LANGUAGE sql STABLE;

-- Helper to set tenant context (called before every request)
CREATE OR REPLACE FUNCTION set_tenant_context(
  p_tenant_id uuid,
  p_user_id uuid,
  p_user_roles text  -- comma-separated role names
) RETURNS void AS $$
BEGIN
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, false);
  PERFORM set_config('app.current_user_id', p_user_id::text, false);
  PERFORM set_config('app.current_user_roles', p_user_roles, false);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 1. TENANTS
-- ============================================================
CREATE TABLE tenants (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  settings    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tenants_settings_gin ON tenants USING gin (settings);

-- ============================================================
-- 2. DEPARTMENTS
-- ============================================================
CREATE TABLE departments (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  parent_department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  name        text NOT NULL,
  description text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX idx_departments_tenant ON departments(tenant_id);

-- ============================================================
-- 3. COST CENTERS
-- ============================================================
CREATE TABLE cost_centers (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code        text NOT NULL,
  name        text NOT NULL,
  description text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE INDEX idx_cost_centers_tenant ON cost_centers(tenant_id);

-- ============================================================
-- 4. ROLES
-- ============================================================
CREATE TABLE roles (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX idx_roles_tenant ON roles(tenant_id);

-- ============================================================
-- 5. PROCESSES (ITIL process types)
-- ============================================================
CREATE TABLE processes (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX idx_processes_tenant ON processes(tenant_id);

-- ============================================================
-- 6. USERS
-- ============================================================
CREATE TABLE users (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id             text,
  email               text NOT NULL,
  password_hash       text NOT NULL,
  first_name          text,
  last_name           text,
  display_name        text NOT NULL,
  title               text,
  phone               text NOT NULL DEFAULT '+41',
  mobile              text,
  location            text NOT NULL DEFAULT 'Zurich',
  timezone            text NOT NULL DEFAULT 'UTC',
  time_format         text NOT NULL DEFAULT '24h'
                      CHECK (time_format IN ('12h', '24h')),
  date_format         text NOT NULL DEFAULT 'DD.MM.YYYY'
                      CHECK (date_format IN ('DD.MM.YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD')),
  employee_type       text NOT NULL DEFAULT 'employee'
                      CHECK (employee_type IN ('employee', 'contractor', 'vendor', 'intern')),
  company             uuid,
  preferred_language  text NOT NULL DEFAULT 'en',
  start_date          date,
  last_working_date   date,
  manager_id          uuid REFERENCES users(id) ON DELETE SET NULL,
  department_id       uuid REFERENCES departments(id) ON DELETE SET NULL,
  cost_center_id      uuid REFERENCES cost_centers(id) ON DELETE SET NULL,
  sso_provider_id     text,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_email ON users(tenant_id, email);
CREATE INDEX idx_users_manager ON users(manager_id);
CREATE INDEX idx_users_department ON users(department_id);
CREATE INDEX idx_users_sso ON users(tenant_id, sso_provider_id) WHERE sso_provider_id IS NOT NULL;
CREATE INDEX idx_users_cost_center ON users(cost_center_id);
CREATE INDEX idx_users_company ON users(company);

-- ============================================================
-- 6A. COMPANIES
-- ============================================================
CREATE TABLE companies (
  id                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name               text NOT NULL,
  code               text,
  website            text,
  phone              text,
  street             text,
  city               text,
  state              text,
  zip                text,
  country            text,
  parent_company_id  uuid REFERENCES companies(id) ON DELETE SET NULL,
  contact_user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  description        text,
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX idx_companies_tenant ON companies(tenant_id);
CREATE INDEX idx_companies_parent ON companies(parent_company_id);
CREATE INDEX idx_companies_contact ON companies(contact_user_id);
CREATE UNIQUE INDEX idx_companies_tenant_code_unique
  ON companies(tenant_id, code)
  WHERE code IS NOT NULL;

ALTER TABLE users
  ADD CONSTRAINT fk_users_company
  FOREIGN KEY (company) REFERENCES companies(id) ON DELETE SET NULL;

-- ============================================================
-- 6B. LOCATIONS
-- ============================================================
CREATE TABLE locations (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                text NOT NULL,
  code                text NOT NULL,
  source              text NOT NULL DEFAULT 'manual',
  country             text,
  state               text,
  city                text,
  zip                 text,
  street              text,
  parent_location_id  uuid REFERENCES locations(id) ON DELETE SET NULL,
  company_id          uuid REFERENCES companies(id) ON DELETE SET NULL,
  description         text,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE INDEX idx_locations_tenant ON locations(tenant_id);
CREATE INDEX idx_locations_company ON locations(company_id);
CREATE INDEX idx_locations_parent ON locations(parent_location_id);
CREATE INDEX idx_locations_name ON locations(tenant_id, name);

-- ============================================================
-- 6C. USER PREFERENCES (cross-device UI prefs)
-- ============================================================
CREATE TABLE user_preferences (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope       text NOT NULL,
  value       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, scope)
);

CREATE INDEX idx_user_preferences_tenant_user ON user_preferences(tenant_id, user_id);
CREATE INDEX idx_user_preferences_scope ON user_preferences(tenant_id, scope);
CREATE INDEX idx_user_preferences_value_gin ON user_preferences USING gin (value);

-- ============================================================
-- 7. USER ROLES (many-to-many)
-- ============================================================
CREATE TABLE user_roles (
  id        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id   uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (tenant_id, user_id, role_id)
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role_id);
CREATE INDEX idx_user_roles_tenant ON user_roles(tenant_id);

-- ============================================================
-- 8. ASSIGNMENT GROUPS
-- ============================================================
CREATE TABLE assignment_groups (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  manager_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  cost_center_id  uuid REFERENCES cost_centers(id) ON DELETE SET NULL,
  parent_group_id uuid REFERENCES assignment_groups(id) ON DELETE SET NULL,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX idx_assignment_groups_tenant ON assignment_groups(tenant_id);
CREATE INDEX idx_assignment_groups_manager ON assignment_groups(manager_id);
CREATE INDEX idx_assignment_groups_parent ON assignment_groups(parent_group_id);

-- ============================================================
-- 9. ASSIGNMENT GROUP MEMBERS (many-to-many)
-- ============================================================
CREATE TABLE assignment_group_members (
  id        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  group_id  uuid NOT NULL REFERENCES assignment_groups(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, group_id, user_id)
);

CREATE INDEX idx_agm_group ON assignment_group_members(group_id);
CREATE INDEX idx_agm_user ON assignment_group_members(user_id);

-- ============================================================
-- 10. ASSIGNMENT GROUP ROLE MAPPINGS (many-to-many)
-- ============================================================
CREATE TABLE assignment_group_roles (
  id        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  group_id  uuid NOT NULL REFERENCES assignment_groups(id) ON DELETE CASCADE,
  role_id   uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  UNIQUE (tenant_id, group_id, role_id)
);

CREATE INDEX idx_agr_group ON assignment_group_roles(group_id);
CREATE INDEX idx_agr_role ON assignment_group_roles(role_id);

-- ============================================================
-- 11. ASSIGNMENT GROUP PROCESSES (many-to-many)
-- ============================================================
CREATE TABLE assignment_group_processes (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  group_id   uuid NOT NULL REFERENCES assignment_groups(id) ON DELETE CASCADE,
  process_id uuid NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
  UNIQUE (tenant_id, group_id, process_id)
);

CREATE INDEX idx_agp_group ON assignment_group_processes(group_id);
CREATE INDEX idx_agp_process ON assignment_group_processes(process_id);

-- ============================================================
-- 12. SERVICE CATALOG – Categories
-- ============================================================
CREATE TABLE service_categories (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  icon        text DEFAULT 'folder',
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_service_categories_tenant ON service_categories(tenant_id);

-- ============================================================
-- 8. SERVICE CATALOG – Items
-- ============================================================
CREATE TABLE service_items (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category_id         uuid NOT NULL REFERENCES service_categories(id) ON DELETE CASCADE,
  name                text NOT NULL,
  short_description   text,
  description         text,
  icon                text DEFAULT 'box',
  picture_storage_key text,
  price               numeric(12,2),
  custom_attributes   jsonb NOT NULL DEFAULT '{}',
  form_schema         jsonb NOT NULL DEFAULT '{"fields": []}',
  approval_required   boolean NOT NULL DEFAULT false,
  sla_hours           integer DEFAULT 72,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_service_items_tenant ON service_items(tenant_id);
CREATE INDEX idx_service_items_category ON service_items(category_id);
CREATE INDEX idx_service_items_custom_attributes_gin ON service_items USING gin (custom_attributes);
CREATE INDEX idx_service_items_form_schema_gin ON service_items USING gin (form_schema);

-- ============================================================
-- 9A. CARTS (RLS-isolated per user)
-- ============================================================
CREATE TABLE carts (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX idx_carts_tenant ON carts(tenant_id);
CREATE INDEX idx_carts_user ON carts(user_id);

CREATE TABLE cart_items (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cart_id          uuid NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  service_item_id uuid NOT NULL REFERENCES service_items(id),
  form_data        jsonb NOT NULL DEFAULT '{}',
  priority         text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  notes            text NOT NULL DEFAULT '',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cart_items_tenant ON cart_items(tenant_id);
CREATE INDEX idx_cart_items_cart ON cart_items(cart_id);
CREATE INDEX idx_cart_items_service_item ON cart_items(service_item_id);

-- ============================================================
-- 9. REQUESTS (User Portal submissions)
-- ============================================================
CREATE TABLE requests (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  number          text NOT NULL,
  requester_id    uuid NOT NULL REFERENCES users(id),
  requested_for   uuid REFERENCES users(id),
  service_item_id uuid NOT NULL REFERENCES service_items(id),
  form_data       jsonb NOT NULL DEFAULT '{}',
  delivery_info   jsonb NOT NULL DEFAULT '{}',
  batch_id        uuid,
  is_active       boolean NOT NULL DEFAULT true,
  status          text NOT NULL DEFAULT 'submitted'
                  CHECK (status IN (
                    'submitted', 'pending_approval', 'approved',
                    'rejected', 'in_progress', 'fulfilled', 'cancelled'
                  )),
  priority        text NOT NULL DEFAULT 'medium'
                  CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  approved_by     uuid REFERENCES users(id),
  approved_at     timestamptz,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, number)
);

CREATE INDEX idx_requests_tenant ON requests(tenant_id);
CREATE INDEX idx_requests_requester ON requests(requester_id);
CREATE INDEX idx_requests_status ON requests(tenant_id, status);
CREATE INDEX idx_requests_batch ON requests(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX idx_requests_form_data_gin ON requests USING gin (form_data);
CREATE INDEX idx_requests_delivery_info_gin ON requests USING gin (delivery_info);

-- Request number sequence per tenant
CREATE SEQUENCE request_number_seq START 1000;

-- ============================================================
-- SERVICES (IT/Business services linked to incidents)
-- ============================================================
CREATE TABLE services (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX idx_services_tenant ON services(tenant_id);

-- ============================================================
-- 10. INCIDENTS (Fulfiller work items)
-- ============================================================
CREATE TYPE incident_status_enum AS ENUM (
  'new', 'assigned', 'in_progress', 'pending', 'resolved', 'closed', 'cancelled'
);

CREATE TABLE incidents (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  number          text NOT NULL,
  request_id      uuid REFERENCES requests(id),
  is_active       boolean NOT NULL DEFAULT true,
  title           text NOT NULL,
  description     text,
  status          incident_status_enum NOT NULL DEFAULT 'new',
  impact          text NOT NULL DEFAULT 'medium'
                  CHECK (impact IN ('low', 'medium', 'high')),
  urgency         text NOT NULL DEFAULT 'medium'
                  CHECK (urgency IN ('low', 'medium', 'high')),
  priority        integer NOT NULL DEFAULT 3
                  CHECK (priority BETWEEN 1 AND 5),
  assigned_to     uuid REFERENCES users(id),
  assignment_group_id uuid REFERENCES assignment_groups(id) ON DELETE SET NULL,
  caller_id       uuid REFERENCES users(id),
  contact_info    text,
  service_id      uuid REFERENCES services(id) ON DELETE SET NULL,
  configuration_item_id uuid,
  category        text,
  subcategory     text,
  resolution_code text,
  resolution_notes text,
  resolved_at     timestamptz,
  closed_at       timestamptz,
  sla_due_at      timestamptz,
  sla_breached    boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, number)
);

CREATE INDEX idx_incidents_tenant ON incidents(tenant_id);
CREATE INDEX idx_incidents_status ON incidents(tenant_id, status);
CREATE INDEX idx_incidents_assigned ON incidents(assigned_to);
CREATE INDEX idx_incidents_assignment_group ON incidents(assignment_group_id);
CREATE INDEX idx_incidents_sla ON incidents(tenant_id, sla_breached, sla_due_at);
CREATE INDEX idx_incidents_request ON incidents(request_id);

CREATE SEQUENCE incident_number_seq START 1000;

-- ============================================================
-- 11. INCIDENT JOURNAL (activity log)
-- ============================================================
CREATE TABLE incident_journal (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES users(id),
  entry_type  text NOT NULL DEFAULT 'comment'
              CHECK (entry_type IN ('comment', 'work_note', 'state_change', 'assignment')),
  content     text NOT NULL,
  is_customer_visible boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_journal_incident ON incident_journal(incident_id);

-- ============================================================
-- 12. CMDB – CI Classes (extensible types)
-- ============================================================
CREATE TABLE ci_classes (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         text NOT NULL,
  display_name text NOT NULL,
  description  text,
  parent_class uuid REFERENCES ci_classes(id),
  attributes   jsonb NOT NULL DEFAULT '{}',
  icon         text DEFAULT 'server',
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX idx_ci_classes_tenant ON ci_classes(tenant_id);
CREATE INDEX idx_ci_classes_attributes_gin ON ci_classes USING gin (attributes);

-- ============================================================
-- 13. CMDB – Configuration Items
-- ============================================================
CREATE TYPE ci_status_enum AS ENUM ('active', 'maintenance', 'retired', 'planned');

CREATE TABLE configuration_items (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  class_id     uuid NOT NULL REFERENCES ci_classes(id),
  name         text NOT NULL,
  display_name text,
  is_active    boolean NOT NULL DEFAULT true,
  status       ci_status_enum NOT NULL DEFAULT 'active',
  environment  text DEFAULT 'production'
               CHECK (environment IN ('production', 'staging', 'development', 'test')),
  attributes   jsonb NOT NULL DEFAULT '{}',
  managed_by   uuid REFERENCES users(id),
  assigned_to    uuid REFERENCES users(id),
  supported_by   uuid REFERENCES assignment_groups(id),
  location       text,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ci_tenant ON configuration_items(tenant_id);
CREATE INDEX idx_ci_class ON configuration_items(class_id);
CREATE INDEX idx_ci_status ON configuration_items(tenant_id, status);
CREATE INDEX idx_ci_assigned ON configuration_items(tenant_id, assigned_to);
CREATE INDEX idx_ci_supported_by ON configuration_items(tenant_id, supported_by);
CREATE INDEX idx_ci_attributes_gin ON configuration_items USING gin (attributes);

-- ============================================================
-- 14. CMDB – CI Relationships
-- ============================================================
CREATE TABLE ci_relationships (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_ci_id    uuid NOT NULL REFERENCES configuration_items(id) ON DELETE CASCADE,
  target_ci_id    uuid NOT NULL REFERENCES configuration_items(id) ON DELETE CASCADE,
  relationship_type text NOT NULL DEFAULT 'depends_on'
                  CHECK (relationship_type IN (
                    'depends_on', 'used_by', 'runs_on',
                    'connected_to', 'part_of', 'manages'
                  )),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_ci_id, target_ci_id, relationship_type)
);

CREATE INDEX idx_ci_rel_source ON ci_relationships(source_ci_id);
CREATE INDEX idx_ci_rel_target ON ci_relationships(target_ci_id);

-- ============================================================
-- 15. CMDB – CI History (audit trail)
-- ============================================================
CREATE TABLE ci_history (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ci_id       uuid NOT NULL REFERENCES configuration_items(id) ON DELETE CASCADE,
  changed_by  uuid NOT NULL REFERENCES users(id),
  change_type text NOT NULL CHECK (change_type IN ('create', 'update', 'delete')),
  field_name  text,
  old_value   text,
  new_value   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ci_history_ci ON ci_history(ci_id);
CREATE INDEX idx_ci_history_time ON ci_history(ci_id, created_at DESC);

-- ============================================================
-- 16. PRIORITY MATRIX (Impact x Urgency)
-- ============================================================
CREATE TABLE priority_matrix (
  id       uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  impact   text NOT NULL CHECK (impact IN ('low', 'medium', 'high')),
  urgency  text NOT NULL CHECK (urgency IN ('low', 'medium', 'high')),
  priority integer NOT NULL CHECK (priority BETWEEN 1 AND 5),
  UNIQUE (impact, urgency)
);

-- Populate the priority matrix
INSERT INTO priority_matrix (impact, urgency, priority) VALUES
  ('high',   'high',   1),  -- Critical
  ('high',   'medium', 2),  -- High
  ('high',   'low',    3),  -- Moderate
  ('medium', 'high',   2),  -- High
  ('medium', 'medium', 3),  -- Moderate
  ('medium', 'low',    4),  -- Low
  ('low',    'high',   3),  -- Moderate
  ('low',    'medium', 4),  -- Low
  ('low',    'low',    5);  -- Planning

-- ============================================================
-- TRIGGERS – auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'tenants', 'departments', 'cost_centers', 'roles', 'processes',
      'users', 'companies', 'locations', 'user_preferences', 'assignment_groups', 'services',
      'service_categories', 'service_items',
      'requests', 'incidents', 'ci_classes', 'configuration_items'
    ])
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at
         BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
      tbl, tbl
    );
  END LOOP;
END;
$$;

-- ============================================================
-- FUNCTION – Calculate priority from impact & urgency
-- ============================================================
CREATE OR REPLACE FUNCTION calculate_priority(p_impact text, p_urgency text)
RETURNS integer AS $$
  SELECT priority FROM priority_matrix
  WHERE impact = p_impact AND urgency = p_urgency;
$$ LANGUAGE sql STABLE;

-- ============================================================
-- FUNCTION – CMDB Impact Analysis (recursive blast radius)
-- ============================================================
CREATE OR REPLACE FUNCTION cmdb_impact_analysis(p_ci_id uuid, p_depth integer DEFAULT 5)
RETURNS TABLE(
  ci_id uuid,
  ci_name text,
  relationship_type text,
  depth integer
) AS $$
WITH RECURSIVE impact AS (
  -- Base: direct dependents
  SELECT
    r.target_ci_id AS ci_id,
    ci.name AS ci_name,
    r.relationship_type,
    1 AS depth
  FROM ci_relationships r
  JOIN configuration_items ci ON ci.id = r.target_ci_id
  WHERE r.source_ci_id = p_ci_id
    AND r.relationship_type IN ('depends_on', 'runs_on', 'part_of')

  UNION

  -- Recursive: dependents of dependents
  SELECT
    r.target_ci_id,
    ci.name,
    r.relationship_type,
    imp.depth + 1
  FROM ci_relationships r
  JOIN configuration_items ci ON ci.id = r.target_ci_id
  JOIN impact imp ON imp.ci_id = r.source_ci_id
  WHERE imp.depth < p_depth
    AND r.relationship_type IN ('depends_on', 'runs_on', 'part_of')
)
SELECT DISTINCT ON (impact.ci_id) * FROM impact
ORDER BY impact.ci_id, impact.depth;
$$ LANGUAGE sql STABLE;

-- ============================================================
-- SEED DATA – Demo tenant, users, catalog, CMDB
-- ============================================================

-- Demo tenant
INSERT INTO tenants (id, name, slug) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Acme Corp', 'acme');

-- Demo departments
INSERT INTO departments (id, tenant_id, name, description) VALUES
  ('a1000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001',
   'IT', 'Information Technology'),
  ('a1000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000001',
   'Engineering', 'Software Engineering'),
  ('a1000000-0000-0000-0000-000000000003',
   'a0000000-0000-0000-0000-000000000001',
   'Finance', 'Finance & Accounting'),
  ('a1000000-0000-0000-0000-000000000004',
   'a0000000-0000-0000-0000-000000000001',
   'HR', 'Human Resources'),
  ('a1000000-0000-0000-0000-000000000005',
   'a0000000-0000-0000-0000-000000000001',
   'Sales', 'Sales & Business Development');

-- Demo cost centers
INSERT INTO cost_centers (id, tenant_id, code, name, description) VALUES
  ('a2000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001',
   'CC-IT-001', 'IT Operations', 'IT department operational costs'),
  ('a2000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000001',
   'CC-ENG-001', 'Engineering', 'Engineering department costs'),
  ('a2000000-0000-0000-0000-000000000003',
   'a0000000-0000-0000-0000-000000000001',
   'CC-FIN-001', 'Finance', 'Finance department costs'),
  ('a2000000-0000-0000-0000-000000000004',
   'a0000000-0000-0000-0000-000000000001',
   'CC-HR-001', 'Human Resources', 'HR department costs'),
  ('a2000000-0000-0000-0000-000000000005',
   'a0000000-0000-0000-0000-000000000001',
   'CC-SAL-001', 'Sales', 'Sales department costs');

-- Demo roles
INSERT INTO roles (id, tenant_id, name, description) VALUES
  ('a3000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001',
   'admin', 'Full system administrator'),
  ('a3000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000001',
   'fulfiller', 'IT support agent / fulfiller'),
  ('a3000000-0000-0000-0000-000000000003',
   'a0000000-0000-0000-0000-000000000001',
   'user', 'Standard end user'),
  ('a3000000-0000-0000-0000-000000000004',
   'a0000000-0000-0000-0000-000000000001',
   'approver', 'Can approve service requests'),
  ('a3000000-0000-0000-0000-000000000005',
   'a0000000-0000-0000-0000-000000000001',
   'asset_manager', 'Can manage CMDB assets'),
  ('a3000000-0000-0000-0000-000000000006',
   'a0000000-0000-0000-0000-000000000001',
   'configuration_manager', 'Can create and edit configuration items'),
  ('a3000000-0000-0000-0000-000000000007',
   'a0000000-0000-0000-0000-000000000001',
   'problem', 'Can manage and work on problems'),
  ('a3000000-0000-0000-0000-000000000008',
   'a0000000-0000-0000-0000-000000000001',
   'change_manager', 'Can manage and approve changes'),
  ('a3000000-0000-0000-0000-000000000009',
   'a0000000-0000-0000-0000-000000000001',
   'catalog_designer', 'Can design catalog service items and tasks'),
  ('a3000000-0000-0000-0000-000000000010',
   'a0000000-0000-0000-0000-000000000001',
   'credential_manager', 'Can create and rotate encrypted integration credentials');

-- Demo company
INSERT INTO companies (
  id, tenant_id, name, code, website, phone, street, city, state, zip, country, is_active
) VALUES (
  'a4000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'Acme Corp',
  'ACME',
  'https://acme.local',
  '+41 20 555 0100',
  'Main Street 1',
  'Zurich',
  'ZH',
  '8001',
  'Switzerland',
  true
);

-- Demo users (passwords: admin123 – bcrypt hash)
INSERT INTO users (
  id, tenant_id, user_id, email, password_hash,
  first_name, last_name, display_name, title,
  phone, mobile, location, timezone, time_format, date_format,
  employee_type, company, preferred_language,
  start_date, department_id, cost_center_id
) VALUES
  ('b0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001',
   'EMP001', 'admin@acme.local',
   '$2b$10$WI5eBebgKFrYIXgHEKUdF.X7ogfJWMaDkLg7UUOb2paF8sUAjxf4y',
   'Alex', 'Administrator', 'Admin User', 'IT Director',
  '+4120 555 0100', '+41 6 1234 5678', 'Zurich HQ', 'Europe/Zurich', '24h', 'DD.MM.YYYY',
   'employee', 'a4000000-0000-0000-0000-000000000001', 'en',
   '2020-01-15',
   'a1000000-0000-0000-0000-000000000001',
   'a2000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000001',
   'EMP002', 'fulfiller@acme.local',
   '$2b$10$WI5eBebgKFrYIXgHEKUdF.X7ogfJWMaDkLg7UUOb2paF8sUAjxf4y',
   'Sam', 'Support', 'IT Support Agent', 'IT Support Engineer',
  '+41 20 555 0101', '+41 6 2345 6789', 'Zurich HQ', 'Europe/Zurich', '24h', 'DD.MM.YYYY',
   'employee', 'a4000000-0000-0000-0000-000000000001', 'en',
   '2021-06-01',
   'a1000000-0000-0000-0000-000000000001',
   'a2000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000003',
   'a0000000-0000-0000-0000-000000000001',
   'EMP003', 'user@acme.local',
   '$2b$10$WI5eBebgKFrYIXgHEKUdF.X7ogfJWMaDkLg7UUOb2paF8sUAjxf4y',
   'Jane', 'Employee', 'Jane Employee', 'Software Engineer',
  '+41 20 555 0102', '+41 6 3456 7890', 'Rotterdam Office', 'Europe/Zurich', '24h', 'DD.MM.YYYY',
   'employee', 'a4000000-0000-0000-0000-000000000001', 'en',
   '2022-03-15',
   'a1000000-0000-0000-0000-000000000002',
   'a2000000-0000-0000-0000-000000000002');

-- Set manager relationships (fulfiller and user report to admin)
UPDATE users SET manager_id = 'b0000000-0000-0000-0000-000000000001'
WHERE id IN ('b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000003');

-- Assign roles to demo users
INSERT INTO user_roles (tenant_id, user_id, role_id, granted_by) VALUES
  -- Admin gets admin + approver + asset_manager + configuration_manager
  ('a0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000001',
   'a3000000-0000-0000-0000-000000000001', NULL),
  ('a0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000001',
   'a3000000-0000-0000-0000-000000000004', NULL),
  ('a0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000001',
   'a3000000-0000-0000-0000-000000000005', NULL),
  ('a0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000001',
   'a3000000-0000-0000-0000-000000000006', NULL),
  ('a0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000001',
   'a3000000-0000-0000-0000-000000000008', NULL),
  -- Fulfiller gets fulfiller + user
  ('a0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000002',
   'a3000000-0000-0000-0000-000000000002', NULL),
  ('a0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000002',
   'a3000000-0000-0000-0000-000000000003', NULL),
  -- Jane Employee gets user
  ('a0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000003',
   'a3000000-0000-0000-0000-000000000003', NULL);

-- Demo processes
INSERT INTO processes (id, tenant_id, name, description) VALUES
  ('a4000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001',
   'Incident Management', 'Restore normal service as quickly as possible'),
  ('a4000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000001',
   'Change Management', 'Control the lifecycle of all changes'),
  ('a4000000-0000-0000-0000-000000000003',
   'a0000000-0000-0000-0000-000000000001',
   'Problem Management', 'Prevent incidents and minimize impact of unavoidable ones'),
  ('a4000000-0000-0000-0000-000000000004',
   'a0000000-0000-0000-0000-000000000001',
   'Request Fulfillment', 'Manage the lifecycle of service requests'),
  ('a4000000-0000-0000-0000-000000000005',
   'a0000000-0000-0000-0000-000000000001',
   'Asset Management', 'Manage the lifecycle of IT assets');

-- Demo assignment groups
INSERT INTO assignment_groups (id, tenant_id, name, description, manager_id, cost_center_id) VALUES
  ('a5000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001',
   'Service Desk', 'Front-line IT support',
   'b0000000-0000-0000-0000-000000000001',
   'a2000000-0000-0000-0000-000000000001'),
  ('a5000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000001',
   'Network Operations', 'Network infrastructure team',
   'b0000000-0000-0000-0000-000000000001',
   'a2000000-0000-0000-0000-000000000001');

-- Assignment group members
INSERT INTO assignment_group_members (tenant_id, group_id, user_id) VALUES
  ('a0000000-0000-0000-0000-000000000001',
   'a5000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000001',
   'a5000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000001',
   'a5000000-0000-0000-0000-000000000002',
   'b0000000-0000-0000-0000-000000000002');

-- Assignment group processes
INSERT INTO assignment_group_processes (tenant_id, group_id, process_id) VALUES
  ('a0000000-0000-0000-0000-000000000001',
   'a5000000-0000-0000-0000-000000000001',
   'a4000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000001',
   'a5000000-0000-0000-0000-000000000001',
   'a4000000-0000-0000-0000-000000000003'),
  ('a0000000-0000-0000-0000-000000000001',
   'a5000000-0000-0000-0000-000000000001',
   'a4000000-0000-0000-0000-000000000004'),
  ('a0000000-0000-0000-0000-000000000001',
   'a5000000-0000-0000-0000-000000000002',
   'a4000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000001',
   'a5000000-0000-0000-0000-000000000002',
   'a4000000-0000-0000-0000-000000000002');

-- Demo services (IT/business)
INSERT INTO services (id, tenant_id, name, description) VALUES
  ('a6000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001',
   'Email Service', 'Corporate email and calendar system'),
  ('a6000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000001',
   'VPN', 'Virtual private network for remote access'),
  ('a6000000-0000-0000-0000-000000000003',
   'a0000000-0000-0000-0000-000000000001',
   'SAP ERP', 'Enterprise resource planning system'),
  ('a6000000-0000-0000-0000-000000000004',
   'a0000000-0000-0000-0000-000000000001',
   'Corporate Network', 'LAN/WAN infrastructure'),
  ('a6000000-0000-0000-0000-000000000005',
   'a0000000-0000-0000-0000-000000000001',
   'File Storage', 'Network file shares and cloud storage');

-- Service categories
INSERT INTO service_categories (id, tenant_id, name, description, icon, sort_order) VALUES
  ('c0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001',
   'Hardware', 'Laptops, monitors, peripherals', 'laptop', 1),
  ('c0000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000001',
   'Software', 'Applications and licenses', 'code', 2),
  ('c0000000-0000-0000-0000-000000000003',
   'a0000000-0000-0000-0000-000000000001',
   'Access & Accounts', 'Access requests and account management', 'key', 3),
  ('c0000000-0000-0000-0000-000000000004',
   'a0000000-0000-0000-0000-000000000001',
   'General IT', 'General IT support', 'headset', 4);

-- Service items
INSERT INTO service_items (id, tenant_id, category_id, name, short_description, form_schema, approval_required, sla_hours) VALUES
  ('d0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000001',
   'New Laptop',
   'Request a new laptop for work',
   '{"fields": [
     {"name": "os_preference", "label": "Operating System", "type": "select", "required": true, "options": ["Windows 11", "macOS", "Linux (Ubuntu)"]},
     {"name": "reason", "label": "Business Justification", "type": "textarea", "required": true},
     {"name": "urgency", "label": "Urgency", "type": "select", "required": true, "options": ["Standard (2 weeks)", "Expedited (1 week)", "Emergency (2 days)"]}
   ]}',
   true, 336),
  ('d0000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000002',
   'Software Installation',
   'Request installation of approved software',
   '{"fields": [
     {"name": "software_name", "label": "Software Name", "type": "text", "required": true},
     {"name": "version", "label": "Version (if specific)", "type": "text", "required": false},
     {"name": "license_key", "label": "License Key (if you have one)", "type": "text", "required": false}
   ]}',
   false, 24),
  ('d0000000-0000-0000-0000-000000000003',
   'a0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000003',
   'New User Account',
   'Create accounts for a new employee',
   '{"fields": [
     {"name": "employee_name", "label": "Employee Full Name", "type": "text", "required": true},
     {"name": "department", "label": "Department", "type": "select", "required": true, "options": ["Engineering", "Sales", "Marketing", "Finance", "HR", "Operations"]},
     {"name": "start_date", "label": "Start Date", "type": "date", "required": true},
     {"name": "systems", "label": "Systems Needed", "type": "multiselect", "required": true, "options": ["Email", "Slack", "GitHub", "Jira", "AWS Console", "VPN"]}
   ]}',
   true, 48),
  ('d0000000-0000-0000-0000-000000000004',
   'a0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000004',
   'General IT Help',
   'Get help with any IT issue',
   '{"fields": [
     {"name": "issue_description", "label": "Describe your issue", "type": "textarea", "required": true},
     {"name": "asset_tag", "label": "Asset Tag (if applicable)", "type": "text", "required": false}
   ]}',
   false, 8);

-- CMDB – CI Classes
INSERT INTO ci_classes (id, tenant_id, name, display_name, description, attributes, icon) VALUES
  ('e0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001',
   'server', 'Server', 'Physical or virtual server',
   '{"os": {"type": "string"}, "cpu_cores": {"type": "integer"}, "ram_gb": {"type": "integer"}, "ip_address": {"type": "string"}}',
   'server'),
  ('e0000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000001',
   'application', 'Application', 'Software application or service',
   '{"version": {"type": "string"}, "language": {"type": "string"}, "port": {"type": "integer"}, "url": {"type": "string"}}',
   'globe'),
  ('e0000000-0000-0000-0000-000000000003',
   'a0000000-0000-0000-0000-000000000001',
   'database', 'Database', 'Database instance',
   '{"engine": {"type": "string"}, "version": {"type": "string"}, "port": {"type": "integer"}, "max_connections": {"type": "integer"}}',
   'database'),
  ('e0000000-0000-0000-0000-000000000004',
   'a0000000-0000-0000-0000-000000000001',
   'network_device', 'Network Device', 'Router, switch, or firewall',
   '{"device_type": {"type": "string"}, "ip_address": {"type": "string"}, "firmware_version": {"type": "string"}}',
   'wifi');

-- CMDB – Configuration Items (sample infrastructure)
INSERT INTO configuration_items (id, tenant_id, class_id, name, display_name, status, environment, attributes) VALUES
  ('f0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001',
   'e0000000-0000-0000-0000-000000000001',
   'web-prod-01', 'Production Web Server 1', 'active', 'production',
   '{"os": "Ubuntu 22.04", "cpu_cores": 8, "ram_gb": 32, "ip_address": "10.0.1.10"}'),
  ('f0000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000001',
   'e0000000-0000-0000-0000-000000000001',
   'web-prod-02', 'Production Web Server 2', 'active', 'production',
   '{"os": "Ubuntu 22.04", "cpu_cores": 8, "ram_gb": 32, "ip_address": "10.0.1.11"}'),
  ('f0000000-0000-0000-0000-000000000003',
   'a0000000-0000-0000-0000-000000000001',
   'e0000000-0000-0000-0000-000000000003',
   'db-prod-01', 'Production PostgreSQL', 'active', 'production',
   '{"engine": "PostgreSQL", "version": "16.2", "port": 5432, "max_connections": 200}'),
  ('f0000000-0000-0000-0000-000000000004',
   'a0000000-0000-0000-0000-000000000001',
   'e0000000-0000-0000-0000-000000000002',
   'nova-api', 'Nova Suite API', 'active', 'production',
   '{"version": "1.0.0", "language": "TypeScript", "port": 4000, "url": "https://api.acme.local"}'),
  ('f0000000-0000-0000-0000-000000000005',
   'a0000000-0000-0000-0000-000000000001',
   'e0000000-0000-0000-0000-000000000004',
   'fw-prod-01', 'Production Firewall', 'active', 'production',
   '{"device_type": "firewall", "ip_address": "10.0.0.1", "firmware_version": "7.4.1"}');

-- CMDB – Relationships
INSERT INTO ci_relationships (tenant_id, source_ci_id, target_ci_id, relationship_type) VALUES
  -- Nova API runs on web servers
  ('a0000000-0000-0000-0000-000000000001',
   'f0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000001', 'runs_on'),
  ('a0000000-0000-0000-0000-000000000001',
   'f0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000002', 'runs_on'),
  -- Nova API depends on database
  ('a0000000-0000-0000-0000-000000000001',
   'f0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000003', 'depends_on'),
  -- Web servers connected to firewall
  ('a0000000-0000-0000-0000-000000000001',
   'f0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000005', 'connected_to'),
  ('a0000000-0000-0000-0000-000000000001',
   'f0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000005', 'connected_to');

-- ============================================================
-- DEFERRED FOREIGN KEYS (cross-section references)
-- ============================================================
ALTER TABLE incidents
  ADD CONSTRAINT fk_incidents_ci
  FOREIGN KEY (configuration_item_id) REFERENCES configuration_items(id);

-- ============================================================
-- IMPORT STAGING TABLES
-- ============================================================

CREATE TABLE import_jobs (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by      uuid NOT NULL REFERENCES users(id),
  entity_type     text NOT NULL,
  file_name       text NOT NULL,
  status          text NOT NULL DEFAULT 'uploaded'
                  CHECK (status IN ('uploaded', 'validated', 'committed', 'failed')),
  column_mapping  jsonb,
  total_rows      integer NOT NULL DEFAULT 0,
  valid_rows      integer NOT NULL DEFAULT 0,
  error_rows      integer NOT NULL DEFAULT 0,
  warning_rows    integer NOT NULL DEFAULT 0,
  committed_rows  integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE import_rows (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id      uuid NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  row_number  integer NOT NULL,
  raw_data    jsonb NOT NULL,
  mapped_data jsonb,
  status      text NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'valid', 'warning', 'error', 'committed')),
  errors      jsonb DEFAULT '[]',
  warnings    jsonb DEFAULT '[]',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_import_jobs_column_mapping_gin ON import_jobs USING gin (column_mapping);
CREATE INDEX idx_import_rows_job ON import_rows(job_id);
CREATE INDEX idx_import_rows_status ON import_rows(job_id, status);
CREATE INDEX idx_import_rows_raw_data_gin ON import_rows USING gin (raw_data);
CREATE INDEX idx_import_rows_mapped_data_gin ON import_rows USING gin (mapped_data);
CREATE INDEX idx_import_rows_errors_gin ON import_rows USING gin (errors);
CREATE INDEX idx_import_rows_warnings_gin ON import_rows USING gin (warnings);

-- ============================================================
-- CATALOG WORKFLOW TASKS
-- ============================================================

CREATE TABLE catalog_tasks (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service_item_id   uuid NOT NULL REFERENCES service_items(id) ON DELETE CASCADE,
  name              text NOT NULL,
  description       text,
  instructions      text,
  task_type         text NOT NULL DEFAULT 'manual'
                    CHECK (task_type IN ('approval', 'manual', 'automated')),
  task_order        integer NOT NULL DEFAULT 1,
  assigned_group_id uuid REFERENCES assignment_groups(id),
  sla_hours         integer,
  automation_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_catalog_tasks_item ON catalog_tasks(service_item_id, task_order);

CREATE SEQUENCE task_number_seq START 1000;

CREATE TABLE request_tasks (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  number            text NOT NULL,
  request_id        uuid NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  catalog_task_id   uuid REFERENCES catalog_tasks(id),
  task_order        integer NOT NULL,
  name              text NOT NULL,
  description       text,
  instructions      text,
  task_type         text NOT NULL
                    CHECK (task_type IN ('approval', 'manual', 'automated')),
  is_active         boolean NOT NULL DEFAULT true,
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped', 'rejected', 'failed')),
  assigned_to       uuid REFERENCES users(id),
  assigned_group_id uuid REFERENCES assignment_groups(id),
  started_at        timestamptz,
  completed_at      timestamptz,
  completed_by      uuid REFERENCES users(id),
  outcome           text CHECK (outcome IN ('approved', 'rejected')),
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_request_tasks_request ON request_tasks(request_id, task_order);

-- ============================================================
-- ATTACHMENTS
-- ============================================================

CREATE TABLE attachments (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type   text NOT NULL,
  entity_id     uuid NOT NULL,
  file_name     text NOT NULL,
  mime_type     text NOT NULL,
  size_bytes    integer NOT NULL,
  storage_key   text NOT NULL,
  uploaded_by   uuid NOT NULL REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_attachments_entity ON attachments(entity_type, entity_id);

-- ============================================================
-- SLA DEFINITIONS (configurable SLA policies)
-- ============================================================

CREATE TABLE sla_definitions (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  process_type    text NOT NULL DEFAULT 'incident'
                  CHECK (process_type IN ('incident', 'request', 'task')),
  -- Trigger conditions (when does this SLA apply?)
  condition_priority   integer CHECK (condition_priority BETWEEN 1 AND 5),
  condition_impact     text CHECK (condition_impact IN ('low', 'medium', 'high')),
  condition_urgency    text CHECK (condition_urgency IN ('low', 'medium', 'high')),
  condition_category   text,
  condition_service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  -- SLA timing
  resolution_hours     integer NOT NULL DEFAULT 24,
  response_hours       integer,
  auto_close_days      integer NOT NULL DEFAULT 7 CHECK (auto_close_days BETWEEN 1 AND 365),
  warning_pct          integer NOT NULL DEFAULT 80
                       CHECK (warning_pct BETWEEN 1 AND 99),
  -- Breach actions
  on_warning           jsonb NOT NULL DEFAULT '[]',
  on_breach            jsonb NOT NULL DEFAULT '[]',
  -- Metadata
  is_active       boolean NOT NULL DEFAULT true,
  sort_order       integer NOT NULL DEFAULT 100,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sla_definitions_tenant ON sla_definitions(tenant_id, process_type, is_active);
CREATE INDEX idx_sla_definitions_on_warning_gin ON sla_definitions USING gin (on_warning);
CREATE INDEX idx_sla_definitions_on_breach_gin ON sla_definitions USING gin (on_breach);

CREATE TRIGGER trg_sla_definitions_updated_at
  BEFORE UPDATE ON sla_definitions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Seed SLA definitions
INSERT INTO sla_definitions (tenant_id, name, description, process_type, condition_priority, resolution_hours, response_hours, auto_close_days, warning_pct, on_warning, on_breach, sort_order) VALUES
  ('a0000000-0000-0000-0000-000000000001',
   'P1 Critical', 'Critical priority incidents require fastest resolution',
   'incident', 1, 4, 1, 7, 80,
   '["notify_assignee", "notify_group_manager", "auto_assign"]',
   '["escalate_priority", "notify_assignee", "notify_group_manager", "reassign"]',
   10),
  ('a0000000-0000-0000-0000-000000000001',
   'P2 High', 'High priority incidents',
   'incident', 2, 8, 2, 7, 80,
   '["notify_assignee", "auto_assign"]',
   '["escalate_priority", "notify_assignee", "notify_group_manager"]',
   20),
  ('a0000000-0000-0000-0000-000000000001',
   'P3 Medium', 'Standard priority incidents',
   'incident', 3, 24, 4, 7, 80,
   '["notify_assignee"]',
   '["escalate_priority", "notify_assignee"]',
   30),
  ('a0000000-0000-0000-0000-000000000001',
   'P4 Low', 'Low priority incidents',
   'incident', 4, 48, 8, 7, 80,
   '["notify_assignee"]',
   '["notify_assignee", "notify_group_manager"]',
   40),
  ('a0000000-0000-0000-0000-000000000001',
   'P5 Planning', 'Lowest priority – planned work',
   'incident', 5, 72, 24, 7, 80,
   '["notify_assignee"]',
   '["notify_assignee"]',
   50);

-- ============================================================
-- TENANT CREDENTIALS (encrypted mini-vault; secret at rest via pgp_sym_encrypt)
-- ============================================================

CREATE TABLE tenant_credentials (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug            text NOT NULL,
  label           text NOT NULL,
  description     text,
  secret_enc      bytea NOT NULL,
  created_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug),
  CONSTRAINT tenant_credentials_slug_format CHECK (
    char_length(slug) <= 64 AND slug ~ '^[a-z][a-z0-9_]*$'
  )
);

CREATE INDEX idx_tenant_credentials_tenant ON tenant_credentials(tenant_id);

CREATE TRIGGER trg_tenant_credentials_updated_at
  BEFORE UPDATE ON tenant_credentials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- DATA SOURCES (scheduled imports via Temporal)
-- ============================================================

CREATE TABLE data_sources (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  entity_type     text NOT NULL,
  source_type     text NOT NULL DEFAULT 'csv_url'
                  CHECK (source_type IN ('csv_url', 'json_url', 'rest_api', 'sftp')),
  source_config   jsonb NOT NULL DEFAULT '{}',
  column_mapping  jsonb NOT NULL DEFAULT '{}',
  schedule_cron   text NOT NULL DEFAULT '0 2 * * *',
  schedule_enabled boolean NOT NULL DEFAULT false,
  import_mode     text NOT NULL DEFAULT 'insert'
                  CHECK (import_mode IN ('insert', 'upsert', 'full_sync')),
  upsert_key      text,
  last_run_at     timestamptz,
  last_run_status text,
  created_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_data_sources_tenant ON data_sources(tenant_id);
CREATE INDEX idx_data_sources_source_config_gin ON data_sources USING gin (source_config);
CREATE INDEX idx_data_sources_column_mapping_gin ON data_sources USING gin (column_mapping);

CREATE TRIGGER trg_data_sources_updated_at
  BEFORE UPDATE ON data_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE data_source_runs (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  data_source_id  uuid NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running', 'completed', 'failed')),
  trigger_type    text NOT NULL DEFAULT 'manual'
                  CHECK (trigger_type IN ('manual', 'scheduled')),
  total_rows      integer NOT NULL DEFAULT 0,
  committed_rows  integer NOT NULL DEFAULT 0,
  error_rows      integer NOT NULL DEFAULT 0,
  skipped_rows    integer NOT NULL DEFAULT 0,
  error_message   text,
  error_samples   jsonb NOT NULL DEFAULT '[]',
  run_meta        jsonb NOT NULL DEFAULT '{}',
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

CREATE INDEX idx_data_source_runs_ds ON data_source_runs(data_source_id);
CREATE INDEX idx_data_source_runs_error_samples_gin ON data_source_runs USING gin (error_samples);
CREATE INDEX idx_data_source_runs_run_meta_gin ON data_source_runs USING gin (run_meta);

-- ============================================================
-- TENANT SETTINGS (theming, branding)
-- ============================================================

CREATE TABLE tenant_settings (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key         text NOT NULL,
  value       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key)
);

CREATE INDEX idx_tenant_settings_tenant ON tenant_settings(tenant_id);

CREATE TRIGGER trg_tenant_settings_updated_at
  BEFORE UPDATE ON tenant_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Seed default theme
INSERT INTO tenant_settings (tenant_id, key, value) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'app_name', 'Nova Suite'),
  ('a0000000-0000-0000-0000-000000000001', 'app_subtitle', 'Service Management'),
  ('a0000000-0000-0000-0000-000000000001', 'primary_color', '#4f46e5'),
  ('a0000000-0000-0000-0000-000000000001', 'sidebar_bg', '#0f172a'),
  ('a0000000-0000-0000-0000-000000000001', 'sidebar_active_bg', '#4f46e5'),
  ('a0000000-0000-0000-0000-000000000001', 'login_bg_from', '#0f172a'),
  ('a0000000-0000-0000-0000-000000000001', 'login_bg_to', '#1e1b4b'),
  ('a0000000-0000-0000-0000-000000000001', 'dark_content_bg', '#0b1220'),
  ('a0000000-0000-0000-0000-000000000001', 'dark_surface_bg', '#1e293b'),
  ('a0000000-0000-0000-0000-000000000001', 'dark_muted_bg', '#111827'),
  ('a0000000-0000-0000-0000-000000000001', 'dark_border_color', '#475569'),
  ('a0000000-0000-0000-0000-000000000001', 'dark_text_primary', '#f1f5f9'),
  ('a0000000-0000-0000-0000-000000000001', 'dark_text_muted', '#94a3b8'),
  ('a0000000-0000-0000-0000-000000000001', 'logo_url', '');

-- ============================================================
-- KNOWLEDGE BASE
-- ============================================================

CREATE TYPE kb_status AS ENUM ('draft', 'review', 'published', 'retired');
CREATE TYPE problem_status_enum AS ENUM (
  'new',
  'investigating',
  'root_cause_identified',
  'fix_in_progress',
  'resolved',
  'closed',
  'known_error'
);

CREATE TABLE knowledge_categories (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text,
  parent_id     uuid REFERENCES knowledge_categories(id) ON DELETE SET NULL,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, parent_id, name)
);

CREATE TABLE knowledge_articles (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  number        text UNIQUE NOT NULL,
  title         text NOT NULL,
  content       text NOT NULL,
  category_id   uuid REFERENCES knowledge_categories(id) ON DELETE SET NULL,
  assignment_group_id uuid REFERENCES assignment_groups(id) ON DELETE SET NULL,
  root_article_id uuid REFERENCES knowledge_articles(id) ON DELETE SET NULL,
  previous_version_id uuid REFERENCES knowledge_articles(id) ON DELETE SET NULL,
  version_no    integer NOT NULL DEFAULT 1,
  is_active     boolean NOT NULL DEFAULT true,
  status        kb_status NOT NULL DEFAULT 'draft',
  author_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  view_count    integer NOT NULL DEFAULT 0,
  meta_data     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_kb_articles_tenant_status ON knowledge_articles(tenant_id, status, updated_at DESC);
CREATE INDEX idx_kb_articles_category ON knowledge_articles(tenant_id, category_id);
CREATE INDEX idx_kb_articles_assignment_group ON knowledge_articles(tenant_id, assignment_group_id);
CREATE INDEX idx_kb_articles_meta_data_gin ON knowledge_articles USING gin (meta_data);
CREATE INDEX idx_kb_articles_number_trgm ON knowledge_articles USING gin (number gin_trgm_ops);
CREATE INDEX idx_kb_articles_title_trgm ON knowledge_articles USING gin (title gin_trgm_ops);
CREATE INDEX idx_kb_articles_content_trgm ON knowledge_articles USING gin (content gin_trgm_ops);
CREATE UNIQUE INDEX uq_knowledge_categories_root_name
  ON knowledge_categories(tenant_id, name)
  WHERE parent_id IS NULL;

CREATE TABLE incident_kb_resolutions (
  incident_id   uuid REFERENCES incidents(id) ON DELETE CASCADE,
  kb_id         uuid REFERENCES knowledge_articles(id) ON DELETE CASCADE,
  resolved_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  applied_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (incident_id, kb_id)
);

CREATE TABLE kb_approval_workflows (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  category_id   uuid REFERENCES knowledge_categories(id) ON DELETE SET NULL,
  steps         jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 100,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_kb_workflows_tenant ON kb_approval_workflows(tenant_id, is_active, sort_order);

CREATE TABLE kb_article_approvals (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  article_id          uuid NOT NULL REFERENCES knowledge_articles(id) ON DELETE CASCADE,
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  step_order          integer NOT NULL,
  assignment_group_id uuid NOT NULL REFERENCES assignment_groups(id) ON DELETE RESTRICT,
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by          uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at          timestamptz,
  notes               text,
  UNIQUE(article_id, step_order)
);
CREATE INDEX idx_kb_article_approvals_article ON kb_article_approvals(article_id, step_order);

CREATE TABLE kb_article_ratings (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  article_id uuid NOT NULL REFERENCES knowledge_articles(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rating     smallint NOT NULL CHECK (rating IN (-1, 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(article_id, user_id)
);
CREATE INDEX idx_kb_article_ratings_article ON kb_article_ratings(article_id);

CREATE SEQUENCE IF NOT EXISTS problem_number_seq START 1;

CREATE TABLE problems (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  number              text NOT NULL,
  title               text NOT NULL,
  description         text,
  priority            text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  impact              text NOT NULL DEFAULT 'medium' CHECK (impact IN ('low', 'medium', 'high')),
  category            text,
  is_active           boolean NOT NULL DEFAULT true,
  status              problem_status_enum NOT NULL DEFAULT 'new',
  root_cause          text,
  symptoms            text,
  workaround          text,
  permanent_fix       text,
  reported_by         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_to         uuid REFERENCES users(id) ON DELETE SET NULL,
  assignment_group_id uuid REFERENCES assignment_groups(id) ON DELETE SET NULL,
  affected_ci         uuid REFERENCES configuration_items(id) ON DELETE SET NULL,
  resolution_notes    text,
  resolved_at         timestamptz,
  resolved_by         uuid REFERENCES users(id) ON DELETE SET NULL,
  closed_at           timestamptz,
  closed_by           uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, number)
);
CREATE INDEX idx_problems_tenant_status ON problems(tenant_id, status, updated_at DESC);
CREATE INDEX idx_problems_assignment_group ON problems(tenant_id, assignment_group_id);
CREATE INDEX idx_problems_assigned_to ON problems(tenant_id, assigned_to);
CREATE INDEX idx_problems_reported_by ON problems(tenant_id, reported_by);
CREATE INDEX idx_problems_affected_ci ON problems(tenant_id, affected_ci);
CREATE INDEX idx_problems_search_title ON problems USING gin (title gin_trgm_ops);
CREATE INDEX idx_problems_search_desc ON problems USING gin (description gin_trgm_ops);
CREATE INDEX idx_problems_search_number ON problems USING gin (number gin_trgm_ops);

CREATE TABLE problem_incidents (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  problem_id        uuid NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  incident_id       uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  relationship_type text NOT NULL DEFAULT 'caused_by'
                    CHECK (relationship_type IN ('caused_by', 'related_to', 'symptom_of')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, problem_id, incident_id)
);
CREATE INDEX idx_problem_incidents_problem ON problem_incidents(tenant_id, problem_id);
CREATE INDEX idx_problem_incidents_incident ON problem_incidents(tenant_id, incident_id);

CREATE TABLE known_errors (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  problem_id        uuid NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  title             text NOT NULL,
  symptoms          text NOT NULL,
  workaround        text NOT NULL,
  permanent_fix_eta date,
  tags              text[] NOT NULL DEFAULT '{}',
  severity          text CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_known_errors_problem ON known_errors(tenant_id, problem_id, is_active);
CREATE INDEX idx_known_errors_tags_gin ON known_errors USING gin (tags);

CREATE TABLE problem_tasks (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  problem_id    uuid NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text,
  task_type     text CHECK (task_type IN ('investigate', 'analyze', 'test', 'document')),
  is_active     boolean NOT NULL DEFAULT true,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'in_progress', 'completed', 'blocked')),
  assigned_to   uuid REFERENCES users(id) ON DELETE SET NULL,
  due_date      timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_problem_tasks_problem ON problem_tasks(tenant_id, problem_id, status);
CREATE INDEX idx_problem_tasks_assigned_to ON problem_tasks(tenant_id, assigned_to, status);

CREATE TRIGGER trg_knowledge_categories_updated_at
  BEFORE UPDATE ON knowledge_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_knowledge_articles_updated_at
  BEFORE UPDATE ON knowledge_articles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_kb_approval_workflows_updated_at
  BEFORE UPDATE ON kb_approval_workflows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_problems_updated_at
  BEFORE UPDATE ON problems
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_known_errors_updated_at
  BEFORE UPDATE ON known_errors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_problem_tasks_updated_at
  BEFORE UPDATE ON problem_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- CHANGE MANAGEMENT
-- ============================================================

CREATE TYPE change_status_enum AS ENUM (
  'draft',
  'assessment',
  'pending_approval',
  'approved',
  'rejected',
  'planning',
  'scheduled',
  'implementing',
  'implemented',
  'reviewing',
  'closed',
  'cancelled'
);

CREATE TYPE change_stage_enum AS ENUM (
  'request',
  'assessment',
  'approval',
  'planning',
  'implementation',
  'review'
);

CREATE TYPE change_risk_enum AS ENUM ('low', 'medium', 'high', 'very_high');
CREATE TYPE change_priority_enum AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE approval_status_enum AS ENUM ('pending', 'approved', 'rejected', 'waived');

CREATE SEQUENCE IF NOT EXISTS change_number_seq START 1;

CREATE TABLE change_types (
  id                         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id                  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                       text NOT NULL,
  description                text,
  requires_cab_approval      boolean NOT NULL DEFAULT true,
  requires_manager_approval  boolean NOT NULL DEFAULT true,
  auto_approve               boolean NOT NULL DEFAULT false,
  default_risk_level         change_risk_enum NOT NULL DEFAULT 'medium',
  max_implementation_hours   integer,
  allowed_stages             change_stage_enum[] NOT NULL DEFAULT ARRAY[
    'request'::change_stage_enum,
    'assessment'::change_stage_enum,
    'approval'::change_stage_enum,
    'planning'::change_stage_enum,
    'implementation'::change_stage_enum,
    'review'::change_stage_enum
  ],
  approval_config            jsonb NOT NULL DEFAULT '{"required_approvals": 1, "allow_emergency_bypass": false}'::jsonb,
  is_active                  boolean NOT NULL DEFAULT true,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE standard_changes (
  id                             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id                      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  change_type_id                 uuid NOT NULL REFERENCES change_types(id) ON DELETE RESTRICT,
  name                           text NOT NULL,
  description                    text,
  category                       text,
  implementation_plan_template   text,
  backout_plan_template          text,
  test_plan_template             text,
  pre_assessed_risk              change_risk_enum NOT NULL DEFAULT 'low',
  automated                      boolean NOT NULL DEFAULT false,
  automation_script              text,
  usage_count                    integer NOT NULL DEFAULT 0,
  success_rate                   numeric(5,2),
  is_active                      boolean NOT NULL DEFAULT true,
  created_at                     timestamptz NOT NULL DEFAULT now(),
  updated_at                     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cab_meetings (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title         text NOT NULL,
  scheduled_at  timestamptz NOT NULL,
  duration_min  integer NOT NULL DEFAULT 60,
  status        text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  minutes       text,
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE changes (
  id                        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id                 uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  number                    text NOT NULL,
  change_type_id            uuid NOT NULL REFERENCES change_types(id) ON DELETE RESTRICT,
  standard_change_id        uuid REFERENCES standard_changes(id) ON DELETE SET NULL,
  category                  text,
  is_active                 boolean NOT NULL DEFAULT true,
  title                     text NOT NULL,
  description               text NOT NULL,
  reason_for_change         text NOT NULL,
  stage                     change_stage_enum NOT NULL DEFAULT 'request',
  status                    change_status_enum NOT NULL DEFAULT 'draft',
  risk_level                change_risk_enum NOT NULL DEFAULT 'medium',
  impact                    text NOT NULL DEFAULT 'medium',
  impact_description        text,
  implementation_plan       text NOT NULL,
  backout_plan              text NOT NULL,
  test_plan                 text,
  requested_by              uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_to               uuid REFERENCES users(id) ON DELETE SET NULL,
  assignment_group_id       uuid REFERENCES assignment_groups(id) ON DELETE SET NULL,
  scheduled_start           timestamptz,
  scheduled_end             timestamptz,
  actual_start              timestamptz,
  actual_end                timestamptz,
  downtime_required         boolean NOT NULL DEFAULT false,
  maintenance_window        text,
  implementation_notes      text,
  success                   boolean,
  actual_downtime_minutes   integer,
  related_problem_id        uuid REFERENCES problems(id) ON DELETE SET NULL,
  related_incident_id       uuid REFERENCES incidents(id) ON DELETE SET NULL,
  priority                  change_priority_enum NOT NULL DEFAULT 'medium',
  business_justification    text,
  estimated_cost            numeric(12,2),
  review_notes              text,
  conflict_summary          jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, number)
);

CREATE TABLE change_cis (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  change_id   uuid NOT NULL REFERENCES changes(id) ON DELETE CASCADE,
  ci_id       uuid NOT NULL REFERENCES configuration_items(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, change_id, ci_id)
);

CREATE TABLE change_approvals (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  change_id           uuid NOT NULL REFERENCES changes(id) ON DELETE CASCADE,
  approval_type       text NOT NULL CHECK (approval_type IN ('manager', 'cab', 'technical', 'security', 'business')),
  status              approval_status_enum NOT NULL DEFAULT 'pending',
  approver_user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  approver_group_id   uuid REFERENCES assignment_groups(id) ON DELETE SET NULL,
  decided_by          uuid REFERENCES users(id) ON DELETE SET NULL,
  decision_notes      text,
  due_at              timestamptz,
  decided_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cab_meeting_changes (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cab_meeting_id  uuid NOT NULL REFERENCES cab_meetings(id) ON DELETE CASCADE,
  change_id       uuid NOT NULL REFERENCES changes(id) ON DELETE CASCADE,
  decision        text CHECK (decision IN ('approved', 'rejected', 'deferred')),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, cab_meeting_id, change_id)
);

CREATE TABLE change_blackouts (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  start_date  timestamptz NOT NULL,
  end_date    timestamptz NOT NULL,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date > start_date)
);

CREATE TABLE change_conflicts (
  id                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  change_id          uuid NOT NULL REFERENCES changes(id) ON DELETE CASCADE,
  conflicting_change_id uuid REFERENCES changes(id) ON DELETE CASCADE,
  conflict_type      text NOT NULL CHECK (conflict_type IN ('schedule_overlap', 'ci_overlap', 'blackout_window')),
  severity           text NOT NULL DEFAULT 'warning' CHECK (severity IN ('warning', 'blocking')),
  details            text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_change_types_tenant_name ON change_types(tenant_id, name, is_active);
CREATE INDEX idx_change_types_approval_config_gin ON change_types USING gin (approval_config);
CREATE INDEX idx_standard_changes_tenant ON standard_changes(tenant_id, is_active, created_at DESC);
CREATE INDEX idx_cab_meetings_tenant_time ON cab_meetings(tenant_id, scheduled_at DESC);
CREATE INDEX idx_changes_tenant_status ON changes(tenant_id, status, updated_at DESC);
CREATE INDEX idx_changes_tenant_stage ON changes(tenant_id, stage, updated_at DESC);
CREATE INDEX idx_changes_tenant_risk ON changes(tenant_id, risk_level, priority, updated_at DESC);
CREATE INDEX idx_changes_type ON changes(tenant_id, change_type_id);
CREATE INDEX idx_changes_assignment_group ON changes(tenant_id, assignment_group_id);
CREATE INDEX idx_changes_assigned_to ON changes(tenant_id, assigned_to);
CREATE INDEX idx_changes_requested_by ON changes(tenant_id, requested_by);
CREATE INDEX idx_changes_scheduled_window ON changes(tenant_id, scheduled_start, scheduled_end);
CREATE INDEX idx_changes_related_incident ON changes(tenant_id, related_incident_id);
CREATE INDEX idx_changes_related_problem ON changes(tenant_id, related_problem_id);
CREATE INDEX idx_changes_search_number ON changes USING gin (number gin_trgm_ops);
CREATE INDEX idx_changes_search_title ON changes USING gin (title gin_trgm_ops);
CREATE INDEX idx_changes_search_desc ON changes USING gin (description gin_trgm_ops);
CREATE INDEX idx_changes_conflict_summary_gin ON changes USING gin (conflict_summary);
CREATE INDEX idx_change_approvals_change ON change_approvals(tenant_id, change_id, status);
CREATE INDEX idx_change_approvals_approver_user ON change_approvals(tenant_id, approver_user_id, status);
CREATE INDEX idx_change_approvals_approver_group ON change_approvals(tenant_id, approver_group_id, status);
CREATE INDEX idx_change_cis_change ON change_cis(tenant_id, change_id);
CREATE INDEX idx_change_cis_ci ON change_cis(tenant_id, ci_id);
CREATE INDEX idx_cab_meeting_changes_meeting ON cab_meeting_changes(tenant_id, cab_meeting_id);
CREATE INDEX idx_cab_meeting_changes_change ON cab_meeting_changes(tenant_id, change_id);
CREATE INDEX idx_change_blackouts_window ON change_blackouts(tenant_id, start_date, end_date);
CREATE INDEX idx_change_conflicts_change ON change_conflicts(tenant_id, change_id, severity, created_at DESC);

CREATE TRIGGER trg_change_types_updated_at
  BEFORE UPDATE ON change_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_standard_changes_updated_at
  BEFORE UPDATE ON standard_changes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_changes_updated_at
  BEFORE UPDATE ON changes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_change_approvals_updated_at
  BEFORE UPDATE ON change_approvals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_change_blackouts_updated_at
  BEFORE UPDATE ON change_blackouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_cab_meetings_updated_at
  BEFORE UPDATE ON cab_meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Seed change types
INSERT INTO change_types (
  id, tenant_id, name, description,
  requires_cab_approval, requires_manager_approval, auto_approve,
  default_risk_level, max_implementation_hours, approval_config
) VALUES
  (
    'a9000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'standard',
    'Pre-approved low-risk changes',
    false, false, true,
    'low', 8,
    '{"required_approvals": 0, "allow_emergency_bypass": true, "required_steps": ["request", "planning", "implementation", "review"]}'::jsonb
  ),
  (
    'a9000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'normal',
    'Regular change requiring formal approvals',
    true, true, false,
    'medium', 24,
    '{"required_approvals": 2, "allow_emergency_bypass": false, "required_steps": ["request", "assessment", "approval", "planning", "implementation", "review"]}'::jsonb
  ),
  (
    'a9000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000001',
    'emergency',
    'Expedited changes for critical outages',
    false, true, false,
    'high', 4,
    '{"required_approvals": 1, "allow_emergency_bypass": true, "required_steps": ["request", "assessment", "implementation", "review"]}'::jsonb
  );

INSERT INTO standard_changes (
  id, tenant_id, change_type_id, name, description, category,
  implementation_plan_template, backout_plan_template, test_plan_template,
  pre_assessed_risk, automated, usage_count, success_rate, is_active
) VALUES
  (
    'aa000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'a9000000-0000-0000-0000-000000000001',
    'Restart Application Service',
    'Controlled restart of application service in maintenance window',
    'application',
    '1) Notify stakeholders 2) Drain traffic 3) Restart service 4) Validate health checks',
    'Rollback by starting previous stable service version and restoring traffic',
    'Run smoke test and confirm key transactions complete successfully',
    'low', false, 32, 99.20, true
  ),
  (
    'aa000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'a9000000-0000-0000-0000-000000000001',
    'Firewall Rule Update',
    'Standard network ACL rule update',
    'infrastructure',
    '1) Validate request 2) Apply rule in staged order 3) Verify connectivity',
    'Revert to previous ACL snapshot',
    'Connectivity test from source and destination segments',
    'low', false, 18, 97.50, true
  );

INSERT INTO cab_meetings (
  id, tenant_id, title, scheduled_at, duration_min, status, created_by
) VALUES (
  'ab000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'Weekly CAB',
  now() + interval '7 day',
  90,
  'scheduled',
  'b0000000-0000-0000-0000-000000000001'
);

INSERT INTO changes (
  id, tenant_id, number, change_type_id, category, title, description, reason_for_change,
  stage, status, risk_level, impact, impact_description,
  implementation_plan, backout_plan, test_plan,
  requested_by, assigned_to, assignment_group_id,
  scheduled_start, scheduled_end, downtime_required, maintenance_window,
  related_problem_id, priority, business_justification, estimated_cost
) VALUES (
  'ac000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'CHG0000001',
  'a9000000-0000-0000-0000-000000000002',
  'infrastructure',
  'Database Index Maintenance',
  'Add performance indexes to reduce incident response latency.',
  'Repeated incident spikes require permanent optimization.',
  'approval',
  'pending_approval',
  'medium',
  'medium',
  'Minor performance impact during maintenance window.',
  'Apply index DDL in rolling manner and validate query plans.',
  'Drop newly added indexes and restore previous execution plans.',
  'Run representative report/query performance checks.',
  'b0000000-0000-0000-0000-000000000002',
  'b0000000-0000-0000-0000-000000000002',
  'a5000000-0000-0000-0000-000000000002',
  now() + interval '2 day',
  now() + interval '2 day 2 hour',
  false,
  'after_hours',
  NULL,
  'medium',
  'Stabilize SLA performance for critical reports.',
  1200.00
);

INSERT INTO change_approvals (
  tenant_id, change_id, approval_type, status, approver_user_id, decision_notes
) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000001', 'manager', 'pending', 'b0000000-0000-0000-0000-000000000001', NULL),
  ('a0000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000001', 'cab', 'pending', NULL, NULL);

INSERT INTO knowledge_categories (tenant_id, name, description) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Incidents', 'Known issues, troubleshooting and workarounds'),
  ('a0000000-0000-0000-0000-000000000001', 'Services', 'Service-specific procedures and FAQs');

-- ─── Notifications ───────────────────────────────────────────
CREATE TABLE notifications (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        text        NOT NULL,  -- 'assignment' | 'mention' | 'sla_warning'
  title       text        NOT NULL,
  body        text,
  entity_type text,                  -- 'incident' | 'change' | 'problem' etc.
  entity_id   uuid,
  is_active   boolean     NOT NULL DEFAULT true,
  is_read     boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, tenant_id, is_active, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON notifications(tenant_id, created_at DESC);

CREATE TABLE notification_rules (
  id                 uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name               text        NOT NULL,
  description        text,
  entity_type        text        NOT NULL DEFAULT 'incident',
  trigger_key        text        NOT NULL,
  recipient_type     text        NOT NULL, -- caller | assignee | requester | requested_for | requested_by | reported_by | author | assignment_group_manager | specific_user | assignment_group_members
  recipient_user_id  uuid        REFERENCES users(id) ON DELETE SET NULL,
  recipient_group_id uuid        REFERENCES assignment_groups(id) ON DELETE SET NULL,
  title_template     text        NOT NULL,
  body_template      text,
  is_active          boolean     NOT NULL DEFAULT true,
  sort_order         int         NOT NULL DEFAULT 100,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notification_rules_tenant ON notification_rules(tenant_id, entity_type, trigger_key, is_active, sort_order);
CREATE TRIGGER trg_notification_rules_updated_at
  BEFORE UPDATE ON notification_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO notification_rules (
  tenant_id, name, description, entity_type, trigger_key, recipient_type, title_template, body_template, sort_order
) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Incident assigned to assignee', 'Notify the assignee when an incident is assigned', 'incident', 'incident.assigned', 'assignee', 'Incident {incident_number} assigned', '{incident_title} has been assigned to you.', 10),
  ('a0000000-0000-0000-0000-000000000001', 'Incident assigned to caller', 'Notify the caller when an incident gets assigned', 'incident', 'incident.assigned', 'caller', 'Your incident {incident_number} is now assigned', 'An agent has started working on "{incident_title}".', 20),
  ('a0000000-0000-0000-0000-000000000001', 'Incident resolved to caller', 'Notify the caller when an incident is resolved', 'incident', 'incident.resolved', 'caller', 'Incident {incident_number} resolved', 'Your incident "{incident_title}" has been marked as resolved.', 10),
  ('a0000000-0000-0000-0000-000000000001', 'Request created to requester', 'Notify requester when a request is created', 'request', 'request.created', 'requester', 'Request {request_number} submitted', 'Your request "{request_title}" was submitted successfully.', 10),
  ('a0000000-0000-0000-0000-000000000001', 'Request approved to requester', 'Notify requester when a request is approved', 'request', 'request.approved', 'requester', 'Request {request_number} approved', 'Your request "{request_title}" has been approved.', 20),
  ('a0000000-0000-0000-0000-000000000001', 'Request rejected to requester', 'Notify requester when a request is rejected', 'request', 'request.rejected', 'requester', 'Request {request_number} rejected', 'Your request "{request_title}" was rejected.', 30),
  ('a0000000-0000-0000-0000-000000000001', 'Change created to assignee', 'Notify assignee when a change is created', 'change', 'change.created', 'assignee', 'Change {change_number} created', '{change_title} has been assigned to you.', 10),
  ('a0000000-0000-0000-0000-000000000001', 'Change pending approval to group members', 'Notify assignment group when a change needs approval', 'change', 'change.pending_approval', 'assignment_group_members', 'Change {change_number} pending approval', '{change_title} is waiting for approval.', 20),
  ('a0000000-0000-0000-0000-000000000001', 'Change approved to requester', 'Notify requester when a change is approved', 'change', 'change.approved', 'requested_by', 'Change {change_number} approved', 'Your change "{change_title}" has been approved.', 30),
  ('a0000000-0000-0000-0000-000000000001', 'Problem assigned to assignee', 'Notify assignee when a problem is assigned', 'problem', 'problem.assigned', 'assignee', 'Problem {problem_number} assigned', '{problem_title} has been assigned to you.', 10),
  ('a0000000-0000-0000-0000-000000000001', 'Problem resolved to reporter', 'Notify reporter when a problem is resolved', 'problem', 'problem.resolved', 'reported_by', 'Problem {problem_number} resolved', '"{problem_title}" has been marked as resolved.', 20),
  ('a0000000-0000-0000-0000-000000000001', 'Knowledge submitted for review to group', 'Notify assignment group members when article is submitted', 'knowledge', 'knowledge.submitted_for_review', 'assignment_group_members', 'Article {knowledge_number} submitted for review', '{knowledge_title} is awaiting review.', 10),
  ('a0000000-0000-0000-0000-000000000001', 'Knowledge published to author', 'Notify author when article is published', 'knowledge', 'knowledge.published', 'author', 'Article {knowledge_number} published', 'Your article "{knowledge_title}" has been published.', 20),
  ('a0000000-0000-0000-0000-000000000001', 'Knowledge rejected to author', 'Notify author when article is rejected', 'knowledge', 'knowledge.rejected', 'author', 'Article {knowledge_number} rejected', 'Your article "{knowledge_title}" was rejected.', 30);

-- ─── Workflow Builder Definitions ────────────────────────────
CREATE TABLE workflow_definitions (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id            uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                 text        NOT NULL,
  workflow_type        text        NOT NULL,
  draft_definition     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  published_definition jsonb,
  version              integer     NOT NULL DEFAULT 0,
  is_active            boolean     NOT NULL DEFAULT true,
  draft_updated_at     timestamptz NOT NULL DEFAULT now(),
  published_at         timestamptz,
  published_by         uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_by           uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, workflow_type, name)
);
CREATE INDEX idx_workflow_definitions_tenant
  ON workflow_definitions(tenant_id, workflow_type, is_active, updated_at DESC);
CREATE INDEX idx_workflow_definitions_draft_gin ON workflow_definitions USING gin (draft_definition);
CREATE INDEX idx_workflow_definitions_published_gin ON workflow_definitions USING gin (published_definition);
CREATE TRIGGER trg_workflow_definitions_updated_at
  BEFORE UPDATE ON workflow_definitions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Active-state sync helpers for reporting ────────────────
CREATE OR REPLACE FUNCTION sync_is_active_from_status()
RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'changes' THEN
    NEW.is_active := (NEW.status::text <> 'closed');
  ELSIF TG_TABLE_NAME = 'incidents' THEN
    NEW.is_active := (NEW.status::text <> 'closed');
  ELSIF TG_TABLE_NAME = 'configuration_items' THEN
    NEW.is_active := (NEW.status::text <> 'retired');
  ELSIF TG_TABLE_NAME = 'knowledge_articles' THEN
    NEW.is_active := (NEW.status::text <> 'retired');
  ELSIF TG_TABLE_NAME = 'problem_tasks' THEN
    NEW.is_active := (NEW.status::text <> 'completed');
  ELSIF TG_TABLE_NAME = 'problems' THEN
    NEW.is_active := (NEW.status::text NOT IN ('resolved', 'closed'));
  ELSIF TG_TABLE_NAME = 'request_tasks' THEN
    NEW.is_active := (NEW.status::text NOT IN ('completed', 'skipped', 'rejected'));
  ELSIF TG_TABLE_NAME = 'requests' THEN
    NEW.is_active := (NEW.status::text NOT IN ('fulfilled', 'cancelled'));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION deactivate_previous_knowledge_version()
RETURNS trigger AS $$
BEGIN
  IF NEW.previous_version_id IS NOT NULL THEN
    UPDATE knowledge_articles
    SET is_active = false
    WHERE tenant_id = NEW.tenant_id
      AND id = NEW.previous_version_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_changes_is_active_sync
  BEFORE INSERT OR UPDATE OF status ON changes
  FOR EACH ROW EXECUTE FUNCTION sync_is_active_from_status();

CREATE TRIGGER trg_incidents_is_active_sync
  BEFORE INSERT OR UPDATE OF status ON incidents
  FOR EACH ROW EXECUTE FUNCTION sync_is_active_from_status();

CREATE TRIGGER trg_ci_is_active_sync
  BEFORE INSERT OR UPDATE OF status ON configuration_items
  FOR EACH ROW EXECUTE FUNCTION sync_is_active_from_status();

CREATE TRIGGER trg_knowledge_is_active_sync
  BEFORE INSERT OR UPDATE OF status ON knowledge_articles
  FOR EACH ROW EXECUTE FUNCTION sync_is_active_from_status();

CREATE TRIGGER trg_problem_tasks_is_active_sync
  BEFORE INSERT OR UPDATE OF status ON problem_tasks
  FOR EACH ROW EXECUTE FUNCTION sync_is_active_from_status();

CREATE TRIGGER trg_problems_is_active_sync
  BEFORE INSERT OR UPDATE OF status ON problems
  FOR EACH ROW EXECUTE FUNCTION sync_is_active_from_status();

CREATE TRIGGER trg_request_tasks_is_active_sync
  BEFORE INSERT OR UPDATE OF status ON request_tasks
  FOR EACH ROW EXECUTE FUNCTION sync_is_active_from_status();

CREATE TRIGGER trg_requests_is_active_sync
  BEFORE INSERT OR UPDATE OF status ON requests
  FOR EACH ROW EXECUTE FUNCTION sync_is_active_from_status();

CREATE TRIGGER trg_knowledge_prev_version_inactive
  BEFORE INSERT ON knowledge_articles
  FOR EACH ROW EXECUTE FUNCTION deactivate_previous_knowledge_version();

-- Backfill active flags for deterministic reporting
UPDATE changes SET is_active = (status::text <> 'closed');
UPDATE incidents SET is_active = (status::text <> 'closed');
UPDATE configuration_items SET is_active = (status::text <> 'retired');
UPDATE knowledge_articles SET is_active = (status::text <> 'retired');
UPDATE problem_tasks SET is_active = (status::text <> 'completed');
UPDATE problems SET is_active = (status::text NOT IN ('resolved', 'closed'));
UPDATE request_tasks SET is_active = (status::text <> 'completed');
UPDATE requests SET is_active = (status::text NOT IN ('fulfilled', 'cancelled'));

-- ============================================================
-- DONE – Schema ready
-- ============================================================
