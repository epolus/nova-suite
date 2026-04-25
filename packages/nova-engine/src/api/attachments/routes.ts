/* SPDX-License-Identifier: AGPL-3.0-only */
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { authenticate, setTenantRLS, releaseTenantClient, getRequestClient } from '../../middleware/auth';
import { config } from '../../config';

const router = Router();
router.use(authenticate);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploads.maxFileSize },
});

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── POST /api/attachments/upload ───
router.post('/upload', upload.single('file'), setTenantRLS, releaseTenantClient,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const client = getRequestClient(req);
      const file = req.file;
      const entityType = req.body.entity_type as string;
      const entityId = req.body.entity_id as string;

      if (!file) { res.status(400).json({ error: 'No file uploaded' }); return; }
      if (!entityType || !entityId) { res.status(400).json({ error: 'entity_type and entity_id are required' }); return; }

      const ext = path.extname(file.originalname) || '';
      const storageKey = `${entityType}/${entityId}/${crypto.randomUUID()}${ext}`;
      const fullPath = path.join(config.uploads.dir, storageKey);

      ensureDir(path.dirname(fullPath));
      fs.writeFileSync(fullPath, file.buffer);

      const result = await client.query(
        `INSERT INTO attachments (tenant_id, entity_type, entity_id, file_name, mime_type, size_bytes, storage_key, uploaded_by)
         VALUES (current_tenant_id(), $1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [entityType, entityId, file.originalname, file.mimetype, file.size, storageKey, req.user!.id],
      );

      const att = result.rows[0];
      res.status(201).json({
        id: att.id,
        file_name: att.file_name,
        mime_type: att.mime_type,
        size_bytes: att.size_bytes,
        uploaded_by: req.user!.display_name,
        created_at: att.created_at,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/attachments?entity_type=&entity_id= ───
router.get('/', setTenantRLS, releaseTenantClient,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const entityType = req.query.entity_type as string;
      const entityId = req.query.entity_id as string;

      if (!entityType || !entityId) { res.status(400).json({ error: 'entity_type and entity_id are required' }); return; }

      const result = await client.query(
        `SELECT a.*, u.display_name AS uploaded_by_name
         FROM attachments a
         LEFT JOIN users u ON u.id = a.uploaded_by
         WHERE a.entity_type = $1 AND a.entity_id = $2
         ORDER BY a.created_at DESC`,
        [entityType, entityId],
      );

      res.json({ attachments: result.rows });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/attachments/:id/download ───
router.get('/:id/download', setTenantRLS, releaseTenantClient,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const client = getRequestClient(req);
      const result = await client.query('SELECT * FROM attachments WHERE id = $1', [req.params.id]);

      if (result.rows.length === 0) { res.status(404).json({ error: 'Attachment not found' }); return; }

      const att = result.rows[0];
      const fullPath = path.join(config.uploads.dir, att.storage_key as string);

      if (!fs.existsSync(fullPath)) { res.status(404).json({ error: 'File not found on disk' }); return; }

      res.setHeader('Content-Type', att.mime_type as string);
      res.setHeader('Content-Disposition', `inline; filename="${att.file_name}"`);
      res.setHeader('Content-Length', String(att.size_bytes));
      fs.createReadStream(fullPath).pipe(res);
    } catch (err) {
      next(err);
    }
  },
);

// ─── DELETE /api/attachments/:id ───
router.delete('/:id', setTenantRLS, releaseTenantClient,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const client = getRequestClient(req);
      const result = await client.query('SELECT * FROM attachments WHERE id = $1', [req.params.id]);

      if (result.rows.length === 0) { res.status(404).json({ error: 'Attachment not found' }); return; }

      const att = result.rows[0];
      const fullPath = path.join(config.uploads.dir, att.storage_key as string);

      await client.query('DELETE FROM attachments WHERE id = $1', [req.params.id]);

      try { fs.unlinkSync(fullPath); } catch { /* file may already be gone */ }

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
