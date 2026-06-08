/* SPDX-License-Identifier: AGPL-3.0-only */
import { request } from '../http';
import type { AdminUser, AssignmentGroupItem, AuditEvent, CompanyItem, ConfigDeploymentRun, ConfigPackageApplyResponse, ConfigPackageBundle, ConfigPackageExportResponse, ConfigPackageValidateResponse, CostCenterItem, CreateAssignmentGroupPayload, CreateUserPayload, DepartmentItem, LocationItem, NotificationEmailDelivery, NotificationEmailDeliverySummary, NotificationRule, ProcessItem, RoleItem, RuntimeHealth, ServiceAdminItem, SlaDefinition, SystemMetrics, UpdateAssignmentGroupPayload, UpdateUserPayload, WorkflowDefinition } from '../types';

export const admin = {
  // Users
  users: () => request<{ users: AdminUser[] }>('/admin/users'),
  createUser: (data: CreateUserPayload) =>
    request<{ id: string }>('/admin/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: string, data: UpdateUserPayload) =>
    request<{ success: boolean }>(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteUser: (id: string) =>
    request<void>(`/admin/users/${id}`, { method: 'DELETE' }),
  // Roles
  roles: () => request<{ roles: RoleItem[] }>('/admin/roles'),
  createRole: (data: { name: string; description?: string }) =>
    request<{ id: string }>('/admin/roles', { method: 'POST', body: JSON.stringify(data) }),
  updateRole: (id: string, data: { name?: string; description?: string; is_active?: boolean }) =>
    request<{ success: boolean }>(`/admin/roles/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  // Departments
  departments: () => request<{ departments: DepartmentItem[] }>('/admin/departments'),
  createDepartment: (data: { name: string; description?: string; parent_department_id?: string; cost_center_id?: string }) =>
    request<{ id: string }>('/admin/departments', { method: 'POST', body: JSON.stringify(data) }),
  updateDepartment: (id: string, data: { name?: string; description?: string; parent_department_id?: string; cost_center_id?: string; is_active?: boolean }) =>
    request<{ success: boolean }>(`/admin/departments/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  // Cost Centers
  costCenters: () => request<{ cost_centers: CostCenterItem[] }>('/admin/cost-centers'),
  createCostCenter: (data: { code: string; name: string; description?: string }) =>
    request<{ id: string }>('/admin/cost-centers', { method: 'POST', body: JSON.stringify(data) }),
  updateCostCenter: (id: string, data: { code?: string; name?: string; description?: string; is_active?: boolean }) =>
    request<{ success: boolean }>(`/admin/cost-centers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  // Companies
  companies: () => request<{ companies: CompanyItem[] }>('/admin/companies'),
  createCompany: (data: Partial<CompanyItem>) =>
    request<{ id: string }>('/admin/companies', { method: 'POST', body: JSON.stringify(data) }),
  updateCompany: (id: string, data: Partial<CompanyItem>) =>
    request<{ success: boolean }>(`/admin/companies/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  // Locations
  locations: () => request<{ locations: LocationItem[] }>('/admin/locations'),
  createLocation: (data: Partial<LocationItem>) =>
    request<{ id: string }>('/admin/locations', { method: 'POST', body: JSON.stringify(data) }),
  updateLocation: (id: string, data: Partial<LocationItem>) =>
    request<{ success: boolean }>(`/admin/locations/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  // Processes
  processes: () => request<{ processes: ProcessItem[] }>('/admin/processes'),
  createProcess: (data: { name: string; description?: string }) =>
    request<{ id: string }>('/admin/processes', { method: 'POST', body: JSON.stringify(data) }),
  updateProcess: (id: string, data: { name?: string; description?: string; is_active?: boolean }) =>
    request<{ success: boolean }>(`/admin/processes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  // Assignment Groups
  assignmentGroups: () => request<{ assignment_groups: AssignmentGroupItem[] }>('/admin/assignment-groups'),
  createAssignmentGroup: (data: CreateAssignmentGroupPayload) =>
    request<{ id: string }>('/admin/assignment-groups', { method: 'POST', body: JSON.stringify(data) }),
  updateAssignmentGroup: (id: string, data: UpdateAssignmentGroupPayload) =>
    request<{ success: boolean }>(`/admin/assignment-groups/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  // Services
  services: () => request<{ services: ServiceAdminItem[] }>('/admin/services'),
  createService: (data: { name: string; description?: string }) =>
    request<{ id: string }>('/admin/services', { method: 'POST', body: JSON.stringify(data) }),
  updateService: (id: string, data: { name?: string; description?: string; is_active?: boolean }) =>
    request<{ success: boolean }>(`/admin/services/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  // SLA Definitions
  slaDefinitions: () => request<{ sla_definitions: SlaDefinition[] }>('/admin/sla-definitions'),
  createSlaDefinition: (data: Partial<SlaDefinition>) =>
    request<{ id: string }>('/admin/sla-definitions', { method: 'POST', body: JSON.stringify(data) }),
  updateSlaDefinition: (id: string, data: Partial<SlaDefinition>) =>
    request<{ success: boolean }>(`/admin/sla-definitions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteSlaDefinition: (id: string) =>
    request<{ success: boolean }>(`/admin/sla-definitions/${id}`, { method: 'DELETE' }),
  // Notification Rules
  notificationRules: () => request<{ notification_rules: NotificationRule[] }>('/admin/notification-rules'),
  createNotificationRule: (data: Partial<NotificationRule>) =>
    request<{ id: string }>('/admin/notification-rules', { method: 'POST', body: JSON.stringify(data) }),
  updateNotificationRule: (id: string, data: Partial<NotificationRule>) =>
    request<{ success: boolean }>(`/admin/notification-rules/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteNotificationRule: (id: string) =>
    request<{ success: boolean }>(`/admin/notification-rules/${id}`, { method: 'DELETE' }),
  testNotificationRule: (id: string, data?: { entity_id?: string }) =>
    request<{ success: boolean; workflow_id: string; entity_id: string }>(
      `/admin/notification-rules/${id}/test`,
      { method: 'POST', body: JSON.stringify(data || {}) },
    ),
  notificationEmailDeliveries: (params: { status?: string; trigger_key?: string; recipient?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.trigger_key) qs.set('trigger_key', params.trigger_key);
    if (params.recipient) qs.set('recipient', params.recipient);
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    return request<{ deliveries: NotificationEmailDelivery[]; summary: NotificationEmailDeliverySummary[] }>(
      `/admin/notification-email-deliveries${qs.size > 0 ? `?${qs}` : ''}`,
    );
  },
  // Configuration packages
  exportCatalogItemPackage: (id: string) =>
    request<ConfigPackageExportResponse>(`/admin/config-packages/export/catalog/items/${id}`),
  exportCatalogPackage: () =>
    request<ConfigPackageExportResponse>('/admin/config-packages/export/catalog'),
  exportNotificationRulePackage: (id: string) =>
    request<ConfigPackageExportResponse>(`/admin/config-packages/export/notifications/rules/${id}`),
  exportNotificationPackage: () =>
    request<ConfigPackageExportResponse>('/admin/config-packages/export/notifications'),
  validateConfigPackage: (bundle: ConfigPackageBundle) =>
    request<ConfigPackageValidateResponse>('/admin/config-packages/validate', {
      method: 'POST',
      body: JSON.stringify({ package: bundle }),
    }),
  applyConfigPackage: (bundle: ConfigPackageBundle) =>
    request<ConfigPackageApplyResponse>('/admin/config-packages/apply', {
      method: 'POST',
      body: JSON.stringify({ package: bundle }),
    }),
  configPackageRuns: () => request<{ runs: ConfigDeploymentRun[] }>('/admin/config-packages/runs'),
  // Workflow builder definitions
  workflowDefinitions: () =>
    request<{ workflow_definitions: WorkflowDefinition[] }>('/admin/workflow-definitions'),
  workflowDefinition: (id: string) =>
    request<{ workflow_definition: WorkflowDefinition }>(`/admin/workflow-definitions/${id}`),
  createWorkflowDefinition: (data: {
    name: string;
    workflow_type: string;
    draft_definition: Record<string, unknown>;
  }) =>
    request<{ id: string }>('/admin/workflow-definitions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateWorkflowDefinition: (id: string, data: {
    name?: string;
    workflow_type?: string;
    draft_definition?: Record<string, unknown>;
    is_active?: boolean;
  }) =>
    request<{ success: boolean }>(`/admin/workflow-definitions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  publishWorkflowDefinition: (id: string, data?: { draft_definition?: Record<string, unknown> }) =>
    request<{ success: boolean }>(`/admin/workflow-definitions/${id}/publish`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),
  duplicateWorkflowDefinition: (id: string) =>
    request<{ id: string }>(`/admin/workflow-definitions/${id}/duplicate`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  auditEvents: (limit = 200) =>
    request<{ events: AuditEvent[] }>(`/admin/audit-events?limit=${limit}`),
  runtimeHealth: () =>
    request<RuntimeHealth>('/admin/runtime-health'),
  systemMetrics: () =>
    request<SystemMetrics>('/admin/system-metrics'),
};
