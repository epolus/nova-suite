/* SPDX-License-Identifier: AGPL-3.0-only */

/**
 * Ensure `crypto.randomUUID` exists. The Workflow Builder SDK calls it when
 * dropping palette nodes; it is missing in some non-secure HTTP contexts.
 */
export function ensureCryptoRandomUUID(): void {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  if (!cryptoApi || typeof cryptoApi.randomUUID === 'function') return;

  const randomUUID = function randomUUID(): `${string}-${string}-${string}-${string}-${string}` {
    const bytes = new Uint8Array(16);
    if (typeof cryptoApi.getRandomValues === 'function') {
      cryptoApi.getRandomValues(bytes);
    } else {
      for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as `${string}-${string}-${string}-${string}-${string}`;
  };

  Object.defineProperty(cryptoApi, 'randomUUID', {
    value: randomUUID,
    configurable: true,
    writable: true,
  });
}
