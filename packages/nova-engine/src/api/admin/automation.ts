/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Admin: Automation dry-run ───

import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../../data/db';
import { config } from '../../config';
import { AppError, BadRequest } from '../../middleware/errorHandler';
import {
  collectCredSlugsFromAutomation,
  executeAutomationGraph,
  parseAutomationConfig,
  resolveCredentialTemplateValues,
  validateAutomationConfig,
} from '@nova-suite/shared';
import { logger } from '../../logger';
import { sendAutomationEmail } from './automation-send-email';
import { loadCredentialSecretsBySlugs } from '@nova-suite/shared/node';

const router = Router();

// ════════════════════════════════════════════
// AUTOMATION DRY-RUN (real HTTP, no persistence)
// ════════════════════════════════════════════

const DRY_RUN_MAX_DELAY_MS = 2_000;
const DRY_RUN_TIMEOUT_MS = 90_000;

router.post('/automation/dry-run', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const userId = req.user!.id;
    const userRoles = req.user!.roles.join(',');
    const body = req.body as {
      automation_config?: unknown;
      request_context?: {
        id?: string;
        number?: string;
        status?: string;
        form_data?: Record<string, unknown>;
        delivery_info?: Record<string, unknown>;
      };
    };

    const validationErrors = validateAutomationConfig(body.automation_config);
    if (validationErrors.length > 0) {
      res.status(400).json({ error: 'Invalid automation_config', details: validationErrors });
      return;
    }
    const cfg = parseAutomationConfig(body.automation_config);
    if (!cfg) {
      throw BadRequest('automation_config could not be parsed');
    }

    const ctx = body.request_context ?? {};
    const request = {
      id: typeof ctx.id === 'string' && ctx.id.trim() ? ctx.id.trim() : `dry-run-${Date.now()}`,
      number: typeof ctx.number === 'string' && ctx.number.trim() ? ctx.number.trim() : 'DRY-001',
      status: typeof ctx.status === 'string' && ctx.status.trim() ? ctx.status.trim() : 'in_progress',
      form_data: ctx.form_data && typeof ctx.form_data === 'object' && !Array.isArray(ctx.form_data)
        ? ctx.form_data
        : {},
      delivery_info: ctx.delivery_info && typeof ctx.delivery_info === 'object' && !Array.isArray(ctx.delivery_info)
        ? ctx.delivery_info
        : {},
    };

    const slugList = collectCredSlugsFromAutomation(cfg);
    const client = await db.getClient();
    try {
      await db.setTenantContext(client, tenantId, userId, userRoles);
      const rawCredMap = await loadCredentialSecretsBySlugs(client, config.credentials.masterKey, tenantId, slugList);
      const credMap = await resolveCredentialTemplateValues(tenantId, rawCredMap);

      const runPromise = executeAutomationGraph({
        cfg,
        request,
        credMap,
        client,
        tenantId,
        persistFormData: false,
        dryRun: true,
        maxDelayMs: DRY_RUN_MAX_DELAY_MS,
        automationSharedKey: config.catalogAutomation.sharedKey || undefined,
        sendEmail: sendAutomationEmail,
        onLog: (msg, meta) => logger.info({ ...meta, tenantId }, `[automation-dry-run] ${msg}`),
      });

      const result = await Promise.race([
        runPromise,
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new AppError(408, `Dry-run timed out after ${DRY_RUN_TIMEOUT_MS / 1000}s`)), DRY_RUN_TIMEOUT_MS);
        }),
      ]);

      res.json({
        ok: result.ok,
        message: result.message,
        rejectRequest: result.rejectRequest,
        skipTaskOrders: result.skipTaskOrders,
        trace: result.trace,
        mergePatch: result.mergePatch,
        stateResults: result.stateResults,
        warnings: result.warnings,
        request_context: request,
      });
    } finally {
      await db.clearTenantContext(client).catch(() => undefined);
      client.release();
    }
  } catch (err) { next(err); }
});

export default router;
