/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Change Routes ───
// Thin HTTP layer: auth, validation, response shaping, Temporal enqueue
// side effects. DB / business logic lives in the sibling service modules
// (permissions, list, mutations, workflow, conflicts, config, risk, journal).
import { Router, Request, Response, NextFunction } from 'express';
import {
  authenticate,
  getRequestClient,
  releaseTenantClient,
  setTenantRLS,
} from '../../middleware/auth';
import { validateBody, validateQuery } from '../../middleware/validate';
import {
  addChangeJournalEntrySchema,
  changeApprovalDecisionSchema,
  changeTransitionSchema,
  createBlackoutSchema,
  createCabMeetingSchema,
  createChangeRiskQuestionSchema,
  createChangeSchema,
  createChangeTypeSchema,
  paginationSchema,
  submitChangeRiskAssessmentSchema,
  updateBlackoutSchema,
  updateChangeRiskQuestionSchema,
  updateChangeSchema,
  updateChangeTypeSchema,
} from '../../domain/schemas';
import { AppError } from '../../middleware/errorHandler';
import { hasAnyRole, hasChangeRole, isAdminRole } from '../roles';
import { enqueueNotificationDispatchStartJob } from '../../temporal/workflow-start-queue';
import { listChangeAssignmentGroups } from './permissions';
import { getChangeCalendar, getChangeNav, getChangeStats, listChanges } from './list';
import { listChangeConflicts } from './conflicts';
import { createChange, getChange, updateChange } from './mutations';
import { decideApproval, transitionChange } from './workflow';
import {
  addChangeToCabMeeting,
  createBlackout,
  createCabMeeting,
  createChangeType,
  createRiskQuestion,
  createStandardTemplate,
  deactivateRiskQuestion,
  listBlackouts,
  listCabMeetings,
  listChangeTypes,
  listRiskQuestions,
  listStandardTemplates,
  recordCabDecision,
  updateBlackout,
  updateChangeType,
  updateRiskQuestion,
  updateStandardTemplate,
} from './config';
import { getRiskAnswers, submitRiskAssessment } from './risk';
import { addJournalEntry, getAudit, getJournal } from './journal';
import type { ChangeActor } from './types';

const router = Router();
router.use(authenticate, setTenantRLS, releaseTenantClient);

function actorFrom(req: Request): ChangeActor {
  return {
    id: req.user!.id,
    tenant_id: req.user!.tenant_id,
    isAdmin: isAdminRole(req),
    hasChangeRole: hasChangeRole(req),
    canOverrideBlockingConflicts: hasAnyRole(req, ['admin', 'change_manager']),
  };
}

router.get('/assignment-groups', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const assignment_groups = await listChangeAssignmentGroups(client);
    res.json({ assignment_groups });
  } catch (err) {
    next(err);
  }
});

router.get('/types', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const change_types = await listChangeTypes(client);
    res.json({ change_types });
  } catch (err) {
    next(err);
  }
});

router.post('/types', validateBody(createChangeTypeSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!hasChangeRole(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    const created = await createChangeType(client, req.body);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.patch('/types/:id', validateBody(updateChangeTypeSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!hasChangeRole(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    const updated = await updateChangeType(client, String(req.params.id), req.body);
    if (!updated) return void res.json({ success: true });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.get('/standard-templates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const templates = await listStandardTemplates(client);
    res.json({ templates });
  } catch (err) {
    next(err);
  }
});

router.post('/standard-templates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!hasChangeRole(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    const b = req.body || {};
    if (!b.change_type_id || !b.name) throw new AppError(400, 'change_type_id and name are required');
    const created = await createStandardTemplate(client, b);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.patch('/standard-templates/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!hasChangeRole(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    const updated = await updateStandardTemplate(client, String(req.params.id), req.body);
    if (!updated) return void res.json({ success: true });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.get('/cab-meetings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const meetings = await listCabMeetings(client);
    res.json({ meetings });
  } catch (err) {
    next(err);
  }
});

router.post('/cab-meetings', validateBody(createCabMeetingSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!hasChangeRole(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    const created = await createCabMeeting(client, actorFrom(req), req.body);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.post('/cab-meetings/:id/changes/:changeId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!hasChangeRole(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    await addChangeToCabMeeting(client, String(req.params.id), String(req.params.changeId));
    res.status(201).json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.patch('/cab-meetings/:id/changes/:changeId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!hasChangeRole(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    const decision = req.body?.decision;
    const notes = req.body?.notes || null;
    if (!['approved', 'rejected', 'deferred'].includes(decision)) {
      throw new AppError(400, 'decision must be approved, rejected or deferred');
    }
    await recordCabDecision(client, String(req.params.id), String(req.params.changeId), decision, notes);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/blackouts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const blackouts = await listBlackouts(client);
    res.json({ blackouts });
  } catch (err) {
    next(err);
  }
});

router.post('/blackouts', validateBody(createBlackoutSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!hasChangeRole(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    const created = await createBlackout(client, req.body);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.patch('/blackouts/:id', validateBody(updateBlackoutSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!hasChangeRole(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    const updated = await updateBlackout(client, String(req.params.id), req.body);
    if (!updated) return void res.json({ success: true });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.get('/risk-questions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const includeInactive = String(req.query.include_inactive || '') === 'true';
    const questions = await listRiskQuestions(client, includeInactive && hasChangeRole(req));
    res.json({ questions });
  } catch (err) {
    next(err);
  }
});

router.post('/risk-questions', validateBody(createChangeRiskQuestionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!hasChangeRole(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    const created = await createRiskQuestion(client, req.body);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.patch('/risk-questions/:id', validateBody(updateChangeRiskQuestionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!hasChangeRole(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    const updated = await updateRiskQuestion(client, String(req.params.id), req.body);
    if (!updated) return void res.json({ success: true });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete('/risk-questions/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!hasChangeRole(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    const deactivated = await deactivateRiskQuestion(client, String(req.params.id));
    res.json(deactivated);
  } catch (err) {
    next(err);
  }
});

router.get('/calendar', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const from = req.query.from ? String(req.query.from) : null;
    const to = req.query.to ? String(req.query.to) : null;
    const result = await getChangeCalendar(client, { from, to });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/conflicts/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const conflicts = await listChangeConflicts(client, String(req.params.id));
    res.json({ conflicts });
  } catch (err) {
    next(err);
  }
});

router.get(
  '/',
  validateQuery(paginationSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 20;
      const result = await listChanges(
        client,
        req.query as Record<string, unknown>,
        { id: req.user!.id },
        { hasChangeRole: hasChangeRole(req), page, limit },
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/changes/stats ───
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const stats = await getChangeStats(client);
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

router.get('/nav', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const nav = await getChangeNav(
      client,
      req.query as Record<string, unknown>,
      { id: req.user!.id },
      { hasChangeRole: hasChangeRole(req) },
    );
    res.json(nav);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/risk-answers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const result = await getRiskAnswers(client, actorFrom(req), String(req.params.id));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:id/risk-assessment',
  validateBody(submitChangeRiskAssessmentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const result = await submitRiskAssessment(client, actorFrom(req), String(req.params.id), req.body);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const change = await getChange(client, actorFrom(req), String(req.params.id));
    res.json(change);
  } catch (err) {
    next(err);
  }
});

router.post('/', validateBody(createChangeSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!hasChangeRole(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    const created = await createChange(client, actorFrom(req), req.body);
    enqueueNotificationDispatchStartJob({
      tenantId: req.user!.tenant_id,
      entityType: 'change',
      triggerKey: 'change.created',
      entityId: String(created.id),
      actorUserId: req.user!.id,
    }).catch(() => {});
    res.status(201).json(created);
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      return next(new AppError(409, 'Change number conflict; retry create'));
    }
    next(err);
  }
});

router.patch('/:id', validateBody(updateChangeSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const updated = await updateChange(client, actorFrom(req), String(req.params.id), req.body);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

const TRANSITION_TRIGGER_BY_ACTION: Record<string, string> = {
  request_approval: 'change.pending_approval',
  approve: 'change.approved',
  reject: 'change.rejected',
  schedule: 'change.scheduled',
};

router.post('/:id/transition', validateBody(changeTransitionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const updated = await transitionChange(client, actorFrom(req), String(req.params.id), req.body);
    const transitionTrigger = TRANSITION_TRIGGER_BY_ACTION[String(req.body.action)];
    if (transitionTrigger) {
      enqueueNotificationDispatchStartJob({
        tenantId: req.user!.tenant_id,
        entityType: 'change',
        triggerKey: transitionTrigger,
        entityId: String(req.params.id),
        actorUserId: req.user!.id,
      }).catch(() => {});
    }
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/approvals/:approvalId/decision', validateBody(changeApprovalDecisionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    await decideApproval(
      client,
      actorFrom(req),
      String(req.params.id),
      String(req.params.approvalId),
      req.body,
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/journal', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const entries = await getJournal(client, String(req.params.id));
    res.json({ entries });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:id/journal',
  validateBody(addChangeJournalEntrySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const entry = await addJournalEntry(client, actorFrom(req), String(req.params.id), req.body);
      res.status(201).json(entry);
    } catch (err) {
      next(err);
    }
  },
);

router.get('/:id/audit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const entries = await getAudit(client, String(req.params.id));
    res.json({ entries });
  } catch (err) {
    next(err);
  }
});

export default router;
