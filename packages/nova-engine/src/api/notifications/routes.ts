/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Notification Routes ───
// GET  /api/notifications               – list recent notifications for current user
// GET  /api/notifications/unread-count  – unread count
// POST /api/notifications/:id/read      – mark one as read
// POST /api/notifications/read-all      – mark all as read
// POST /api/notifications/delete-all    – delete all notifications for current user

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, setTenantRLS, releaseTenantClient, getRequestClient } from '../../middleware/auth';

const router = Router();

router.use(authenticate, setTenantRLS, releaseTenantClient);

function isMissingIsActiveColumn(err: unknown): boolean {
  return Boolean((err as { code?: string } | null)?.code === '42703');
}

// ─── GET /notifications/unread-count ───
router.get('/unread-count', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    let result;
    try {
      result = await client.query(
        `SELECT COUNT(*)::int AS count FROM notifications
         WHERE user_id = $1 AND tenant_id = current_tenant_id() AND is_active = true AND is_read = false`,
        [req.user!.id],
      );
    } catch (err) {
      if (!isMissingIsActiveColumn(err)) throw err;
      result = await client.query(
        `SELECT COUNT(*)::int AS count FROM notifications
         WHERE user_id = $1 AND tenant_id = current_tenant_id() AND is_read = false`,
        [req.user!.id],
      );
    }
    res.json({ count: result.rows[0].count });
  } catch (err) {
    next(err);
  }
});

// ─── GET /notifications ───
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    let result;
    try {
      result = await client.query(
        `SELECT id, type, title, body, entity_type, entity_id, is_read, created_at
         FROM notifications
         WHERE user_id = $1 AND tenant_id = current_tenant_id() AND is_active = true
         ORDER BY created_at DESC
         LIMIT 50`,
        [req.user!.id],
      );
    } catch (err) {
      if (!isMissingIsActiveColumn(err)) throw err;
      result = await client.query(
        `SELECT id, type, title, body, entity_type, entity_id, is_read, created_at
         FROM notifications
         WHERE user_id = $1 AND tenant_id = current_tenant_id()
         ORDER BY created_at DESC
         LIMIT 50`,
        [req.user!.id],
      );
    }
    res.json({ notifications: result.rows });
  } catch (err) {
    next(err);
  }
});

// ─── POST /notifications/read-all ───
router.post('/read-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    try {
      await client.query(
        `UPDATE notifications SET is_read = true
         WHERE user_id = $1 AND tenant_id = current_tenant_id() AND is_active = true AND is_read = false`,
        [req.user!.id],
      );
    } catch (err) {
      if (!isMissingIsActiveColumn(err)) throw err;
      await client.query(
        `UPDATE notifications SET is_read = true
         WHERE user_id = $1 AND tenant_id = current_tenant_id() AND is_read = false`,
        [req.user!.id],
      );
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─── POST /notifications/delete-all ───
// Soft-delete by setting is_active=false (keeps history if needed).
router.post('/delete-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    try {
      const r = await client.query(
        `UPDATE notifications SET is_active = false
         WHERE user_id = $1 AND tenant_id = current_tenant_id() AND is_active = true`,
        [req.user!.id],
      );
      res.json({ success: true, deleted: r.rowCount });
    } catch (err) {
      // Backwards compat in case schema changes.
      res.json({ success: false, error: (err as Error).message });
    }
  } catch (err) {
    next(err);
  }
});

// ─── POST /notifications/:id/read ───
router.post('/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    try {
      await client.query(
        `UPDATE notifications SET is_read = true
         WHERE id = $1 AND user_id = $2 AND tenant_id = current_tenant_id() AND is_active = true`,
        [req.params.id, req.user!.id],
      );
    } catch (err) {
      if (!isMissingIsActiveColumn(err)) throw err;
      await client.query(
        `UPDATE notifications SET is_read = true
         WHERE id = $1 AND user_id = $2 AND tenant_id = current_tenant_id()`,
        [req.params.id, req.user!.id],
      );
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
