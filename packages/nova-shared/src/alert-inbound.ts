/* SPDX-License-Identifier: AGPL-3.0-only */

export type AlertStatus = 'firing' | 'resolved';

export type ParsedInboundAlert = {
  source: string;
  fingerprint: string;
  externalEventId: string;
  status: AlertStatus;
  severity: string;
  title: string;
  labels: Record<string, string>;
  sourceUrl: string | null;
  ciKeys: string[];
  occurredAt: string | null;
  payload: Record<string, unknown>;
};

export const DEFAULT_SEVERITY_MAP: Record<string, string> = {
  critical: 'critical',
  page: 'critical',
  error: 'critical',
  warning: 'warning',
  info: 'info',
  none: 'info',
};

export function normalizeSeverity(raw: string, map?: Record<string, string> | null): string {
  const key = raw.trim().toLowerCase() || 'warning';
  const table = { ...DEFAULT_SEVERITY_MAP, ...(map || {}) };
  const mapped = table[key] || key;
  return mapped.trim().toLowerCase() || 'warning';
}

export function labelsMatch(alertLabels: Record<string, string>, expected: Record<string, string>): boolean {
  return Object.entries(expected).every(([key, value]) => {
    return (alertLabels[key] || '').toLowerCase() === String(value).toLowerCase();
  });
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') {
      out[key] = String(entry);
    }
  }
  return out;
}

function asStatus(value: string, fallback: AlertStatus): AlertStatus {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'resolved' || normalized === 'ok') return 'resolved';
  if (normalized === 'firing' || normalized === 'problem') return 'firing';
  return fallback;
}

function ciKeysFrom(labels: Record<string, string>, explicit: string): string[] {
  const keys = [
    explicit,
    labels.ci,
    labels.host,
    labels.hostname,
    labels.node,
    labels.nodename,
    labels.instance,
  ];
  const instance = labels.instance || '';
  const host = instance.split(':')[0] || '';
  if (host && host !== instance) keys.push(host);
  return [...new Set(keys.filter((key): key is string => typeof key === 'string' && key.trim().length > 0).map((key) => key.trim()))];
}

function fromAlertmanager(body: Record<string, unknown>): ParsedInboundAlert[] | null {
  if (!Array.isArray(body.alerts)) return null;
  const groupStatus = asStatus(textOf(body.status), 'firing');
  return body.alerts.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const alert = entry as Record<string, unknown>;
    const labels = stringMap(alert.labels);
    const annotations = stringMap(alert.annotations);
    const status = asStatus(textOf(alert.status), groupStatus);
    const fingerprint = textOf(alert.fingerprint);
    const occurredAt = textOf(alert.startsAt) || textOf(alert.endsAt) || null;
    const title = annotations.summary || annotations.description || labels.alertname || 'Alert';
    const identity = fingerprint || `${labels.alertname || title}|${labels.instance || ''}`;
    return [{
      source: 'alertmanager',
      fingerprint: identity,
      externalEventId: `${identity}:${occurredAt || ''}:${status}`,
      status,
      severity: labels.severity || 'warning',
      title,
      labels,
      sourceUrl: annotations.generatorURL || annotations.runbook_url || annotations.runbook || null,
      ciKeys: ciKeysFrom(labels, ''),
      occurredAt,
      payload: alert,
    }];
  });
}

function fromGeneric(body: Record<string, unknown>): ParsedInboundAlert | null {
  const title = textOf(body.title) || textOf(body.summary) || textOf(body.text);
  const fingerprint = textOf(body.fingerprint);
  const ci = textOf(body.ci) || textOf(body.configuration_item) || textOf(body.host);
  if (!title && !fingerprint) return null;
  const labels = stringMap(body.labels);
  const status = asStatus(textOf(body.status), 'firing');
  const occurredAt = textOf(body.occurred_at) || null;
  const identity = fingerprint || `${textOf(body.source) || 'generic'}|${title}|${ci}`;
  const externalEventId = textOf(body.event_id) || `${identity}:${occurredAt || ''}:${status}`;
  return {
    source: textOf(body.source) || 'generic',
    fingerprint: identity,
    externalEventId,
    status,
    severity: textOf(body.severity) || labels.severity || 'warning',
    title: title || identity,
    labels,
    sourceUrl: textOf(body.source_url) || null,
    ciKeys: ciKeysFrom(labels, ci),
    occurredAt,
    payload: body,
  };
}

/** Alertmanager webhook groups, or one generic JSON alert. */
export function parseInboundAlerts(body: unknown): ParsedInboundAlert[] | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const row = body as Record<string, unknown>;
  if (Array.isArray(row.alerts)) return fromAlertmanager(row);
  if (row.type === 'event_callback' || row.channelId === 'msteams' || row.channel === 'slack' || row.channel === 'teams') {
    return null;
  }
  const generic = fromGeneric(row);
  return generic ? [generic] : null;
}
