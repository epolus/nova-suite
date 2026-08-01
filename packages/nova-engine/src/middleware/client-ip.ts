/* SPDX-License-Identifier: AGPL-3.0-only */
import type { Request } from 'express';

function normalizeIp(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('::ffff:')) return trimmed.slice(7);
  return trimmed;
}

function firstForwardedFor(value: string): string | null {
  const first = value.split(',')[0]?.trim();
  return first || null;
}

function parseForwardedHeader(value: string): string | null {
  for (const part of value.split(';')) {
    const trimmed = part.trim();
    if (!trimmed.toLowerCase().startsWith('for=')) continue;
    let candidate = trimmed.slice(4).trim();
    if (candidate.startsWith('"') && candidate.endsWith('"')) {
      candidate = candidate.slice(1, -1);
    }
    if (candidate.startsWith('[')) {
      const end = candidate.indexOf(']');
      if (end > 0) return candidate.slice(1, end);
    }
    const comma = candidate.indexOf(':');
    if (candidate.includes('.') || comma < 0) {
      return candidate.split(':')[0] || null;
    }
    return candidate || null;
  }
  return null;
}

/** Client IP from reverse-proxy headers (leftmost X-Forwarded-For, then X-Real-IP). */
export function getForwardedClientIp(req: Request): string | null {
  const xForwardedFor = req.get('x-forwarded-for');
  if (xForwardedFor) {
    const first = firstForwardedFor(xForwardedFor);
    if (first) return normalizeIp(first);
  }

  const xRealIp = req.get('x-real-ip');
  if (xRealIp) return normalizeIp(xRealIp);

  const forwarded = req.get('forwarded');
  if (forwarded) {
    const parsed = parseForwardedHeader(forwarded);
    if (parsed) return normalizeIp(parsed);
  }

  return null;
}

/** Best-effort client IP (proxy headers, then Express `req.ip` when trust proxy is enabled). */
export function getClientIp(req: Request): string | null {
  const forwarded = getForwardedClientIp(req);
  if (forwarded) return forwarded;

  const raw = req.ip || req.socket?.remoteAddress;
  if (!raw) return null;
  return normalizeIp(raw);
}
