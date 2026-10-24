/* SPDX-License-Identifier: AGPL-3.0-only */
import type { PoolClient } from 'pg';

export interface TenantAiSettings {
  ai_triage_on_create: boolean;
  ai_auto_apply_priority: boolean;
  ess_auto_deflect: boolean;
  ess_deflect_confidence_threshold: number;
}

const DEFAULTS: TenantAiSettings = {
  ai_triage_on_create: true,
  ai_auto_apply_priority: false,
  ess_auto_deflect: false,
  ess_deflect_confidence_threshold: 0.65,
};

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value === 'true' || value === '1' || value === 'yes';
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function loadTenantAiSettings(client: PoolClient): Promise<TenantAiSettings> {
  const res = await client.query(
    `SELECT key, value FROM tenant_settings
     WHERE tenant_id = current_tenant_id()
       AND key = ANY($1::text[])`,
    [Object.keys(DEFAULTS)],
  );
  const map = new Map<string, string>();
  for (const row of res.rows as Array<{ key: string; value: string }>) {
    map.set(row.key, row.value);
  }
  return {
    ai_triage_on_create: parseBool(map.get('ai_triage_on_create'), DEFAULTS.ai_triage_on_create),
    ai_auto_apply_priority: parseBool(map.get('ai_auto_apply_priority'), DEFAULTS.ai_auto_apply_priority),
    ess_auto_deflect: parseBool(map.get('ess_auto_deflect'), DEFAULTS.ess_auto_deflect),
    ess_deflect_confidence_threshold: parseNumber(
      map.get('ess_deflect_confidence_threshold'),
      DEFAULTS.ess_deflect_confidence_threshold,
    ),
  };
}
