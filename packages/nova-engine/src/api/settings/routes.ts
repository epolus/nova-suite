/* SPDX-License-Identifier: AGPL-3.0-only */
import { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import crypto from 'crypto';
import { db } from '../../data/db';
import { config } from '../../config';
import { authenticate, requireRole } from '../../middleware/auth';
import { cacheDel, cacheGetJson, cacheMetrics, cacheSetJson, resetCacheMetrics } from '../../cache/redis';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.uploads.maxFileSize } });

const DEFAULT_TENANT = 'a0000000-0000-0000-0000-000000000001';
const settingsCacheKey = (tenantId: string) => `tenant-settings:${tenantId}`;

// ─── GET /api/settings/theme (public – no auth, used on login page) ───
router.get('/theme', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const cacheKey = settingsCacheKey(DEFAULT_TENANT);
    const cached = await cacheGetJson<Record<string, string>>(cacheKey);
    if (cached) {
      res.json({ settings: cached });
      return;
    }

    const rows = await db.getMany<{ key: string; value: string }>(
      `SELECT key, value FROM tenant_settings WHERE tenant_id = $1`,
      [DEFAULT_TENANT],
    );
    const settings: Record<string, string> = {};
    rows.forEach((r) => { settings[r.key] = r.value; });
    await cacheSetJson(cacheKey, settings);
    res.json({ settings });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/settings/logo (public – serves logo image) ───
router.get('/logo', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const row = await db.getOne<{ value: string }>(
      `SELECT value FROM tenant_settings WHERE tenant_id = $1 AND key = 'logo_url'`,
      [DEFAULT_TENANT],
    );
    if (!row || !row.value) { res.status(204).end(); return; }

    const fullPath = path.join(config.uploads.dir, row.value);
    if (!fs.existsSync(fullPath)) { res.status(204).end(); return; }

    const ext = path.extname(fullPath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
      '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    };
    res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    fs.createReadStream(fullPath).pipe(res);
  } catch (err) {
    next(err);
  }
});

// ─── Admin routes (require auth + admin) ───

// GET /api/settings/cache/metrics – cache health/usage counters (admin)
router.get(
  '/cache/metrics',
  authenticate, requireRole('admin'),
  async (_req: Request, res: Response) => {
    res.json({ cache: cacheMetrics() });
  },
);

// POST /api/settings/cache/metrics/reset – reset in-memory cache counters (admin)
router.post(
  '/cache/metrics/reset',
  authenticate, requireRole('admin'),
  async (_req: Request, res: Response) => {
    resetCacheMetrics();
    res.json({ success: true, cache: cacheMetrics() });
  },
);

// GET /api/settings – list all settings
router.get(
  '/',
  authenticate, requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user!.tenant_id;
      const cacheKey = settingsCacheKey(tenantId);
      const cached = await cacheGetJson<Record<string, string>>(cacheKey);
      if (cached) {
        res.json({ settings: cached });
        return;
      }

      const rows = await db.getMany<{ key: string; value: string }>(
        `SELECT key, value FROM tenant_settings WHERE tenant_id = $1`,
        [tenantId],
      );
      const settings: Record<string, string> = {};
      rows.forEach((r) => { settings[r.key] = r.value; });
      await cacheSetJson(cacheKey, settings);
      res.json({ settings });
    } catch (err) {
      next(err);
    }
  },
);

// PUT /api/settings – bulk update settings
router.put(
  '/',
  authenticate, requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user!.tenant_id;
      const updates: Record<string, string> = req.body.settings || {};

      for (const [key, value] of Object.entries(updates)) {
        if (key === 'logo_url') continue;
        await db.query(
          `INSERT INTO tenant_settings (tenant_id, key, value)
           VALUES ($1, $2, $3)
           ON CONFLICT (tenant_id, key) DO UPDATE SET value = $3`,
          [tenantId, key, value],
        );
      }

      await cacheDel(settingsCacheKey(tenantId));
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/settings/logo – upload logo
router.post(
  '/logo',
  authenticate, requireRole('admin'),
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.user!.tenant_id;
      const file = req.file;
      if (!file) { res.status(400).json({ error: 'No file uploaded' }); return; }

      const ext = path.extname(file.originalname) || '.png';
      const storageKey = `branding/${crypto.randomUUID()}${ext}`;
      const fullPath = path.join(config.uploads.dir, storageKey);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, file.buffer);

      const old = await db.getOne<{ value: string }>(
        `SELECT value FROM tenant_settings WHERE tenant_id = $1 AND key = 'logo_url'`,
        [tenantId],
      );
      if (old?.value) {
        try { fs.unlinkSync(path.join(config.uploads.dir, old.value)); } catch { /* ignore */ }
      }

      await db.query(
        `INSERT INTO tenant_settings (tenant_id, key, value)
         VALUES ($1, 'logo_url', $2)
         ON CONFLICT (tenant_id, key) DO UPDATE SET value = $2`,
        [tenantId, storageKey],
      );

      await cacheDel(settingsCacheKey(tenantId));
      res.json({ logo_url: storageKey });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/settings/logo – remove logo
router.delete(
  '/logo',
  authenticate, requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user!.tenant_id;
      const old = await db.getOne<{ value: string }>(
        `SELECT value FROM tenant_settings WHERE tenant_id = $1 AND key = 'logo_url'`,
        [tenantId],
      );
      if (old?.value) {
        try { fs.unlinkSync(path.join(config.uploads.dir, old.value)); } catch { /* ignore */ }
      }
      await db.query(
        `INSERT INTO tenant_settings (tenant_id, key, value)
         VALUES ($1, 'logo_url', '')
         ON CONFLICT (tenant_id, key) DO UPDATE SET value = ''`,
        [tenantId],
      );
      await cacheDel(settingsCacheKey(tenantId));
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
