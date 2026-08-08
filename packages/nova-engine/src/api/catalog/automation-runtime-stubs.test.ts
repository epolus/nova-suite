/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it, vi } from 'vitest';
import {
  AUTOMATION_SCHEMA_VERSION,
  executeAutomationGraph,
  validateAndParseAutomationConfig,
} from '@nova-suite/shared';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const GROUP_ID = '22222222-2222-2222-2222-222222222222';
const TASK_ID = '33333333-3333-3333-3333-333333333333';
const INCIDENT_ID = '44444444-4444-4444-4444-444444444444';
const DEF_ID = '55555555-5555-5555-5555-555555555555';

function parseGraph(states: Array<Record<string, unknown>>, startAt = 'stub') {
  const raw = {
    kind: 'state_machine',
    schemaVersion: AUTOMATION_SCHEMA_VERSION,
    startAt,
    states: [...states, { id: 'done', type: 'end', result: 'success' }],
  };
  const parsed = validateAndParseAutomationConfig(raw);
  expect(parsed.errors).toEqual([]);
  expect(parsed.config).not.toBeNull();
  return parsed.config!;
}

describe('executeAutomationGraph library nodes', () => {
  it('runs action.script and stores the return value', async () => {
    const cfg = parseGraph([
      {
        id: 'stub',
        type: 'action.script',
        runtime: 'js',
        code: "return { echo: request.number || 'n/a' };",
        transitions: [{ to: 'done', when: 'success' }],
      },
    ]);
    const result = await executeAutomationGraph({
      cfg,
      request: { number: 'REQ-1' },
      credMap: {},
      persistFormData: false,
      dryRun: true,
    });
    expect(result.ok).toBe(true);
    expect(result.stateResults.stub).toMatchObject({ ok: true, body: { echo: 'REQ-1' } });
  });

  it('sends in-app notifications through the db client', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM users') && sql.includes('is_active') && sql.includes('id = $1')) {
        return { rows: [{ id: USER_ID }] };
      }
      if (sql.includes('SELECT id, email FROM users')) {
        return { rows: [{ id: USER_ID, email: 'a@example.com' }] };
      }
      if (sql.includes('INSERT INTO notifications')) {
        return { rows: [] };
      }
      return { rows: [] };
    });
    const cfg = parseGraph([
      {
        id: 'stub',
        type: 'action.notification',
        channel: 'in_app',
        recipientType: USER_ID,
        titleTemplate: 'Hello {{request.number}}',
        bodyTemplate: 'Body',
        transitions: [{ to: 'done', when: 'success' }],
      },
    ]);
    const result = await executeAutomationGraph({
      cfg,
      request: { number: 'REQ-9' },
      credMap: {},
      client: { query },
      persistFormData: false,
      dryRun: true,
    });
    expect(result.ok).toBe(true);
    expect(query.mock.calls.some((c) => String(c[0]).includes('INSERT INTO notifications'))).toBe(true);
  });

  it('creates an incident ticket', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('calculate_priority')) return { rows: [{ priority: 3 }] };
      if (sql.includes('incident_number_seq')) return { rows: [{ nextval: 1001 }] };
      if (sql.includes('INSERT INTO incidents')) {
        return { rows: [{ id: INCIDENT_ID, number: 'INC0001001' }] };
      }
      return { rows: [] };
    });
    const cfg = parseGraph([
      {
        id: 'stub',
        type: 'action.ticket',
        entity: 'incident',
        operation: 'create',
        fields: { title: 'From {{request.number}}' },
        transitions: [{ to: 'done', when: 'success' }],
      },
    ]);
    const result = await executeAutomationGraph({
      cfg,
      request: { number: 'REQ-2' },
      credMap: {},
      client: { query },
      persistFormData: false,
      dryRun: true,
    });
    expect(result.ok).toBe(true);
    expect(result.stateResults.stub).toMatchObject({
      ok: true,
      body: { number: 'INC0001001' },
    });
  });

  it('assigns the current request task to a group', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM assignment_groups')) return { rows: [{ id: GROUP_ID }] };
      if (sql.includes('UPDATE request_tasks')) return { rows: [] };
      return { rows: [] };
    });
    const cfg = parseGraph([
      {
        id: 'stub',
        type: 'action.assign',
        target: 'group',
        groupIdTemplate: GROUP_ID,
        transitions: [{ to: 'done', when: 'success' }],
      },
    ]);
    const result = await executeAutomationGraph({
      cfg,
      request: {},
      credMap: {},
      client: { query },
      requestTaskId: TASK_ID,
      persistFormData: false,
      dryRun: true,
    });
    expect(result.ok).toBe(true);
    expect(query.mock.calls.some((c) => String(c[0]).includes('UPDATE request_tasks'))).toBe(true);
  });

  it('runs call.workflow against a published definition', async () => {
    const nested = {
      kind: 'state_machine',
      schemaVersion: AUTOMATION_SCHEMA_VERSION,
      startAt: 'inner',
      states: [
        {
          id: 'inner',
          type: 'action.script',
          code: 'return { nested: true };',
          transitions: [{ to: 'innerDone', when: 'success' }],
        },
        { id: 'innerDone', type: 'end', result: 'success' },
      ],
    };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM workflow_definitions')) {
        return { rows: [{ id: DEF_ID, name: 'Child', workflow_type: 'child', published_definition: nested }] };
      }
      return { rows: [] };
    });
    const cfg = parseGraph([
      {
        id: 'stub',
        type: 'call.workflow',
        workflowType: 'child',
        input: { foo: 'bar' },
        transitions: [{ to: 'done', when: 'success' }],
      },
    ]);
    const result = await executeAutomationGraph({
      cfg,
      request: { form_data: {} },
      credMap: {},
      client: { query },
      persistFormData: false,
      dryRun: true,
    });
    expect(result.ok).toBe(true);
    expect(result.stateResults.stub).toMatchObject({ ok: true });
  });
});
