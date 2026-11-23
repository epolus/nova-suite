/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import {
  incidentQueueQuery,
  listWorkbenchQueue,
  normalizeWorkbenchNumbers,
  resolveWorkbenchRecords,
} from './queue';

const USER = { id: 'user-1' };

describe('normalizeWorkbenchNumbers', () => {
  it('keeps known prefixes, drops the rest, and caps the list', () => {
    const many = Array.from({ length: 13 }, (_, index) => `INC${String(index).padStart(7, '0')}`);
    const raw = `${many.join(',')},REQ0000001,nope,inc0000001`;
    const numbers = normalizeWorkbenchNumbers(raw);
    expect(numbers).toHaveLength(12);
    expect(numbers[0]).toBe('INC0000000');
    expect(numbers).not.toContain('REQ0000001');
    expect(numbers.filter((number) => number === 'INC0000001')).toHaveLength(1);
  });
});

describe('incidentQueueQuery', () => {
  it('scopes unassigned work to the caller groups', () => {
    expect(incidentQueueQuery('unassigned', 'vpn')).toMatchObject({
      unassigned: 'true',
      my_groups: 'true',
      search: 'vpn',
      status_not_in: 'resolved,closed,cancelled',
    });
  });
});

describe('listWorkbenchQueue / resolveWorkbenchRecords', () => {
  function mockClient(rows: unknown[] = []) {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const query = vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params: [...params] });
      return { rows };
    });
    return { client: { query } as unknown as PoolClient, calls };
  }

  it('selects unassigned group incidents with caller VIP', async () => {
    const { client, calls } = mockClient();
    await listWorkbenchQueue(client, {
      bucket: 'unassigned',
      search: '',
      limit: 25,
      user: USER,
      isFulfiller: true,
    });
    expect(calls[0]?.sql).toContain('i.assigned_to IS NULL');
    expect(calls[0]?.sql).toContain('assignment_group_members');
    expect(calls[0]?.sql).toContain('c.vip');
    expect(calls[0]?.params.at(-1)).toBe(25);
  });

  it('includes the approaching-SLA window on the sla bucket', async () => {
    const { client, calls } = mockClient();
    await listWorkbenchQueue(client, {
      bucket: 'sla',
      search: 'mail',
      limit: 10,
      user: USER,
      isFulfiller: true,
    });
    expect(calls[0]?.sql).toContain("interval '30 minutes'");
    expect(calls[0]?.sql).toContain('i.sla_breached = true');
    expect(calls[0]?.params).toContain('%mail%');
    expect(calls[0]?.params.at(-1)).toBe(10);
  });

  it('resolves numbers in request order and ignores unknown prefixes', async () => {
    const { client, calls } = mockClient([
      { id: 'p1', number: 'PRB0000002', kind: 'problem' },
      { id: 'i1', number: 'INC0000001', kind: 'incident' },
    ]);
    const records = await resolveWorkbenchRecords(client, 'INC0000001,REQ0000009,PRB0000002,INC0000099');
    expect(calls[0]?.params).toEqual([['INC0000001', 'PRB0000002', 'INC0000099']]);
    expect(records).toEqual([
      { kind: 'incident', id: 'i1', number: 'INC0000001' },
      { kind: 'problem', id: 'p1', number: 'PRB0000002' },
    ]);
  });
});
