/* SPDX-License-Identifier: AGPL-3.0-only */

export type TodoScope = 'me' | 'group';

export interface TodoScopeConfig {
  scope: TodoScope;
  storageKey: string;
  presetsKey: string;
  defaultCols: string[];
  incidentFilter: Record<string, string>;
  taskFilterKey: 'assigned_to_me' | 'my_groups' | 'assigned_to_me_in_my_groups';
}

export const TODO_SCOPE_ME: TodoScopeConfig = {
  scope: 'me',
  storageKey: 'my_todo',
  presetsKey: 'nova_filter_presets_my_todo_incidents',
  defaultCols: ['number', 'title', 'priority', 'status', 'assignment_group_name', 'sla', 'updated_at'],
  incidentFilter: { assigned_to_me: 'true', my_groups: 'true' },
  taskFilterKey: 'assigned_to_me_in_my_groups',
};

export const TODO_SCOPE_GROUP: TodoScopeConfig = {
  scope: 'group',
  storageKey: 'my_groups',
  presetsKey: 'nova_filter_presets_my_groups_incidents',
  defaultCols: ['number', 'title', 'priority', 'status', 'assigned_to_name', 'assignment_group_name', 'sla', 'updated_at'],
  incidentFilter: { my_groups: 'true' },
  taskFilterKey: 'my_groups',
};
