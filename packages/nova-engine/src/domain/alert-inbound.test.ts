/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { labelsMatch, normalizeSeverity, parseInboundAlerts } from '@nova-suite/shared';

describe('alert inbound', () => {
  it('splits an Alertmanager group and treats page as critical', () => {
    const parsed = parseInboundAlerts({
      status: 'firing',
      alerts: [{
        status: 'firing',
        fingerprint: 'abc',
        startsAt: '2026-10-20T10:00:00Z',
        labels: { alertname: 'DiskFull', severity: 'page', instance: 'db-1:9100' },
        annotations: { summary: 'Disk full', generatorURL: 'https://prom.example/graph' },
      }],
    });
    expect(parsed).toHaveLength(1);
    expect(parsed?.[0]).toMatchObject({
      source: 'alertmanager',
      fingerprint: 'abc',
      status: 'firing',
      title: 'Disk full',
      sourceUrl: 'https://prom.example/graph',
    });
    expect(parsed?.[0].ciKeys).toContain('db-1');
    expect(normalizeSeverity(parsed?.[0].severity || '')).toBe('critical');
  });

  it('accepts a generic alert and ignores a Slack event', () => {
    const parsed = parseInboundAlerts({
      source: 'zabbix',
      fingerprint: 'disk-1',
      status: 'ok',
      title: 'Disk recovered',
      ci: 'db-1',
      event_id: 'z1',
    });
    expect(parsed?.[0]).toMatchObject({ source: 'zabbix', status: 'resolved', externalEventId: 'z1' });
    expect(parseInboundAlerts({ type: 'event_callback', event: { type: 'message' } })).toBeNull();
  });

  it('matches labels case-insensitively', () => {
    expect(labelsMatch({ alertname: 'DiskFull' }, { alertname: 'diskfull' })).toBe(true);
    expect(labelsMatch({ alertname: 'DiskFull' }, { alertname: 'Cpu' })).toBe(false);
  });
});