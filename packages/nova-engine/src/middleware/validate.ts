/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Request Validation Middleware ───

import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

/**
 * Validate request body against a Zod schema.
 * Parsed data replaces req.body so downstream handlers get typed data.
 */
export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req.body);
      // Express 5 request properties may be defined via getters; mutate in place.
      if (req.body && typeof req.body === 'object') {
        Object.keys(req.body).forEach((k) => {
          delete (req.body as Record<string, unknown>)[k];
        });
        Object.assign(req.body as Record<string, unknown>, parsed as Record<string, unknown>);
      } else {
        (req as Request & { body: unknown }).body = parsed;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Validate query parameters against a Zod schema.
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req.query) as Record<string, unknown>;
      // Express 5 exposes req.query as getter-only; keep object identity and update keys.
      if (req.query && typeof req.query === 'object') {
        Object.keys(req.query).forEach((k) => {
          delete (req.query as Record<string, unknown>)[k];
        });
        Object.assign(req.query as Record<string, unknown>, parsed);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
