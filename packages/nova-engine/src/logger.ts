/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Structured Logger (pino) ───
import pino from 'pino';
import { config } from './config';

export const logger = pino({
  level: config.logLevel,
  transport:
    config.nodeEnv === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});
