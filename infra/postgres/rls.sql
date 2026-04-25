-- SPDX-License-Identifier: AGPL-3.0-only
-- ============================================================
-- Nova Suite – Row-Level Security Policies
-- Ensures complete tenant data isolation
-- ============================================================

-- Enable RLS on all tenant-scoped tables
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_group_processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE ci_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuration_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ci_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE ci_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE problem_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE known_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE problem_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE standard_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_cis ENABLE ROW LEVEL SECURITY;
ALTER TABLE cab_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE cab_meeting_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_blackouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_definitions ENABLE ROW LEVEL SECURITY;

-- ─── Departments ───
CREATE POLICY tenant_isolation_departments ON departments
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── Cost Centers ───
CREATE POLICY tenant_isolation_cost_centers ON cost_centers
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── Roles ───
CREATE POLICY tenant_isolation_roles ON roles
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── Users ───
CREATE POLICY tenant_isolation_users ON users
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── User Preferences ───
CREATE POLICY tenant_isolation_user_preferences ON user_preferences
  FOR ALL USING (
    tenant_id = current_tenant_id()
    AND user_id = current_user_id()
  );

-- ─── User Roles ───
CREATE POLICY tenant_isolation_user_roles ON user_roles
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── Processes ───
CREATE POLICY tenant_isolation_processes ON processes
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── Companies ───
CREATE POLICY tenant_isolation_companies ON companies
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── Locations ───
CREATE POLICY tenant_isolation_locations ON locations
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── Assignment Groups ───
CREATE POLICY tenant_isolation_assignment_groups ON assignment_groups
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── Assignment Group Members ───
CREATE POLICY tenant_isolation_agm ON assignment_group_members
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── Assignment Group Processes ───
CREATE POLICY tenant_isolation_agp ON assignment_group_processes
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── Service Categories ───
CREATE POLICY tenant_isolation_service_categories ON service_categories
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── Service Items ───
CREATE POLICY tenant_isolation_service_items ON service_items
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── Carts ───
CREATE POLICY tenant_isolation_carts ON carts
  FOR ALL USING (
    tenant_id = current_tenant_id()
    AND user_id = current_user_id()
  );

-- ─── Cart Items ───
CREATE POLICY tenant_isolation_cart_items ON cart_items
  FOR ALL USING (
    tenant_id = current_tenant_id()
    AND cart_id IN (
      SELECT id
      FROM carts
      WHERE tenant_id = current_tenant_id()
        AND user_id = current_user_id()
    )
  );

-- ─── Requests ───
-- Users can see only their own requests; fulfillers & admins see all
CREATE POLICY tenant_isolation_requests ON requests
  FOR ALL USING (
    tenant_id = current_tenant_id()
    AND (
      current_user_has_role('admin', 'fulfiller')
      OR requester_id = current_user_id()
    )
  );

-- ─── Incidents ───
-- Only fulfillers and admins can see incidents
CREATE POLICY tenant_isolation_incidents ON incidents
  FOR ALL USING (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'fulfiller')
  );

-- ─── Incident Journal ───
-- Customer-visible entries for users; all entries for fulfillers/admins
CREATE POLICY tenant_isolation_journal ON incident_journal
  FOR ALL USING (
    tenant_id = current_tenant_id()
    AND (
      current_user_has_role('admin', 'fulfiller')
      OR is_customer_visible = true
    )
  );

-- ─── CI Classes ───
CREATE POLICY tenant_isolation_ci_classes ON ci_classes
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── Configuration Items ───
CREATE POLICY tenant_isolation_ci ON configuration_items
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── CI Relationships ───
CREATE POLICY tenant_isolation_ci_rel ON ci_relationships
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── CI History ───
CREATE POLICY tenant_isolation_ci_history ON ci_history
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── Problems ───
CREATE POLICY tenant_isolation_problems ON problems
  FOR ALL USING (
    tenant_id = current_tenant_id()
    AND (
      current_user_has_role('admin', 'fulfiller', 'problem')
      OR reported_by = current_user_id()
      OR assigned_to = current_user_id()
    )
  );

-- ─── Problem Incidents ───
CREATE POLICY tenant_isolation_problem_incidents ON problem_incidents
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── Known Errors ───
CREATE POLICY tenant_isolation_known_errors ON known_errors
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── Problem Tasks ───
CREATE POLICY tenant_isolation_problem_tasks ON problem_tasks
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── Change Types ───
CREATE POLICY tenant_isolation_change_types ON change_types
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── Changes ───
CREATE POLICY tenant_isolation_changes ON changes
  FOR ALL USING (
    tenant_id = current_tenant_id()
    AND (
      current_user_has_role('admin', 'fulfiller', 'change_manager')
      OR requested_by = current_user_id()
      OR assigned_to = current_user_id()
    )
  );

-- ─── Standard Changes ───
CREATE POLICY tenant_isolation_standard_changes ON standard_changes
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── Change Approvals ───
CREATE POLICY tenant_isolation_change_approvals ON change_approvals
  FOR ALL USING (
    tenant_id = current_tenant_id()
    AND (
      current_user_has_role('admin', 'fulfiller', 'change_manager')
      OR approver_user_id = current_user_id()
      OR EXISTS (
        SELECT 1
        FROM assignment_group_members agm
        WHERE agm.tenant_id = current_tenant_id()
          AND agm.group_id = change_approvals.approver_group_id
          AND agm.user_id = current_user_id()
      )
    )
  );

-- ─── Change CIs ───
CREATE POLICY tenant_isolation_change_cis ON change_cis
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── CAB Meetings ───
CREATE POLICY tenant_isolation_cab_meetings ON cab_meetings
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── CAB Meeting Changes ───
CREATE POLICY tenant_isolation_cab_meeting_changes ON cab_meeting_changes
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── Change Blackouts ───
CREATE POLICY tenant_isolation_change_blackouts ON change_blackouts
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── Change Conflicts ───
CREATE POLICY tenant_isolation_change_conflicts ON change_conflicts
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── Workflow Definitions ───
CREATE POLICY tenant_isolation_workflow_definitions ON workflow_definitions
  FOR ALL USING (tenant_id = current_tenant_id());

-- ============================================================
-- Force RLS even for the table owner (the app user)
-- This is critical – without it the app user bypasses RLS
-- ============================================================
ALTER TABLE departments FORCE ROW LEVEL SECURITY;
ALTER TABLE cost_centers FORCE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE user_preferences FORCE ROW LEVEL SECURITY;
ALTER TABLE user_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE processes FORCE ROW LEVEL SECURITY;
ALTER TABLE companies FORCE ROW LEVEL SECURITY;
ALTER TABLE locations FORCE ROW LEVEL SECURITY;
ALTER TABLE assignment_groups FORCE ROW LEVEL SECURITY;
ALTER TABLE assignment_group_members FORCE ROW LEVEL SECURITY;
ALTER TABLE assignment_group_processes FORCE ROW LEVEL SECURITY;
ALTER TABLE service_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE service_items FORCE ROW LEVEL SECURITY;
ALTER TABLE carts FORCE ROW LEVEL SECURITY;
ALTER TABLE cart_items FORCE ROW LEVEL SECURITY;
ALTER TABLE requests FORCE ROW LEVEL SECURITY;
ALTER TABLE incidents FORCE ROW LEVEL SECURITY;
ALTER TABLE incident_journal FORCE ROW LEVEL SECURITY;
ALTER TABLE ci_classes FORCE ROW LEVEL SECURITY;
ALTER TABLE configuration_items FORCE ROW LEVEL SECURITY;
ALTER TABLE ci_relationships FORCE ROW LEVEL SECURITY;
ALTER TABLE ci_history FORCE ROW LEVEL SECURITY;
ALTER TABLE problems FORCE ROW LEVEL SECURITY;
ALTER TABLE problem_incidents FORCE ROW LEVEL SECURITY;
ALTER TABLE known_errors FORCE ROW LEVEL SECURITY;
ALTER TABLE problem_tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE change_types FORCE ROW LEVEL SECURITY;
ALTER TABLE changes FORCE ROW LEVEL SECURITY;
ALTER TABLE standard_changes FORCE ROW LEVEL SECURITY;
ALTER TABLE change_approvals FORCE ROW LEVEL SECURITY;
ALTER TABLE change_cis FORCE ROW LEVEL SECURITY;
ALTER TABLE cab_meetings FORCE ROW LEVEL SECURITY;
ALTER TABLE cab_meeting_changes FORCE ROW LEVEL SECURITY;
ALTER TABLE change_blackouts FORCE ROW LEVEL SECURITY;
ALTER TABLE change_conflicts FORCE ROW LEVEL SECURITY;
ALTER TABLE workflow_definitions FORCE ROW LEVEL SECURITY;

-- Import staging tables
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON import_jobs
  USING (tenant_id = current_tenant_id());
ALTER TABLE import_jobs FORCE ROW LEVEL SECURITY;

ALTER TABLE import_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY job_access ON import_rows
  USING (job_id IN (SELECT id FROM import_jobs WHERE tenant_id = current_tenant_id()));
ALTER TABLE import_rows FORCE ROW LEVEL SECURITY;

-- Catalog tasks
ALTER TABLE catalog_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON catalog_tasks
  USING (tenant_id = current_tenant_id());
ALTER TABLE catalog_tasks FORCE ROW LEVEL SECURITY;

-- Tenant credentials (mini-vault): catalog_designer may list rows but API returns metadata only;
-- worker uses system role for decrypt during automation.
ALTER TABLE tenant_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_credentials_select ON tenant_credentials
  FOR SELECT
  USING (
    tenant_id = current_tenant_id()
    AND (
      current_user_has_role('admin', 'credential_manager', 'catalog_designer', 'system')
    )
  );

CREATE POLICY tenant_credentials_insert ON tenant_credentials
  FOR INSERT
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'credential_manager')
  );

CREATE POLICY tenant_credentials_update ON tenant_credentials
  FOR UPDATE
  USING (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'credential_manager')
  )
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'credential_manager')
  );

CREATE POLICY tenant_credentials_delete ON tenant_credentials
  FOR DELETE
  USING (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'credential_manager')
  );

ALTER TABLE tenant_credentials FORCE ROW LEVEL SECURITY;

-- Data sources (admin API; worker uses system role)
ALTER TABLE data_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_data_sources ON data_sources
  USING (tenant_id = current_tenant_id());
ALTER TABLE data_sources FORCE ROW LEVEL SECURITY;

ALTER TABLE data_source_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_data_source_runs ON data_source_runs
  USING (tenant_id = current_tenant_id());
ALTER TABLE data_source_runs FORCE ROW LEVEL SECURITY;

-- Request tasks
ALTER TABLE request_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON request_tasks
  USING (tenant_id = current_tenant_id());
ALTER TABLE request_tasks FORCE ROW LEVEL SECURITY;

-- Attachments
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON attachments
  USING (tenant_id = current_tenant_id());
ALTER TABLE attachments FORCE ROW LEVEL SECURITY;

-- ============================================================
-- DONE – RLS policies active
-- ============================================================
