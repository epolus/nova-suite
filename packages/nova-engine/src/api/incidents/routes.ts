/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Incident Routes (Fulfiller Backend) ───
// Thin HTTP layer: auth, validation, response shaping, Temporal enqueue
// side effects. DB / business logic lives in the sibling service modules
// (list, mutations, journal, bulk, relations).
// GET    /api/incidents              – list incidents
// POST   /api/incidents              – create incident
// GET    /api/incidents/:id          – get incident
// PATCH  /api/incidents/:id          – update incident
// GET    /api/incidents/:id/journal  – get journal entries
// POST   /api/incidents/:id/journal  – add journal entry

import { Router, Request, Response, NextFunction } from 'express';
import {
  authenticate,
  requireRole,
  getRequestClient,
  setTenantRLS,
  releaseTenantClient,
} from '../../middleware/auth';
import { validateBody, validateQuery } from '../../middleware/validate';
import {
  createIncidentSchema,
  updateIncidentSchema,
  addJournalEntrySchema,
  incidentLinkMajorIncidentSchema,
  paginationSchema,
  rankedSuggestionsQuerySchema,
} from '../../domain/schemas';
import { AppError } from '../../middleware/errorHandler';
import { createEssIncident } from '../../domain/incidents/create-ess-incident';
import { schedulePostCreateAiAssist } from '../../ai/post-create';
import {
  enqueueIncidentEscalationStartJob,
  enqueueNotificationDispatchStartJob,
} from '../../temporal/workflow-start-queue';
import { canViewAlerts, isFulfillerRole } from '../roles';
import { logger } from '../../logger';
import {
  getIncidentNav,
  getIncidentStats,
  listAssignmentGroups,
  listCallers,
  listCategories,
  listIncidents,
  listResolutionCodes,
  listServices,
} from './list';
import { createIncident, getIncident, updateIncident } from './mutations';
import { addJournalEntry, getJournal } from './journal';
import { bulkUpdate } from './bulk';
import {
  acceptAiSuggestion,
  getCorrelations,
  getIncidentKnownErrors,
  getIncidentProblems,
  getIncidentsByCi,
  getKnownErrorsByContext,
  getSimilarByText,
  getSimilarIncidents,
  linkMajorIncident,
  linkProblem,
  listAiSuggestions,
  rejectAiSuggestion,
  unlinkProblem,
} from './relations';
import type { IncidentActor, IncidentHttpFailure } from './types';

const router = Router();

function actorFrom(req: Request): IncidentActor {
  return {
    id: req.user!.id,
    tenant_id: req.user!.tenant_id,
    isFulfiller: isFulfillerRole(req),
  };
}

function sendFailure(res: Response, failure: IncidentHttpFailure): void {
  res.status(failure.status).json({ error: failure.error });
}

// All incident routes require auth + tenant context
router.use(authenticate, setTenantRLS, releaseTenantClient);

// ─── GET /api/incidents/services ─── (list services for dropdowns)
router.get('/services', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const services = await listServices(client);
    res.json({ services });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/incidents/callers ─── (list callers for incident submit)
router.get('/callers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const users = await listCallers(client);
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/incidents ───
router.get(
  '/',
  validateQuery(paginationSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 20;
      const result = await listIncidents(
        client,
        req.query as Record<string, unknown>,
        { id: req.user!.id },
        { isFulfiller: isFulfillerRole(req), page, limit },
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/incidents ───
router.post(
  '/',
  requireRole('admin', 'fulfiller'),
  validateBody(createIncidentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const actor = actorFrom(req);
      const { title, description } = req.body;

      const created = await createIncident(client, actor, req.body);
      const incident = created.incident;

      // Fire-and-forget via durable queue: start SLA escalation workflow
      const incidentId = String(incident.id);
      if (created.slaResolutionDueAt || created.slaResponseDueAt) {
        enqueueIncidentEscalationStartJob({
          incidentId,
          tenantId: req.user!.tenant_id,
          priority: created.priority,
          slaDueAt: String(created.slaResolutionDueAt || created.slaResponseDueAt),
          responseDueAt: created.slaResponseDueAt == null
            ? null
            : String(created.slaResponseDueAt),
        }).catch(() => {});
      }

      enqueueNotificationDispatchStartJob({
        tenantId: req.user!.tenant_id,
        entityType: 'incident',
        triggerKey: 'incident.created',
        entityId: incidentId,
        actorUserId: req.user!.id,
      }).catch(() => {});

      schedulePostCreateAiAssist({
        tenantId: req.user!.tenant_id,
        actorUserId: req.user!.id,
        incidentId,
        title,
        description: description || null,
        essChannel: false,
      });

      res.status(201).json({ ...incident, custom_fields: created.custom_fields });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/incidents/ess ─── (ESS-only simplified submit)
router.post(
  '/ess',
  requireRole('admin', 'fulfiller', 'user'),
  validateBody(createIncidentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (isFulfillerRole(req)) {
        throw new AppError(403, 'Use /api/incidents for agent incident creation');
      }

      const client = getRequestClient(req);
      const incident = await createEssIncident(
        client,
        req.user!.id,
        req.user!.tenant_id,
        req.body,
      );
      res.status(201).json(incident);
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/incidents/stats ───
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const stats = await getIncidentStats(
      client,
      { id: req.user!.id },
      { isFulfiller: isFulfillerRole(req) },
    );
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/incidents/assignment-groups ───
router.get('/assignment-groups', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const assignment_groups = await listAssignmentGroups(client);
    res.json({ assignment_groups });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/incidents/categories ───
router.get('/categories', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const includeInactive = String((req.query as Record<string, unknown>).include_inactive ?? '') === 'true';
    const categories = await listCategories(client, { includeInactive });
    res.json({ categories });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/incidents/resolution-codes ───
router.get('/resolution-codes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const includeInactive = String((req.query as Record<string, unknown>).include_inactive ?? '') === 'true';
    const resolution_codes = await listResolutionCodes(client, { includeInactive });
    res.json({ resolution_codes });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/incidents/bulk ───
router.patch(
  '/bulk',
  requireRole('admin', 'fulfiller'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const { ids, action, value } = req.body as { ids: string[]; action: string; value?: string };
      if (!Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ error: 'ids array is required' }); return;
      }
      const result = await bulkUpdate(client, ids, action, value);
      if (!result.ok) {
        sendFailure(res, result);
        return;
      }
      res.json(result.data);
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/incidents/nav ─── (prev/next navigation)
router.get('/nav', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const currentId = req.query.current as string;
    if (!currentId) {
      res.json({ prev_id: null, next_id: null });
      return;
    }

    const nav = await getIncidentNav(
      client,
      req.query as Record<string, unknown>,
      { id: req.user!.id },
      { isFulfiller: isFulfillerRole(req), currentId },
    );

    const requestStartedAt = (req as { _requestStartedAt?: number })._requestStartedAt;
    const dbClientAcquiredAt = (req as { _dbClientAcquiredAt?: number })._dbClientAcquiredAt;
    const authAndPoolMs =
      requestStartedAt != null && dbClientAcquiredAt != null
        ? dbClientAcquiredAt - requestStartedAt
        : null;
    const totalMs = requestStartedAt != null ? Date.now() - requestStartedAt : null;

    logger.info(
      {
        incidentId: currentId,
        authAndPoolMs,
        queryMs: nav.queryMs,
        totalMs,
        filterCount: nav.filterCount,
      },
      'incident nav timing',
    );
    res.setHeader(
      'Server-Timing',
      `auth-pool;dur=${authAndPoolMs ?? 0}, db;dur=${nav.queryMs}`,
    );

    res.json({
      prev_id: nav.prev_id,
      next_id: nav.next_id,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/incidents/:id/similar ───
router.get(
  '/:id/similar',
  validateQuery(rankedSuggestionsQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const incidentId = String(req.params.id);
      const limit = Number((req.query as Record<string, unknown>).limit ?? 5);

      const result = await getSimilarIncidents(client, actorFrom(req), incidentId, limit);
      if (!result.ok) {
        sendFailure(res, result);
        return;
      }
      res.json(result.data);
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/incidents/similar-by-text ───
router.get('/similar-by-text', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const title = String((req.query as Record<string, unknown>).title ?? '');
    const description = String((req.query as Record<string, unknown>).description ?? '');
    const limit = Math.min(Number((req.query as Record<string, unknown>).limit ?? 6), 20);

    const incidents = await getSimilarByText(client, actorFrom(req), { title, description, limit });
    res.json({ incidents });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/incidents/by-ci/:ciId ───
router.get('/by-ci/:ciId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const incidents = await getIncidentsByCi(client, String(req.params.ciId));
    res.json({ incidents });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/incidents/known-errors-by-context ───
router.get('/known-errors-by-context', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const known_errors = await getKnownErrorsByContext(client, req.query as Record<string, unknown>);
    res.json({ known_errors });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/incidents/:id ───
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const result = await getIncident(client, actorFrom(req), String(req.params.id));
    if (!result.ok) {
      sendFailure(res, result);
      return;
    }
    res.json(result.data);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/incidents/:id/correlations ───
router.get('/:id/correlations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!canViewAlerts(req)) {
      res.json({ hints: [] });
      return;
    }
    const client = getRequestClient(req);
    const hints = await getCorrelations(client, String(req.params.id));
    res.json({ hints });
  } catch (err) { next(err); }
});

// ─── GET /api/incidents/:id/known-errors ───
router.get('/:id/known-errors', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const result = await getIncidentKnownErrors(client, actorFrom(req), String(req.params.id));
    if (!result.ok) {
      sendFailure(res, result);
      return;
    }
    res.json({ known_errors: result.data });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:id/link-major-incident',
  requireRole('admin', 'fulfiller', 'major_incident_manager'),
  validateBody(incidentLinkMajorIncidentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const { major_incident_id: majorIncidentId } = req.body as { major_incident_id: string };

      const result = await linkMajorIncident(
        client,
        actorFrom(req),
        String(req.params.id),
        majorIncidentId,
      );
      if (!result.ok) {
        sendFailure(res, result);
        return;
      }
      res.status(201).json(result.data);
      return;
    } catch (err) {
      next(err);
      return;
    }
  },
);

// ─── GET /api/incidents/:id/ai-suggestions ───
router.get(
  '/:id/ai-suggestions',
  requireRole('admin', 'fulfiller'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const suggestions = await listAiSuggestions(client, String(req.params.id));
      res.json({ suggestions });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/incidents/:id/ai-suggestions/:suggestionId/accept ───
router.post(
  '/:id/ai-suggestions/:suggestionId/accept',
  requireRole('admin', 'fulfiller'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const result = await acceptAiSuggestion(
        client,
        actorFrom(req),
        String(req.params.id),
        String(req.params.suggestionId),
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/incidents/:id/ai-suggestions/:suggestionId/reject ───
router.post(
  '/:id/ai-suggestions/:suggestionId/reject',
  requireRole('admin', 'fulfiller'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const result = await rejectAiSuggestion(
        client,
        actorFrom(req),
        String(req.params.id),
        String(req.params.suggestionId),
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/incidents/:id/problems ───
router.get('/:id/problems', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const result = await getIncidentProblems(client, actorFrom(req), String(req.params.id));
    if (!result.ok) {
      sendFailure(res, result);
      return;
    }
    res.json({ problems: result.data });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/incidents/:id/problems ───
router.post(
  '/:id/problems',
  requireRole('admin', 'fulfiller'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const { problem_id, relationship_type } = req.body || {};
      if (!problem_id) throw new AppError(400, 'problem_id is required');

      await linkProblem(client, String(req.params.id), problem_id, relationship_type);
      res.status(201).json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─── DELETE /api/incidents/:id/problems/:problemId ───
router.delete(
  '/:id/problems/:problemId',
  requireRole('admin', 'fulfiller'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      await unlinkProblem(client, String(req.params.id), String(req.params.problemId));
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─── PATCH /api/incidents/:id ───
router.patch(
  '/:id',
  validateBody(updateIncidentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const result = await updateIncident(client, actorFrom(req), String(req.params.id), req.body);
      if (!result.ok) {
        sendFailure(res, result);
        return;
      }
      res.json(result.data);
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/incidents/:id/journal ───
router.get('/:id/journal', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const journal = await getJournal(client, String(req.params.id));
    const requestStartedAt = (req as { _requestStartedAt?: number })._requestStartedAt;
    const dbClientAcquiredAt = (req as { _dbClientAcquiredAt?: number })._dbClientAcquiredAt;
    const authAndPoolMs =
      requestStartedAt != null && dbClientAcquiredAt != null
        ? dbClientAcquiredAt - requestStartedAt
        : null;
    const totalMs = requestStartedAt != null ? Date.now() - requestStartedAt : null;

    logger.info(
      {
        incidentId: req.params.id,
        authAndPoolMs,
        queryMs: journal.queryMs,
        totalMs,
        rowCount: journal.rowCount,
      },
      'incident journal timing',
    );
    res.setHeader(
      'Server-Timing',
      `auth-pool;dur=${authAndPoolMs ?? 0}, db;dur=${journal.queryMs}`,
    );

    res.json({ entries: journal.entries });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/incidents/:id/journal ───
router.post(
  '/:id/journal',
  validateBody(addJournalEntrySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const result = await addJournalEntry(client, actorFrom(req), String(req.params.id), req.body);
      if (!result.ok) {
        sendFailure(res, result);
        return;
      }
      res.status(201).json(result.data);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
