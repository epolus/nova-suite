/* SPDX-License-Identifier: AGPL-3.0-only */
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

const PRIVATE_NETS = new BlockList();
PRIVATE_NETS.addSubnet('0.0.0.0', 8, 'ipv4');
PRIVATE_NETS.addSubnet('10.0.0.0', 8, 'ipv4');
PRIVATE_NETS.addSubnet('100.64.0.0', 10, 'ipv4');
PRIVATE_NETS.addSubnet('127.0.0.0', 8, 'ipv4');
PRIVATE_NETS.addSubnet('169.254.0.0', 16, 'ipv4');
PRIVATE_NETS.addSubnet('172.16.0.0', 12, 'ipv4');
PRIVATE_NETS.addSubnet('192.0.0.0', 24, 'ipv4');
PRIVATE_NETS.addSubnet('192.0.2.0', 24, 'ipv4');
PRIVATE_NETS.addSubnet('192.168.0.0', 16, 'ipv4');
PRIVATE_NETS.addSubnet('198.18.0.0', 15, 'ipv4');
PRIVATE_NETS.addSubnet('198.51.100.0', 24, 'ipv4');
PRIVATE_NETS.addSubnet('203.0.113.0', 24, 'ipv4');
PRIVATE_NETS.addSubnet('224.0.0.0', 4, 'ipv4');
PRIVATE_NETS.addSubnet('240.0.0.0', 4, 'ipv4');
PRIVATE_NETS.addAddress('::', 'ipv6');
PRIVATE_NETS.addAddress('::1', 'ipv6');
PRIVATE_NETS.addSubnet('fc00::', 7, 'ipv6');
PRIVATE_NETS.addSubnet('fe80::', 10, 'ipv6');
PRIVATE_NETS.addSubnet('ff00::', 8, 'ipv6');

export class UnsafeHttpUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeHttpUrlError';
  }
}

export type HostLookup = (hostname: string) => Promise<Array<{ address: string; family: 4 | 6 }>>;

const defaultLookup: HostLookup = async (hostname) => {
  const rows = await lookup(hostname, { all: true });
  return rows.map((row) => ({ address: row.address, family: row.family as 4 | 6 }));
};

function ipv4Mapped(address: string): string | null {
  const match = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  return match ? match[1] : null;
}

export function isBlockedIp(address: string, family: 4 | 6): boolean {
  const mapped = ipv4Mapped(address);
  if (mapped) return PRIVATE_NETS.check(mapped, 'ipv4');
  return PRIVATE_NETS.check(address, family === 6 ? 'ipv6' : 'ipv4');
}

/** Hostname checks CodeQL can see before any fetch. */
export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    host === 'localhost'
    || host === '127.0.0.1'
    || host === '0.0.0.0'
    || host === '::'
    || host === '::1'
    || host === '169.254.169.254'
  ) {
    return true;
  }
  if (host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return true;
  }
  if (/^(10\.|127\.|169\.254\.|192\.168\.|0\.)/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[0-2]\d)\./.test(host)) return true;
  const ipVersion = isIP(host);
  if (ipVersion === 4) return isBlockedIp(host, 4);
  if (ipVersion === 6) return isBlockedIp(host, 6);
  return false;
}

/**
 * Restrict user-supplied importer URLs to public http(s) after DNS resolution.
 * Does not follow redirects; callers must pass `redirect: 'error'`.
 */
export async function assertPublicHttpUrl(
  raw: string,
  lookupFn: HostLookup = defaultLookup,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeHttpUrlError('Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeHttpUrlError('URL must use http or https');
  }
  if (url.username || url.password) {
    throw new UnsafeHttpUrlError('URL must not include credentials');
  }
  if (isBlockedHostname(url.hostname)) {
    throw new UnsafeHttpUrlError('URL host is not allowed');
  }

  let resolved: Array<{ address: string; family: 4 | 6 }>;
  try {
    resolved = await lookupFn(url.hostname.replace(/^\[|\]$/g, ''));
  } catch {
    throw new UnsafeHttpUrlError('URL host could not be resolved');
  }
  if (resolved.length === 0 || resolved.some((row) => isBlockedIp(row.address, row.family))) {
    throw new UnsafeHttpUrlError('URL host is not allowed');
  }
  return url;
}

function encodeSegment(value: string): string {
  try {
    return encodeURIComponent(decodeURIComponent(value));
  } catch {
    return encodeURIComponent(value);
  }
}

/**
 * Rebuild an href from a validated URL using encoded components.
 * Callers must only pass URLs already accepted by assertPublicHttpUrl.
 */
export function toPublicHttpHref(url: URL): string {
  const protocol = url.protocol === 'https:' ? 'https:' : 'http:';
  const rawHost = url.hostname.replace(/^\[|\]$/g, '');
  const host = isIP(rawHost) === 6 ? `[${rawHost}]` : encodeSegment(rawHost);
  const port = url.port ? `:${encodeSegment(url.port)}` : '';
  const path = url.pathname.split('/').map((seg) => (seg === '' ? '' : encodeSegment(seg))).join('/');
  const query = [...url.searchParams.entries()]
    .map(([key, value]) => `${encodeSegment(key)}=${encodeSegment(value)}`)
    .join('&');
  return query ? `${protocol}//${host}${port}${path}?${query}` : `${protocol}//${host}${port}${path}`;
}

/**
 * Fetch a URL that has already passed assertPublicHttpUrl.
 * Re-checks protocol/host, disables redirects, and is the only outbound
 * fetch sink for admin-configured importer URLs.
 */
export async function fetchValidatedPublicHttp(
  url: URL,
  init: RequestInit = {},
): Promise<Response> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeHttpUrlError('URL must use http or https');
  }
  if (isBlockedHostname(url.hostname)) {
    throw new UnsafeHttpUrlError('URL host is not allowed');
  }
  const href = toPublicHttpHref(url);
  // codeql[js/request-forgery] Intentional fetch of admin-configured importer/OAuth URL after assertPublicHttpUrl: http(s) only, credentials forbidden, private/loopback/link-local/metadata hosts blocked (hostname + resolved DNS), redirects disabled.
  return fetch(href, { ...init, redirect: 'error' });
}

/** Validate a user-supplied URL, then fetch without following redirects. */
export async function fetchPublicHttp(
  raw: string,
  init: RequestInit = {},
  lookupFn: HostLookup = defaultLookup,
): Promise<Response> {
  const url = await assertPublicHttpUrl(raw, lookupFn);
  return fetchValidatedPublicHttp(url, init);
}
