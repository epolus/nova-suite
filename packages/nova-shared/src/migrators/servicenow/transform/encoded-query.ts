/* SPDX-License-Identifier: AGPL-3.0-only */
import type { AdvancedCondition } from '../../../automation-config';
import { pillFieldMapping, singlePillPath, translatePillPath, type PillContext } from './pills';

export type EncodedTerm = { field: string; op: string; value: string };

/** Longest operators first so "!=" is not read as "=" and "NOT IN" not as "IN". */
const OPERATORS = [
  'ISNOTEMPTY', 'ISEMPTY', 'ANYTHING', 'EMPTYSTRING',
  'NOT IN', 'NOT LIKE', 'NOTLIKE', 'NOTIN', 'STARTSWITH', 'ENDSWITH', 'DOESNOTCONTAIN', 'BETWEEN',
  'SAMEAS', 'NSAMEAS', 'VALCHANGES', 'CHANGESFROM', 'CHANGESTO', 'MORETHAN', 'LESSTHAN',
  'LIKE', 'IN',
  '!=', '>=', '<=', '=', '>', '<',
];

/** Splits a term into field/op/value, ignoring operator-like text inside `{{pills}}`. */
export function parseTerm(raw: string): EncodedTerm | null {
  const term = raw.trim();
  if (!term) return null;
  let depth = 0;
  for (let i = 0; i < term.length; i += 1) {
    if (term.startsWith('{{', i)) { depth += 1; i += 1; continue; }
    if (term.startsWith('}}', i)) { depth = Math.max(0, depth - 1); i += 1; continue; }
    if (depth > 0 || i === 0) continue;
    for (const op of OPERATORS) {
      if (term.startsWith(op, i)) {
        return { field: term.slice(0, i), op, value: term.slice(i + op.length) };
      }
    }
  }
  return null;
}

/** Splits on a separator only outside `{{pills}}`. */
function splitOutsidePills(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i += 1) {
    if (s.startsWith('{{', i)) { depth += 1; i += 1; continue; }
    if (s.startsWith('}}', i)) { depth = Math.max(0, depth - 1); i += 1; continue; }
    if (depth === 0 && s.startsWith(sep, i)) {
      out.push(s.slice(start, i));
      start = i + sep.length;
      i += sep.length - 1;
    }
  }
  out.push(s.slice(start));
  return out;
}

/** Parses `a=1^ORb=2^c=3^NQd=4` into OR-of-AND-of-OR groups. */
export function parseEncodedQuery(query: string): EncodedTerm[][][] {
  return splitOutsidePills(query.replace(/\^EQ$/, ''), '^NQ').map((group) => {
    const ands: EncodedTerm[][] = [];
    for (const part of splitOutsidePills(group, '^')) {
      if (!part || part.startsWith('ORDERBY')) continue;
      if (part.startsWith('OR') && ands.length > 0) {
        const t = parseTerm(part.slice(2));
        if (t) ands[ands.length - 1].push(t);
        continue;
      }
      const t = parseTerm(part);
      if (t) ands.push([t]);
    }
    return ands;
  }).filter((g) => g.length > 0);
}

const ALWAYS_TRUE: AdvancedCondition = { op: 'eq', left: 1, right: 1 };
/** Fail-closed for unknown/unparsed operators so branches do not silently always run. */
const ALWAYS_FALSE: AdvancedCondition = { op: 'eq', left: 1, right: 0 };

function combine(op: 'and' | 'or', conditions: AdvancedCondition[]): AdvancedCondition {
  if (conditions.length === 0) return ALWAYS_TRUE;
  if (conditions.length === 1) return conditions[0];
  return { op, conditions };
}

function termToCondition(term: EncodedTerm, ctx: PillContext): AdvancedCondition {
  const leftPath = singlePillPath(term.field, ctx) ?? translatePillPath(term.field, ctx);
  let left: unknown;
  let mapping = pillFieldMapping(term.field, ctx);
  if (leftPath) left = { var: leftPath };
  else {
    mapping = ctx.fields.get(term.field) ?? null;
    if (!mapping) {
      ctx.notes.warn('condition_field', `Condition field "${term.field}" is not a data pill; assuming a request form field.`, term.field);
    }
    left = { var: `request.form_data.${mapping?.fieldName ?? term.field}` };
  }
  const literal = (v: string): unknown => {
    const pill = singlePillPath(v, ctx);
    if (pill) return { var: pill };
    return mapping ? mapping.mapValue(v) : v;
  };
  const list = (v: string) => v.split(',').map((x) => literal(x.trim()));

  switch (term.op) {
    case '=':
    case 'SAMEAS':
      return { op: 'eq', left, right: literal(term.value) };
    case '!=':
    case 'NSAMEAS':
      return { op: 'ne', left, right: literal(term.value) };
    case '>':
    case 'MORETHAN':
      return { op: 'gt', left, right: literal(term.value) };
    case '>=':
      return { op: 'gte', left, right: literal(term.value) };
    case '<':
    case 'LESSTHAN':
      return { op: 'lt', left, right: literal(term.value) };
    case '<=':
      return { op: 'lte', left, right: literal(term.value) };
    case 'LIKE':
      return { op: 'contains', left, right: literal(term.value) };
    case 'STARTSWITH':
    case 'ENDSWITH':
      ctx.notes.warn('condition_approximated', `${term.op} is approximated with "contains".`, term.field);
      return { op: 'contains', left, right: literal(term.value) };
    case 'NOT LIKE':
    case 'NOTLIKE':
    case 'DOESNOTCONTAIN':
      return { op: 'not', condition: { op: 'contains', left, right: literal(term.value) } };
    case 'IN':
      return { op: 'in', left, right: list(term.value) };
    case 'NOT IN':
    case 'NOTIN':
      return { op: 'not', condition: { op: 'in', left, right: list(term.value) } };
    case 'ISEMPTY':
    case 'EMPTYSTRING':
      return { op: 'in', left, right: ['', null] };
    case 'ISNOTEMPTY':
      return { op: 'not', condition: { op: 'in', left, right: ['', null] } };
    case 'ANYTHING':
      return ALWAYS_TRUE;
    default:
      ctx.notes.warn('condition_operator', `Condition operator ${term.op} is not supported; treated as false.`, term.field);
      return ALWAYS_FALSE;
  }
}

export function encodedQueryToCondition(query: string, ctx: PillContext): AdvancedCondition {
  const q = query.trim();
  if (!q) return ALWAYS_TRUE;
  const groups = parseEncodedQuery(q);
  if (groups.length === 0) {
    ctx.notes.warn('condition_unparsed', `Condition "${q.slice(0, 120)}" could not be parsed; treated as false.`);
    return ALWAYS_FALSE;
  }
  return combine(
    'or',
    groups.map((ands) => combine('and', ands.map((ors) => combine('or', ors.map((t) => termToCondition(t, ctx)))))),
  );
}

/** Encoded `field=value^field2=value2` assignments, as used by Create/Update Record inputs. */
export function parseFieldAssignments(raw: string): Array<{ field: string; value: string }> {
  const out: Array<{ field: string; value: string }> = [];
  for (const part of splitOutsidePills(raw, '^')) {
    const t = parseTerm(part);
    if (t && t.op === '=') out.push({ field: t.field, value: t.value });
  }
  return out;
}
