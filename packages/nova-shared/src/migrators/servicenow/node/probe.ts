/* SPDX-License-Identifier: AGPL-3.0-only */
import type { ServiceNowProbeResult } from '../snapshot';
import { ServiceNowApiError, type ServiceNowClient } from './client';
import { decodeFlowValues } from './decode';

export type { ServiceNowProbeResult };

export const SERVICENOW_PROBE_TABLES = [
  'sc_catalog',
  'sc_category',
  'sc_cat_item',
  'item_option_new',
  'item_option_new_set',
  'io_set_item',
  'question_choice',
  'sys_hub_flow',
  'sys_hub_action_instance',
  'sys_hub_action_instance_v2',
  'sys_hub_flow_logic',
  'sys_hub_flow_logic_instance_v2',
  'sys_hub_sub_flow_instance',
  'sys_hub_sub_flow_instance_v2',
  'sys_hub_trigger_instance',
  'sys_hub_trigger_instance_v2',
  'sys_hub_flow_variable',
  'sys_hub_action_type_base',
  'sys_hub_flow_logic_definition',
  'sys_variable_value',
] as const;

/** Tables without which a migration cannot produce anything useful. */
const REQUIRED_TABLES = new Set(['sc_category', 'sc_cat_item', 'item_option_new']);

export async function probeServiceNowInstance(client: ServiceNowClient): Promise<ServiceNowProbeResult> {
  const messages: string[] = [];
  let release: string | null = null;
  try {
    const rows = await client.list('sys_properties', { query: 'name=glide.buildtag.last', fields: 'value', limit: 1 });
    release = rows[0] ? String(rows[0].value ?? '') || null : null;
  } catch (err) {
    if (err instanceof ServiceNowApiError && err.status === 401) {
      return {
        ok: false,
        instanceUrl: client.instanceUrl,
        release: null,
        tables: [],
        flowStorage: 'unknown',
        valueEncoding: 'n/a',
        messages: ['Authentication failed (401). Check the credential.'],
      };
    }
    messages.push('sys_properties is not readable; release unknown.');
  }

  const tables: ServiceNowProbeResult['tables'] = [];
  for (const table of SERVICENOW_PROBE_TABLES) {
    tables.push({ table, ...(await client.probe(table)) });
  }
  const byName = new Map(tables.map((t) => [t.table, t]));
  for (const t of tables) {
    if (!t.ok && t.status === 403) messages.push(`No read access to ${t.table}.`);
    if (!t.ok && REQUIRED_TABLES.has(t.table)) messages.push(`Required table ${t.table} is not readable.`);
  }

  const v1 = (byName.get('sys_hub_action_instance')?.total ?? 0) > 0;
  const v2 = (byName.get('sys_hub_action_instance_v2')?.total ?? 0) > 0;
  const flowStorage = v1 && v2 ? 'mixed' : v2 ? 'v2' : v1 ? 'v1' : 'unknown';

  let valueEncoding: ServiceNowProbeResult['valueEncoding'] = 'n/a';
  if (v2) {
    try {
      const sample = await client.list('sys_hub_action_instance_v2', { fields: 'values', limit: 5 });
      const encodings = new Set(
        sample.map((r) => decodeFlowValues(String(r.values ?? '')).encoding).filter((e) => e !== 'empty'),
      );
      valueEncoding = encodings.size === 0
        ? 'n/a'
        : encodings.size > 1
          ? 'mixed'
          : ([...encodings][0] as 'json' | 'compressed' | 'unknown');
      if (encodings.has('unknown')) messages.push('Some v2 step values use an unrecognized encoding.');
    } catch {
      messages.push('Could not sample sys_hub_action_instance_v2 values.');
    }
  }
  if (!byName.get('sys_hub_flow')?.ok) messages.push('Flow Designer tables are not readable; only catalog structure will migrate.');

  const ok = [...REQUIRED_TABLES].every((t) => byName.get(t)?.ok);
  return { ok, instanceUrl: client.instanceUrl, release, tables, flowStorage, valueEncoding, messages };
}
