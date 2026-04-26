/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – API Client ───

const BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('nova_token');
}

export function setToken(token: string) {
  localStorage.setItem('nova_token', token);
}

export function clearToken() {
  localStorage.removeItem('nova_token');
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((opts.headers as Record<string, string>) || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...opts, headers });

  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const details = Array.isArray(body?.details)
      ? body.details
        .map((detail: { path?: string; message?: string }) => {
          const path = typeof detail?.path === 'string' && detail.path ? `${detail.path}: ` : '';
          const message = typeof detail?.message === 'string' ? detail.message : 'Invalid value';
          return `${path}${message}`;
        })
        .filter(Boolean)
      : [];
    const baseMessage =
      typeof body?.error === 'string' && body.error.trim().length > 0
        ? body.error
        : `Request failed: ${res.status}`;
    const fullMessage = details.length > 0 ? `${baseMessage} (${details.join('; ')})` : baseMessage;
    throw new Error(fullMessage);
  }

  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

// ─── Settings / Theme ───
export interface ThemeSettings {
  app_name: string;
  app_subtitle: string;
  primary_color: string;
  sidebar_bg: string;
  sidebar_active_bg: string;
  content_bg: string;
  login_bg_from: string;
  login_bg_to: string;
  dark_content_bg: string;
  dark_surface_bg: string;
  dark_muted_bg: string;
  dark_border_color: string;
  dark_text_primary: string;
  dark_text_muted: string;
  catalog_currency: string;
  logo_url: string;
  [key: string]: string;
}

export interface CacheMetrics {
  enabled: boolean;
  connected: boolean;
  url: string;
  defaultTtlSeconds: number;
  getHits: number;
  getMisses: number;
  getErrors: number;
  setOps: number;
  setErrors: number;
  delOps: number;
  delErrors: number;
  totalGets: number;
  hitRatio: number | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
}

export const settings = {
  theme: () => request<{ settings: ThemeSettings }>('/settings/theme'),
  get: () => request<{ settings: ThemeSettings }>('/settings'),
  cacheMetrics: () => request<{ cache: CacheMetrics }>('/settings/cache/metrics'),
  resetCacheMetrics: () => request<{ success: boolean; cache: CacheMetrics }>('/settings/cache/metrics/reset', { method: 'POST', body: JSON.stringify({}) }),
  update: (s: Partial<ThemeSettings>) =>
    request<{ success: boolean }>('/settings', { method: 'PUT', body: JSON.stringify({ settings: s }) }),
  uploadLogo: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return uploadFile<{ logo_url: string }>('/settings/logo', fd);
  },
  deleteLogo: () => request<{ success: boolean }>('/settings/logo', { method: 'DELETE' }),
  logoUrl: () => `${BASE}/settings/logo`,
};

// ─── Auth ───
export const auth = {
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<{ user: User }>('/auth/me'),
  updateTimeFormat: (time_format: '12h' | '24h') =>
    request<{ user: User }>('/auth/me/time-format', {
      method: 'PATCH',
      body: JSON.stringify({ time_format }),
    }),
  updateDateFormat: (date_format: 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD') =>
    request<{ user: User }>('/auth/me/date-format', {
      method: 'PATCH',
      body: JSON.stringify({ date_format }),
    }),
  getPreference: (scope: string) =>
    request<{ preference: Record<string, unknown> | null }>(`/auth/me/preferences/${encodeURIComponent(scope)}`),
  setPreference: (scope: string, value: Record<string, unknown>) =>
    request<{ success: boolean }>(`/auth/me/preferences/${encodeURIComponent(scope)}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    }),
  users: () => request<{ users: UserListItem[] }>('/auth/users'),
  ssoConfig: () =>
    request<{ enabled: boolean; provider_name: string; local_login_enabled?: boolean }>('/auth/sso/config'),
};

// ─── Catalog ───
export const catalog = {
  categories: () => request<{ categories: Category[] }>('/catalog/categories'),
  items: (categoryId?: string) =>
    request<{ items: ServiceItem[] }>(
      `/catalog/items${categoryId ? `?category_id=${categoryId}` : ''}`,
    ),
  item: (id: string) => request<ServiceItem>(`/catalog/items/${id}`),
  createItem: (data: Partial<ServiceItem>) =>
    request<ServiceItem>('/catalog/items', { method: 'POST', body: JSON.stringify(data) }),
  updateItem: (id: string, data: Partial<ServiceItem>) =>
    request<ServiceItem>(`/catalog/items/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteItem: (id: string) =>
    request<{ success: boolean }>(`/catalog/items/${id}`, { method: 'DELETE' }),
  uploadPicture: (itemId: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return uploadFile<ServiceItem>(`/catalog/items/${itemId}/picture`, fd);
  },
  deletePicture: (itemId: string) =>
    request<{ success: boolean }>(`/catalog/items/${itemId}/picture`, { method: 'DELETE' }),
  pictureUrl: (itemId: string) => `${BASE}/catalog/items/${itemId}/picture`,
  allItems: () =>
    request<{ items: ServiceItem[] }>('/catalog/items?include_inactive=true'),
  allTasks: () => request<{ tasks: AllCatalogTask[] }>('/catalog/tasks'),
  itemTasks: (itemId: string) => request<{ tasks: CatalogTask[] }>(`/catalog/items/${itemId}/tasks`),
  createItemTask: (itemId: string, data: Partial<CatalogTask>) =>
    request<CatalogTask>(`/catalog/items/${itemId}/tasks`, { method: 'POST', body: JSON.stringify(data) }),
  updateItemTask: (itemId: string, taskId: string, data: Partial<CatalogTask>) =>
    request<CatalogTask>(`/catalog/items/${itemId}/tasks/${taskId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteItemTask: (itemId: string, taskId: string) =>
    request<{ success: boolean }>(`/catalog/items/${itemId}/tasks/${taskId}`, { method: 'DELETE' }),
};

// ─── Requests ───
export const requests = {
  list: (params: Record<string, string> = {}, page = 1, limit = 20) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit), ...params });
    return request<{ requests: ServiceRequest[]; pagination: Pagination }>(`/requests?${qs}`);
  },
  get: (id: string) => request<ServiceRequest>(`/requests/${id}`),
  nav: (currentId: string, params: Record<string, string> = {}) => {
    const qs = new URLSearchParams({ current: currentId, ...params });
    return request<{ prev_id: string | null; next_id: string | null }>(`/requests/nav?${qs}`);
  },
  create: (data: {
    service_item_id: string;
    form_data?: Record<string, unknown>;
    priority?: string;
    notes?: string;
    requested_for?: string;
    delivery_info?: { location?: string; date_needed?: string; instructions?: string };
    batch_id?: string;
  }) => request<ServiceRequest>('/requests', { method: 'POST', body: JSON.stringify(data) }),
  batch: (data: {
    items: { service_item_id: string; form_data?: Record<string, unknown>; priority?: string; notes?: string }[];
    requested_for?: string;
    delivery_info?: { location?: string; date_needed?: string; instructions?: string };
  }) => request<{ batch_id: string; requests: ServiceRequest[] }>('/requests/batch', {
    method: 'POST', body: JSON.stringify(data),
  }),
  approve: (id: string, action: 'approve' | 'reject', notes?: string) =>
    request<ServiceRequest>(`/requests/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ action, notes }),
    }),
  tasks: (id: string) => request<{ tasks: RequestTask[] }>(`/requests/${id}/tasks`),
  task: (taskId: string) => request<RequestTaskListItem>(`/requests/tasks/${taskId}`),
  completeTask: (requestId: string, taskId: string, data: { outcome?: string; notes?: string }) =>
    request<RequestTask>(`/requests/${requestId}/tasks/${taskId}/complete`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  assignTask: (requestId: string, taskId: string) =>
    request<RequestTask>(`/requests/${requestId}/tasks/${taskId}/assign`, { method: 'POST' }),
  taskQueue: (params: Record<string, string> = {}, page = 1, limit = 20) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit), ...params });
    return request<{ tasks: RequestTaskListItem[]; pagination: Pagination }>(`/requests/tasks?${qs}`);
  },
};

// ─── Incidents ───
export const incidents = {
  list: (params: Record<string, string> = {}, page = 1, limit = 20) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit), ...params });
    return request<{ incidents: Incident[]; pagination: Pagination }>(`/incidents?${qs}`);
  },
  get: (id: string) => request<Incident>(`/incidents/${id}`),
  create: (data: Partial<Incident>) =>
    request<Incident>('/incidents', { method: 'POST', body: JSON.stringify(data) }),
  createEss: (data: Partial<Incident>) =>
    request<Incident>('/incidents/ess', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Incident>) =>
    request<Incident>(`/incidents/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  journal: (id: string) => request<{ entries: JournalEntry[] }>(`/incidents/${id}/journal`),
  addJournal: (id: string, data: { entry_type: string; content: string; is_customer_visible: boolean }) =>
    request<JournalEntry>(`/incidents/${id}/journal`, { method: 'POST', body: JSON.stringify(data) }),
  nav: (currentId: string, params: Record<string, string> = {}) => {
    const qs = new URLSearchParams({ current: currentId, ...params });
    return request<{ prev_id: string | null; next_id: string | null }>(`/incidents/nav?${qs}`);
  },
  callers: () => request<{ users: UserListItem[] }>('/incidents/callers'),
  services: () => request<{ services: ServiceListItem[] }>('/incidents/services'),
  linkedProblems: (incidentId: string) =>
    request<{ problems: IncidentProblemLink[] }>(`/incidents/${incidentId}/problems`),
  relateProblem: (incidentId: string, problemId: string, relationshipType = 'related_to') =>
    request<{ success: boolean }>(`/incidents/${incidentId}/problems`, {
      method: 'POST',
      body: JSON.stringify({ problem_id: problemId, relationship_type: relationshipType }),
    }),
  unrelateProblem: (incidentId: string, problemId: string) =>
    request<{ success: boolean }>(`/incidents/${incidentId}/problems/${problemId}`, { method: 'DELETE' }),
  similar: (id: string, params: { limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    return request<{ incidents: SimilarIncident[] }>(`/incidents/${id}/similar${qs.size ? `?${qs}` : ''}`);
  },
  similarByText: (params: { title?: string; description?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.title) qs.set('title', params.title);
    if (params.description) qs.set('description', params.description);
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    return request<{ incidents: SimilarIncident[] }>(`/incidents/similar-by-text?${qs}`);
  },
  assignmentGroups: () => request<{ assignment_groups: AssignmentGroupItem[] }>('/incidents/assignment-groups'),
  bulkUpdate: (ids: string[], action: string, value?: string) =>
    request<{ success: boolean; updated: number }>('/incidents/bulk', {
      method: 'PATCH',
      body: JSON.stringify({ ids, action, value }),
    }),
  stats: () => request<IncidentStats>('/incidents/stats'),
};

// ─── Problems ───
export const problems = {
  list: (params: Record<string, string> = {}, page = 1, limit = 20) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit), ...params });
    return request<{ problems: Problem[]; pagination: Pagination }>(`/problems?${qs}`);
  },
  get: (id: string) => request<Problem>(`/problems/${id}`),
  create: (data: Partial<Problem>) =>
    request<Problem>('/problems', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Problem>) =>
    request<Problem>(`/problems/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  nav: (currentId: string, params: Record<string, string> = {}) => {
    const qs = new URLSearchParams({ current: currentId, ...params });
    return request<{ prev_id: string | null; next_id: string | null }>(`/problems/nav?${qs}`);
  },
  assignmentGroups: () => request<{ assignment_groups: AssignmentGroupItem[] }>('/problems/assignment-groups'),
  searchIncidents: (q: string) =>
    request<{ incidents: Array<{ id: string; number: string; title: string; status: string }> }>(`/problems/incidents/search?q=${encodeURIComponent(q)}`),
  linkedIncidents: (problemId: string) =>
    request<{ incidents: ProblemIncidentLink[] }>(`/problems/${problemId}/incidents`),
  linkIncident: (problemId: string, incidentId: string, relationshipType = 'caused_by') =>
    request<{ success: boolean }>(`/problems/${problemId}/incidents`, {
      method: 'POST',
      body: JSON.stringify({ incident_id: incidentId, relationship_type: relationshipType }),
    }),
  unlinkIncident: (problemId: string, incidentId: string) =>
    request<{ success: boolean }>(`/problems/${problemId}/incidents/${incidentId}`, { method: 'DELETE' }),
  tasks: (problemId: string) =>
    request<{ tasks: ProblemTask[] }>(`/problems/${problemId}/tasks`),
  createTask: (problemId: string, data: Partial<ProblemTask>) =>
    request<ProblemTask>(`/problems/${problemId}/tasks`, { method: 'POST', body: JSON.stringify(data) }),
  updateTask: (problemId: string, taskId: string, data: Partial<ProblemTask>) =>
    request<ProblemTask>(`/problems/${problemId}/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTask: (problemId: string, taskId: string) =>
    request<{ success: boolean }>(`/problems/${problemId}/tasks/${taskId}`, { method: 'DELETE' }),
  knownErrors: (problemId: string) =>
    request<{ known_errors: KnownError[] }>(`/problems/${problemId}/known-errors`),
  createKnownError: (problemId: string, data: Partial<KnownError>) =>
    request<KnownError>(`/problems/${problemId}/known-errors`, { method: 'POST', body: JSON.stringify(data) }),
  updateKnownError: (problemId: string, knownErrorId: string, data: Partial<KnownError>) =>
    request<KnownError>(`/problems/${problemId}/known-errors/${knownErrorId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  byCi: (ciId: string) => request<{ problems: Problem[] }>(`/problems/by-ci/${ciId}`),
};

// ─── Changes ───
export const changes = {
  list: (params: Record<string, string> = {}, page = 1, limit = 20) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit), ...params });
    return request<{ changes: Change[]; pagination: Pagination }>(`/changes?${qs}`);
  },
  get: (id: string) => request<ChangeDetail>(`/changes/${id}`),
  create: (data: Partial<Change>) =>
    request<Change>('/changes', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Change>) =>
    request<Change>(`/changes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  nav: (currentId: string, params: Record<string, string> = {}) => {
    const qs = new URLSearchParams({ current: currentId, ...params });
    return request<{ prev_id: string | null; next_id: string | null }>(`/changes/nav?${qs}`);
  },
  assignmentGroups: () => request<{ assignment_groups: AssignmentGroupItem[] }>('/changes/assignment-groups'),
  types: () => request<{ change_types: ChangeType[] }>('/changes/types'),
  createType: (data: Partial<ChangeType>) =>
    request<ChangeType>('/changes/types', { method: 'POST', body: JSON.stringify(data) }),
  updateType: (id: string, data: Partial<ChangeType>) =>
    request<ChangeType>(`/changes/types/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  standardTemplates: () => request<{ templates: StandardChangeTemplate[] }>('/changes/standard-templates'),
  createStandardTemplate: (data: Partial<StandardChangeTemplate>) =>
    request<StandardChangeTemplate>('/changes/standard-templates', { method: 'POST', body: JSON.stringify(data) }),
  updateStandardTemplate: (id: string, data: Partial<StandardChangeTemplate>) =>
    request<StandardChangeTemplate>(`/changes/standard-templates/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  cabMeetings: () => request<{ meetings: CabMeeting[] }>('/changes/cab-meetings'),
  createCabMeeting: (data: Partial<CabMeeting>) =>
    request<CabMeeting>('/changes/cab-meetings', { method: 'POST', body: JSON.stringify(data) }),
  addToCabMeeting: (meetingId: string, changeId: string) =>
    request<{ success: boolean }>(`/changes/cab-meetings/${meetingId}/changes/${changeId}`, { method: 'POST' }),
  decideCabMeetingChange: (meetingId: string, changeId: string, decision: 'approved' | 'rejected' | 'deferred', notes?: string) =>
    request<{ success: boolean }>(`/changes/cab-meetings/${meetingId}/changes/${changeId}`, {
      method: 'PATCH',
      body: JSON.stringify({ decision, notes }),
    }),
  blackouts: () => request<{ blackouts: ChangeBlackout[] }>('/changes/blackouts'),
  createBlackout: (data: Partial<ChangeBlackout>) =>
    request<ChangeBlackout>('/changes/blackouts', { method: 'POST', body: JSON.stringify(data) }),
  updateBlackout: (id: string, data: Partial<ChangeBlackout>) =>
    request<ChangeBlackout>(`/changes/blackouts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  calendar: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params);
    return request<{ changes: Change[]; blackouts: ChangeBlackout[] }>(`/changes/calendar?${qs}`);
  },
  conflicts: (id: string) => request<{ conflicts: ChangeConflict[] }>(`/changes/conflicts/${id}`),
  transition: (id: string, data: { action: string; notes?: string; scheduled_start?: string | null; scheduled_end?: string | null }) =>
    request<Change>(`/changes/${id}/transition`, { method: 'POST', body: JSON.stringify(data) }),
  decideApproval: (changeId: string, approvalId: string, decision: 'approved' | 'rejected' | 'waived', notes?: string) =>
    request<{ success: boolean }>(`/changes/${changeId}/approvals/${approvalId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, notes }),
    }),
  stats: () => request<ChangeStats>('/changes/stats'),
};

// ─── Admin ───
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
};

// ─── CMDB ───
export const cmdb = {
  classes: () => request<{ classes: CIClass[] }>('/cmdb/classes'),
  createClass: (data: Partial<CIClass>) =>
    request<CIClass>('/cmdb/classes', { method: 'POST', body: JSON.stringify(data) }),
  updateClass: (id: string, data: Partial<CIClass>) =>
    request<CIClass>(`/cmdb/classes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteClass: (id: string) =>
    request<void>(`/cmdb/classes/${id}`, { method: 'DELETE' }),
  items: (params: Record<string, string> = {}, page = 1, limit = 20) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit), ...params });
    return request<{ items: CI[]; pagination: Pagination }>(`/cmdb/items?${qs}`);
  },
  item: (id: string) => request<CI & { relationships: { outgoing: CIRelationship[]; incoming: CIRelationship[] } }>(`/cmdb/items/${id}`),
  createItem: (data: Partial<CI>) =>
    request<CI>('/cmdb/items', { method: 'POST', body: JSON.stringify(data) }),
  updateItem: (id: string, data: Partial<CI>) =>
    request<CI>(`/cmdb/items/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  itemHistory: (id: string) => request<{ history: CIHistoryEntry[] }>(`/cmdb/items/${id}/history`),
  impact: (id: string, depth = 5) =>
    request<{ source_ci_id: string; impacted_items: ImpactedCI[]; total: number }>(
      `/cmdb/items/${id}/impact?depth=${depth}`,
    ),
  relationships: () => request<{ relationships: CIRelationship[] }>('/cmdb/relationships'),
  createRelationship: (data: { source_ci_id: string; target_ci_id: string; relationship_type: string; notes?: string }) =>
    request<CIRelationship>('/cmdb/relationships', { method: 'POST', body: JSON.stringify(data) }),
  deleteRelationship: (id: string) =>
    request<void>(`/cmdb/relationships/${id}`, { method: 'DELETE' }),
  nav: (currentId: string, params: Record<string, string> = {}) => {
    const qs = new URLSearchParams({ current: currentId, ...params });
    return request<{ prev_id: string | null; next_id: string | null }>(`/cmdb/items/nav?${qs}`);
  },
};

// ─── Knowledge ───
export const knowledge = {
  categories: () => request<{ categories: KnowledgeCategory[] }>('/knowledge/categories'),
  createCategory: (data: { name: string; description?: string | null; parent_id?: string | null; is_active?: boolean }) =>
    request<{ id: string }>('/knowledge/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateCategory: (id: string, data: Partial<KnowledgeCategory>) =>
    request<{ success: boolean }>(`/knowledge/categories/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCategory: (id: string) =>
    request<{ success: boolean }>(`/knowledge/categories/${id}`, { method: 'DELETE' }),
  assignmentGroups: () => request<{ assignment_groups: AssignmentGroupItem[] }>('/knowledge/assignment-groups'),
  workflows: () => request<{ workflows: KnowledgeApprovalWorkflow[] }>('/knowledge/workflows'),
  createWorkflow: (data: Partial<KnowledgeApprovalWorkflow>) =>
    request<{ id: string }>('/knowledge/workflows', { method: 'POST', body: JSON.stringify(data) }),
  updateWorkflow: (id: string, data: Partial<KnowledgeApprovalWorkflow>) =>
    request<{ success: boolean }>(`/knowledge/workflows/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteWorkflow: (id: string) =>
    request<{ success: boolean }>(`/knowledge/workflows/${id}`, { method: 'DELETE' }),
  articles: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params);
    return request<{ articles: KnowledgeArticle[] }>(`/knowledge/articles?${qs}`);
  },
  article: (id: string) => request<KnowledgeArticleDetail>(`/knowledge/articles/${id}`),
  createArticle: (data: Partial<KnowledgeArticle>) =>
    request<{ id: string }>('/knowledge/articles', { method: 'POST', body: JSON.stringify(data) }),
  updateArticle: (id: string, data: Partial<KnowledgeArticle>) =>
    request<{ success: boolean }>(`/knowledge/articles/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  newVersion: (id: string) =>
    request<{ id: string }>(`/knowledge/articles/${id}/new-version`, { method: 'POST', body: JSON.stringify({}) }),
  submitForReview: (id: string) =>
    request<{ success: boolean; status: string }>(`/knowledge/articles/${id}/submit`, { method: 'POST', body: JSON.stringify({}) }),
  decideApproval: (articleId: string, approvalId: string, decision: 'approved' | 'rejected', notes?: string) =>
    request<{ success: boolean }>(`/knowledge/articles/${articleId}/approvals/${approvalId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, notes }),
    }),
  incidentResolutions: (incidentId: string) =>
    request<{ resolutions: KnowledgeIncidentResolution[] }>(`/knowledge/incidents/${incidentId}/resolutions`),
  linkIncidentResolution: (incidentId: string, kbId: string) =>
    request<{ success: boolean }>(`/knowledge/incidents/${incidentId}/resolutions`, {
      method: 'POST',
      body: JSON.stringify({ kb_id: kbId }),
    }),
  suggestionsForIncident: (incidentId: string, params: { limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    return request<{ articles: KnowledgeSuggestion[] }>(`/knowledge/incidents/${incidentId}/suggestions${qs.size ? `?${qs}` : ''}`);
  },
  suggestionsByText: (params: { title?: string; description?: string; category?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.title) qs.set('title', params.title);
    if (params.description) qs.set('description', params.description);
    if (params.category) qs.set('category', params.category);
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    return request<{ articles: KnowledgeSuggestion[] }>(`/knowledge/suggestions-by-text?${qs}`);
  },
  ratings: (id: string) => request<KbArticleRatingSummary>(`/knowledge/articles/${id}/ratings`),
  rate: (id: string, rating: 1 | -1 | null) =>
    request<KbArticleRatingSummary>(`/knowledge/articles/${id}/rate`, {
      method: 'POST',
      body: JSON.stringify({ rating }),
    }),
};

// ─── Notifications ───
export interface AppNotification {
  id: string;
  type: 'assignment' | 'mention' | 'sla_warning' | 'workflow';
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
}

export const notifications = {
  list: () => request<{ notifications: AppNotification[] }>('/notifications'),
  unreadCount: () => request<{ count: number }>('/notifications/unread-count'),
  markRead: (id: string) =>
    request<{ success: boolean }>(`/notifications/${id}/read`, { method: 'POST', body: JSON.stringify({}) }),
  markAllRead: () =>
    request<{ success: boolean }>('/notifications/read-all', { method: 'POST', body: JSON.stringify({}) }),
  deleteAll: () =>
    request<{ success: boolean; deleted?: number }>('/notifications/delete-all', { method: 'POST', body: JSON.stringify({}) }),
};

// ─── Global Search ───
export interface SearchResult {
  type: 'incident' | 'change' | 'problem' | 'knowledge' | 'ci';
  id: string;
  identifier: string;
  title: string;
  subtitle: string | null;
  path: string;
  score: number;
}

export const search = {
  query: (q: string, limit = 20, type?: string) => {
    const qs = new URLSearchParams({ q, limit: String(limit) });
    if (type) qs.set('type', type);
    return request<{ results: SearchResult[] }>(`/search?${qs}`);
  },
};

// ─── Approvals ───
export interface PendingApproval {
  type: 'change' | 'knowledge' | 'request';
  approval_id: string;
  approval_type: string;
  entity_id: string;
  entity_number: string;
  entity_title: string;
  created_at: string;
}

export const approvals = {
  pendingCount: () => request<{ count: number }>('/approvals/pending-count'),
  list: () => request<{ approvals: PendingApproval[] }>('/approvals'),
};

// ─── Temporal ───
export const temporal = {
  overview: () => request<TemporalOverview>('/temporal/overview'),
  workflows: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params);
    return request<{ workflows: WorkflowExecution[]; nextPageToken: string | null }>(`/temporal/workflows?${qs}`);
  },
  workflow: (workflowId: string, runId: string) =>
    request<WorkflowDetail>(`/temporal/workflows/${encodeURIComponent(workflowId)}/${encodeURIComponent(runId)}`),
  history: (workflowId: string, runId: string, params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params);
    return request<{ events: HistoryEvent[]; nextPageToken: string | null }>(
      `/temporal/workflows/${encodeURIComponent(workflowId)}/${encodeURIComponent(runId)}/history?${qs}`,
    );
  },
  terminate: (workflowId: string, runId: string, reason?: string) =>
    request<{ success: boolean }>(
      `/temporal/workflows/${encodeURIComponent(workflowId)}/${encodeURIComponent(runId)}/terminate`,
      { method: 'POST', body: JSON.stringify({ reason }) },
    ),
  cancel: (workflowId: string, runId: string) =>
    request<{ success: boolean }>(
      `/temporal/workflows/${encodeURIComponent(workflowId)}/${encodeURIComponent(runId)}/cancel`,
      { method: 'POST', body: JSON.stringify({}) },
    ),
};

// ─── Importer ───
async function uploadFile<T>(path: string, formData: FormData): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: formData });

  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const details = Array.isArray(body?.details)
      ? body.details
        .map((detail: { path?: string; message?: string }) => {
          const path = typeof detail?.path === 'string' && detail.path ? `${detail.path}: ` : '';
          const message = typeof detail?.message === 'string' ? detail.message : 'Invalid value';
          return `${path}${message}`;
        })
        .filter(Boolean)
      : [];
    const baseMessage =
      typeof body?.error === 'string' && body.error.trim().length > 0
        ? body.error
        : `Request failed: ${res.status}`;
    const fullMessage = details.length > 0 ? `${baseMessage} (${details.join('; ')})` : baseMessage;
    throw new Error(fullMessage);
  }
  return res.json();
}

export const importer = {
  entities: () => request<{ entities: EntityFieldDef[] }>('/import/entities'),
  upload: (file: File, entityType: string) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('entity_type', entityType);
    return uploadFile<ImportUploadResult>('/import/upload', fd);
  },
  validate: (
    jobId: string,
    columnMapping: Record<string, string>,
    fixedValues: Record<string, string> = {},
  ) =>
    request<ImportValidationResult>(`/import/${jobId}/validate`, {
      method: 'POST',
      body: JSON.stringify({ column_mapping: columnMapping, fixed_values: fixedValues }),
    }),
  getJob: (jobId: string) => request<ImportJob>(`/import/${jobId}`),
  getRows: (jobId: string, params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params);
    return request<{ rows: ImportRow[]; pagination: Pagination }>(`/import/${jobId}/rows?${qs}`);
  },
  commit: (jobId: string) => request<{ committed: number; failed: number }>(`/import/${jobId}/commit`, { method: 'POST' }),
  jobs: () => request<{ jobs: ImportJob[] }>('/import'),
  deleteJob: (jobId: string) => request<{ success: boolean }>(`/import/${jobId}`, { method: 'DELETE' }),
};

// ─── Types ───
export interface User {
  id: string;
  tenant_id: string;
  email: string;
  display_name: string;
  time_format: '12h' | '24h';
  date_format: 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
  roles: string[];
}

export interface UserListItem {
  id: string;
  email: string;
  display_name: string;
  user_id: string | null;
  phone?: string | null;
  mobile?: string | null;
  roles: string[];
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  sort_order: number;
}

export interface ServiceItem {
  id: string;
  category_id: string;
  name: string;
  short_description: string | null;
  description: string | null;
  icon: string;
  picture_storage_key: string | null;
  price: number | null;
  custom_attributes: Record<string, unknown>;
  form_schema: { fields: FormField[] };
  approval_required: boolean;
  sla_hours: number;
  is_active: boolean;
  category_name?: string;
}

export interface FormField {
  name: string;
  label?: string;
  type: 'text' | 'textarea' | 'date' | 'number' | 'email' | 'checkbox' | 'select' | 'multiselect' | 'cmdb_ref' | 'user_ref';
  required?: boolean;
  options?: string[];
  placeholder?: string;
  helpText?: string;
  min?: number;
  max?: number;
  pattern?: string;
  ci_class?: string;
  ci_filter?: Record<string, string>;
  defaultValue?: string;
}

export interface ServiceRequest {
  id: string;
  number: string;
  requester_id: string;
  requested_for: string | null;
  service_item_id: string;
  form_data: Record<string, unknown>;
  form_schema?: { fields: FormField[] };
  delivery_info: { location?: string; date_needed?: string; instructions?: string };
  batch_id: string | null;
  status: string;
  priority: string;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  service_item_name?: string;
  requester_name?: string;
  approved_by_name?: string;
  requested_for_name?: string;
  batch_count?: number;
}

export interface Incident {
  id: string;
  number: string;
  request_id: string | null;
  title: string;
  description: string | null;
  status: string;
  impact: string;
  urgency: string;
  priority: number;
  assigned_to: string | null;
  assignment_group_id: string | null;
  caller_id: string | null;
  contact_info: string | null;
  service_id: string | null;
  configuration_item_id: string | null;
  category: string | null;
  subcategory: string | null;
  resolution_code: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  sla_due_at: string | null;
  sla_breached: boolean;
  created_at: string;
  updated_at: string;
  assigned_to_name?: string;
  assignment_group_name?: string;
  caller_name?: string;
  caller_email?: string;
  caller_phone?: string;
  caller_mobile?: string;
  caller_department_name?: string;
  service_name?: string;
  ci_name?: string;
  ci_display_name?: string;
}

export interface IncidentProblemLink {
  problem_id: string;
  incident_id: string;
  relationship_type: 'caused_by' | 'related_to' | 'symptom_of';
  created_at: string;
  problem_number?: string;
  problem_title?: string;
  problem_status?: string;
  problem_priority?: 'low' | 'medium' | 'high' | 'critical';
}

export interface SimilarIncident {
  id: string;
  number: string;
  title: string;
  status: string;
  priority: number;
  category: string | null;
  subcategory: string | null;
  service_id: string | null;
  service_name?: string | null;
  configuration_item_id: string | null;
  ci_name?: string | null;
  ci_display_name?: string | null;
  similarity_score: number;
  created_at: string;
  updated_at: string;
}

export interface IncidentStats {
  open_total: number;
  sla_breached: number;
  assigned_to_me: number;
  by_priority: Array<{ priority: number; label: string; count: number }>;
}

export interface ChangeStats {
  open_total: number;
  pending_approval: number;
}

export interface Problem {
  id: string;
  number: string;
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high' | 'critical';
  impact: 'low' | 'medium' | 'high';
  category: string | null;
  status: 'new' | 'investigating' | 'root_cause_identified' | 'fix_in_progress' | 'resolved' | 'closed' | 'known_error';
  root_cause: string | null;
  symptoms: string | null;
  workaround: string | null;
  permanent_fix: string | null;
  reported_by: string;
  assigned_to: string | null;
  assignment_group_id: string | null;
  affected_ci: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  closed_at: string | null;
  closed_by: string | null;
  created_at: string;
  updated_at: string;
  reported_by_name?: string;
  assigned_to_name?: string;
  assignment_group_name?: string;
  affected_ci_name?: string;
  incident_count?: number;
  open_incident_count?: number;
}

export interface ProblemIncidentLink {
  problem_id: string;
  incident_id: string;
  relationship_type: 'caused_by' | 'related_to' | 'symptom_of';
  created_at: string;
  incident_number?: string;
  incident_title?: string;
  incident_status?: string;
}

export interface ProblemTask {
  id: string;
  problem_id: string;
  title: string;
  description: string | null;
  task_type: 'investigate' | 'analyze' | 'test' | 'document' | null;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  assigned_to: string | null;
  assigned_to_name?: string;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface KnownError {
  id: string;
  problem_id: string;
  title: string;
  symptoms: string;
  workaround: string;
  permanent_fix_eta: string | null;
  tags: string[];
  severity: 'low' | 'medium' | 'high' | 'critical' | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChangeType {
  id: string;
  name: string;
  description: string | null;
  requires_cab_approval: boolean;
  requires_manager_approval: boolean;
  auto_approve: boolean;
  default_risk_level: 'low' | 'medium' | 'high' | 'very_high';
  max_implementation_hours: number | null;
  approval_config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChangeAffectedCI {
  ci_id: string;
  display_name?: string;
  name?: string;
}

export interface ChangeApproval {
  id: string;
  change_id: string;
  approval_type: 'manager' | 'cab' | 'technical' | 'security' | 'business';
  status: 'pending' | 'approved' | 'rejected' | 'waived';
  approver_user_id: string | null;
  approver_group_id: string | null;
  approver_name?: string;
  approver_group_name?: string;
  decided_by: string | null;
  decision_notes: string | null;
  due_at: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChangeConflict {
  id: string;
  change_id: string;
  conflicting_change_id: string | null;
  conflict_type: 'schedule_overlap' | 'ci_overlap' | 'blackout_window';
  severity: 'warning' | 'blocking';
  details: string | null;
  created_at: string;
  conflicting_change_number?: string;
  conflicting_change_title?: string;
}

export interface Change {
  id: string;
  number: string;
  change_type_id: string;
  standard_change_id: string | null;
  category: string | null;
  title: string;
  description: string;
  reason_for_change: string;
  stage: 'request' | 'assessment' | 'approval' | 'planning' | 'implementation' | 'review';
  status: 'draft' | 'assessment' | 'pending_approval' | 'approved' | 'rejected' | 'planning' | 'scheduled' | 'implementing' | 'implemented' | 'reviewing' | 'closed' | 'cancelled';
  risk_level: 'low' | 'medium' | 'high' | 'very_high';
  impact: string;
  impact_description: string | null;
  implementation_plan: string;
  backout_plan: string;
  test_plan: string | null;
  requested_by: string;
  assigned_to: string | null;
  assignment_group_id: string | null;
  service_id: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  downtime_required: boolean;
  maintenance_window: string | null;
  implementation_notes: string | null;
  success: boolean | null;
  actual_downtime_minutes: number | null;
  related_problem_id: string | null;
  related_incident_id: string | null;
  priority: 'low' | 'medium' | 'high' | 'critical';
  business_justification: string | null;
  estimated_cost: number | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
  change_type_name?: string;
  assignment_group_name?: string;
  service_name?: string;
  assigned_to_name?: string;
  requested_by_name?: string;
  conflict_count?: number;
  pending_approvals?: number;
}

export interface ChangeDetail extends Change {
  affected_cis: ChangeAffectedCI[];
  approvals: ChangeApproval[];
  conflicts: ChangeConflict[];
  allowed_actions?: Array<
    | 'submit_assessment'
    | 'request_approval'
    | 'approve'
    | 'reject'
    | 'start_planning'
    | 'schedule'
    | 'start_implementation'
    | 'mark_implemented'
    | 'start_review'
    | 'close'
    | 'cancel'
  >;
}

export interface StandardChangeTemplate {
  id: string;
  change_type_id: string;
  change_type_name?: string;
  name: string;
  description: string | null;
  category: string | null;
  implementation_plan_template: string | null;
  backout_plan_template: string | null;
  test_plan_template: string | null;
  pre_assessed_risk: 'low' | 'medium' | 'high' | 'very_high';
  automated: boolean;
  automation_script: string | null;
  usage_count: number;
  success_rate: number | null;
  is_active: boolean;
}

export interface CabMeeting {
  id: string;
  title: string;
  scheduled_at: string;
  duration_min: number;
  status: 'scheduled' | 'completed' | 'cancelled';
  minutes: string | null;
  created_by: string | null;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface ChangeBlackout {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  created_at: string;
  updated_at?: string;
}

export interface ServiceListItem {
  id: string;
  name: string;
  description: string | null;
}

export interface JournalEntry {
  id: string;
  incident_id: string;
  author_id: string;
  entry_type: string;
  content: string;
  is_customer_visible: boolean;
  created_at: string;
  author_name?: string;
}

export interface CIClass {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  parent_class: string | null;
  attributes: Record<string, { type: string; reference_table?: string }>;
  icon: string;
  created_at: string;
  updated_at: string;
}

export interface CI {
  id: string;
  class_id: string;
  name: string;
  display_name: string;
  status: string;
  environment: string;
  attributes: Record<string, unknown>;
  managed_by: string | null;
  assigned_to: string | null;
  supported_by: string | null;
  location_id: string | null;
  location: string | null;
  location_name?: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  class_display_name?: string;
  class_name?: string;
  class_icon?: string;
  class_attributes?: Record<string, { type: string }>;
  managed_by_name?: string;
  assigned_to_name?: string;
  supported_by_name?: string;
}

export interface CIRelationship {
  id: string;
  source_ci_id: string;
  target_ci_id: string;
  relationship_type: string;
  notes: string | null;
  source_name?: string;
  source_display_name?: string;
  target_name?: string;
  target_display_name?: string;
}

export interface CIHistoryEntry {
  id: string;
  ci_id: string;
  changed_by: string;
  change_type: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  changed_by_name?: string;
}

export interface ImpactedCI {
  ci_id: string;
  ci_name: string;
  relationship_type: string;
  depth: number;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

// ─── Admin Types ───
export interface AdminUser {
  id: string;
  user_id: string | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string;
  title: string | null;
  phone: string | null;
  mobile: string | null;
  location: string | null;
  timezone: string;
  time_format: '12h' | '24h';
  date_format: 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
  employee_type: string;
  company: string | null;
  company_name: string | null;
  preferred_language: string;
  start_date: string | null;
  last_working_date: string | null;
  is_active: boolean;
  manager_id: string | null;
  department_id: string | null;
  cost_center_id: string | null;
  created_at: string;
  updated_at: string;
  manager_name: string | null;
  department_name: string | null;
  cost_center_name: string | null;
  cost_center_code: string | null;
  roles: string[];
  role_details: { id: string; name: string }[];
  inherited_roles: string[];
}

export interface RoleItem {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DepartmentItem {
  id: string;
  name: string;
  description: string | null;
  parent_department_id: string | null;
  parent_department_name: string | null;
  cost_center_id: string | null;
  cost_center_name: string | null;
  cost_center_code: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  user_count: number;
}

export interface CostCenterItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  user_count: number;
}

export interface CompanyItem {
  id: string;
  name: string;
  code: string | null;
  website: string | null;
  phone: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  parent_company_id: string | null;
  parent_company_name: string | null;
  contact_user_id: string | null;
  contact_user_name: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  location_count: number;
}

export interface LocationItem {
  id: string;
  name: string;
  code: string;
  source: string;
  country: string | null;
  state: string | null;
  city: string | null;
  zip: string | null;
  street: string | null;
  parent_location_id: string | null;
  parent_location_name: string | null;
  company_id: string | null;
  company_name: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateUserPayload {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  display_name: string;
  title?: string;
  phone?: string;
  mobile?: string;
  location?: string;
  timezone?: string;
  time_format?: '12h' | '24h';
  date_format?: 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
  employee_type?: string;
  company?: string;
  preferred_language?: string;
  start_date?: string;
  last_working_date?: string;
  user_id?: string;
  manager_id?: string | null;
  department_id?: string | null;
  cost_center_id?: string | null;
  role_ids?: string[];
}

export interface ProcessItem {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  group_count: number;
}

export interface ServiceAdminItem {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AssignmentGroupItem {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  manager_id: string | null;
  cost_center_id: string | null;
  parent_group_id: string | null;
  created_at: string;
  updated_at: string;
  manager_name: string | null;
  cost_center_name: string | null;
  cost_center_code: string | null;
  parent_group_name: string | null;
  member_count: number;
  members: { id: string; display_name: string }[];
  processes: { id: string; name: string }[];
  roles: { id: string; name: string }[];
}

export interface CreateAssignmentGroupPayload {
  name: string;
  description?: string;
  manager_id?: string | null;
  cost_center_id?: string | null;
  parent_group_id?: string | null;
  member_ids?: string[];
  process_ids?: string[];
  role_ids?: string[];
}

export interface UpdateAssignmentGroupPayload {
  name?: string;
  description?: string;
  manager_id?: string | null;
  cost_center_id?: string | null;
  parent_group_id?: string | null;
  is_active?: boolean;
  member_ids?: string[];
  process_ids?: string[];
  role_ids?: string[];
}

export interface UpdateUserPayload {
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string;
  title?: string | null;
  phone?: string | null;
  mobile?: string | null;
  location?: string | null;
  timezone?: string;
  time_format?: '12h' | '24h';
  date_format?: 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
  employee_type?: string;
  company?: string | null;
  preferred_language?: string;
  start_date?: string | null;
  last_working_date?: string | null;
  email?: string;
  user_id?: string | null;
  password?: string;
  manager_id?: string | null;
  department_id?: string | null;
  cost_center_id?: string | null;
  is_active?: boolean;
  role_ids?: string[];
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  workflow_type: string;
  draft_definition: Record<string, unknown>;
  published_definition: Record<string, unknown> | null;
  version: number;
  is_active: boolean;
  draft_updated_at: string;
  published_at: string | null;
  published_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Temporal Types ───
export interface TemporalOverview {
  namespace: string;
  state: string;
  /** Best single value: server TTL if known, else configured days. */
  retentionDays: number | null;
  /** Workflow history retention from Temporal namespace (authoritative). */
  retentionDaysServer: number | null;
  /** `TEMPORAL_RETENTION_DAYS` from Nova config. */
  retentionDaysConfigured: number;
  running: number;
  failedLast24h: number;
  completedLast24h: number;
}

export interface WorkflowExecution {
  workflowId: string;
  runId: string;
  type: string;
  status: string;
  statusCode: number;
  taskQueue: string;
  startTime: string | null;
  executionTime: string | null;
  closeTime: string | null;
  historyLength: number;
}

export interface WorkflowDetail extends WorkflowExecution {
  memo: Record<string, unknown>;
  searchAttributes: Record<string, unknown>;
  parentExecution: { workflowId: string; runId: string } | null;
}

export interface HistoryEvent {
  eventId: number;
  eventType: string;
  eventTypeCode: number;
  timestamp: string | null;
  attributes: Record<string, unknown> | null;
}

// ─── Attachments ───
export const attachments = {
  list: (entityType: string, entityId: string) =>
    request<{ attachments: Attachment[] }>(`/attachments?entity_type=${entityType}&entity_id=${entityId}`),
  upload: (entityType: string, entityId: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('entity_type', entityType);
    fd.append('entity_id', entityId);
    return uploadFile<Attachment>('/attachments/upload', fd);
  },
  uploadBlob: (entityType: string, entityId: string, blob: Blob, fileName: string) => {
    const fd = new FormData();
    fd.append('file', blob, fileName);
    fd.append('entity_type', entityType);
    fd.append('entity_id', entityId);
    return uploadFile<Attachment>('/attachments/upload', fd);
  },
  download: async (id: string, fileName: string) => {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${BASE}/attachments/${id}/download`, { headers });
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  },
  previewUrl: async (id: string): Promise<string> => {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${BASE}/attachments/${id}/download`, { headers });
    if (!res.ok) throw new Error('Preview failed');
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },
  delete: (id: string) => request<{ success: boolean }>(`/attachments/${id}`, { method: 'DELETE' }),
};

// ─── Import Types ───
export interface EntityFieldDef {
  key: string;
  label: string;
  fields: { key: string; label: string; required: boolean }[];
}

export interface ImportUploadResult {
  id: string;
  entity_type: string;
  file_name: string;
  total_rows: number;
  file_columns: string[];
  suggested_mapping: Record<string, string>;
  fields: {
    key: string;
    label: string;
    required: boolean;
    type?: 'string' | 'integer' | 'number' | 'boolean' | 'date' | 'enum';
    enum_values?: string[];
    resolve_table?: string | null;
    resolve_match?: string | null;
  }[];
}

export interface ImportJob {
  id: string;
  tenant_id: string;
  created_by: string;
  created_by_name?: string;
  entity_type: string;
  file_name: string;
  status: string;
  column_mapping: Record<string, string> | null;
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  warning_rows: number;
  committed_rows: number;
  created_at: string;
  updated_at: string;
}

export interface ImportRow {
  id: string;
  job_id: string;
  row_number: number;
  raw_data: Record<string, string>;
  mapped_data: Record<string, unknown> | null;
  status: string;
  errors: { field: string; message: string }[];
  warnings: { field: string; message: string }[];
  created_at: string;
}

export interface ImportValidationResult {
  total: number;
  valid: number;
  errors: number;
  warnings: number;
}

// ─── Attachment Types ───
export interface Attachment {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string;
  uploaded_by_name?: string;
  created_at: string;
}

// ─── Catalog Task Types ───
export interface CatalogTask {
  id: string;
  service_item_id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  task_type: 'approval' | 'manual' | 'automated';
  task_order: number;
  assigned_group_id: string | null;
  assigned_group_name?: string;
  sla_hours: number | null;
  /** When task_type is automated, worker executes rest_call / cmdb_lookup without user signals. */
  automation_config?: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
}

export interface AllCatalogTask extends CatalogTask {
  service_item_name: string;
  category_name: string;
  service_item_is_active?: boolean;
}

// ─── SLA Definition Types ───
export interface SlaDefinition {
  id: string;
  name: string;
  description: string | null;
  process_type: 'incident' | 'request' | 'task';
  condition_priority: number | null;
  condition_impact: string | null;
  condition_urgency: string | null;
  condition_category: string | null;
  condition_service_id: string | null;
  condition_service_name?: string;
  resolution_hours: number;
  response_hours: number | null;
  auto_close_days: number;
  warning_pct: number;
  on_warning: string[];
  on_breach: string[];
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface NotificationRule {
  id: string;
  name: string;
  description: string | null;
  entity_type: 'incident' | 'request' | 'change' | 'problem' | 'knowledge';
  trigger_key: string;
  recipient_type:
    | 'caller'
    | 'assignee'
    | 'requester'
    | 'requested_for'
    | 'requested_by'
    | 'reported_by'
    | 'author'
    | 'assignment_group_manager'
    | 'specific_user'
    | 'assignment_group_members';
  recipient_user_id: string | null;
  recipient_user_name?: string | null;
  recipient_group_id: string | null;
  recipient_group_name?: string | null;
  title_template: string;
  body_template: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeCategory {
  id: string;
  name: string;
  description: string | null;
  parent_id?: string | null;
  parent_name?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeApprovalWorkflow {
  id: string;
  name: string;
  category_id: string | null;
  category_name?: string;
  steps: { step_order: number; assignment_group_id: string }[];
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeArticle {
  id: string;
  number: string;
  title: string;
  content: string;
  category_id: string | null;
  category_name?: string;
  assignment_group_id?: string | null;
  assignment_group_name?: string | null;
  root_article_id?: string | null;
  previous_version_id?: string | null;
  version_no?: number;
  status: 'draft' | 'review' | 'published' | 'retired';
  author_id: string | null;
  author_name?: string;
  view_count: number;
  meta_data: Record<string, unknown>;
  pending_approval_count?: number;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeArticleApproval {
  id: string;
  article_id: string;
  step_order: number;
  assignment_group_id: string;
  assignment_group_name?: string;
  status: 'pending' | 'approved' | 'rejected';
  decided_by: string | null;
  decided_by_name?: string;
  decided_at: string | null;
  notes: string | null;
}

export interface KnowledgeArticleDetail extends KnowledgeArticle {
  approvals: KnowledgeArticleApproval[];
  versions?: Array<{ id: string; number: string; status: string; version_no: number; updated_at: string }>;
}

export interface KnowledgeIncidentResolution {
  incident_id: string;
  kb_id: string;
  kb_number: string;
  kb_title: string;
  kb_status: string;
  resolved_by: string | null;
  resolved_by_name?: string;
  applied_at: string;
}

export interface KnowledgeSuggestion {
  id: string;
  number: string;
  title: string;
  excerpt: string;
  category_id: string | null;
  category_name?: string | null;
  updated_at: string;
  view_count: number;
  resolution_count: number;
  suggestion_score: number;
}

export interface KbArticleRatingSummary {
  thumbs_up: number;
  thumbs_down: number;
  my_rating: 1 | -1 | null;
}

export interface RequestTask {
  id: string;
  number: string;
  request_id: string;
  catalog_task_id: string | null;
  task_order: number;
  name: string;
  description: string | null;
  instructions: string | null;
  task_type: 'approval' | 'manual' | 'automated';
  status: 'pending' | 'in_progress' | 'completed' | 'skipped' | 'rejected' | 'failed';
  assigned_to: string | null;
  assigned_to_name?: string;
  assigned_group_id: string | null;
  assigned_group_name?: string;
  started_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  completed_by_name?: string;
  outcome: 'approved' | 'rejected' | null;
  notes: string | null;
  created_at: string;
  /** From parent request when tasks are loaded with the request (e.g. GET /requests/:id/tasks). */
  requester_id?: string;
  requested_for?: string | null;
}

export interface RequestTaskListItem extends RequestTask {
  request_number: string;
  request_status: string;
  service_item_name: string;
  requester_id: string;
  /** Employee the request is for; when set, manager approval uses this user (not submitter). */
  requested_for?: string | null;
  requester_name: string;
}

// ─── Tenant credentials (vault) ───
export interface TenantCredentialListItem {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface TenantCredentialDetail extends TenantCredentialListItem {
  has_secret: boolean;
  created_by: string | null;
}

export const credentials = {
  list: () => request<{ credentials: TenantCredentialListItem[] }>('/credentials'),
  get: (id: string) => request<{ credential: TenantCredentialDetail }>(`/credentials/${id}`),
  create: (body: { slug: string; label: string; description?: string | null; secret: string }) =>
    request<{ credential: TenantCredentialListItem }>('/credentials', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  update: (id: string, body: { label?: string; description?: string | null; secret?: string }) =>
    request<{ credential: TenantCredentialListItem }>(`/credentials/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  remove: (id: string) =>
    request<void>(`/credentials/${id}`, { method: 'DELETE' }),
};

// ─── Data Source Types ───
export interface DataSource {
  id: string;
  name: string;
  description: string | null;
  entity_type: string;
  source_type: 'csv_url' | 'json_url' | 'rest_api' | 'sftp';
  source_config: {
    url?: string;
    headers?: Record<string, string>;
    json_path?: string;
    /** Resolved from tenant_credentials at import time (same slugs as catalog {{cred.slug}}). */
    credential_slug?: string;
    // OAuth2
    auth_type?: 'none' | 'bearer' | 'oauth2';
    bearer_token?: string;
    oauth2_token_url?: string;
    oauth2_client_id?: string;
    oauth2_client_secret?: string;
    oauth2_scope?: string;
    pagination?: {
      enabled?: boolean;
      mode?: 'page' | 'offset';
      page_param?: string;
      page_start?: number;
      page_size_param?: string;
      page_size?: number;
      offset_param?: string;
      offset_start?: number;
      limit_param?: string;
      limit?: number;
      max_pages?: number;
    };
    // SFTP
    sftp_host?: string;
    sftp_port?: number;
    sftp_username?: string;
    sftp_password?: string;
    sftp_private_key?: string;
    sftp_path?: string;
    sftp_file_type?: 'csv' | 'json';
    // CSV options
    csv_delimiter?: string;
    csv_has_headers?: boolean;
  };
  column_mapping: Record<string, string | string[]>;
  schedule_cron: string;
  schedule_enabled: boolean;
  import_mode: 'insert' | 'upsert' | 'full_sync';
  upsert_key: string | null;
  last_run_at: string | null;
  last_run_status: string | null;
  created_by: string | null;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface DataSourceRunErrorSample {
  row_index: number;
  error: string;
  data: Record<string, string>;
  mapped_data?: Record<string, unknown>;
}

export interface DataSourceRunMeta {
  detected_columns?: string[];
  mapping_used?: Record<string, string | string[]>;
}

export interface DataSourceRun {
  id: string;
  data_source_id: string;
  status: 'running' | 'completed' | 'failed';
  trigger_type: 'manual' | 'scheduled';
  total_rows: number;
  committed_rows: number;
  error_rows: number;
  skipped_rows: number;
  error_message: string | null;
  error_samples: DataSourceRunErrorSample[];
  run_meta: DataSourceRunMeta;
  started_at: string;
  completed_at: string | null;
}

export interface DataSourceTestResult {
  detected_columns: string[];
  sample_rows: Record<string, string>[];
  suggested_mapping: Record<string, string>;
  content_type: string;
}

export const dataSources = {
  list: () => request<{ data_sources: DataSource[] }>('/datasources'),
  entityTypes: () => request<{ entities: EntityFieldDef[] }>('/datasources/entity-types'),
  get: (id: string) => request<{ data_source: DataSource }>(`/datasources/${id}`),
  create: (data: Partial<DataSource>) =>
    request<{ id: string }>('/datasources', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<DataSource>) =>
    request<{ success: boolean }>(`/datasources/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/datasources/${id}`, { method: 'DELETE' }),
  run: (id: string) =>
    request<{ workflow_id: string }>(`/datasources/${id}/run`, { method: 'POST' }),
  runs: (id: string) =>
    request<{ runs: DataSourceRun[] }>(`/datasources/${id}/runs`),
  testSource: (data: {
    entity_type: string;
    source_type: DataSource['source_type'];
    source_config: DataSource['source_config'];
  }) => request<{ result: DataSourceTestResult }>('/datasources/test-source', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
};

// ─── Cart ───
export type CartPriority = 'low' | 'medium' | 'high' | 'critical';

export interface CartItem {
  id: string;
  serviceItem: ServiceItem;
  formData: Record<string, unknown>;
  priority: CartPriority;
  notes: string;
}

export interface CartState {
  items: CartItem[];
  cartCount: number;
  cartTotal: number;
}

export const cart = {
  get: () => request<CartState>('/cart'),
  addItem: (payload: { service_item_id: string; form_data?: Record<string, unknown>; priority?: CartPriority; notes?: string }) =>
    request<CartState>('/cart/items', { method: 'POST', body: JSON.stringify(payload) }),
  updateItem: (id: string, payload: { form_data?: Record<string, unknown>; priority?: CartPriority; notes?: string }) =>
    request<CartState>(`/cart/items/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  removeItem: (id: string) => request<CartState>(`/cart/items/${id}`, { method: 'DELETE' }),
  clear: () => request<CartState>('/cart', { method: 'DELETE' }),
};
