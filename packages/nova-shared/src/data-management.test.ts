/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import {
  DataManagementQueryError,
  compileDataManagementMatch,
  dataManagementCountSql,
  dataManagementIdPageSql,
  dataManagementJobRequestSchema,
  dataManagementPreviewSchema,
  listDataManagementTargets,
} from './data-management';

describe('compileDataManagementMatch', () => {
  it('keeps closed and cancelled incidents and parameterizes older_than', () => {
    const match = compileDataManagementMatch('incidents', [
      { field: 'created_at', operator: 'older_than', value: { amount: 2, unit: 'years' } },
    ]);
    expect(match.where).toBe(
      "t.status::text IN ('closed', 'cancelled') AND t.created_at < NOW() - ($1 * INTERVAL '1 year')",
    );
    expect(match.values).toEqual([2]);
    expect(match.where).not.toContain('2');
  });

  it('omits the status guard when open records are included and limits archive to active rows', () => {
    const match = compileDataManagementMatch('incidents', 
      [{ field: 'closed_at', operator: 'older_than', value: { amount: 18, unit: 'months' } }],
      { includeOpen: true, onlyActive: true },
    );
    expect(match.where).toBe(
      "t.is_active = true AND t.closed_at < NOW() - ($1 * INTERVAL '1 month')",
    );
    expect(match.values).toEqual([18]);
  });

  it('rejects an empty filter list', () => {
    expect(() => compileDataManagementMatch('incidents', [])).toThrow(DataManagementQueryError);
  });

  it('rejects fields and operators outside the catalog', () => {
    expect(() => compileDataManagementMatch('incidents', [
      { field: 'created_at; drop table incidents', operator: 'older_than', value: { amount: 1, unit: 'days' } },
    ])).toThrow(/Unsupported filter field/);
    expect(() => compileDataManagementMatch('incidents', [
      { field: 'title', operator: 'older_than', value: { amount: 1, unit: 'days' } },
    ])).toThrow(/not allowed/);
  });

  it('binds list and contains values', () => {
    const match = compileDataManagementMatch('incidents', [
      { field: 'status', operator: 'in', value: ['closed', 'cancelled'] },
      { field: 'title', operator: 'contains', value: 'vpn' },
    ], { includeOpen: true });
    expect(match.where).toContain('t.status::text = ANY($1::text[])');
    expect(match.where).toContain("t.title ILIKE '%' || $2 || '%'");
    expect(match.values).toEqual([['closed', 'cancelled'], 'vpn']);
    expect(dataManagementCountSql('incidents', match).text.startsWith('SELECT count(*)::int AS count FROM incidents t WHERE')).toBe(true);
  });

  it('pages by id with the next two parameters', () => {
    const match = compileDataManagementMatch('incidents', [
      { field: 'priority', operator: 'gte', value: 3 },
    ]);
    expect(dataManagementIdPageSql('incidents', match)).toContain('t.id > $2::uuid');
    expect(dataManagementIdPageSql('incidents', match)).toContain('LIMIT $3');
  });

  it('publishes allowlisted targets without SQL fragments', () => {
    const targets = listDataManagementTargets();
    expect(targets.map((target) => target.key)).toEqual([
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
    ]);
    const incidents = targets[0];
    expect(incidents.actions).toEqual(['delete', 'archive']);
    expect(incidents.closed_statuses).toEqual(['closed', 'cancelled']);
    expect(targets.find((target) => target.key === 'assets')?.actions).toEqual(['delete']);
    const created = incidents.fields.find((field) => field.key === 'created_at');
    expect(created?.operators).toContain('older_than');
    expect(JSON.stringify(targets)).not.toContain('t.created_at');
    expect(JSON.stringify(targets)).not.toContain('FROM ');
  });

  it('guards finished requests and configuration items', () => {
    const requests = compileDataManagementMatch('requests', [
      { field: 'created_at', operator: 'older_than', value: { amount: 2, unit: 'years' } },
    ]);
    expect(requests.where).toBe(
      "t.status IN ('fulfilled', 'rejected', 'cancelled') AND t.created_at < NOW() - ($1 * INTERVAL '1 year')",
    );
    expect(dataManagementCountSql('requests', requests).text).toContain('FROM requests t WHERE');

    const items = compileDataManagementMatch('configuration_items', [
      { field: 'name', operator: 'contains', value: 'firewall' },
    ]);
    expect(items.where).toBe("t.status::text IN ('retired') AND t.name ILIKE '%' || $1 || '%'");
  });

  it('rejects archive for tables that cannot be marked inactive', () => {
    const parsed = dataManagementPreviewSchema.safeParse({
      target: 'assets',
      action: 'archive',
      filters: [{ field: 'created_at', operator: 'older_than', value: { amount: 1, unit: 'years' } }],
    });
    expect(parsed.success).toBe(false);
    const job = dataManagementJobRequestSchema.safeParse({
      target: 'alerts',
      action: 'delete',
      filters: [{ field: 'resolved_at', operator: 'older_than', value: { amount: 90, unit: 'days' } }],
      confirm_count: 3,
    });
    expect(job.success).toBe(true);
    if (job.success) {
      expect(compileDataManagementMatch(job.data.target, job.data.filters).where).toContain("t.status IN ('resolved')");
    }
  });
});
