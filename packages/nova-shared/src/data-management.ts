/* SPDX-License-Identifier: AGPL-3.0-only */
import { z } from 'zod';

export const DATA_MANAGEMENT_CHUNK_SIZE = 500;
export const DATA_MANAGEMENT_SAMPLE_LIMIT = 20;

export const DATA_MANAGEMENT_ACTIONS = ['delete', 'archive'] as const;
export type DataManagementAction = (typeof DATA_MANAGEMENT_ACTIONS)[number];

export const DATA_MANAGEMENT_TARGET_KEYS = [
  'incidents',
  'requests',
  'configuration_items',
  'assets',
  'problems',
  'changes',
  'knowledge_articles',
  'alerts',
  'releases',
  'improvements',
] as const;
export type DataManagementTargetKey = (typeof DATA_MANAGEMENT_TARGET_KEYS)[number];

export const DATA_MANAGEMENT_OPERATORS = ['eq', 'neq', 'contains', 'in', 'gte', 'lte', 'older_than'] as const;
export type DataManagementOperator = (typeof DATA_MANAGEMENT_OPERATORS)[number];

export const DATA_MANAGEMENT_UNITS = ['days', 'months', 'years'] as const;
export type DataManagementUnit = (typeof DATA_MANAGEMENT_UNITS)[number];

type FieldType = 'text' | 'number' | 'boolean' | 'timestamp';

type FieldSpec = {
  sql: string;
  type: FieldType;
};

type TargetSpec = {
  table: string;
  actions: readonly DataManagementAction[];
  fields: Record<string, FieldSpec>;
  statusSql: string;
  closedStatuses: readonly string[];
  sampleFrom: string;
  sampleColumns: string;
  cleanupEntityTypes: readonly string[];
  beforeDelete: readonly string[];
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

const BOTH_ACTIONS = DATA_MANAGEMENT_ACTIONS;
const DELETE_ONLY = ['delete'] as const;

function column(name: string): string {
  if (!/^[a-z_]+$/.test(name)) throw new Error(`Invalid column ${name}`);
  return `t.${name}`;
}

function text(name: string): FieldSpec {
  return { sql: column(name), type: 'text' };
}

function asText(name: string): FieldSpec {
  return { sql: `${column(name)}::text`, type: 'text' };
}

function numberField(name: string): FieldSpec {
  return { sql: column(name), type: 'number' };
}

function bool(name: string): FieldSpec {
  return { sql: column(name), type: 'boolean' };
}

function timestamp(name: string): FieldSpec {
  return { sql: column(name), type: 'timestamp' };
}

function dateAsTimestamp(name: string): FieldSpec {
  return { sql: `${column(name)}::timestamptz`, type: 'timestamp' };
}

const RECORD_SAMPLE = 't.number, t.title, t.status::text AS status, t.created_at, t.closed_at';

const TARGETS: Record<DataManagementTargetKey, TargetSpec> = {
  incidents: {
    table: 'incidents',
    actions: BOTH_ACTIONS,
    statusSql: 't.status::text',
    closedStatuses: ['closed', 'cancelled'],
    sampleFrom: 'incidents t',
    sampleColumns: RECORD_SAMPLE,
    cleanupEntityTypes: ['incident'],
    beforeDelete: [],
    fields: {
      number: text('number'),
      title: text('title'),
      status: asText('status'),
      priority: numberField('priority'),
      category: text('category'),
      sla_breached: bool('sla_breached'),
      created_at: timestamp('created_at'),
      updated_at: timestamp('updated_at'),
      resolved_at: timestamp('resolved_at'),
      closed_at: timestamp('closed_at'),
      assigned_to: asText('assigned_to'),
      caller_id: asText('caller_id'),
    },
  },
  requests: {
    table: 'requests',
    actions: BOTH_ACTIONS,
    statusSql: 't.status',
    closedStatuses: ['fulfilled', 'rejected', 'cancelled'],
    sampleFrom: 'requests t LEFT JOIN service_items si ON si.id = t.service_item_id',
    sampleColumns: 't.number, COALESCE(si.name, t.number) AS title, t.status AS status, t.created_at, NULL::timestamptz AS closed_at',
    cleanupEntityTypes: ['request'],
    beforeDelete: [
      'UPDATE incidents SET request_id = NULL WHERE request_id = ANY($1::uuid[])',
    ],
    fields: {
      number: text('number'),
      status: text('status'),
      priority: text('priority'),
      notes: text('notes'),
      created_at: timestamp('created_at'),
      updated_at: timestamp('updated_at'),
      approved_at: timestamp('approved_at'),
      requester_id: asText('requester_id'),
    },
  },
  configuration_items: {
    table: 'configuration_items',
    actions: BOTH_ACTIONS,
    statusSql: 't.status::text',
    closedStatuses: ['retired'],
    sampleFrom: 'configuration_items t',
    sampleColumns: 't.name AS number, COALESCE(t.display_name, t.name) AS title, t.status::text AS status, t.created_at, NULL::timestamptz AS closed_at',
    cleanupEntityTypes: ['configuration_item', 'ci'],
    beforeDelete: [
      'UPDATE incidents SET configuration_item_id = NULL WHERE configuration_item_id = ANY($1::uuid[])',
    ],
    fields: {
      name: text('name'),
      display_name: text('display_name'),
      status: asText('status'),
      environment: text('environment'),
      created_at: timestamp('created_at'),
      updated_at: timestamp('updated_at'),
      assigned_to: asText('assigned_to'),
    },
  },
  assets: {
    table: 'assets',
    actions: DELETE_ONLY,
    statusSql: 't.status',
    closedStatuses: ['retired', 'disposed'],
    sampleFrom: 'assets t',
    sampleColumns: 't.asset_tag AS number, t.name AS title, t.status AS status, t.created_at, NULL::timestamptz AS closed_at',
    cleanupEntityTypes: ['asset'],
    beforeDelete: [],
    fields: {
      asset_tag: text('asset_tag'),
      name: text('name'),
      category: text('category'),
      status: text('status'),
      purchase_date: dateAsTimestamp('purchase_date'),
      warranty_expires_at: dateAsTimestamp('warranty_expires_at'),
      created_at: timestamp('created_at'),
      updated_at: timestamp('updated_at'),
    },
  },
  problems: {
    table: 'problems',
    actions: BOTH_ACTIONS,
    statusSql: 't.status::text',
    closedStatuses: ['closed'],
    sampleFrom: 'problems t',
    sampleColumns: RECORD_SAMPLE,
    cleanupEntityTypes: ['problem'],
    beforeDelete: [],
    fields: {
      number: text('number'),
      title: text('title'),
      status: asText('status'),
      priority: text('priority'),
      category: text('category'),
      sla_breached: bool('sla_breached'),
      created_at: timestamp('created_at'),
      updated_at: timestamp('updated_at'),
      resolved_at: timestamp('resolved_at'),
      closed_at: timestamp('closed_at'),
      assigned_to: asText('assigned_to'),
    },
  },
  changes: {
    table: 'changes',
    actions: BOTH_ACTIONS,
    statusSql: 't.status::text',
    closedStatuses: ['closed', 'cancelled', 'rejected'],
    sampleFrom: 'changes t',
    sampleColumns: 't.number, t.title, t.status::text AS status, t.created_at, t.actual_end AS closed_at',
    cleanupEntityTypes: ['change'],
    beforeDelete: [],
    fields: {
      number: text('number'),
      title: text('title'),
      status: asText('status'),
      priority: asText('priority'),
      category: text('category'),
      risk_level: asText('risk_level'),
      sla_breached: bool('sla_breached'),
      created_at: timestamp('created_at'),
      updated_at: timestamp('updated_at'),
      scheduled_start: timestamp('scheduled_start'),
      scheduled_end: timestamp('scheduled_end'),
      actual_end: timestamp('actual_end'),
    },
  },
  knowledge_articles: {
    table: 'knowledge_articles',
    actions: BOTH_ACTIONS,
    statusSql: 't.status::text',
    closedStatuses: ['retired'],
    sampleFrom: 'knowledge_articles t',
    sampleColumns: 't.number, t.title, t.status::text AS status, t.created_at, NULL::timestamptz AS closed_at',
    cleanupEntityTypes: ['knowledge_article', 'knowledge'],
    beforeDelete: [],
    fields: {
      number: text('number'),
      title: text('title'),
      status: asText('status'),
      created_at: timestamp('created_at'),
      updated_at: timestamp('updated_at'),
    },
  },
  alerts: {
    table: 'alerts',
    actions: DELETE_ONLY,
    statusSql: 't.status',
    closedStatuses: ['resolved'],
    sampleFrom: 'alerts t',
    sampleColumns: 't.number, t.title, t.status AS status, t.created_at, t.resolved_at AS closed_at',
    cleanupEntityTypes: ['alert'],
    beforeDelete: [],
    fields: {
      number: text('number'),
      title: text('title'),
      status: text('status'),
      severity: text('severity'),
      source: text('source'),
      created_at: timestamp('created_at'),
      updated_at: timestamp('updated_at'),
      first_seen_at: timestamp('first_seen_at'),
      last_seen_at: timestamp('last_seen_at'),
      resolved_at: timestamp('resolved_at'),
    },
  },
  releases: {
    table: 'releases',
    actions: DELETE_ONLY,
    statusSql: 't.status',
    closedStatuses: ['deployed', 'cancelled'],
    sampleFrom: 'releases t',
    sampleColumns: 't.number, t.title, t.status AS status, t.created_at, t.deployed_at AS closed_at',
    cleanupEntityTypes: ['release'],
    beforeDelete: [],
    fields: {
      number: text('number'),
      title: text('title'),
      status: text('status'),
      release_type: text('release_type'),
      risk_level: text('risk_level'),
      created_at: timestamp('created_at'),
      updated_at: timestamp('updated_at'),
      planned_start: timestamp('planned_start'),
      planned_end: timestamp('planned_end'),
      deployed_at: timestamp('deployed_at'),
    },
  },
  improvements: {
    table: 'improvements',
    actions: DELETE_ONLY,
    statusSql: 't.status',
    closedStatuses: ['done', 'cancelled'],
    sampleFrom: 'improvements t',
    sampleColumns: 't.number, t.title, t.status AS status, t.created_at, NULL::timestamptz AS closed_at',
    cleanupEntityTypes: ['improvement'],
    beforeDelete: [],
    fields: {
      number: text('number'),
      title: text('title'),
      status: text('status'),
      source_type: text('source_type'),
      created_at: timestamp('created_at'),
      updated_at: timestamp('updated_at'),
    },
  },
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

const dataManagementRequestObject = z.object({
  target: z.enum(DATA_MANAGEMENT_TARGET_KEYS),
  action: z.enum(DATA_MANAGEMENT_ACTIONS),
  filters: z.array(dataManagementFilterSchema).min(1).max(20),
  include_open: z.boolean().optional().default(false),
}).strict();

function refineTargetAction(
  value: { target: DataManagementTargetKey; action: DataManagementAction },
  ctx: z.RefinementCtx,
): void {
  if (!TARGETS[value.target].actions.includes(value.action)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['action'],
      message: `Action "${value.action}" is not allowed for ${value.target}`,
    });
  }
}

export const dataManagementPreviewSchema = dataManagementRequestObject.superRefine(refineTargetAction);

export const dataManagementJobRequestSchema = dataManagementRequestObject.extend({
  confirm_count: z.number().int().nonnegative(),
}).superRefine(refineTargetAction);

export type DataManagementPreviewRequest = z.infer<typeof dataManagementPreviewSchema>;
export type DataManagementJobRequest = z.infer<typeof dataManagementJobRequestSchema>;

export interface DataManagementFieldCatalog {
  key: string;
  type: FieldType;
  operators: DataManagementOperator[];
}

export interface DataManagementTargetCatalog {
  key: DataManagementTargetKey;
  actions: DataManagementAction[];
  closed_statuses: string[];
  fields: DataManagementFieldCatalog[];
}

export interface CompiledMatch {
  where: string;
  values: unknown[];
}

export interface DataManagementMatchOptions {
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
  return DATA_MANAGEMENT_TARGET_KEYS.map((key) => {
    const spec = TARGETS[key];
    return {
      key,
      actions: [...spec.actions],
      closed_statuses: [...spec.closedStatuses],
      fields: Object.entries(spec.fields).map(([fieldKey, field]) => ({
        key: fieldKey,
        type: field.type,
        operators: [...OPERATORS_BY_TYPE[field.type]],
      })),
    };
  });
}

export interface DataManagementTargetExecution {
  table: string;
  actions: readonly DataManagementAction[];
  cleanupEntityTypes: readonly string[];
  beforeDelete: readonly string[];
}

function requireTarget(target: string): TargetSpec {
  if (!isTargetKey(target)) throw new DataManagementQueryError(`Unsupported target "${target}"`);
  return TARGETS[target];
}

export function dataManagementTargetSpec(target: string): DataManagementTargetExecution {
  return requireTarget(target);
}

export function compileDataManagementMatch(
  target: string,
  filters: unknown,
  options: DataManagementMatchOptions = {},
): CompiledMatch {
  const spec = requireTarget(target);
  const parsed = z.array(dataManagementFilterSchema).min(1).max(20).safeParse(filters);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join('; ') || 'Invalid filters';
    throw new DataManagementQueryError(message);
  }

  const values: unknown[] = [];
  const clauses: string[] = [];
  if (!options.includeOpen) {
    clauses.push(`${spec.statusSql} IN (${spec.closedStatuses.map(quoteLiteral).join(', ')})`);
  }
  if (options.onlyActive) {
    if (!spec.actions.includes('archive')) {
      throw new DataManagementQueryError(`Action "archive" is not allowed for ${target}`);
    }
    clauses.push('t.is_active = true');
  }

  for (const filter of parsed.data) {
    clauses.push(compileFilter(spec, filter, values));
  }

  return { where: clauses.join(' AND '), values };
}

export function dataManagementCountSql(target: string, match: CompiledMatch): { text: string; values: unknown[] } {
  const spec = requireTarget(target);
  return {
    text: `SELECT count(*)::int AS count FROM ${spec.table} t WHERE ${match.where}`,
    values: match.values,
  };
}

export function dataManagementSampleSql(target: string, match: CompiledMatch): { text: string; values: unknown[] } {
  const spec = requireTarget(target);
  const limitParam = match.values.length + 1;
  return {
    text: `SELECT ${spec.sampleColumns}
           FROM ${spec.sampleFrom}
           WHERE ${match.where}
           ORDER BY t.created_at ASC
           LIMIT $${limitParam}`,
    values: [...match.values, DATA_MANAGEMENT_SAMPLE_LIMIT],
  };
}

export function dataManagementIdPageSql(target: string, match: CompiledMatch): string {
  const spec = requireTarget(target);
  const cursorParam = match.values.length + 1;
  const limitParam = match.values.length + 2;
  return `SELECT t.id::text AS id
          FROM ${spec.table} t
          WHERE ${match.where}
            AND ($${cursorParam}::uuid IS NULL OR t.id > $${cursorParam}::uuid)
          ORDER BY t.id
          LIMIT $${limitParam}`;
}

function isTargetKey(value: string): value is DataManagementTargetKey {
  return (DATA_MANAGEMENT_TARGET_KEYS as readonly string[]).includes(value);
}

function quoteLiteral(value: string): string {
  if (!/^[a-z_]+$/.test(value)) throw new DataManagementQueryError('Invalid status value');
  return `'${value}'`;
}

function compileFilter(spec: TargetSpec, filter: DataManagementFilter, values: unknown[]): string {
  const field = spec.fields[filter.field];
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
