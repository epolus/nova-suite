/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import { getClientIp, getForwardedClientIp } from './client-ip';

function mockRequest(headers: Record<string, string>, ip?: string): Request {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    get(name: string) {
      return normalized[name.toLowerCase()];
    },
    ip,
    socket: { remoteAddress: '192.168.0.2' },
  } as Request;
}

describe('getForwardedClientIp', () => {
  it('prefers the leftmost X-Forwarded-For address', () => {
    const req = mockRequest({ 'x-forwarded-for': '203.0.113.10, 192.168.0.2' });
    expect(getForwardedClientIp(req)).toBe('203.0.113.10');
  });

  it('falls back to X-Real-IP', () => {
    const req = mockRequest({ 'x-real-ip': '203.0.113.20' });
    expect(getForwardedClientIp(req)).toBe('203.0.113.20');
  });

  it('parses the Forwarded header', () => {
    const req = mockRequest({ forwarded: 'for=203.0.113.30;proto=https;by=192.168.0.2' });
    expect(getForwardedClientIp(req)).toBe('203.0.113.30');
  });
});

describe('getClientIp', () => {
  it('uses forwarded headers before the socket address', () => {
    const req = mockRequest({ 'x-forwarded-for': '203.0.113.40' });
    expect(getClientIp(req)).toBe('203.0.113.40');
  });

  it('falls back to req.ip when headers are missing', () => {
    const req = mockRequest({}, '192.168.0.2');
    expect(getClientIp(req)).toBe('192.168.0.2');
  });
});
