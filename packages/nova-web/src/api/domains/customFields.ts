/* SPDX-License-Identifier: AGPL-3.0-only */
import { request } from '../http';
import type { CustomFieldDefinition, CustomFieldEntityType } from '../types/customFields';

export const customFields = {
  definitions: (entityType: CustomFieldEntityType, params: { includeInactive?: boolean } = {}) => {
    const qs = new URLSearchParams();
    if (params.includeInactive) qs.set('include_inactive', 'true');
    return request<{ definitions: CustomFieldDefinition[] }>(
      `/custom-fields/${entityType}${qs.size ? `?${qs}` : ''}`,
    );
  },
  values: (entityType: CustomFieldEntityType, entityId: string) =>
    request<{ custom_fields: Record<string, unknown> }>(
      `/custom-fields/${entityType}/${entityId}/values`,
    ),
};
