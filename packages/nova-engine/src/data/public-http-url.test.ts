/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import {
  assertPublicHttpUrl,
  isBlockedHostname,
  isBlockedIp,
  toPublicHttpHref,
  type HostLookup,
} from './public-http-url';

const publicLookup: HostLookup = async () => [{ address: '8.8.8.8', family: 4 }];
const loopbackLookup: HostLookup = async () => [{ address: '127.0.0.1', family: 4 }];

describe('isBlockedHostname', () => {
  it('blocks loopback and metadata hosts', () => {
    expect(isBlockedHostname('localhost')).toBe(true);
    expect(isBlockedHostname('127.0.0.1')).toBe(true);
    expect(isBlockedHostname('169.254.169.254')).toBe(true);
    expect(isBlockedHostname('10.1.2.3')).toBe(true);
    expect(isBlockedHostname('192.168.0.9')).toBe(true);
    expect(isBlockedHostname('172.16.0.1')).toBe(true);
    expect(isBlockedHostname('metadata.google.internal')).toBe(true);
  });

  it('allows a public hostname shape', () => {
    expect(isBlockedHostname('files.example.com')).toBe(false);
  });
});

describe('isBlockedIp', () => {
  it('blocks private and link-local ranges', () => {
    expect(isBlockedIp('10.0.0.1', 4)).toBe(true);
    expect(isBlockedIp('192.168.1.1', 4)).toBe(true);
    expect(isBlockedIp('127.0.0.1', 4)).toBe(true);
    expect(isBlockedIp('::1', 6)).toBe(true);
    expect(isBlockedIp('8.8.8.8', 4)).toBe(false);
  });
});

describe('assertPublicHttpUrl', () => {
  it('rejects non-http schemes', async () => {
    await expect(assertPublicHttpUrl('file:///etc/passwd', publicLookup)).rejects.toThrow(/http or https/);
  });

  it('rejects loopback URLs before DNS', async () => {
    await expect(assertPublicHttpUrl('http://127.0.0.1/secret', publicLookup)).rejects.toThrow(/not allowed/);
    await expect(assertPublicHttpUrl('http://localhost/secret', publicLookup)).rejects.toThrow(/not allowed/);
  });

  it('rejects hosts that resolve to a private address', async () => {
    await expect(assertPublicHttpUrl('https://evil.example/x', loopbackLookup)).rejects.toThrow(/not allowed/);
  });

  it('rejects embedded credentials', async () => {
    await expect(assertPublicHttpUrl('https://a:b@example.com/', publicLookup)).rejects.toThrow(/credentials/);
  });

  it('returns a URL for a public http(s) host', async () => {
    const url = await assertPublicHttpUrl('https://files.example.com/data.csv', publicLookup);
    expect(url.protocol).toBe('https:');
    expect(url.hostname).toBe('files.example.com');
  });
});

describe('toPublicHttpHref', () => {
  it('rebuilds a public https URL with encoded path and query', () => {
    const url = new URL('https://files.example.com/reports/Q1.csv?x=a b');
    expect(toPublicHttpHref(url)).toBe('https://files.example.com/reports/Q1.csv?x=a%20b');
  });

  it('keeps a non-default port', () => {
    const url = new URL('http://files.example.com:8080/data.json');
    expect(toPublicHttpHref(url)).toBe('http://files.example.com:8080/data.json');
  });
});
