/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Request Routes (User Portal) ───
// GET    /api/requests           – list my requests
// POST   /api/requests           – submit a new request
// GET    /api/requests/:id       – get request details
// POST   /api/requests/:id/approve – approve/reject (admin/fulfiller)

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
  createRequestSchema,
  batchRequestSchema,
  approveRequestSchema,
  paginationSchema,
} from '../../domain/schemas';
import { NotFound, BadRequest } from '../../middleware/errorHandler';
import { startCatalogFulfillment, signalTaskCompleted, startNotificationDispatch } from '../../temporal/workflows';
import { isAdminRole, isFulfillerRole } from '../roles';
import { getRequestApprovalTrigger } from '../../notifications/triggers';

interface FormFieldDef {
  name: string;
  label?: string;
  type: string;
  required?: boolean;
  options?: string[];
  min?: number;
  max?: number;
  pattern?: string;
  ci_class?: string;
}

function validateFormData(
  fields: FormFieldDef[],
  data: Record<string, unknown>,
): Record<string, string> | null {
  if (!fields || fields.length === 0) return null;
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const raw = data[field.name];
    const val = raw != null ? String(raw).trim() : '';

    if (field.required && !val && field.type !== 'checkbox') {
      errors[field.name] = `${field.label || field.name} is required`;
      continue;
    }
    if (!val) continue;

    if (field.type === 'number') {
      const n = Number(val);
      if (isNaN(n)) { errors[field.name] = 'Must be a number'; continue; }
      if (field.min != null && n < field.min) { errors[field.name] = `Minimum value is ${field.min}`; continue; }
      if (field.max != null && n > field.max) { errors[field.name] = `Maximum value is ${field.max}`; continue; }
    }

    if (field.type === 'email' && val) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        errors[field.name] = 'Invalid email address';
        continue;
      }
    }

    if (field.type === 'select' && field.options && field.options.length > 0) {
      if (!field.options.includes(val)) {
        errors[field.name] = `Invalid option: ${val}`;
        continue;
      }
    }

    if (field.pattern) {
      try {
        if (!new RegExp(field.pattern).test(val)) {
          errors[field.name] = `Does not match the required format`;
        }
      } catch {}
    }
  }
  return Object.keys(errors).length > 0 ? errors : null;
}

const router = Router();

router.use(authenticate, setTenantRLS, releaseTenantClient);

// ─── GET /api/requests ───
router.get(
  '/',
  validateQuery(paginationSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const { page, limit } = req.query as any;
      const offset = (page - 1) * limit;

      // Build dynamic filters
      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 0;

      // Regular users only see their own requests
      const isPrivileged = isFulfillerRole(req);
      if (!isPrivileged) {
        paramIdx++;
        conditions.push(`(r.requester_id = $${paramIdx} OR r.requested_for = $${paramIdx})`);
        params.push(req.user!.id);
      }

      if (req.query.status) {
        paramIdx++;
        conditions.push(`r.status = $${paramIdx}`);
        params.push(req.query.status);
      } else if (req.query.active === 'true') {
        conditions.push(`r.status IN ('submitted', 'pending_approval', 'approved', 'in_progress')`);
      }
      if (req.query.search) {
        paramIdx++;
        conditions.push(`(r.number ILIKE $${paramIdx} OR si.name ILIKE $${paramIdx} OR u.display_name ILIKE $${paramIdx} OR r.notes ILIKE $${paramIdx})`);
        params.push(`%${req.query.search}%`);
      }

      // Per-column "starts with" filters (cf.column=value)
      const cfMap: Record<string, string> = {
        number: 'r.number', status: 'r.status',
        service_item_name: 'si.name', requester_name: 'u.display_name',
        requested_for_name: 'rf.display_name', notes: 'r.notes',
      };
      for (const [qKey, qVal] of Object.entries(req.query)) {
        if (typeof qKey === 'string' && qKey.startsWith('cf.') && typeof qVal === 'string' && qVal) {
          const col = cfMap[qKey.slice(3)];
          if (col) {
            paramIdx++;
            conditions.push(`${col} ILIKE $${paramIdx}`);
            params.push(`${qVal}%`);
          }
        }
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const allowedSortCols: Record<string, string> = {
        number: 'r.number',
        priority: 'r.priority',
        status: 'r.status',
        created_at: 'r.created_at',
        updated_at: 'r.updated_at',
        approved_at: 'r.approved_at',
        service_item_name: 'si.name',
        requester_name: 'u.display_name',
        requested_for_name: 'rf.display_name',
      };
      const sortBy = typeof req.query.sort_by === 'string' && allowedSortCols[req.query.sort_by]
        ? allowedSortCols[req.query.sort_by]
        : 'r.created_at';
      const sortDir = req.query.sort_dir === 'asc' ? 'ASC' : 'DESC';
      const orderBy = `${sortBy} ${sortDir}, r.id ASC`;

      const countResult = await client.query(
        `SELECT count(*) FROM requests r
         JOIN service_items si ON si.id = r.service_item_id
         JOIN users u ON u.id = r.requester_id
         LEFT JOIN users rf ON rf.id = r.requested_for
         ${whereClause}`,
        params,
      );
      const total = parseInt(countResult.rows[0].count, 10);

      paramIdx++;
      params.push(limit);
      paramIdx++;
      params.push(offset);

      const result = await client.query(
        `SELECT r.*, si.name AS service_item_name, u.display_name AS requester_name,
                rf.display_name AS requested_for_name
         FROM requests r
         JOIN service_items si ON si.id = r.service_item_id
         JOIN users u ON u.id = r.requester_id
         LEFT JOIN users rf ON rf.id = r.requested_for
         ${whereClause}
         ORDER BY ${orderBy}
         LIMIT $${paramIdx - 1} OFFSET $${paramIdx}`,
        params,
      );

      res.json({
        requests: result.rows,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/requests/nav ─── (prev/next navigation)
router.get('/nav', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const currentId = req.query.current as string;
    if (!currentId) {
      res.json({ prev_id: null, next_id: null });
      return;
    }

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 0;

    const isPrivileged = isFulfillerRole(req);
    if (!isPrivileged) {
      paramIdx++;
      conditions.push(`(r.requester_id = $${paramIdx} OR r.requested_for = $${paramIdx})`);
      params.push(req.user!.id);
    }

    if (req.query.status) {
      paramIdx++;
      conditions.push(`r.status = $${paramIdx}`);
      params.push(req.query.status);
    } else if (req.query.active === 'true') {
      conditions.push(`r.status IN ('submitted', 'pending_approval', 'approved', 'in_progress')`);
    }
    if (req.query.search) {
      paramIdx++;
      conditions.push(`(r.number ILIKE $${paramIdx} OR si.name ILIKE $${paramIdx} OR u.display_name ILIKE $${paramIdx} OR r.notes ILIKE $${paramIdx})`);
      params.push(`%${req.query.search}%`);
    }

    const cfMap: Record<string, string> = {
      number: 'r.number', status: 'r.status',
      service_item_name: 'si.name', requester_name: 'u.display_name',
      requested_for_name: 'rf.display_name', notes: 'r.notes',
    };
    for (const [qKey, qVal] of Object.entries(req.query)) {
      if (typeof qKey === 'string' && qKey.startsWith('cf.') && typeof qVal === 'string' && qVal) {
        const col = cfMap[qKey.slice(3)];
        if (col) {
          paramIdx++;
          conditions.push(`${col} ILIKE $${paramIdx}`);
          params.push(`${qVal}%`);
        }
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const allowedSortCols: Record<string, string> = {
      number: 'r.number',
      priority: 'r.priority',
      status: 'r.status',
      created_at: 'r.created_at',
      updated_at: 'r.updated_at',
      approved_at: 'r.approved_at',
      service_item_name: 'si.name',
      requester_name: 'u.display_name',
      requested_for_name: 'rf.display_name',
    };
    const sortBy = typeof req.query.sort_by === 'string' && allowedSortCols[req.query.sort_by]
      ? allowedSortCols[req.query.sort_by]
      : 'r.created_at';
    const sortDir = req.query.sort_dir === 'asc' ? 'ASC' : 'DESC';
    const orderBy = `${sortBy} ${sortDir}, r.id ASC`;

    const result = await client.query(
      `SELECT r.id
       FROM requests r
       JOIN service_items si ON si.id = r.service_item_id
       JOIN users u ON u.id = r.requester_id
       LEFT JOIN users rf ON rf.id = r.requested_for
       ${whereClause}
       ORDER BY ${orderBy}`,
      params,
    );

    const ids: string[] = result.rows.map((r: { id: string }) => r.id);
    const currentIndex = ids.indexOf(currentId);

    res.json({
      prev_id: currentIndex > 0 ? ids[currentIndex - 1] : null,
      next_id: currentIndex >= 0 && currentIndex < ids.length - 1 ? ids[currentIndex + 1] : null,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/requests ───
router.post(
  '/',
  validateBody(createRequestSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const { service_item_id, form_data, priority, notes, requested_for, delivery_info, batch_id } = req.body;
      const userId = req.user!.id;

      const itemResult = await client.query(
        'SELECT * FROM service_items WHERE id = $1 AND is_active = true',
        [service_item_id],
      );
      if (itemResult.rows.length === 0) {
        throw NotFound('Service item not found');
      }

      const serviceItem = itemResult.rows[0];

      // Validate form_data against the item's form_schema
      const schema = serviceItem.form_schema;
      if (schema?.fields?.length > 0 && form_data) {
        const fieldErrors = validateFormData(schema.fields, form_data);
        if (fieldErrors) {
          throw BadRequest(`Form validation failed: ${Object.values(fieldErrors).join(', ')}`);
        }
      }

      // Verify reference fields exist
      if (schema?.fields?.length > 0 && form_data) {
        for (const field of schema.fields as FormFieldDef[]) {
          const val = form_data[field.name];
          if (!val) continue;
          if (field.type === 'cmdb_ref') {
            const ciCheck = await client.query(
              'SELECT id, status FROM configuration_items WHERE id = $1',
              [val],
            );
            if (ciCheck.rows.length === 0) {
              throw BadRequest(`${field.label || field.name}: Referenced CI not found`);
            }
            if (ciCheck.rows[0].status !== 'active') {
              throw BadRequest(`${field.label || field.name}: Referenced CI is not active (status: ${ciCheck.rows[0].status})`);
            }
          }
          if (field.type === 'user_ref') {
            const userCheck = await client.query(
              'SELECT id FROM users WHERE id = $1',
              [val],
            );
            if (userCheck.rows.length === 0) {
              throw BadRequest(`${field.label || field.name}: Referenced user not found`);
            }
          }
        }
      }

      const taskCheck = await client.query(
        'SELECT count(*) FROM catalog_tasks WHERE service_item_id = $1 AND is_active = true',
        [service_item_id],
      );
      const hasWorkflowTasks = parseInt(taskCheck.rows[0].count, 10) > 0;

      const seqResult = await client.query("SELECT nextval('request_number_seq')");
      const number = `REQ${seqResult.rows[0].nextval.toString().padStart(7, '0')}`;

      let status: string;
      if (hasWorkflowTasks) {
        status = 'submitted';
      } else {
        status = serviceItem.approval_required ? 'pending_approval' : 'in_progress';
      }

      const result = await client.query(
        `INSERT INTO requests (
          tenant_id, number, requester_id, requested_for, service_item_id,
          form_data, delivery_info, batch_id, status, priority, notes
        ) VALUES (
          current_tenant_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
        ) RETURNING *`,
        [
          number, userId, requested_for || null, service_item_id,
          JSON.stringify(form_data), JSON.stringify(delivery_info || {}),
          batch_id || null, status, priority, notes || null,
        ],
      );

      const newRequest = result.rows[0];

      if (hasWorkflowTasks) {
        try {
          await startCatalogFulfillment({
            requestId: newRequest.id,
            tenantId: req.user!.tenant_id,
            serviceItemId: service_item_id,
          });
        } catch {
          // Don't fail the request creation if workflow start fails
        }
      }

      startNotificationDispatch({
        tenantId: req.user!.tenant_id,
        entityType: 'request',
        triggerKey: 'request.created',
        entityId: String(newRequest.id),
        actorUserId: req.user!.id,
      }).catch(() => {});

      res.status(201).json(newRequest);
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/requests/batch ───
router.post(
  '/batch',
  validateBody(batchRequestSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const { items, requested_for, delivery_info } = req.body;
      const userId = req.user!.id;
      const { v4: uuidv4 } = await import('uuid');
      const batchId = uuidv4();

      const createdRequests: any[] = [];

      await client.query('BEGIN');
      try {
        for (const item of items) {
          const itemResult = await client.query(
            'SELECT * FROM service_items WHERE id = $1 AND is_active = true',
            [item.service_item_id],
          );
          if (itemResult.rows.length === 0) {
            throw BadRequest(`Service item ${item.service_item_id} not found or inactive`);
          }
          const serviceItem = itemResult.rows[0];

          // Validate form_data for each batch item
          const batchSchema = serviceItem.form_schema;
          if (batchSchema?.fields?.length > 0 && item.form_data) {
            const fieldErrors = validateFormData(batchSchema.fields, item.form_data);
            if (fieldErrors) {
              throw BadRequest(`${serviceItem.name}: ${Object.values(fieldErrors).join(', ')}`);
            }
            for (const field of batchSchema.fields as FormFieldDef[]) {
              const val = item.form_data[field.name];
              if (!val) continue;
              if (field.type === 'cmdb_ref') {
                const ciCheck = await client.query(
                  'SELECT id, status FROM configuration_items WHERE id = $1',
                  [val],
                );
                if (ciCheck.rows.length === 0) {
                  throw BadRequest(`${serviceItem.name} - ${field.label || field.name}: Referenced CI not found`);
                }
                if (ciCheck.rows[0].status !== 'active') {
                  throw BadRequest(`${serviceItem.name} - ${field.label || field.name}: Referenced CI is not active (status: ${ciCheck.rows[0].status})`);
                }
              }
              if (field.type === 'user_ref') {
                const userCheck = await client.query('SELECT id FROM users WHERE id = $1', [val]);
                if (userCheck.rows.length === 0) {
                  throw BadRequest(`${serviceItem.name} - ${field.label || field.name}: Referenced user not found`);
                }
              }
            }
          }

          const taskCheck = await client.query(
            'SELECT count(*) FROM catalog_tasks WHERE service_item_id = $1 AND is_active = true',
            [item.service_item_id],
          );
          const hasWorkflowTasks = parseInt(taskCheck.rows[0].count, 10) > 0;

          const seqResult = await client.query("SELECT nextval('request_number_seq')");
          const number = `REQ${seqResult.rows[0].nextval.toString().padStart(7, '0')}`;

          let status: string;
          if (hasWorkflowTasks) {
            status = 'submitted';
          } else {
            status = serviceItem.approval_required ? 'pending_approval' : 'in_progress';
          }

          const result = await client.query(
            `INSERT INTO requests (
              tenant_id, number, requester_id, requested_for, service_item_id,
              form_data, delivery_info, batch_id, status, priority, notes
            ) VALUES (
              current_tenant_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
            ) RETURNING *`,
            [
              number, userId, requested_for || null, item.service_item_id,
              JSON.stringify(item.form_data || {}), JSON.stringify(delivery_info || {}),
              batchId, status, item.priority || 'medium', item.notes || null,
            ],
          );

          createdRequests.push(result.rows[0]);
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }

      // Start workflows outside the DB transaction
      for (const newReq of createdRequests) {
        const taskCheck = await client.query(
          'SELECT count(*) FROM catalog_tasks WHERE service_item_id = $1 AND is_active = true',
          [newReq.service_item_id],
        );
        if (parseInt(taskCheck.rows[0].count, 10) > 0) {
          try {
            await startCatalogFulfillment({
              requestId: newReq.id,
              tenantId: req.user!.tenant_id,
              serviceItemId: newReq.service_item_id,
            });
          } catch {
            // Don't fail checkout if a workflow start fails
          }
        }
      }

      res.status(201).json({ batch_id: batchId, requests: createdRequests });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/requests/tasks (standalone task queue) ───
router.get(
  '/tasks',
  validateQuery(paginationSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const { page, limit } = req.query as any;
      const offset = (page - 1) * limit;
      const userId = req.user!.id;

      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 0;

      // Default to active tasks unless explicit status filter
      if (req.query.status) {
        paramIdx++;
        conditions.push(`rt.status = $${paramIdx}`);
        params.push(req.query.status);
      } else {
        conditions.push(`rt.status IN ('pending', 'in_progress')`);
      }

      if (req.query.assigned_to_me === 'true') {
        paramIdx++;
        const assignedParam = paramIdx;
        params.push(userId);
        paramIdx++;
        const managerParam = paramIdx;
        params.push(userId);
        conditions.push(
          `(rt.assigned_to = $${assignedParam}
            OR (
              rt.task_type = 'approval'
              AND rt.assigned_group_id IS NULL
              AND rt.assigned_to IS NULL
              AND EXISTS (
                SELECT 1 FROM users req_u
                WHERE req_u.id = r.requester_id
                  AND req_u.manager_id = $${managerParam}
              )
            ))`,
        );
      }

      if (req.query.my_groups === 'true') {
        paramIdx++;
        conditions.push(
          `rt.assigned_group_id IN (SELECT group_id FROM assignment_group_members WHERE user_id = $${paramIdx})`,
        );
        params.push(userId);
      }

      if (req.query.search) {
        paramIdx++;
        conditions.push(
          `(rt.name ILIKE $${paramIdx} OR r.number ILIKE $${paramIdx} OR si.name ILIKE $${paramIdx})`,
        );
        params.push(`%${req.query.search}%`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await client.query(
        `SELECT count(*) FROM request_tasks rt
         JOIN requests r ON r.id = rt.request_id
         JOIN service_items si ON si.id = r.service_item_id
         ${whereClause}`,
        params,
      );
      const total = parseInt(countResult.rows[0].count, 10);

      paramIdx++;
      params.push(limit);
      paramIdx++;
      params.push(offset);

      const sortCol = req.query.sort_by === 'request_number' ? 'r.number'
        : req.query.sort_by === 'service_item_name' ? 'si.name'
        : req.query.sort_by === 'assigned_group_name' ? 'ag.name'
        : req.query.sort_by ? `rt.${req.query.sort_by}`
        : 'rt.created_at';
      const sortDir = req.query.sort_dir === 'asc' ? 'ASC' : 'DESC';

      const result = await client.query(
        `SELECT rt.*,
                r.number AS request_number,
                r.status AS request_status,
                r.requester_id AS requester_id,
                r.requested_for AS requested_for,
                si.name AS service_item_name,
                req_user.display_name AS requester_name,
                u.display_name AS assigned_to_name,
                cb.display_name AS completed_by_name,
                ag.name AS assigned_group_name
         FROM request_tasks rt
         JOIN requests r ON r.id = rt.request_id
         JOIN service_items si ON si.id = r.service_item_id
         JOIN users req_user ON req_user.id = r.requester_id
         LEFT JOIN users u ON u.id = rt.assigned_to
         LEFT JOIN users cb ON cb.id = rt.completed_by
         LEFT JOIN assignment_groups ag ON ag.id = rt.assigned_group_id
         ${whereClause}
         ORDER BY ${sortCol} ${sortDir}
         LIMIT $${paramIdx - 1} OFFSET $${paramIdx}`,
        params,
      );

      res.json({
        tasks: result.rows,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/requests/tasks/:taskId (single task detail) ───
router.get('/tasks/:taskId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const { taskId } = req.params;
    const userId = req.user!.id;

    const result = await client.query(
      `SELECT rt.*,
              r.number AS request_number,
              r.status AS request_status,
              r.requester_id AS requester_id,
              r.requested_for AS requested_for,
              si.name AS service_item_name,
              req_user.display_name AS requester_name,
              u.display_name AS assigned_to_name,
              cb.display_name AS completed_by_name,
              ag.name AS assigned_group_name
       FROM request_tasks rt
       JOIN requests r ON r.id = rt.request_id
       JOIN service_items si ON si.id = r.service_item_id
       JOIN users req_user ON req_user.id = r.requester_id
       LEFT JOIN users u ON u.id = rt.assigned_to
       LEFT JOIN users cb ON cb.id = rt.completed_by
       LEFT JOIN assignment_groups ag ON ag.id = rt.assigned_group_id
       WHERE rt.id = $1`,
      [taskId],
    );

    if (result.rows.length === 0) {
      throw NotFound('Task not found');
    }

    const task = result.rows[0];
    const isAdmin = isAdminRole(req);
    const isAssignee = task.assigned_to === userId;
    let isGroupMember = false;
    if (task.assigned_group_id) {
      const memberCheck = await client.query(
        `SELECT 1 FROM assignment_group_members WHERE group_id = $1 AND user_id = $2`,
        [task.assigned_group_id, userId],
      );
      isGroupMember = memberCheck.rows.length > 0;
    }
    let isRequesterManager = false;
    const approvalSubjectId =
      (task.requested_for as string | null) ?? (task.requester_id as string);
    if (
      task.task_type === 'approval'
      && !task.assigned_group_id
      && approvalSubjectId
    ) {
      const managerCheck = await client.query(
        `SELECT 1 FROM users WHERE id = $1 AND manager_id = $2`,
        [approvalSubjectId, userId],
      );
      isRequesterManager = managerCheck.rows.length > 0;
    }
    if (!isAdmin && !isAssignee && !isGroupMember && !isRequesterManager) {
      throw NotFound('Task not found');
    }

    res.json(task);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/requests/:id ───
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const result = await client.query(
      `SELECT r.*, si.name AS service_item_name, si.form_schema,
              u.display_name AS requester_name,
              a.display_name AS approved_by_name,
              rf.display_name AS requested_for_name
       FROM requests r
       JOIN service_items si ON si.id = r.service_item_id
       JOIN users u ON u.id = r.requester_id
       LEFT JOIN users a ON a.id = r.approved_by
       LEFT JOIN users rf ON rf.id = r.requested_for
       WHERE r.id = $1`,
      [req.params.id],
    );

    if (result.rows.length === 0) {
      throw NotFound('Request not found');
    }

    const request = result.rows[0];

    if (request.batch_id) {
      const batchCount = await client.query(
        'SELECT count(*) FROM requests WHERE batch_id = $1',
        [request.batch_id],
      );
      request.batch_count = parseInt(batchCount.rows[0].count, 10);
    }

    res.json(request);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/requests/:id/approve (admin/fulfiller) ───
router.post(
  '/:id/approve',
  requireRole('admin', 'fulfiller'),
  validateBody(approveRequestSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const { action, notes } = req.body;
      const requestId = req.params.id;
      const approverId = req.user!.id;

      // Get current request
      const existing = await client.query('SELECT * FROM requests WHERE id = $1', [requestId]);
      if (existing.rows.length === 0) {
        throw NotFound('Request not found');
      }

      const request = existing.rows[0];
      if (request.status !== 'pending_approval') {
        throw BadRequest('Request is not pending approval');
      }

      const newStatus = action === 'approve' ? 'approved' : 'rejected';

      const result = await client.query(
        `UPDATE requests
         SET status = $1, approved_by = $2, approved_at = now(),
             notes = COALESCE($3, notes)
         WHERE id = $4
         RETURNING *`,
        [newStatus, approverId, notes || null, requestId],
      );

      // If approved and item doesn't need further work, auto-create incident
      if (action === 'approve') {
        const itemResult = await client.query(
          'SELECT * FROM service_items WHERE id = $1',
          [request.service_item_id],
        );
        const item = itemResult.rows[0];

        // Generate incident number
        const seqResult = await client.query("SELECT nextval('incident_number_seq')");
        const incNumber = `INC${seqResult.rows[0].nextval.toString().padStart(7, '0')}`;

        // Calculate SLA due date
        const slaDueAt = new Date();
        slaDueAt.setHours(slaDueAt.getHours() + (item.sla_hours || 72));

        await client.query(
          `INSERT INTO incidents (
            tenant_id, number, request_id, title, description,
            status, impact, urgency, priority, caller_id, sla_due_at
          ) VALUES (
            current_tenant_id(), $1, $2, $3, $4,
            'new', 'medium', 'medium', 3, $5, $6
          )`,
          [
            incNumber,
            requestId,
            `Request: ${item.name}`,
            `Auto-created from request ${request.number}.\n\nForm data: ${JSON.stringify(request.form_data, null, 2)}`,
            request.requester_id,
            slaDueAt.toISOString(),
          ],
        );

        // Update request status to in_progress
        await client.query("UPDATE requests SET status = 'in_progress' WHERE id = $1", [requestId]);
      }

      const updatedRequest = result.rows[0];
      startNotificationDispatch({
        tenantId: req.user!.tenant_id,
        entityType: 'request',
        triggerKey: getRequestApprovalTrigger(action),
        entityId: String(requestId),
        actorUserId: req.user!.id,
      }).catch(() => {});

      res.json(updatedRequest);
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/requests/:id/tasks ───
router.get('/:id/tasks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const result = await client.query(
      `SELECT rt.*,
              r.requester_id AS requester_id,
              r.requested_for AS requested_for,
              u.display_name AS assigned_to_name,
              cb.display_name AS completed_by_name,
              ag.name AS assigned_group_name
       FROM request_tasks rt
       JOIN requests r ON r.id = rt.request_id
       LEFT JOIN users u ON u.id = rt.assigned_to
       LEFT JOIN users cb ON cb.id = rt.completed_by
       LEFT JOIN assignment_groups ag ON ag.id = rt.assigned_group_id
       WHERE rt.request_id = $1
       ORDER BY rt.task_order, rt.created_at`,
      [req.params.id],
    );
    res.json({ tasks: result.rows });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/requests/:id/tasks/:taskId/complete ───
router.post('/:id/tasks/:taskId/complete',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const { outcome, notes } = req.body;
      const requestId = req.params.id as string;
      const taskId = req.params.taskId as string;
      const userId = req.user!.id;

      const reqOwnerResult = await client.query(
        `SELECT requester_id, requested_for FROM requests WHERE id = $1`,
        [requestId],
      );
      if (reqOwnerResult.rows.length === 0) throw NotFound('Request not found');
      const requestedForId = reqOwnerResult.rows[0].requested_for as string | null;
      const requesterIdForSubject = reqOwnerResult.rows[0].requester_id as string;
      const approvalSubjectId = (requestedForId ?? requesterIdForSubject) as string;

      // Verify the task exists and is in_progress
      const taskResult = await client.query(
        `SELECT * FROM request_tasks WHERE id = $1 AND request_id = $2`,
        [taskId, requestId],
      );
      if (taskResult.rows.length === 0) throw NotFound('Task not found');
      const task = taskResult.rows[0];
      if (task.status !== 'in_progress') throw BadRequest('Task is not in progress');

      // Authorization by task type:
      // - approval + group: group member or admin
      // - approval + no group: request subject's manager or admin (subject = COALESCE(requested_for, requester_id))
      // - non-approval: assignee/group member/admin
      const isAdmin = isAdminRole(req);
      const isAssignee = task.assigned_to === userId;
      let isGroupMember = false;
      if (task.assigned_group_id) {
        const memberCheck = await client.query(
          `SELECT 1 FROM assignment_group_members WHERE group_id = $1 AND user_id = $2`,
          [task.assigned_group_id, userId],
        );
        isGroupMember = memberCheck.rows.length > 0;
      }

      // For approval tasks, outcome is required
      if (task.task_type === 'approval' && !['approved', 'rejected'].includes(outcome)) {
        throw BadRequest('Approval tasks require outcome: approved or rejected');
      }

      // Prevent self-approval: the employee the approval is about cannot approve their own gate (matches createRequestTasks subject = COALESCE(requested_for, requester_id)).
      if (task.task_type === 'approval' && !isAdmin && approvalSubjectId === userId) {
        throw BadRequest('You cannot approve or reject your own request');
      }

      if (task.task_type === 'approval') {
        if (isAdmin) {
          // admin override allowed
        } else if (task.assigned_group_id) {
          if (!isGroupMember) {
            throw BadRequest('Only members of the approver group can decide this approval');
          }
        } else {
          const managerCheck = await client.query(
            `SELECT 1 FROM users WHERE id = $1 AND manager_id = $2`,
            [approvalSubjectId, userId],
          );
          if (managerCheck.rows.length === 0) {
            throw BadRequest('Only the request subject\'s manager can decide this approval');
          }
        }
      } else if (!isAdmin && !isAssignee && !isGroupMember) {
        throw BadRequest('You are not authorized to complete this task');
      }

      const finalOutcome = task.task_type === 'approval' ? outcome : 'completed';

      // Signal the Temporal workflow
      await signalTaskCompleted(requestId, taskId, finalOutcome, notes || null, userId);

      if (task.task_type === 'approval' && (finalOutcome === 'approved' || finalOutcome === 'rejected')) {
        startNotificationDispatch({
          tenantId: req.user!.tenant_id,
          entityType: 'request',
          triggerKey: getRequestApprovalTrigger(finalOutcome),
          entityId: String(requestId),
          actorUserId: req.user!.id,
        }).catch(() => {});
      }

      // Also update the task directly for immediate feedback
      await client.query(
        `UPDATE request_tasks SET
          status = $1, outcome = $2, completed_by = $3, completed_at = now(), notes = $4
         WHERE id = $5`,
        [
          finalOutcome === 'rejected' ? 'rejected' : 'completed',
          task.task_type === 'approval' ? finalOutcome : null,
          userId, notes || null, taskId,
        ],
      );

      const updated = await client.query(
        `SELECT rt.*, u.display_name AS assigned_to_name, cb.display_name AS completed_by_name, ag.name AS assigned_group_name
         FROM request_tasks rt
         LEFT JOIN users u ON u.id = rt.assigned_to
         LEFT JOIN users cb ON cb.id = rt.completed_by
         LEFT JOIN assignment_groups ag ON ag.id = rt.assigned_group_id
         WHERE rt.id = $1`,
        [taskId],
      );

      res.json(updated.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/requests/:id/tasks/:taskId/assign ───
router.post('/:id/tasks/:taskId/assign',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const taskId = req.params.taskId;
      const requestId = req.params.id;
      const userId = req.user!.id;

      // Verify the task exists
      const taskCheck = await client.query(
        `SELECT * FROM request_tasks WHERE id = $1 AND request_id = $2 AND status IN ('pending', 'in_progress')`,
        [taskId, requestId],
      );
      if (taskCheck.rows.length === 0) throw NotFound('Task not found or already completed');
      const task = taskCheck.rows[0];

      // Only group members or admins can self-assign
      const isAdmin = isAdminRole(req);
      if (task.task_type === 'approval') {
        throw BadRequest('Approval tasks cannot be self-assigned');
      }
      if (!isAdmin && task.assigned_group_id) {
        const memberCheck = await client.query(
          `SELECT 1 FROM assignment_group_members WHERE group_id = $1 AND user_id = $2`,
          [task.assigned_group_id, userId],
        );
        if (memberCheck.rows.length === 0) {
          throw BadRequest('You must be a member of the assigned group to claim this task');
        }
      }

      const result = await client.query(
        `UPDATE request_tasks SET assigned_to = $1
         WHERE id = $2 AND request_id = $3
         RETURNING *`,
        [userId, taskId, requestId],
      );

      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
