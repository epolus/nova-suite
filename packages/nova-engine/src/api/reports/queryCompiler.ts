/* SPDX-License-Identifier: AGPL-3.0-only */

import { AppError } from '../../middleware/errorHandler';
import {
  ensureDataset,
  type DatasetSpec,
  type ReportDatasetKey,
} from '../../analytics/datasets';

type Scalar = string | number | boolean;

export type { ReportDatasetKey };
export type ReportComponentType = 'table' | 'kpi' | 'bar_chart' | 'pie_chart';
export type ReportFilterOperator = 'eq' | 'neq' | 'contains' | 'in' | 'gte' | 'lte';
export type ReportSortDirection = 'asc' | 'desc';
export type ReportKpiMetric = 'count' | 'avg' | 'sum';

export interface ReportFilter {
  field: string;
  operator: ReportFilterOperator;
  value: Scalar | Scalar[];
}

export interface ReportSort {
  field: string;
  direction?: ReportSortDirection;
}

export interface TableComponentConfig {
  id?: string;
  type: 'table';
  dataset: ReportDatasetKey;
  columns: string[];
  filters?: ReportFilter[];
  sort?: ReportSort | null;
  limit?: number;
}

export interface KpiComponentConfig {
  id?: string;
  type: 'kpi';
  dataset: ReportDatasetKey;
  metric: ReportKpiMetric;
  metric_field?: string;
  filters?: ReportFilter[];
}

export interface ChartComponentConfig {
  id?: string;
  type: 'bar_chart' | 'pie_chart';
  dataset: ReportDatasetKey;
  group_by: string;
  metric: ReportKpiMetric;
  metric_field?: string;
  filters?: ReportFilter[];
  top_n?: number;
}

export type ReportComponentConfig = TableComponentConfig | KpiComponentConfig | ChartComponentConfig;

type CompiledQuery = {
  text: string;
  values: unknown[];
};

const SORT_SQL: Record<string, 'ASC' | 'DESC'> = { asc: 'ASC', desc: 'DESC' };
const TABLE_COLUMN_ALIASES = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11'] as const;

function sortSql(direction: unknown): 'ASC' | 'DESC' {
  const key = String(direction || 'desc').trim().toLowerCase();
  return SORT_SQL[key] ?? 'DESC';
}

function isScalar(value: unknown): value is Scalar {
  return ['string', 'number', 'boolean'].includes(typeof value);
}

function ensureFilterArray(filters: unknown): ReportFilter[] {
  if (filters === undefined || filters === null) return [];
  if (!Array.isArray(filters)) throw new AppError(400, 'filters must be an array');
  return filters as ReportFilter[];
}

function compileFilters(
  dataset: DatasetSpec,
  filters: ReportFilter[],
  values: unknown[],
): string[] {
  const clauses: string[] = [];

  for (const filter of filters) {
    if (!filter || typeof filter !== 'object') throw new AppError(400, 'Invalid filter object');
    const fieldName = String(filter.field || '').trim();
    const operator = String(filter.operator || '').trim() as ReportFilterOperator;
    if (!fieldName || !operator) throw new AppError(400, 'Each filter requires field and operator');

    const field = dataset.fields[fieldName];
    if (!field) throw new AppError(400, `Unsupported filter field "${fieldName}"`);

    const value = filter.value;
    if (operator === 'contains' && field.type !== 'text') {
      throw new AppError(400, `Operator "contains" is only allowed for text fields (${fieldName})`);
    }
    if ((operator === 'gte' || operator === 'lte') && !['number', 'timestamp'].includes(field.type)) {
      throw new AppError(400, `Operator "${operator}" requires number/timestamp field (${fieldName})`);
    }

    const valueIdx = values.length + 1;
    switch (operator) {
      case 'eq':
      case 'neq': {
        if (!isScalar(value)) throw new AppError(400, `Filter value for "${fieldName}" must be scalar`);
        values.push(value);
        clauses.push(`${field.sql} ${operator === 'eq' ? '=' : '!='} $${valueIdx}`);
        break;
      }
      case 'contains': {
        if (typeof value !== 'string') throw new AppError(400, `Filter value for "${fieldName}" must be text`);
        values.push(value);
        clauses.push(`${field.sql} ILIKE '%' || $${valueIdx} || '%'`);
        break;
      }
      case 'in': {
        if (!Array.isArray(value) || value.length === 0) {
          throw new AppError(400, `Filter value for "${fieldName}" must be a non-empty array`);
        }
        if (value.length > 100) throw new AppError(400, `Too many values for "${fieldName}"`);
        if (!value.every((item) => isScalar(item))) {
          throw new AppError(400, `Filter array for "${fieldName}" must contain scalar values`);
        }
        values.push(value);
        clauses.push(`${field.sql} = ANY($${valueIdx})`);
        break;
      }
      case 'gte':
      case 'lte': {
        if (!isScalar(value)) throw new AppError(400, `Filter value for "${fieldName}" must be scalar`);
        values.push(value);
        clauses.push(`${field.sql} ${operator === 'gte' ? '>=' : '<='} $${valueIdx}`);
        break;
      }
      default:
        throw new AppError(400, `Unsupported filter operator "${operator}"`);
    }
  }

  return clauses;
}

function normalizeLimit(rawLimit: unknown, maxAllowed: number): number {
  const limit = Number(rawLimit ?? 50);
  if (!Number.isFinite(limit)) return 50;
  return Math.max(1, Math.min(Math.trunc(limit), maxAllowed));
}

export function compileTableQuery(config: TableComponentConfig, maxAllowedRows = 500): CompiledQuery & { columns: string[] } {
  const dataset = ensureDataset(config.dataset);
  if (!Array.isArray(config.columns) || config.columns.length === 0) {
    throw new AppError(400, 'Table component requires at least one column');
  }
  if (config.columns.length > TABLE_COLUMN_ALIASES.length) {
    throw new AppError(400, 'A table component can have at most 12 columns');
  }

  const columns = config.columns.map((column) => String(column).trim());
  const selected = columns.map((key, index) => {
    const field = dataset.fields[key];
    const alias = TABLE_COLUMN_ALIASES[index];
    if (!field || !alias) throw new AppError(400, `Unsupported table column "${key}"`);
    return `${field.sql} AS "${alias}"`;
  });

  const values: unknown[] = [];
  const whereClauses = ['t.tenant_id = current_tenant_id()'];
  whereClauses.push(...compileFilters(dataset, ensureFilterArray(config.filters), values));

  let orderBy = 'ORDER BY t.created_at DESC';
  if (config.sort && typeof config.sort === 'object') {
    const sortField = dataset.fields[String(config.sort.field || '').trim()];
    if (!sortField || !sortField.sortable) {
      throw new AppError(400, `Unsupported sort field "${config.sort.field}"`);
    }
    orderBy = `ORDER BY ${sortField.sql} ${sortSql(config.sort.direction)}`;
  }

  const limit = normalizeLimit(config.limit, maxAllowedRows);
  values.push(limit);

  return {
    text: `SELECT t.id AS "_row_id", ${selected.join(', ')}
           FROM ${dataset.table} t
           WHERE ${whereClauses.join(' AND ')}
           ${orderBy}
           LIMIT $${values.length}`,
    values,
    columns,
  };
}

export function compileKpiQuery(config: KpiComponentConfig): CompiledQuery {
  const dataset = ensureDataset(config.dataset);
  const metric = String(config.metric || '').trim() as ReportKpiMetric;
  if (!metric || !['count', 'avg', 'sum'].includes(metric)) {
    throw new AppError(400, `Unsupported metric "${config.metric}"`);
  }

  let metricSql = 'count(*)::numeric AS value';
  if (metric === 'avg' || metric === 'sum') {
    const fieldName = String(config.metric_field || '').trim();
    const field = dataset.fields[fieldName];
    if (!field) throw new AppError(400, `Metric field "${fieldName}" is not allowed`);
    if (field.type !== 'number') {
      throw new AppError(400, `Metric "${metric}" requires a numeric field`);
    }
    metricSql = `${metric}(${field.sql})::numeric AS value`;
  }

  const values: unknown[] = [];
  const whereClauses = ['t.tenant_id = current_tenant_id()'];
  whereClauses.push(...compileFilters(dataset, ensureFilterArray(config.filters), values));

  return {
    text: `SELECT ${metricSql}
           FROM ${dataset.table} t
           WHERE ${whereClauses.join(' AND ')}`,
    values,
  };
}

export function compileChartQuery(config: ChartComponentConfig, maxBuckets = 20): CompiledQuery {
  const dataset = ensureDataset(config.dataset);
  const groupBy = String(config.group_by || '').trim();
  const groupField = dataset.fields[groupBy];
  if (!groupField || groupField.groupable !== true) {
    throw new AppError(400, `Chart group_by field "${groupBy}" is not allowed`);
  }

  const metric = String(config.metric || '').trim() as ReportKpiMetric;
  if (!metric || !['count', 'avg', 'sum'].includes(metric)) {
    throw new AppError(400, `Unsupported metric "${config.metric}"`);
  }

  let metricSql = 'count(*)::numeric';
  if (metric === 'avg' || metric === 'sum') {
    const fieldName = String(config.metric_field || '').trim();
    const metricField = dataset.fields[fieldName];
    if (!metricField || metricField.type !== 'number') {
      throw new AppError(400, `Metric field "${fieldName}" must be a numeric field`);
    }
    metricSql = `${metric}(${metricField.sql})::numeric`;
  }

  const values: unknown[] = [];
  const whereClauses = ['t.tenant_id = current_tenant_id()'];
  whereClauses.push(...compileFilters(dataset, ensureFilterArray(config.filters), values));

  const topN = normalizeLimit(config.top_n, maxBuckets);
  values.push(topN);

  return {
    text: `SELECT
             ${groupField.sql} AS raw_label,
             COALESCE(${groupField.sql}::text, '(empty)') AS label,
             ${metricSql} AS value
           FROM ${dataset.table} t
           WHERE ${whereClauses.join(' AND ')}
           GROUP BY ${groupField.sql}
           ORDER BY value DESC NULLS LAST
           LIMIT $${values.length}`,
    values,
  };
}

function readComponentId(raw: Record<string, unknown>): string | undefined {
  if (typeof raw.id !== 'string') return undefined;
  const id = raw.id.trim();
  if (!id || id.length > 80 || !/^[a-zA-Z0-9_-]+$/.test(id)) return undefined;
  return id;
}

export function normalizeComponentConfig(input: unknown): ReportComponentConfig {
  if (!input || typeof input !== 'object') throw new AppError(400, 'Invalid component config');
  const raw = input as Record<string, unknown>;
  const id = readComponentId(raw);
  const type = String(raw.type || '').trim() as ReportComponentType;
  if (type === 'table') {
    return {
      id,
      type,
      dataset: String(raw.dataset || '').trim() as ReportDatasetKey,
      columns: Array.isArray(raw.columns) ? raw.columns.map((col) => String(col)) : [],
      filters: ensureFilterArray(raw.filters),
      sort: raw.sort && typeof raw.sort === 'object'
        ? {
            field: String((raw.sort as Record<string, unknown>).field || ''),
            direction: String((raw.sort as Record<string, unknown>).direction || 'desc') as ReportSortDirection,
          }
        : null,
      limit: raw.limit as number | undefined,
    };
  }

  if (type === 'kpi') {
    return {
      id,
      type,
      dataset: String(raw.dataset || '').trim() as ReportDatasetKey,
      metric: String(raw.metric || '').trim() as ReportKpiMetric,
      metric_field: raw.metric_field ? String(raw.metric_field) : undefined,
      filters: ensureFilterArray(raw.filters),
    };
  }

  if (type === 'bar_chart' || type === 'pie_chart') {
    return {
      id,
      type,
      dataset: String(raw.dataset || '').trim() as ReportDatasetKey,
      group_by: String(raw.group_by || '').trim(),
      metric: String(raw.metric || '').trim() as ReportKpiMetric,
      metric_field: raw.metric_field ? String(raw.metric_field) : undefined,
      filters: ensureFilterArray(raw.filters),
      top_n: raw.top_n as number | undefined,
    };
  }

  throw new AppError(400, `Unsupported component type "${type}"`);
}

