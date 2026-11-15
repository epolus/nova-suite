/* SPDX-License-Identifier: AGPL-3.0-only */
// Authenticates worker → engine and catalog automation callbacks with
// CATALOG_AUTOMATION_SHARED_KEY (X-Automation-Key header or Bearer token).

import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { secretsEqual } from '../auth/secrets';

function readProvidedKey(req: Request): string {
  const header = req.headers['x-automation-key'];
  const headerKey = typeof header === 'string' ? header.trim() : Array.isArray(header) ? header[0]?.trim() || '' : '';
  if (headerKey) return headerKey;
  const authHeader = req.headers.authorization;
  return authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
}

export function requireAutomationSharedKey(req: Request, res: Response, next: NextFunction): void {
  const configured = config.catalogAutomation.sharedKey;
  if (!configured) {
    res.status(503).json({
      error: 'Catalog automation key is not configured',
      hint: 'Set CATALOG_AUTOMATION_SHARED_KEY on the API server and restart.',
    });
    return;
  }
  if (!secretsEqual(readProvidedKey(req), configured)) {
    res.status(401).json({ error: 'Invalid automation key' });
    return;
  }
  next();
}
