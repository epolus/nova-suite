/* SPDX-License-Identifier: AGPL-3.0-only */

/** Create a unique id, with fallback when `crypto.randomUUID` is unavailable (e.g. non-secure context). */
export function createStableId(prefix = 'id'): string {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
