/* SPDX-License-Identifier: AGPL-3.0-only */
import { gunzipSync, inflateSync } from 'node:zlib';

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function tryDecompressBase64(raw: string): string | undefined {
  if (!/^[A-Za-z0-9+/=\s]+$/.test(raw)) return undefined;
  const buf = Buffer.from(raw.replace(/\s+/g, ''), 'base64');
  if (buf.length < 2) return undefined;
  try {
    if (buf[0] === 0x1f && buf[1] === 0x8b) return gunzipSync(buf).toString('utf8');
    if (buf[0] === 0x78) return inflateSync(buf).toString('utf8');
  } catch {
    return undefined;
  }
  return undefined;
}

/** Unwraps `{ value, displayValue }` style input values down to the stored value. */
function unwrapInputValue(v: unknown): unknown {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    if ('value' in o && Object.keys(o).every((k) => ['value', 'displayValue', 'display_value', 'valueType', 'type', 'name', 'label', 'parameter', 'scriptActive', 'children'].includes(k))) {
      return unwrapInputValue(o.value);
    }
  }
  return v;
}

function inputsArrayToRecord(arr: unknown[]): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  let matched = 0;
  for (const entry of arr) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    const name = typeof e.name === 'string' ? e.name : typeof e.element === 'string' ? e.element : null;
    if (!name) continue;
    matched += 1;
    const children = Array.isArray(e.children) ? inputsArrayToRecord(e.children) : null;
    out[name] = children && Object.keys(children).length > 0 && (e.value === undefined || e.value === '')
      ? children
      : unwrapInputValue(e.value);
  }
  return matched > 0 ? out : null;
}

/**
 * Decodes the `values` column of Flow Designer v2 instance tables. Newer releases store
 * gzip+base64 JSON; older ones store plain JSON. The JSON is either a name/value array,
 * an object with an `inputs` array, or a plain object.
 */
export function decodeFlowValues(raw: string): { values: Record<string, unknown>; encoding: 'empty' | 'json' | 'compressed' | 'unknown' } {
  const trimmed = (raw || '').trim();
  if (!trimmed) return { values: {}, encoding: 'empty' };
  let encoding: 'json' | 'compressed' = 'json';
  let parsed = tryJson(trimmed);
  if (parsed === undefined) {
    const inflated = tryDecompressBase64(trimmed);
    if (inflated === undefined) return { values: { __raw: trimmed }, encoding: 'unknown' };
    parsed = tryJson(inflated);
    encoding = 'compressed';
    if (parsed === undefined) return { values: { __raw: inflated }, encoding: 'unknown' };
  }
  return { values: normalizeDecodedValues(parsed), encoding };
}

export function normalizeDecodedValues(parsed: unknown): Record<string, unknown> {
  if (Array.isArray(parsed)) return inputsArrayToRecord(parsed) ?? { __items: parsed };
  if (parsed && typeof parsed === 'object') {
    const o = parsed as Record<string, unknown>;
    if (Array.isArray(o.inputs)) {
      const rec = inputsArrayToRecord(o.inputs) ?? {};
      const rest: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(o)) if (k !== 'inputs') rest[`__${k}`] = v;
      return { ...rest, ...rec };
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) out[k] = unwrapInputValue(v);
    return out;
  }
  return { __raw: parsed };
}
