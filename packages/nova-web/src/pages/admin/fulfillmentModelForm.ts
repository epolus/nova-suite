/* SPDX-License-Identifier: AGPL-3.0-only */
import type { FulfillmentModel, FulfillmentModelConfig } from '../../api/client';
import { fulfillmentGroupTasks } from '../../api/types/catalog';

export const CI_STATUSES = ['installed', 'in_stock', 'maintenance', 'retired', 'planned'] as const;

export type TaskDraft = {
  name: string;
  instructions: string;
  assigned_group_id: string;
  sla_hours: string;
};

export type FormState = {
  name: string;
  description: string;
  is_active: boolean;
  tasks: TaskDraft[];
  ci_enabled: boolean;
  class_id: string;
  ci_name_template: string;
  ci_display_name_template: string;
  ci_status: (typeof CI_STATUSES)[number];
  asset_enabled: boolean;
  asset_category: string;
  asset_name_template: string;
  asset_tag_template: string;
};

export function emptyTask(name = ''): TaskDraft {
  return { name, instructions: '', assigned_group_id: '', sla_hours: '' };
}

export function emptyForm(): FormState {
  return {
    name: '',
    description: '',
    is_active: true,
    tasks: [emptyTask('Fulfill request')],
    ci_enabled: true,
    class_id: '',
    ci_name_template: '{{item.name}} {{request.number}}',
    ci_display_name_template: '{{item.name}} {{request.number}}',
    ci_status: 'installed',
    asset_enabled: false,
    asset_category: 'hardware',
    asset_name_template: '{{item.name}} {{request.number}}',
    asset_tag_template: '{{request.number}}',
  };
}

export function formFromModel(model: FulfillmentModel): FormState {
  const config = model.config;
  return {
    name: model.name,
    description: model.description || '',
    is_active: model.is_active,
    tasks: fulfillmentGroupTasks(config).map((task) => ({
      name: task.name || '',
      instructions: task.instructions || '',
      assigned_group_id: task.assigned_group_id || '',
      sla_hours: task.sla_hours ? String(task.sla_hours) : '',
    })),
    ci_enabled: config.ci.enabled,
    class_id: config.ci.class_id || '',
    ci_name_template: config.ci.name_template,
    ci_display_name_template: config.ci.display_name_template,
    ci_status: config.ci.status || 'installed',
    asset_enabled: config.asset.enabled,
    asset_category: config.asset.category || 'hardware',
    asset_name_template: config.asset.name_template,
    asset_tag_template: config.asset.asset_tag_template,
  };
}

export function configFromForm(form: FormState): FulfillmentModelConfig {
  return {
    tasks: form.tasks.map((task) => {
      const sla = task.sla_hours.trim() ? Number(task.sla_hours) : null;
      return {
        name: task.name.trim(),
        instructions: task.instructions.trim() || null,
        assigned_group_id: task.assigned_group_id || null,
        sla_hours: sla && Number.isInteger(sla) ? sla : null,
      };
    }),
    ci: {
      enabled: form.ci_enabled,
      class_id: form.class_id || null,
      name_template: form.ci_name_template.trim(),
      display_name_template: form.ci_display_name_template.trim(),
      status: form.ci_status,
    },
    asset: {
      enabled: form.asset_enabled,
      category: form.asset_category.trim() || 'hardware',
      name_template: form.asset_name_template.trim(),
      asset_tag_template: form.asset_tag_template.trim(),
    },
  };
}
