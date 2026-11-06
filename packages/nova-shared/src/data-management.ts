/* SPDX-License-Identifier: AGPL-3.0-only */
import { z } from 'zod';

export const DATA_MANAGEMENT_CHUNK_SIZE = 500;
export const DATA_MANAGEMENT_SAMPLE_LIMIT = 20;

export const DATA_MANAGEMENT_ACTIONS = ['delete', 'archive'] as const;
export type DataManagementAction = (typeof DATA_MANAGEMENT_ACTIONS)[number];

export const DATA_MANAGEMENT_OPERATORS = ['eq', 'neq', 'contains', 'in', 'gte', 'lte', 'older_than'] as const;
export type DataManagementOperator = (typeof DATA_MANAGEMENT_OPERATORS)[number];

export const DATA_MANAGEMENT_UNITS = ['days', 'months', 'years'] as const;
export type DataManagementUnit = (typeof DATA_MANAGEMENT_UNITS)[number];

type FieldType = 'text' | 'number' | 'boolean' | 'timestamp';

type FieldSpec = {
  sql: string;
  type: FieldType;
};

const INCIDENT_FIELDS: Record<string, FieldSpec> = {
  number: { sql: 't.number', type: 'text' },
  title: { sql: 't.title', type: 'text' },
  status: { sql: 't.status::text', type: 'text' },
  priority: { sql: 't.priority', type: 'number' },
  category: { sql: 't.category', type: 'text' },
  sla_breached: { sql: 't.sla_breached', type: 'boolean' },
  created_at: { sql: 't.created_at', type: 'timestamp' },
  updated_at: { sql: 't.updated_at', type: 'timestamp' },
  resolved_at: { sql: 't.resolved_at', type: 'timestamp' },
  closed_at: { sql: 't.closed_at', type: 'timestamp' },
  assigned_to: { sql: 't.assigned_to::text', type: 'text' },
  caller_id: { sql: 't.caller_id::text', type: 'text' },
};

const OPERATORS_BY_TYPE: Record<FieldType, readonly DataManagementOperator[]> = {
  text: ['eq', 'neq', 'contains', 'in'],
  number: ['eq', 'neq', 'in', 'gte', 'lte'],
  boolean: ['eq', 'neq'],
  timestamp: ['eq', 'neq', 'gte', 'lte', 'older_than'],
};

const INTERVAL_SQL: Record<DataManagementUnit, string> = {
  days: "INTERVAL '1 day'",
  months: "INTERVAL '1 month'",
  years: "INTERVAL '1 year'",
};

const olderThanValue = z.object({
  amount: z.number().int().min(1).max(3650),
  unit: z.enum(DATA_MANAGEMENT_UNITS),
}).strict();

const scalarValue = z.union([
  z.string().trim().min(1).max(500),
  z.number().finite(),
  z.boolean(),
]);

export const dataManagementFilterSchema = z.object({
  field: z.string().trim().min(1).max(64),
  operator: z.enum(DATA_MANAGEMENT_OPERATORS),
  value: z.union([
    scalarValue,
    z.array(scalarValue).min(1).max(100),
    olderThanValue,
  ]),
}).strict();

export type DataManagementFilter = z.infer<typeof dataManagementFilterSchema>;

export const dataManagementPreviewSchema = z.object({
  target: z.literal('incidents'),
  action: z.enum(DATA_MANAGEMENT_ACTIONS),
  filters: z.array(dataManagementFilterSchema).min(1).max(20),
  include_open: z.boolean().optional().default(false),
}).strict();

export const dataManagementJobRequestSchema = dataManagementPreviewSchema.extend({
  confirm_count: z.number().int().nonnegative(),
}).strict();

export type DataManagementPreviewRequest = z.infer<typeof dataManagementPreviewSchema>;
export type DataManagementJobRequest = z.infer<typeof dataManagementJobRequestSchema>;

export interface DataManagementFieldCatalog {
  key: string;
  type: FieldType;
  operators: DataManagementOperator[];
}

export interface DataManagementTargetCatalog {
  key: 'incidents';
  actions: DataManagementAction[];
  fields: DataManagementFieldCatalog[];
}

export interface CompiledMatch {
  where: string;
  values: unknown[];
}

export interface IncidentMatchOptions {
  includeOpen?: boolean;
  onlyActive?: boolean;
}

export class DataManagementQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataManagementQueryError';
  }
}

export function listDataManagementTargets(): DataManagementTargetCatalog[] {
  return [{
    key: 'incidents',
    actions: [...DATA_MANAGEMENT_ACTIONS],
    fields: Object.entries(INCIDENT_FIELDS).map(([key, field]) => ({
      key,
      type: field.type,
      operators: [...OPERATORS_BY_TYPE[field.type]],
    })),
  }];
}

export function compileIncidentMatch(filters: unknown, options: IncidentMatchOptions = {}): CompiledMatch {
  const parsed = z.array(dataManagementFilterSchema).min(1).max(20).safeParse(filters);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join('; ') || 'Invalid filters';
    throw new DataManagementQueryError(message);
  }

  const values: unknown[] = [];
  const clauses: string[] = [];
  if (!options.includeOpen) {
    clauses.push(`t.status::text IN ('closed', 'cancelled')`);
  }
  if (options.onlyActive) {
    clauses.push('t.is_active = true');
  }

  for (const filter of parsed.data) {
    clauses.push(compileFilter(filter, values));
  }

  return { where: clauses.join(' AND '), values };
}

export function incidentCountSql(match: CompiledMatch): { text: string; values: unknown[] } {
  return {
    text: `SELECT count(*)::int AS count FROM incidents t WHERE ${match.where}`,
    values: match.values,
  };
}

export function incidentSampleSql(match: CompiledMatch): { text: string; values: unknown[] } {
  const limitParam = match.values.length + 1;
  return {
    text: `SELECT t.number, t.title, t.status::text AS status, t.created_at, t.closed_at
           FROM incidents t
           WHERE ${match.where}
           ORDER BY t.created_at ASC
           LIMIT $${limitParam}`,
    values: [...match.values, DATA_MANAGEMENT_SAMPLE_LIMIT],
  };
}

export function incidentIdPageSql(match: CompiledMatch): string {
  const cursorParam = match.values.length + 1;
  const limitParam = match.values.length + 2;
  return `SELECT t.id::text AS id
          FROM incidents t
          WHERE ${match.where}
            AND ($${cursorParam}::uuid IS NULL OR t.id > $${cursorParam}::uuid)
          ORDER BY t.id
          LIMIT $${limitParam}`;
}

function compileFilter(filter: DataManagementFilter, values: unknown[]): string {
  const field = INCIDENT_FIELDS[filter.field];
  if (!field) throw new DataManagementQueryError(`Unsupported filter field "${filter.field}"`);
  if (!OPERATORS_BY_TYPE[field.type].includes(filter.operator)) {
    throw new DataManagementQueryError(`Operator "${filter.operator}" is not allowed for ${filter.field}`);
  }

  const valueIdx = values.length + 1;
  switch (filter.operator) {
    case 'eq':
    case 'neq':
      values.push(expectScalar(filter, field.type));
      return `${field.sql} ${filter.operator === 'eq' ? '=' : '!='} ${param(field.type, valueIdx)}`;
    case 'contains':
      if (typeof filter.value !== 'string') {
        throw new DataManagementQueryError(`Filter value for "${filter.field}" must be text`);
      }
      values.push(filter.value);
      return `${field.sql} ILIKE '%' || $${valueIdx} || '%'`;
    case 'in': {
      if (!Array.isArray(filter.value)) {
        throw new DataManagementQueryError(`Filter value for "${filter.field}" must be a list`);
      }
      const items = filter.value.map((item) => expectListItem(filter.field, field.type, item));
      values.push(items);
      const arrayCast = field.type === 'number' ? '::numeric[]' : '::text[]';
      return `${field.sql} = ANY($${valueIdx}${arrayCast})`;
    }
    case 'gte':
    case 'lte':
      values.push(expectScalar(filter, field.type));
      return `${field.sql} ${filter.operator === 'gte' ? '>=' : '<='} ${param(field.type, valueIdx)}`;
    case 'older_than': {
      const relative = olderThanValue.safeParse(filter.value);
      if (!relative.success) {
        throw new DataManagementQueryError(`Filter value for "${filter.field}" must be an amount and unit`);
      }
      values.push(relative.data.amount);
      return `${field.sql} < NOW() - ($${valueIdx} * ${INTERVAL_SQL[relative.data.unit]})`;
    }
    default:
      throw new DataManagementQueryError(`Unsupported filter operator "${filter.operator}"`);
  }
}

function param(type: FieldType, index: number): string {
  return type === 'timestamp' ? `$${index}::timestamptz` : `$${index}`;
}

function expectScalar(filter: DataManagementFilter, type: FieldType): string | number | boolean {
  if (Array.isArray(filter.value) || (filter.value !== null && typeof filter.value === 'object')) {
    throw new DataManagementQueryError(`Filter value for "${filter.field}" must be a single value`);
  }
  if (type === 'text') {
    if (typeof filter.value !== 'string' || filter.value.trim() === '') {
      throw new DataManagementQueryError(`Filter value for "${filter.field}" must be text`);
    }
    return filter.value;
  }
  if (type === 'number') {
    if (typeof filter.value !== 'number' || !Number.isFinite(filter.value)) {
      throw new DataManagementQueryError(`Filter value for "${filter.field}" must be a number`);
    }
    return filter.value;
  }
  if (type === 'boolean') {
    if (typeof filter.value !== 'boolean') {
      throw new DataManagementQueryError(`Filter value for "${filter.field}" must be true or false`);
    }
    return filter.value;
  }
  if (typeof filter.value !== 'string' || Number.isNaN(Date.parse(filter.value))) {
    throw new DataManagementQueryError(`Filter value for "${filter.field}" must be a timestamp`);
  }
  return filter.value;
}

function expectListItem(field: string, type: FieldType, item: string | number | boolean): string | number {
  if (type === 'number') {
    if (typeof item !== 'number' || !Number.isFinite(item)) {
      throw new DataManagementQueryError(`Filter list for "${field}" must contain numbers`);
    }
    return item;
  }
  if (typeof item !== 'string' || item.trim() === '') {
    throw new DataManagementQueryError(`Filter list for "${field}" must contain text`);
  }
  return item;
}
