/* SPDX-License-Identifier: AGPL-3.0-only */
import type { ReportComponentConfig, ReportFilter } from '../../api/client';

export type BuilderState = {
  name: string;
  description: string;
  is_shared: boolean;
  allowed_roles: string;
  components: ReportComponentConfig[];
};

export function createStableId(): string {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  return `rep_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createTableComponent(): ReportComponentConfig {
  return {
    id: createStableId(),
    type: 'table',
    title: 'New table',
    dataset: 'incidents',
    columns: ['number', 'status', 'created_at'],
    filters: [],
    sort: { field: 'created_at', direction: 'desc' },
    limit: 25,
  };
}

export function createKpiComponent(): ReportComponentConfig {
  return {
    id: createStableId(),
    type: 'kpi',
    title: 'New KPI',
    dataset: 'incidents',
    metric: 'count',
    filters: [],
  };
}

export function createBarChartComponent(): ReportComponentConfig {
  return {
    id: createStableId(),
    type: 'bar_chart',
    title: 'New bar chart',
    dataset: 'incidents',
    group_by: 'status',
    metric: 'count',
    top_n: 8,
    filters: [],
  };
}

export function createPieChartComponent(): ReportComponentConfig {
  return {
    id: createStableId(),
    type: 'pie_chart',
    title: 'New pie chart',
    dataset: 'incidents',
    group_by: 'category',
    metric: 'count',
    top_n: 6,
    filters: [],
  };
}

export function emptyState(): BuilderState {
  return {
    name: 'Untitled report',
    description: '',
    is_shared: false,
    allowed_roles: '',
    components: [],
  };
}

export function ensureComponentIds(components: ReportComponentConfig[]): ReportComponentConfig[] {
  return components.map((component) => {
    if (typeof component.id === 'string' && component.id.trim().length > 0) {
      return component;
    }
    return { ...component, id: createStableId() };
  });
}

export function firstFilter(component: ReportComponentConfig): ReportFilter | null {
  const filters = component.filters ?? [];
  return filters.length > 0 ? filters[0] ?? null : null;
}

export function updateFirstFilter(component: ReportComponentConfig, filter: ReportFilter | null): ReportComponentConfig {
  if (!filter) return { ...component, filters: [] };
  return { ...component, filters: [filter] };
}
