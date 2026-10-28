/* SPDX-License-Identifier: AGPL-3.0-only */
import type { NoteCollector } from './report';
import type { FieldMapping } from './variables';

export type StepAlias = {
  stateId: string;
  kind: 'action' | 'approval' | 'loop' | 'subflow';
};

export type PillContext = {
  fields: Map<string, FieldMapping>;
  /** Lower-cased alias (ui_id, sys_id, "look_up_record_1", ...) -> converted state. */
  aliases: Map<string, StepAlias>;
  isSubflow: boolean;
  notes: NoteCollector;
};

const REQUEST_FIELD_MAP: Record<string, string> = {
  sys_id: 'request.id',
  number: 'request.number',
  state: 'request.status',
  stage: 'request.status',
  requested_for: 'request.requested_for',
  opened_by: 'request.requester_id',
  request: 'request.id',
  assigned_to: 'request.assigned_to',
};

/** Translates the inside of a `{{...}}` data pill to a Nova template path, or null when unknown. */
export function translatePillPath(raw: string, ctx: PillContext): string | null {
  const path = raw.trim().replace(/\s+/g, '');
  const parts = path.split('.');
  const head = (parts[0] ?? '').toLowerCase();

  if (head === 'trigger' || head === 'trigger_inputs') {
    let rest = parts.slice(1);
    if (['request_item', 'current', 'requested_item', 'ritm', 'table_record'].includes((rest[0] ?? '').toLowerCase())) {
      rest = rest.slice(1);
    }
    if ((rest[0] ?? '').toLowerCase() === 'variables' && rest[1]) {
      const mapping = ctx.fields.get(rest[1]);
      const fieldName = mapping?.fieldName ?? rest[1].toLowerCase();
      if (!mapping) ctx.notes.warn('pill_unknown_variable', `Data pill references unknown variable "${rest[1]}".`, path);
      return ['request.form_data', fieldName, ...rest.slice(2)].join('.');
    }
    if ((rest[0] ?? '').toLowerCase() === 'request' && rest[1]) rest = rest.slice(1);
    const field = (rest[0] ?? 'sys_id').toLowerCase();
    if (REQUEST_FIELD_MAP[field]) {
      if (rest.length > 1) {
        ctx.notes.warn('pill_dot_walk', `Dot-walked pill "${path}" is not supported; using ${REQUEST_FIELD_MAP[field]}.`, path);
      }
      return REQUEST_FIELD_MAP[field];
    }
    ctx.notes.warn('pill_request_field', `Request field "${field}" has no Nova equivalent; it will resolve to an empty value.`, path);
    return `request.${field}`;
  }

  if (head === 'flow_variables' || head === 'flowvariables' || (head === 'flow' && (parts[1] ?? '').toLowerCase() === 'variables')) {
    const rest = head === 'flow' ? parts.slice(2) : parts.slice(1);
    return ['vars', ...rest].join('.');
  }

  if (head === 'subflow' || head === 'subflow_inputs' || head === 'inputs') {
    if (!ctx.isSubflow) {
      ctx.notes.warn('pill_subflow_input', `Subflow input pill "${path}" used outside a subflow.`, path);
    }
    return ['request.form_data', ...parts.slice(1)].join('.');
  }

  const alias = ctx.aliases.get(head);
  if (alias) {
    const rest = parts.slice(1);
    if (alias.kind === 'loop') {
      const tail = rest[0] && ['item', 'current_item', 'currentitem'].includes(rest[0].toLowerCase()) ? rest.slice(1) : rest;
      return ['loop', alias.stateId, 'item', ...tail].join('.');
    }
    if (alias.kind === 'approval') {
      return `state.${alias.stateId}.body.outcome`;
    }
    if (alias.kind === 'subflow') {
      ctx.notes.warn('pill_subflow_output', `Subflow output pill "${path}" maps to the sub-workflow result; verify it.`, path);
      return ['state', alias.stateId, 'body', ...rest].join('.');
    }
    // Record outputs ("Record", "Records") wrap the created/found record in ServiceNow.
    const tail = rest[0] && ['record', 'records', 'output', 'outputs'].includes(rest[0].toLowerCase()) ? rest.slice(1) : rest;
    return ['state', alias.stateId, 'body', ...tail].join('.');
  }

  return null;
}

const PILL_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

/** Rewrites every data pill in a string; unknown pills are left as-is and reported. */
export function translateTemplate(value: string, ctx: PillContext): string {
  return value.replace(PILL_RE, (whole, inner: string) => {
    const mapped = translatePillPath(inner, ctx);
    if (mapped === null) {
      ctx.notes.warn('pill_unresolved', `Data pill "${inner}" could not be translated.`, inner);
      return whole;
    }
    return `{{${mapped}}}`;
  });
}

/** Returns the Nova path when the whole value is exactly one pill. */
export function singlePillPath(value: string, ctx: PillContext): string | null {
  const m = /^\{\{\s*([^}]+?)\s*\}\}$/.exec(value.trim());
  if (!m) return null;
  return translatePillPath(m[1], ctx);
}

export function translateUnknown(value: unknown, ctx: PillContext): unknown {
  if (typeof value === 'string') return translateTemplate(value, ctx);
  if (Array.isArray(value)) return value.map((v) => translateUnknown(v, ctx));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = translateUnknown(v, ctx);
    return out;
  }
  return value;
}

/** The ServiceNow variable referenced by a pill, used to map literal values in conditions. */
export function pillFieldMapping(raw: string, ctx: PillContext): FieldMapping | null {
  const m = /^\{\{\s*([^}]+?)\s*\}\}$/.exec(raw.trim());
  const path = (m ? m[1] : raw).replace(/\s+/g, '');
  const vm = /(?:^|\.)variables\.([^.]+)/.exec(path);
  return vm ? ctx.fields.get(vm[1]) ?? null : null;
}
