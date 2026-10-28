/* SPDX-License-Identifier: AGPL-3.0-only */
import type { SnQuestionChoice, SnVariable } from '../raw-schemas';
import type { NoteCollector } from './report';
import { htmlToText, truncate } from './text';

export type NovaFormFieldType =
  | 'text'
  | 'textarea'
  | 'date'
  | 'number'
  | 'email'
  | 'checkbox'
  | 'select'
  | 'multiselect'
  | 'cmdb_ref'
  | 'user_ref';

export type NovaFormField = {
  name: string;
  label?: string;
  type: NovaFormFieldType;
  required?: boolean;
  options?: string[];
  placeholder?: string;
  helpText?: string;
  min?: number;
  max?: number;
  pattern?: string;
  defaultValue?: string;
};

/** How a ServiceNow variable maps onto the Nova form; used to translate data pills and conditions. */
export type FieldMapping = {
  snName: string;
  fieldName: string;
  type: NovaFormFieldType;
  /** Converts a ServiceNow stored value (e.g. a choice value) to what Nova stores. */
  mapValue: (v: string) => unknown;
};

/** ServiceNow item_option_new.type codes. */
export const SN_VARIABLE_TYPES: Record<number, string> = {
  1: 'Yes / No',
  2: 'Multi Line Text',
  3: 'Multiple Choice',
  4: 'Numeric Scale',
  5: 'Select Box',
  6: 'Single Line Text',
  7: 'CheckBox',
  8: 'Reference',
  9: 'Date',
  10: 'Date/Time',
  11: 'Label',
  12: 'Break',
  14: 'Custom',
  15: 'UI Page',
  16: 'Wide Single Line Text',
  17: 'Custom with Label',
  18: 'Lookup Select Box',
  19: 'Container Start',
  20: 'Container End',
  21: 'List Collector',
  22: 'Lookup Multiple Choice',
  23: 'HTML',
  24: 'Container Split',
  25: 'Masked',
  26: 'Email',
  27: 'URL',
  28: 'IP Address',
  29: 'Duration',
  31: 'Requested For',
  32: 'Rich Text Label',
  33: 'Attachment',
};

const DROPPED_TYPES = new Set([11, 12, 14, 15, 17, 19, 20, 24, 32, 33]);

function sanitizeFieldName(raw: string, used: Set<string>): string {
  let base = raw.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'field';
  if (/^[0-9]/.test(base)) base = `f_${base}`;
  base = base.slice(0, 60);
  let name = base;
  let n = 2;
  while (used.has(name)) name = `${base}_${n++}`;
  used.add(name);
  return name;
}

const identity = (v: string): unknown => v;

/**
 * Orders an item's variables the way the portal shows them: direct variables and variable
 * sets interleaved by order (variable sets sort by their io_set_item order).
 */
export function orderItemVariables(
  itemId: string,
  variables: SnVariable[],
  setLinks: Array<{ variable_set: string; order: number }>,
): SnVariable[] {
  const direct = variables.filter((v) => v.cat_item === itemId && !v.variable_set);
  const blocks: Array<{ order: number; vars: SnVariable[] }> = direct.map((v) => ({ order: v.order, vars: [v] }));
  for (const link of setLinks) {
    const vars = variables.filter((v) => v.variable_set === link.variable_set).sort((a, b) => a.order - b.order);
    blocks.push({ order: link.order, vars });
  }
  return blocks.sort((a, b) => a.order - b.order).flatMap((b) => b.vars);
}

export function convertVariables(
  vars: SnVariable[],
  choices: SnQuestionChoice[],
  notes: NoteCollector,
): { fields: NovaFormField[]; mappings: Map<string, FieldMapping> } {
  const fields: NovaFormField[] = [];
  const mappings = new Map<string, FieldMapping>();
  const used = new Set<string>();
  const choicesByQuestion = new Map<string, SnQuestionChoice[]>();
  for (const c of choices) {
    const list = choicesByQuestion.get(c.question) ?? [];
    list.push(c);
    choicesByQuestion.set(c.question, list);
  }

  for (const v of vars) {
    const label = htmlToText(v.question_text) || v.name;
    const typeLabel = SN_VARIABLE_TYPES[v.type] ?? `type ${v.type}`;
    if (DROPPED_TYPES.has(v.type)) {
      notes.info('variable_dropped', `${typeLabel} variable is layout-only or unsupported in Nova forms and was dropped.`, v.name || label);
      if (v.type === 33) notes.warn('attachment_variable', 'Attachment variables are not migrated; requesters can attach files to the request instead.', v.name);
      continue;
    }
    if (!v.name) {
      notes.warn('variable_unnamed', `A ${typeLabel} variable without a name was skipped.`, label);
      continue;
    }
    const name = sanitizeFieldName(v.name, used);
    const field: NovaFormField = { name, label: truncate(label, 200), type: 'text' };
    let mapValue: (s: string) => unknown = identity;
    const varChoices = (choicesByQuestion.get(v.sys_id) ?? []).sort((a, b) => a.order - b.order);
    const choiceOptions = () => {
      const valueToText = new Map(varChoices.map((c) => [c.value, c.text || c.value]));
      field.options = varChoices.map((c) => c.text || c.value);
      mapValue = (s) => valueToText.get(s) ?? s;
    };

    switch (v.type) {
      case 1:
      case 7:
        field.type = 'checkbox';
        mapValue = (s) => ['true', 'yes', '1'].includes(s.toLowerCase());
        break;
      case 2:
      case 23:
        field.type = 'textarea';
        if (v.type === 23) notes.info('html_variable', 'HTML variable converted to a plain textarea.', v.name);
        break;
      case 3:
      case 5:
        field.type = 'select';
        choiceOptions();
        if (varChoices.length === 0) {
          field.type = 'text';
          notes.warn('choices_missing', 'No question_choice rows found; converted to a text field.', v.name);
        }
        break;
      case 4:
        field.type = 'select';
        field.options = ['1', '2', '3', '4', '5'];
        break;
      case 6:
      case 16:
        field.type = 'text';
        break;
      case 8:
      case 31: {
        const table = v.type === 31 ? 'sys_user' : v.reference;
        if (table === 'sys_user') field.type = 'user_ref';
        else if (table.startsWith('cmdb_ci')) {
          field.type = 'cmdb_ref';
          notes.info('cmdb_reference', `Reference to ${table}; set the CI class filter in the form builder if needed.`, v.name);
        } else {
          field.type = 'text';
          notes.warn('reference_unsupported', `Reference to ${table || 'unknown table'} has no Nova equivalent; converted to text.`, v.name);
        }
        break;
      }
      case 9:
        field.type = 'date';
        break;
      case 10:
        field.type = 'date';
        notes.info('datetime_to_date', 'Date/Time variable converted to a date (time of day is dropped).', v.name);
        break;
      case 18:
      case 22:
        if (varChoices.length > 0) {
          field.type = 'select';
          choiceOptions();
        } else {
          field.type = 'text';
          notes.warn('lookup_variable', `Lookup options from ${v.lookup_table || 'a table'} are not migrated; converted to text.`, v.name);
        }
        break;
      case 21:
        if (varChoices.length > 0) {
          field.type = 'multiselect';
          choiceOptions();
        } else {
          field.type = 'textarea';
          notes.warn('list_collector', `List collector over ${v.list_table || 'a table'} converted to a free-text field.`, v.name);
        }
        break;
      case 25:
        field.type = 'text';
        notes.warn('masked_variable', 'Masked variable converted to plain text; avoid collecting secrets in request forms.', v.name);
        break;
      case 26:
        field.type = 'email';
        break;
      case 27:
        field.type = 'text';
        field.pattern = '^https?://.+';
        break;
      case 28:
        field.type = 'text';
        break;
      case 29:
        field.type = 'text';
        notes.info('duration_variable', 'Duration variable converted to text.', v.name);
        break;
      default:
        field.type = 'text';
        notes.warn('variable_type_unknown', `Unknown variable type ${v.type}; converted to text.`, v.name);
    }

    if (v.mandatory) field.required = true;
    const help = htmlToText(v.help_text || v.tooltip);
    if (help) field.helpText = truncate(help, 500);
    if (v.example_text) field.placeholder = truncate(v.example_text, 200);
    if (v.default_value) {
      if (/^javascript:/i.test(v.default_value)) {
        notes.info('scripted_default', 'Scripted default value was dropped.', v.name);
      } else {
        field.defaultValue = String(mapValue(v.default_value));
      }
    }
    fields.push(field);
    mappings.set(v.name, { snName: v.name, fieldName: name, type: field.type, mapValue });
  }
  return { fields, mappings };
}
