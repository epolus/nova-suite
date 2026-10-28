/* SPDX-License-Identifier: AGPL-3.0-only */
import { deflateSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  normalizeServiceNowInstanceUrl,
  parseServiceNowCredentialSecret,
  ServiceNowApiError,
  ServiceNowClient,
} from './client';
import { decodeFlowValues } from './decode';
import { extractServiceNowSnapshot } from './extract';
import { probeServiceNowInstance } from './probe';
import { createFakeServiceNow } from './testing';

const BASIC = { kind: 'basic' as const, username: 'svc', password: 'pw' };
const BASIC_HEADER = { name: 'authorization', value: `Basic ${Buffer.from('svc:pw').toString('base64')}` };
const GROUP_ID = 'a'.repeat(32);
const OLD_ITEM = 'b'.repeat(32);

function clientFor(tables: Record<string, Array<Record<string, unknown>>>, opts: Parameters<typeof createFakeServiceNow>[1] = {}) {
  const fake = createFakeServiceNow(tables, opts);
  const sleeps: number[] = [];
  const client = new ServiceNowClient({
    instanceUrl: 'acme',
    auth: BASIC,
    fetchImpl: fake.fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  return { client, fake, sleeps };
}

describe('instance URL and credential parsing', () => {
  it('normalizes instance names and rejects http', () => {
    expect(normalizeServiceNowInstanceUrl('Acme')).toBe('https://acme.service-now.com');
    expect(normalizeServiceNowInstanceUrl('acme.service-now.com/')).toBe('https://acme.service-now.com');
    expect(() => normalizeServiceNowInstanceUrl('http://acme.service-now.com')).toThrow(/https/);
  });

  it('parses supported secret shapes', () => {
    const url = 'https://acme.service-now.com';
    expect(parseServiceNowCredentialSecret('svc:p:w', url)).toEqual({ kind: 'basic', username: 'svc', password: 'p:w' });
    expect(parseServiceNowCredentialSecret('{"auth_type":"oauth2","client_id":"a","client_secret":"b"}', url))
      .toMatchObject({ kind: 'oauth2', tokenUrl: `${url}/oauth_token.do` });
    expect(parseServiceNowCredentialSecret('{"auth_type":"api_key","api_key":"k"}', url)).toEqual({ kind: 'api_key', apiKey: 'k' });
    expect(() => parseServiceNowCredentialSecret('nope', url)).toThrow();
  });
});

describe('decodeFlowValues', () => {
  const inputs = [{ name: 'table_name', value: { value: 'incident', displayValue: 'Incident' } }, { name: 'record', value: '' }];

  it('decodes plain JSON, gzip and deflate payloads', () => {
    expect(decodeFlowValues(JSON.stringify(inputs))).toEqual({ values: { table_name: 'incident', record: '' }, encoding: 'json' });
    const gz = gzipSync(Buffer.from(JSON.stringify({ inputs }))).toString('base64');
    expect(decodeFlowValues(gz)).toEqual({ values: { table_name: 'incident', record: '' }, encoding: 'compressed' });
    const df = deflateSync(Buffer.from(JSON.stringify({ a: 1 }))).toString('base64');
    expect(decodeFlowValues(df)).toEqual({ values: { a: 1 }, encoding: 'compressed' });
  });

  it('reports unknown encodings without throwing', () => {
    expect(decodeFlowValues('').encoding).toBe('empty');
    expect(decodeFlowValues('not json at all!').encoding).toBe('unknown');
  });
});

describe('ServiceNowClient', () => {
  const rows = [{ sys_id: '1' }, { sys_id: '2' }, { sys_id: '3' }];

  it('pages with sysparm_offset until a short page', async () => {
    const fake = createFakeServiceNow({ sc_catalog: rows }, { expectAuthHeader: BASIC_HEADER });
    const client = new ServiceNowClient({ instanceUrl: 'acme', auth: BASIC, fetchImpl: fake.fetch, pageSize: 2 });
    expect(await client.list('sc_catalog', { fields: 'sys_id' })).toEqual(rows);
    expect(fake.requests.map((u) => new URL(u).searchParams.get('sysparm_offset'))).toEqual(['0', '2']);
  });

  it('retries 5xx with backoff', async () => {
    const { client, sleeps } = clientFor({ sc_catalog: rows }, { failFirst: 2 });
    expect(await client.list('sc_catalog')).toHaveLength(3);
    expect(sleeps).toEqual([500, 1000]);
  });

  it('fails fast on 401 and reports it from probe', async () => {
    const { client, sleeps } = clientFor({ sc_catalog: rows }, { expectAuthHeader: { name: 'authorization', value: 'other' } });
    await expect(client.list('sc_catalog')).rejects.toMatchObject({ status: 401 });
    expect(sleeps).toEqual([]);
    const probe = await probeServiceNowInstance(client);
    expect(probe.ok).toBe(false);
    expect(probe.messages[0]).toMatch(/401/);
  });

  it('chunks IN queries', async () => {
    const { client, fake } = clientFor({ sc_catalog: rows });
    expect(await client.listIn('sc_catalog', 'sys_id', ['1', '2', '3', '3'], { chunkSize: 2 })).toHaveLength(3);
    expect(fake.requests).toHaveLength(2);
  });

  it('wraps non-JSON responses', async () => {
    const client = new ServiceNowClient({
      instanceUrl: 'acme',
      auth: BASIC,
      fetchImpl: async () => new Response('<html>login</html>', { status: 200 }),
    });
    await expect(client.list('sc_catalog')).rejects.toBeInstanceOf(ServiceNowApiError);
  });
});

describe('extractServiceNowSnapshot', () => {
  const gz = (v: unknown) => gzipSync(Buffer.from(JSON.stringify(v))).toString('base64');
  const tables = {
    sys_properties: [{ name: 'glide.buildtag.last', value: 'glide-xanadu' }],
    sc_catalog: [{ sys_id: 'cat', title: 'Service Catalog', active: 'true' }],
    sc_category: [{ sys_id: 'hw', title: 'Hardware', sc_catalog: 'cat', active: 'true' }],
    sc_cat_item: [
      { sys_id: 'i1', name: 'Laptop', category: 'hw', active: 'true', flow_designer_flow: 'f1', sys_class_name: 'sc_cat_item' },
      { sys_id: OLD_ITEM, name: 'Old Thing', category: 'hw', active: 'true', workflow: 'wf1', sys_class_name: 'sc_cat_item' },
      { sys_id: 'i3', name: 'Producer', category: 'hw', active: 'true', sys_class_name: 'sc_cat_item_producer' },
      { sys_id: 'i4', name: 'Retired', category: 'hw', active: 'false', sys_class_name: 'sc_cat_item' },
    ],
    item_option_new: [{ sys_id: 'v1', name: 'model', question_text: 'Model', type: '6', cat_item: 'i1', active: 'true' }],
    item_option_new_set: [],
    io_set_item: [],
    question_choice: [],
    sys_hub_flow: [
      { sys_id: 'f1', name: 'Laptop flow', type: 'flow', master_snapshot: 's1', active: 'true' },
      { sys_id: 'f2', name: 'Notify', type: 'subflow', active: 'true' },
    ],
    sys_hub_action_instance_v2: [
      { sys_id: 'a1', flow: 's1', ui_id: 'u1', order: '1', action_type: 'at1', values: gz({ inputs: [{ name: 'approver', value: GROUP_ID }] }) },
    ],
    sys_hub_flow_logic_instance_v2: [],
    sys_hub_sub_flow_instance_v2: [{ sys_id: 'sf1', flow: 's1', ui_id: 'u2', order: '2', subflow: 'f2', values: '' }],
    sys_hub_action_instance: [{ sys_id: 'a2', flow: 'f2', ui_id: 'u3', order: '1', action_type: 'at1' }],
    sys_hub_flow_logic: [],
    sys_hub_sub_flow_instance: [],
    sys_variable_value: [{ document_key: 'a2', value: 'hello', 'variable.element': 'message' }],
    sys_hub_trigger_instance_v2: [{ sys_id: 't1', flow: 's1', 'trigger_definition.name': 'Service Catalog' }],
    sys_hub_flow_variable: [],
    sys_hub_action_type_base: [{ sys_id: 'at1', name: 'Ask For Approval', internal_name: 'ask_for_approval' }],
    sys_user_group: [{ sys_id: GROUP_ID, name: 'IT Approvers' }],
    sys_user: [],
  };

  it('extracts items, v2 compressed flows, v1 subflows and referenced groups', async () => {
    const { client } = clientFor(tables);
    const stages: string[] = [];
    const snap = await extractServiceNowSnapshot(client, {}, (stage) => {
      stages.push(stage);
    });

    expect(snap.release).toBe('glide-xanadu');
    expect(snap.items.map((i) => i.sys_id)).toEqual(['i1', OLD_ITEM]);
    expect(snap.variables.map((v) => v.name)).toEqual(['model']);

    const main = snap.flows.find((f) => f.sys_id === 'f1')!;
    expect(main).toMatchObject({ storage: 'v2', sourceRecordId: 's1', triggerName: 'Service Catalog' });
    expect(main.steps.map((s) => [s.kind, s.values])).toEqual([
      ['action', { approver: GROUP_ID }],
      ['subflow', {}],
    ]);
    const sub = snap.flows.find((f) => f.sys_id === 'f2')!;
    expect(sub).toMatchObject({ storage: 'v1' });
    expect(sub.steps[0].values).toEqual({ message: 'hello' });

    expect(snap.actionTypes.map((a) => a.name)).toEqual(['Ask For Approval']);
    expect(snap.groups).toEqual([{ sys_id: GROUP_ID, name: 'IT Approvers' }]);
    expect(snap.warnings).toEqual(expect.arrayContaining([
      expect.stringMatching(/legacy workflow/),
      expect.stringMatching(/sys_hub_trigger_instance is not available/),
    ]));
    expect(stages).toEqual(expect.arrayContaining(['catalogs', 'items', 'variables', 'flows', 'definitions']));
  });

  it('honors includeRecordProducers, includeInactive and itemIds', async () => {
    const all = await extractServiceNowSnapshot(clientFor(tables).client, { includeRecordProducers: true, includeInactive: true });
    expect(all.items.map((i) => i.sys_id).sort()).toEqual([OLD_ITEM, 'i1', 'i3', 'i4']);
    const one = await extractServiceNowSnapshot(clientFor(tables).client, { itemIds: [OLD_ITEM] });
    expect(one.items.map((i) => i.sys_id)).toEqual([OLD_ITEM]);
    expect(one.flows).toEqual([]);
  });

  it('turns table ACL errors into warnings', async () => {
    const { client } = clientFor(tables, { statusByTable: { sys_hub_flow: 403 } });
    const snap = await extractServiceNowSnapshot(client);
    expect(snap.flows).toEqual([]);
    expect(snap.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/No read access to sys_hub_flow/)]));
  });
});
