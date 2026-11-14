/* SPDX-License-Identifier: AGPL-3.0-only */
import { request } from '../http';
import type {
  ChecklistEntityType,
  ChecklistInstance,
  ChecklistInstanceItem,
  ChecklistTemplate,
  ChecklistTemplatePayload,
} from '../types/checklists';

export type {
  ChecklistEntityType,
  ChecklistInstance,
  ChecklistInstanceItem,
  ChecklistTemplate,
  ChecklistTemplatePayload,
} from '../types/checklists';

export const checklists = {
  listTemplates: (entityType?: ChecklistEntityType) => {
    const q = entityType ? `?entity_type=${encodeURIComponent(entityType)}` : '';
    return request<{ checklist_templates: ChecklistTemplate[] }>(`/checklists/templates${q}`);
  },
  listInstances: (entityType: ChecklistEntityType, entityId: string) =>
    request<{ checklist_instances: ChecklistInstance[] }>(
      `/checklists?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`,
    ),
  apply: (data: { entity_type: ChecklistEntityType; entity_id: string; template_id: string }) =>
    request<ChecklistInstance>('/checklists/apply', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  setItemDone: (itemId: string, is_done: boolean) =>
    request<ChecklistInstanceItem>(`/checklists/items/${encodeURIComponent(itemId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_done }),
    }),
  removeInstance: (instanceId: string) =>
    request<{ success: boolean }>(`/checklists/instances/${encodeURIComponent(instanceId)}`, {
      method: 'DELETE',
    }),
  adminList: (includeInactive = true, entityType?: ChecklistEntityType) => {
    const params = new URLSearchParams();
    params.set('include_inactive', includeInactive ? 'true' : 'false');
    if (entityType) params.set('entity_type', entityType);
    return request<{ checklist_templates: ChecklistTemplate[] }>(
      `/admin/checklist-templates?${params.toString()}`,
    );
  },
  adminCreate: (data: ChecklistTemplatePayload) =>
    request<ChecklistTemplate>('/admin/checklist-templates', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  adminUpdate: (id: string, data: Partial<ChecklistTemplatePayload>) =>
    request<ChecklistTemplate>(`/admin/checklist-templates/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  adminDelete: (id: string) =>
    request<{ success: boolean }>(`/admin/checklist-templates/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
};
