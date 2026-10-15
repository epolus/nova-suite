/* SPDX-License-Identifier: AGPL-3.0-only */

/**
 * Automated RCA correlation stubs.
 *
 * Discovery / monitoring events and deployment feeds will plug into
 * `correlateAlerts` later (CMDB alerts, CI change windows, CI/CD).
 * Until then adapters return empty hints so callers can wire UI/API safely.
 */

export interface CorrelationHint {
  source: string;
  summary: string;
  confidence: number;
  relatedEntityType?: string;
  relatedEntityId?: string;
  occurredAt?: string;
  metadata?: Record<string, unknown>;
}

export interface RcaCorrelationAdapter {
  correlateAlerts(incident: {
    id: string;
    title: string;
    description?: string | null;
    configuration_item_id?: string | null;
    service_id?: string | null;
    created_at?: string;
  }): Promise<CorrelationHint[]>;
}

/** No-op adapter until discovery/events correlation is available. */
export class NoopRcaAdapter implements RcaCorrelationAdapter {
  async correlateAlerts(_incident: {
    id: string;
    title: string;
    description?: string | null;
    configuration_item_id?: string | null;
    service_id?: string | null;
    created_at?: string;
  }): Promise<CorrelationHint[]> {
    return [];
  }
}

export const defaultRcaAdapter: RcaCorrelationAdapter = new NoopRcaAdapter();

export async function correlateAlerts(
  incident: Parameters<RcaCorrelationAdapter['correlateAlerts']>[0],
  adapter: RcaCorrelationAdapter = defaultRcaAdapter,
): Promise<CorrelationHint[]> {
  return adapter.correlateAlerts(incident);
}
