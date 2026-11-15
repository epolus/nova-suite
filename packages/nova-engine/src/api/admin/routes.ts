/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Admin Routes ───
// Thin composition of admin sub-routers. All routes are admin-only except the
// broader-role GET /assignment-groups, which is mounted before the admin gate.

import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../../data/db';
import { authenticate, requireRole, setTenantRLS, releaseTenantClient } from '../../middleware/auth';
import { recordAuditEvent } from '../../audit/events';
import { getClientIp } from '../../middleware/client-ip';
import { logger } from '../../logger';
import usersRouter from './users';
import rbacRouter from './rbac';
import orgRouter from './org';
import assignmentGroupsRouter, { assignmentGroupsReadRouter } from './assignment-groups';
import processesRouter from './processes';
import servicesRouter from './services';
import slaRouter from './sla';
import notificationsRouter from './notifications';
import workflowsRouter from './workflows';
import automationRouter from './automation';
import incidentAdminRouter from './incident-admin';
import opsRouter from './ops';

const router = Router();

// Read-only for admin + fulfiller (used by assignment pickers and task flows).
// Must stay BEFORE the admin-only middleware below.
router.use(assignmentGroupsReadRouter);

// All other admin routes require authentication + admin role
router.use(authenticate, requireRole('admin'), setTenantRLS, releaseTenantClient);

router.use((req: Request, res: Response, next: NextFunction) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase())) {
    next();
    return;
  }
  const startedAt = Date.now();
  // The request-scoped client is released on 'finish', so the insert needs its own connection.
  res.on('finish', () => {
    const user = req.user!;
    void db.withTenantContext(user.tenant_id, user.id, user.roles.join(',') || 'user', () => recordAuditEvent({
      tenantId: user.tenant_id,
      actorUserId: user.id,
      category: 'admin',
      action: `${req.method} ${req.baseUrl}${req.path}`,
      level: res.statusCode >= 400 ? 'warning' : 'info',
      clientIp: getClientIp(req),
      metadata: {
        status: res.statusCode,
        duration_ms: Date.now() - startedAt,
      },
    })).catch((err) => {
      logger.warn({ err }, 'Failed to record admin audit event');
    });
  });
  next();
});

router.use(opsRouter);
router.use(rbacRouter);
router.use(orgRouter);
router.use(usersRouter);
router.use(processesRouter);
router.use(assignmentGroupsRouter);
router.use(servicesRouter);
router.use(slaRouter);
router.use(notificationsRouter);
router.use(workflowsRouter);
router.use(automationRouter);
router.use(incidentAdminRouter);

export default router;
