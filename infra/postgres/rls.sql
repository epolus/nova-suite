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
ALTER TABLE user_dashboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_group_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_group_processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE major_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE major_incident_stakeholder_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE major_incident_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE major_incident_related_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE major_incident_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE postmortems ENABLE ROW LEVEL SECURITY;
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
ALTER TABLE workflow_start_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_pending_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_deployment_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_metrics_db_size_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_kb_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_runbook_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_approval_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_article_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_article_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_rule_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_email_deliveries ENABLE ROW LEVEL SECURITY;

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

-- ─── User Dashboards ───
CREATE POLICY tenant_isolation_user_dashboards ON user_dashboards
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

-- ─── Assignment Group Roles ───
CREATE POLICY tenant_isolation_agr ON assignment_group_roles
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── Assignment Group Processes ───
CREATE POLICY tenant_isolation_agp ON assignment_group_processes
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── Services ───
CREATE POLICY tenant_isolation_services ON services
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
-- Only fulfillers and admins can see incidents; system (worker) for automation
CREATE POLICY tenant_isolation_incidents ON incidents
  FOR ALL USING (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'fulfiller', 'system')
  );

-- ─── Incident Journal ───
-- Customer-visible entries for users; all entries for fulfillers/admins; system for automation
CREATE POLICY tenant_isolation_journal ON incident_journal
  FOR ALL USING (
    tenant_id = current_tenant_id()
    AND (
      current_user_has_role('admin', 'fulfiller', 'system')
      OR is_customer_visible = true
    )
  );

-- ─── Major incidents: fulfillers read; managers + admin write; system (worker) writes events ───
DROP POLICY IF EXISTS tenant_isolation_major_incidents ON major_incidents;
CREATE POLICY major_incidents_select ON major_incidents
  FOR SELECT USING (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'fulfiller', 'major_incident_manager', 'system')
  );
CREATE POLICY major_incidents_insert ON major_incidents
  FOR INSERT WITH CHECK (
    tenant_id = current_tenant_id()
    AND (
      current_user_has_role('admin', 'major_incident_manager', 'system')
      OR (current_user_has_role('fulfiller') AND primary_incident_id IS NOT NULL)
    )
  );
CREATE POLICY major_incidents_update ON major_incidents
  FOR UPDATE USING (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'major_incident_manager', 'system')
  );

DROP POLICY IF EXISTS tenant_isolation_mi_stakeholder_updates ON major_incident_stakeholder_updates;
CREATE POLICY mi_stakeholder_updates_select ON major_incident_stakeholder_updates
  FOR SELECT USING (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'fulfiller', 'major_incident_manager', 'system')
  );
CREATE POLICY mi_stakeholder_updates_insert ON major_incident_stakeholder_updates
  FOR INSERT WITH CHECK (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'major_incident_manager', 'system')
  );

DROP POLICY IF EXISTS tenant_isolation_mi_events ON major_incident_events;
CREATE POLICY mi_events_select ON major_incident_events
  FOR SELECT USING (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'fulfiller', 'major_incident_manager', 'system')
  );
CREATE POLICY mi_events_insert ON major_incident_events
  FOR INSERT WITH CHECK (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'fulfiller', 'major_incident_manager', 'system')
  );

DROP POLICY IF EXISTS tenant_isolation_mi_related ON major_incident_related_incidents;
CREATE POLICY mi_related_select ON major_incident_related_incidents
  FOR SELECT USING (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'fulfiller', 'major_incident_manager', 'system')
  );
CREATE POLICY mi_related_insert ON major_incident_related_incidents
  FOR INSERT WITH CHECK (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'major_incident_manager', 'fulfiller', 'system')
  );

DROP POLICY IF EXISTS tenant_isolation_mi_participants ON major_incident_participants;
CREATE POLICY mi_participants_select ON major_incident_participants
  FOR SELECT USING (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'fulfiller', 'major_incident_manager', 'system')
  );
CREATE POLICY mi_participants_insert ON major_incident_participants
  FOR INSERT WITH CHECK (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'major_incident_manager', 'system')
  );
CREATE POLICY mi_participants_delete ON major_incident_participants
  FOR DELETE USING (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'major_incident_manager', 'system')
  );

DROP POLICY IF EXISTS tenant_isolation_postmortems ON postmortems;
CREATE POLICY postmortems_select ON postmortems
  FOR SELECT USING (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'fulfiller', 'major_incident_manager', 'system')
  );
CREATE POLICY postmortems_insert ON postmortems
  FOR INSERT WITH CHECK (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'major_incident_manager', 'system')
  );
CREATE POLICY postmortems_update ON postmortems
  FOR UPDATE USING (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'major_incident_manager', 'system')
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

-- ─── AI Assistant ───
CREATE POLICY tenant_isolation_ai_conversations ON ai_conversations
  FOR ALL
  USING (tenant_id = current_tenant_id() AND user_id = current_user_id())
  WITH CHECK (tenant_id = current_tenant_id() AND user_id = current_user_id());

CREATE POLICY tenant_isolation_ai_messages ON ai_messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM ai_conversations c
      WHERE c.id = ai_messages.conversation_id
        AND c.tenant_id = current_tenant_id()
        AND c.user_id = current_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ai_conversations c
      WHERE c.id = ai_messages.conversation_id
        AND c.tenant_id = current_tenant_id()
        AND c.user_id = current_user_id()
    )
  );

CREATE POLICY tenant_isolation_ai_pending_actions ON ai_pending_actions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM ai_conversations c
      WHERE c.id = ai_pending_actions.conversation_id
        AND c.tenant_id = current_tenant_id()
        AND c.user_id = current_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ai_conversations c
      WHERE c.id = ai_pending_actions.conversation_id
        AND c.tenant_id = current_tenant_id()
        AND c.user_id = current_user_id()
    )
  );

CREATE POLICY tenant_isolation_ai_audit_log ON ai_audit_log
  FOR ALL
  USING (tenant_id = current_tenant_id() AND user_id = current_user_id())
  WITH CHECK (tenant_id = current_tenant_id() AND user_id = current_user_id());

-- ─── Workflow Start Jobs ───
-- Tenant-scoped access in normal request context, plus system role for dispatcher.
CREATE POLICY workflow_start_jobs_tenant_or_system_policy ON workflow_start_jobs
  FOR ALL
  USING (tenant_id = current_tenant_id() OR current_user_has_role('system'))
  WITH CHECK (tenant_id = current_tenant_id() OR current_user_has_role('system'));

-- ─── Audit Events ───
CREATE POLICY tenant_isolation_audit_events ON audit_events
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── System Metrics DB Size Snapshots ───
CREATE POLICY tenant_isolation_system_metrics_db_size_snapshots ON system_metrics_db_size_snapshots
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── Assets ───
CREATE POLICY tenant_isolation_assets ON assets
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── Releases ───
CREATE POLICY tenant_isolation_releases ON releases
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── Report Exports ───
CREATE POLICY tenant_isolation_report_exports ON report_exports
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── Report Definitions ───
CREATE POLICY tenant_isolation_report_definitions ON report_definitions
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── Report Activity Events ───
CREATE POLICY tenant_isolation_report_activity_events ON report_activity_events
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── SLA Definitions ───
CREATE POLICY tenant_isolation_sla_definitions ON sla_definitions
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── Tenant Settings ───
CREATE POLICY tenant_isolation_tenant_settings ON tenant_settings
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── Knowledge Categories ───
CREATE POLICY tenant_isolation_knowledge_categories ON knowledge_categories
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── Knowledge Articles ───
CREATE POLICY tenant_isolation_knowledge_articles ON knowledge_articles
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── Incident KB Resolutions ───
-- Table has no tenant_id, so derive tenant visibility through linked incident/article.
CREATE POLICY tenant_isolation_incident_kb_resolutions ON incident_kb_resolutions
  FOR ALL USING (
    EXISTS (
      SELECT 1
      FROM incidents i
      JOIN knowledge_articles ka ON ka.id = incident_kb_resolutions.kb_id
      WHERE i.id = incident_kb_resolutions.incident_id
        AND i.tenant_id = current_tenant_id()
        AND ka.tenant_id = current_tenant_id()
    )
  );

-- ─── Service runbook links (catalog ↔ KB) ───
CREATE POLICY tenant_isolation_service_runbook_links ON service_runbook_links
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── Knowledge Approval Workflows ───
CREATE POLICY tenant_isolation_kb_approval_workflows ON kb_approval_workflows
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── Knowledge Article Approvals ───
CREATE POLICY tenant_isolation_kb_article_approvals ON kb_article_approvals
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── Knowledge Article Ratings ───
CREATE POLICY tenant_isolation_kb_article_ratings ON kb_article_ratings
  FOR ALL USING (tenant_id = current_tenant_id());

-- ─── Notifications ───
CREATE POLICY tenant_isolation_notifications ON notifications
  FOR ALL USING (
    tenant_id = current_tenant_id()
    AND (
      current_user_has_role('admin', 'fulfiller', 'system')
      OR user_id = current_user_id()
    )
  )
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND (
      current_user_has_role('admin', 'fulfiller', 'system')
      OR user_id = current_user_id()
    )
  );

-- ─── Notification Rules ───
CREATE POLICY tenant_isolation_notification_rules ON notification_rules
  FOR ALL USING (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'fulfiller', 'system')
  )
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'fulfiller', 'system')
  );

-- ─── Notification Rule Templates ───
CREATE POLICY tenant_isolation_notification_rule_templates ON notification_rule_templates
  FOR ALL USING (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'fulfiller', 'system')
  )
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'fulfiller', 'system')
  );

-- ─── Notification Email Deliveries ───
CREATE POLICY tenant_isolation_notification_email_deliveries ON notification_email_deliveries
  FOR ALL USING (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'fulfiller', 'system')
  )
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'fulfiller', 'system')
  );

-- ============================================================
-- Force RLS even for the table owner (the app user)
-- This is critical – without it the app user bypasses RLS
-- ============================================================
ALTER TABLE departments FORCE ROW LEVEL SECURITY;
ALTER TABLE cost_centers FORCE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE user_preferences FORCE ROW LEVEL SECURITY;
ALTER TABLE user_dashboards FORCE ROW LEVEL SECURITY;
ALTER TABLE user_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE processes FORCE ROW LEVEL SECURITY;
ALTER TABLE companies FORCE ROW LEVEL SECURITY;
ALTER TABLE locations FORCE ROW LEVEL SECURITY;
ALTER TABLE assignment_groups FORCE ROW LEVEL SECURITY;
ALTER TABLE assignment_group_members FORCE ROW LEVEL SECURITY;
ALTER TABLE assignment_group_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE assignment_group_processes FORCE ROW LEVEL SECURITY;
ALTER TABLE services FORCE ROW LEVEL SECURITY;
ALTER TABLE service_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE service_items FORCE ROW LEVEL SECURITY;
ALTER TABLE carts FORCE ROW LEVEL SECURITY;
ALTER TABLE cart_items FORCE ROW LEVEL SECURITY;
ALTER TABLE requests FORCE ROW LEVEL SECURITY;
ALTER TABLE incidents FORCE ROW LEVEL SECURITY;
ALTER TABLE incident_journal FORCE ROW LEVEL SECURITY;
ALTER TABLE major_incidents FORCE ROW LEVEL SECURITY;
ALTER TABLE major_incident_stakeholder_updates FORCE ROW LEVEL SECURITY;
ALTER TABLE major_incident_events FORCE ROW LEVEL SECURITY;
ALTER TABLE major_incident_related_incidents FORCE ROW LEVEL SECURITY;
ALTER TABLE major_incident_participants FORCE ROW LEVEL SECURITY;
ALTER TABLE postmortems FORCE ROW LEVEL SECURITY;
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
ALTER TABLE workflow_start_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_pending_actions FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_audit_log FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
ALTER TABLE config_deployment_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE system_metrics_db_size_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE assets FORCE ROW LEVEL SECURITY;
ALTER TABLE releases FORCE ROW LEVEL SECURITY;
ALTER TABLE report_exports FORCE ROW LEVEL SECURITY;
ALTER TABLE report_definitions FORCE ROW LEVEL SECURITY;
ALTER TABLE report_activity_events FORCE ROW LEVEL SECURITY;
ALTER TABLE sla_definitions FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE knowledge_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE knowledge_articles FORCE ROW LEVEL SECURITY;
ALTER TABLE incident_kb_resolutions FORCE ROW LEVEL SECURITY;
ALTER TABLE service_runbook_links FORCE ROW LEVEL SECURITY;
ALTER TABLE kb_approval_workflows FORCE ROW LEVEL SECURITY;
ALTER TABLE kb_article_approvals FORCE ROW LEVEL SECURITY;
ALTER TABLE kb_article_ratings FORCE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
ALTER TABLE notification_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE notification_rule_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE notification_email_deliveries FORCE ROW LEVEL SECURITY;

-- Import staging tables
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON import_jobs
  USING (tenant_id = current_tenant_id());
ALTER TABLE import_jobs FORCE ROW LEVEL SECURITY;

ALTER TABLE import_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY job_access ON import_rows
  USING (job_id IN (SELECT id FROM import_jobs WHERE tenant_id = current_tenant_id()));
ALTER TABLE import_rows FORCE ROW LEVEL SECURITY;

-- Configuration deployment runs
CREATE POLICY tenant_isolation_config_deployment_runs ON config_deployment_runs
  FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

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
