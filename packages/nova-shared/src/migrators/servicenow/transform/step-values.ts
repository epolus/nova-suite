/* SPDX-License-Identifier: AGPL-3.0-only */

export function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

export function pick(values: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = values[k];
    if (v !== undefined && v !== null && str(v) !== '') return str(v);
  }
  return '';
}

/** Reference inputs arrive as a sys_id or as `{"display":"Procurement","value":"<sys_id>"}`. */
export function referenceValue(raw: string): { id: string; display: string } {
  const text = raw.trim();
  if (text.startsWith('{')) {
    try {
      const o = JSON.parse(text) as Record<string, unknown>;
      return { id: str(o.value), display: str(o.display ?? o.display_value) };
    } catch {
      // fall through
    }
  }
  return /^[0-9a-f]{32}$/.test(text) ? { id: text, display: '' } : { id: '', display: text };
}

export function publicInputs(values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) if (!k.startsWith('__')) out[k] = v;
  return out;
}

/** Pills reference the trigger by its name, e.g. `{{Service Catalog_1.request_item}}`. */
export function triggerAliasesFor(triggerName: string): Set<string> {
  const base = triggerName.replace(/\s+/g, '').toLowerCase();
  return new Set(base ? [`${base}_1`, base] : []);
}

/**
 * Parses a ServiceNow wait duration. Absolute datetimes are not delaySeconds — callers should
 * warn and skip rather than treating epoch seconds as a delay.
 */
export function parseDurationSeconds(raw: string): { seconds: number; absolute: boolean } {
  const s = raw.trim();
  if (!s) return { seconds: 0, absolute: false };
  if (/^\d+(\.\d+)?$/.test(s)) return { seconds: Math.round(Number(s)), absolute: false };
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(s);
  if (m) return { seconds: 0, absolute: true };
  return { seconds: 0, absolute: false };
}
