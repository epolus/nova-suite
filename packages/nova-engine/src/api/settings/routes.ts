/* SPDX-License-Identifier: AGPL-3.0-only */
import { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../../data/db';
import { config } from '../../config';
import { authenticate, requireRole, setTenantRLS, releaseTenantClient } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { cacheDel, cacheGetJson, cacheMetrics, cacheSetJson, resetCacheMetrics } from '../../cache/redis';
import { resolveUploadPath, safeImageExtension, UnsafeUploadPathError } from '../../data/upload-path';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.uploads.maxFileSize } });

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';
const settingsCacheKey = (tenantId: string) => `tenant-settings:${tenantId}`;
const themeCacheKey = (tenantId: string) => `tenant-theme:${tenantId}`;
const adminSettings = [authenticate, requireRole('admin'), setTenantRLS, releaseTenantClient] as const;

// Served unauthenticated on the login page: never add secrets or internal config here.
export const PUBLIC_THEME_KEYS = [
  'app_name',
  'app_subtitle',
  'primary_color',
  'sidebar_bg',
  'sidebar_active_bg',
  'content_bg',
  'login_bg_from',
  'login_bg_to',
  'dark_content_bg',
  'dark_surface_bg',
  'dark_muted_bg',
  'dark_border_color',
  'dark_text_primary',
  'dark_text_muted',
  'catalog_currency',
  'logo_url',
] as const;

// logo_url is managed by the /logo endpoints only.
export const WRITABLE_SETTING_KEYS: ReadonlySet<string> = new Set([
  ...PUBLIC_THEME_KEYS.filter((key) => key !== 'logo_url'),
  'ai_triage_on_create',
  'ai_auto_apply_priority',
  'ess_auto_deflect',
  'ess_deflect_confidence_threshold',
  'default_locale',
]);

export const updateSettingsSchema = z.object({
  settings: z.record(z.string(), z.string().max(2000)).superRefine((settings, ctx) => {
    const unknown = Object.keys(settings).filter((key) => !WRITABLE_SETTING_KEYS.has(key));
    if (unknown.length > 0) {
      ctx.addIssue({ code: 'custom', message: `Unsupported setting keys: ${unknown.join(', ')}` });
    }
  }),
});

async function invalidateSettingsCache(tenantId: string): Promise<void> {
  await Promise.all([cacheDel(settingsCacheKey(tenantId)), cacheDel(themeCacheKey(tenantId))]);
}

// ─── GET /api/settings/theme (public – no auth, used on login page) ───
router.get('/theme', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const cacheKey = themeCacheKey(config.tenancy.primaryTenantId);
    const cached = await cacheGetJson<Record<string, string>>(cacheKey);
    if (cached) {
      res.json({ settings: cached });
      return;
    }

    const rows = await db.withTenantContext(config.tenancy.primaryTenantId, SYSTEM_USER_ID, 'user', () => db.getMany<{ key: string; value: string }>(
      `SELECT key, value FROM tenant_settings WHERE tenant_id = $1 AND key = ANY($2::text[])`,
      [config.tenancy.primaryTenantId, PUBLIC_THEME_KEYS],
    ));
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
    const row = await db.withTenantContext(config.tenancy.primaryTenantId, SYSTEM_USER_ID, 'user', () => db.getOne<{ value: string }>(
      `SELECT value FROM tenant_settings WHERE tenant_id = $1 AND key = 'logo_url'`,
      [config.tenancy.primaryTenantId],
    ));
    if (!row || !row.value) { res.status(204).end(); return; }

    let fullPath: string;
    try {
      fullPath = resolveUploadPath(config.uploads.dir, row.value);
    } catch (err) {
      if (err instanceof UnsafeUploadPathError) {
        res.status(204).end(); return;
      }
      throw err;
    }
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
  ...adminSettings,
  async (_req: Request, res: Response) => {
    res.json({ cache: cacheMetrics() });
  },
);

// POST /api/settings/cache/metrics/reset – reset in-memory cache counters (admin)
router.post(
  '/cache/metrics/reset',
  ...adminSettings,
  async (_req: Request, res: Response) => {
    resetCacheMetrics();
    res.json({ success: true, cache: cacheMetrics() });
  },
);

// GET /api/settings – list all settings
router.get(
  '/',
  ...adminSettings,
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
  ...adminSettings,
  validateBody(updateSettingsSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user!.tenant_id;
      const updates = (req.body as z.infer<typeof updateSettingsSchema>).settings;

      for (const [key, value] of Object.entries(updates)) {
        await db.query(
          `INSERT INTO tenant_settings (tenant_id, key, value)
           VALUES ($1, $2, $3)
           ON CONFLICT (tenant_id, key) DO UPDATE SET value = $3`,
          [tenantId, key, value],
        );
      }

      await invalidateSettingsCache(tenantId);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/settings/logo – upload logo
router.post(
  '/logo',
  ...adminSettings,
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.user!.tenant_id;
      const file = req.file;
      if (!file) { res.status(400).json({ error: 'No file uploaded' }); return; }

      const ext = safeImageExtension(file.originalname, '.png');
      const storageKey = `branding/${crypto.randomUUID()}${ext}`;
      const fullPath = resolveUploadPath(config.uploads.dir, storageKey);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, file.buffer);

      const old = await db.getOne<{ value: string }>(
        `SELECT value FROM tenant_settings WHERE tenant_id = $1 AND key = 'logo_url'`,
        [tenantId],
      );
      if (old?.value) {
        try { fs.unlinkSync(resolveUploadPath(config.uploads.dir, old.value)); } catch { /* ignore */ }
      }

      await db.query(
        `INSERT INTO tenant_settings (tenant_id, key, value)
         VALUES ($1, 'logo_url', $2)
         ON CONFLICT (tenant_id, key) DO UPDATE SET value = $2`,
        [tenantId, storageKey],
      );

      await invalidateSettingsCache(tenantId);
      res.json({ logo_url: storageKey });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/settings/logo – remove logo
router.delete(
  '/logo',
  ...adminSettings,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user!.tenant_id;
      const old = await db.getOne<{ value: string }>(
        `SELECT value FROM tenant_settings WHERE tenant_id = $1 AND key = 'logo_url'`,
        [tenantId],
      );
      if (old?.value) {
        try { fs.unlinkSync(resolveUploadPath(config.uploads.dir, old.value)); } catch { /* ignore */ }
      }
      await db.query(
        `INSERT INTO tenant_settings (tenant_id, key, value)
         VALUES ($1, 'logo_url', '')
         ON CONFLICT (tenant_id, key) DO UPDATE SET value = ''`,
        [tenantId],
      );
      await invalidateSettingsCache(tenantId);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
