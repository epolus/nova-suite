/* SPDX-License-Identifier: AGPL-3.0-only */
import { Router, Request, Response, NextFunction } from 'express';
import { parseInboundAlerts } from '@nova-suite/shared';
import { AppError } from '../../middleware/errorHandler';
import { ingestAlerts } from '../../domain/alerts';
import { cancelIncidentAutoClose, signalIncidentResolved } from '../../temporal/workflows';
import { requireAutomationSharedKey } from '../../middleware/automation-key';

const router = Router();

router.post('/events', requireAutomationSharedKey, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const alerts = parseInboundAlerts(req.body);
    if (!alerts) throw new AppError(400, 'Unrecognized alert payload');
    const tenantId = String(req.body?.tenant_id || '').trim();
    if (!tenantId) throw new AppError(400, 'tenant_id is required');
    const results = await ingestAlerts(tenantId, alerts);
    for (const row of results) {
      if (row.resolvedIncidentId) signalIncidentResolved(row.resolvedIncidentId).catch(() => {});
      if (row.reopenedIncidentId) cancelIncidentAutoClose(row.reopenedIncidentId).catch(() => {});
    }
    res.status(202).json({
      results: results.map((row) => ({
        fingerprint: row.fingerprint,
        duplicate: row.duplicate,
        alert_number: row.alertNumber,
        incident_number: row.incidentNumber,
        resolved: Boolean(row.resolvedIncidentId),
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
