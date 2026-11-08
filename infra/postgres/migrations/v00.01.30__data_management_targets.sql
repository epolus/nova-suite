-- Allow retention jobs on the other operational record tables.
-- data_manager can read role-gated tables so preview matches the rows the worker will change.

DROP POLICY IF EXISTS tenant_isolation_requests ON requests;
CREATE POLICY tenant_isolation_requests ON requests
  FOR ALL USING (
    tenant_id = current_tenant_id()
    AND (
      current_user_has_role('admin', 'fulfiller', 'system', 'data_manager')
      OR requester_id = current_user_id()
      OR requested_for = current_user_id()
    )
  );

DROP POLICY IF EXISTS tenant_isolation_problems ON problems;
CREATE POLICY tenant_isolation_problems ON problems
  FOR ALL USING (
    tenant_id = current_tenant_id()
    AND (
      current_user_has_role('admin', 'fulfiller', 'problem', 'system', 'data_manager')
      OR reported_by = current_user_id()
      OR assigned_to = current_user_id()
    )
  );

DROP POLICY IF EXISTS tenant_isolation_changes ON changes;
CREATE POLICY tenant_isolation_changes ON changes
  FOR ALL USING (
    tenant_id = current_tenant_id()
    AND (
      current_user_has_role('admin', 'fulfiller', 'change_manager', 'system', 'data_manager')
      OR requested_by = current_user_id()
      OR assigned_to = current_user_id()
    )
  );

DROP POLICY IF EXISTS tenant_isolation_alerts ON alerts;
CREATE POLICY tenant_isolation_alerts ON alerts
  FOR ALL USING (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'event_operator', 'event_manager', 'system', 'data_manager')
  )
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND current_user_has_role('admin', 'event_operator', 'event_manager', 'system', 'data_manager')
  );

ALTER TABLE data_management_jobs DROP CONSTRAINT IF EXISTS data_management_jobs_target_check;

ALTER TABLE data_management_jobs
  ADD CONSTRAINT data_management_jobs_target_check
  CHECK (target IN (
    'incidents', 'requests', 'configuration_items', 'assets', 'problems',
    'changes', 'knowledge_articles', 'alerts', 'releases', 'improvements'
  ));
