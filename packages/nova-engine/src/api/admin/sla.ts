/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Admin: SLA definitions and business calendars ───

import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../../data/db';
import { AppError } from '../../middleware/errorHandler';

const router = Router();

// ════════════════════════════════════════════
// SLA DEFINITIONS
// ════════════════════════════════════════════

router.get('/sla-definitions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const rows = await db.getMany(
      `SELECT sd.*, svc.name AS condition_service_name
       FROM sla_definitions sd
       LEFT JOIN services svc ON svc.id = sd.condition_service_id
       WHERE sd.tenant_id = $1
       ORDER BY sd.sort_order, sd.name`,
      [tenantId],
    );
    res.json({ sla_definitions: rows });
  } catch (err) { next(err); }
});

router.post('/sla-definitions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const {
      name, description, process_type,
      condition_priority, condition_impact, condition_urgency,
      condition_category, condition_service_id,
      resolution_hours, response_hours, auto_close_days, warning_pct,
      on_warning, on_breach, sort_order,
    } = req.body;

    if (!name) throw new AppError(400, 'name is required');
    if (!resolution_hours) throw new AppError(400, 'resolution_hours is required');

    const row = await db.getOne<{ id: string }>(
      `INSERT INTO sla_definitions (
        tenant_id, name, description, process_type,
        condition_priority, condition_impact, condition_urgency,
        condition_category, condition_service_id,
        resolution_hours, response_hours, auto_close_days, warning_pct,
        on_warning, on_breach, sort_order
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      ) RETURNING id`,
      [
        tenantId, name, description || null, process_type || 'incident',
        condition_priority ?? null, condition_impact || null, condition_urgency || null,
        condition_category || null, condition_service_id || null,
        resolution_hours, response_hours ?? null, auto_close_days ?? 7, warning_pct ?? 80,
        JSON.stringify(on_warning || []), JSON.stringify(on_breach || []),
        sort_order ?? 100,
      ],
    );
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.patch('/sla-definitions/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const {
      name, description, process_type,
      condition_priority, condition_impact, condition_urgency,
      condition_category, condition_service_id,
      resolution_hours, response_hours, auto_close_days, warning_pct,
      on_warning, on_breach, is_active, sort_order,
    } = req.body;

    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;

    if (name !== undefined) { sets.push(`name = $${i++}`); vals.push(name); }
    if (description !== undefined) { sets.push(`description = $${i++}`); vals.push(description || null); }
    if (process_type !== undefined) { sets.push(`process_type = $${i++}`); vals.push(process_type); }
    if (condition_priority !== undefined) { sets.push(`condition_priority = $${i++}`); vals.push(condition_priority); }
    if (condition_impact !== undefined) { sets.push(`condition_impact = $${i++}`); vals.push(condition_impact || null); }
    if (condition_urgency !== undefined) { sets.push(`condition_urgency = $${i++}`); vals.push(condition_urgency || null); }
    if (condition_category !== undefined) { sets.push(`condition_category = $${i++}`); vals.push(condition_category || null); }
    if (condition_service_id !== undefined) { sets.push(`condition_service_id = $${i++}`); vals.push(condition_service_id || null); }
    if (resolution_hours !== undefined) { sets.push(`resolution_hours = $${i++}`); vals.push(resolution_hours); }
    if (response_hours !== undefined) { sets.push(`response_hours = $${i++}`); vals.push(response_hours); }
    if (auto_close_days !== undefined) { sets.push(`auto_close_days = $${i++}`); vals.push(auto_close_days); }
    if (warning_pct !== undefined) { sets.push(`warning_pct = $${i++}`); vals.push(warning_pct); }
    if (on_warning !== undefined) { sets.push(`on_warning = $${i++}`); vals.push(JSON.stringify(on_warning)); }
    if (on_breach !== undefined) { sets.push(`on_breach = $${i++}`); vals.push(JSON.stringify(on_breach)); }
    if (is_active !== undefined) { sets.push(`is_active = $${i++}`); vals.push(is_active); }
    if (sort_order !== undefined) { sets.push(`sort_order = $${i++}`); vals.push(sort_order); }

    if (sets.length === 0) { res.json({ success: true }); return; }

    vals.push(req.params.id, tenantId);
    await db.query(
      `UPDATE sla_definitions SET ${sets.join(', ')} WHERE id = $${i++} AND tenant_id = $${i}`,
      vals,
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.delete('/sla-definitions/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    await db.query('DELETE FROM sla_definitions WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════
// BUSINESS CALENDARS
// ════════════════════════════════════════════

router.get('/business-calendars', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const rows = await db.getMany(
      `SELECT * FROM business_calendars
       WHERE tenant_id = $1
       ORDER BY is_default DESC, name ASC`,
      [tenantId],
    );
    res.json({ business_calendars: rows });
  } catch (err) { next(err); }
});

router.get('/business-calendars/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const calendar = await db.getOne(
      `SELECT * FROM business_calendars WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, tenantId],
    );
    if (!calendar) throw new AppError(404, 'Calendar not found');
    const hours = await db.getMany(
      `SELECT id, day_of_week, start_time::text AS start_time, end_time::text AS end_time
       FROM business_hours WHERE calendar_id = $1
       ORDER BY day_of_week, start_time`,
      [req.params.id],
    );
    const holidayRows = await db.getMany(
      `SELECT id, holiday_date::text AS holiday_date, name
       FROM holidays WHERE calendar_id = $1
       ORDER BY holiday_date`,
      [req.params.id],
    );
    res.json({ ...calendar, hours, holidays: holidayRows });
  } catch (err) { next(err); }
});

router.post('/business-calendars', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const { name, timezone, is_default, hours, holidays } = req.body || {};
    if (!name || !String(name).trim()) throw new AppError(400, 'name is required');

    if (is_default) {
      await db.query(
        `UPDATE business_calendars SET is_default = false WHERE tenant_id = $1 AND is_default = true`,
        [tenantId],
      );
    }

    const row = await db.getOne<{ id: string }>(
      `INSERT INTO business_calendars (tenant_id, name, timezone, is_default)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [tenantId, String(name).trim(), timezone || 'UTC', Boolean(is_default)],
    );
    const calendarId = row!.id;

    if (Array.isArray(hours)) {
      for (const h of hours) {
        await db.query(
          `INSERT INTO business_hours (calendar_id, day_of_week, start_time, end_time)
           VALUES ($1, $2, $3::time, $4::time)`,
          [calendarId, h.day_of_week, h.start_time, h.end_time],
        );
      }
    }
    if (Array.isArray(holidays)) {
      for (const hol of holidays) {
        await db.query(
          `INSERT INTO holidays (calendar_id, holiday_date, name)
           VALUES ($1, $2::date, $3)`,
          [calendarId, hol.holiday_date, hol.name || 'Holiday'],
        );
      }
    }

    res.status(201).json({ id: calendarId });
  } catch (err) { next(err); }
});

router.patch('/business-calendars/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const existing = await db.getOne(
      `SELECT id FROM business_calendars WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, tenantId],
    );
    if (!existing) throw new AppError(404, 'Calendar not found');

    const { name, timezone, is_default, hours, holidays } = req.body || {};
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;

    if (name !== undefined) { sets.push(`name = $${i++}`); vals.push(String(name).trim()); }
    if (timezone !== undefined) { sets.push(`timezone = $${i++}`); vals.push(timezone || 'UTC'); }
    if (is_default !== undefined) {
      if (is_default) {
        await db.query(
          `UPDATE business_calendars SET is_default = false WHERE tenant_id = $1 AND is_default = true AND id <> $2`,
          [tenantId, req.params.id],
        );
      }
      sets.push(`is_default = $${i++}`);
      vals.push(Boolean(is_default));
    }

    if (sets.length) {
      vals.push(req.params.id, tenantId);
      await db.query(
        `UPDATE business_calendars SET ${sets.join(', ')} WHERE id = $${i++} AND tenant_id = $${i}`,
        vals,
      );
    }

    if (Array.isArray(hours)) {
      await db.query('DELETE FROM business_hours WHERE calendar_id = $1', [req.params.id]);
      for (const h of hours) {
        await db.query(
          `INSERT INTO business_hours (calendar_id, day_of_week, start_time, end_time)
           VALUES ($1, $2, $3::time, $4::time)`,
          [req.params.id, h.day_of_week, h.start_time, h.end_time],
        );
      }
    }
    if (Array.isArray(holidays)) {
      await db.query('DELETE FROM holidays WHERE calendar_id = $1', [req.params.id]);
      for (const hol of holidays) {
        await db.query(
          `INSERT INTO holidays (calendar_id, holiday_date, name)
           VALUES ($1, $2::date, $3)`,
          [req.params.id, hol.holiday_date, hol.name || 'Holiday'],
        );
      }
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});

router.delete('/business-calendars/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    await db.query(
      'DELETE FROM business_calendars WHERE id = $1 AND tenant_id = $2',
      [req.params.id, tenantId],
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
