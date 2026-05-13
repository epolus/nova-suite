/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Global Error Handler ───

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../logger';

/** Application-level error with HTTP status. */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** Convenience constructors. */
export const NotFound = (message = 'Resource not found') => new AppError(404, message, 'NOT_FOUND');
export const BadRequest = (message: string) => new AppError(400, message, 'BAD_REQUEST');
export const Unauthorized = (message = 'Unauthorized') => new AppError(401, message, 'UNAUTHORIZED');
export const Forbidden = (message = 'Forbidden') => new AppError(403, message, 'FORBIDDEN');
export const Conflict = (message: string) => new AppError(409, message, 'CONFLICT');

/** Global error-handling middleware (must have 4 params for Express to recognize it). */
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  // Zod validation errors → 400
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: err.issues.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // Known application errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
    return;
  }

  // Unknown errors → 500
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  });
}
