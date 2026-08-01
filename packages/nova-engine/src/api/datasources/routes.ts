/* SPDX-License-Identifier: AGPL-3.0-only */
import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../../data/db';
import { config } from '../../config';
import { authenticate, requireRole } from '../../middleware/auth';
import { ENTITY_DEFS } from '../import/entity-defs';
import { startDataSourceSync, cancelDataSourceSchedule } from '../../temporal/workflows';
import { enqueueDataSourceScheduleStartJob } from '../../temporal/workflow-start-queue';
import SftpClient from 'ssh2-sftp-client';

const router = Router();
router.use(authenticate, requireRole('admin'));

type SourceType = 'csv_url' | 'json_url' | 'rest_api' | 'sftp';
type SourceConfig = {
  url?: string;
  headers?: Record<string, string>;
  json_path?: string;
  credential_slug?: string;
  auth_type?: 'none' | 'bearer' | 'oauth2';
  bearer_token?: string;
  oauth2_token_url?: string;
  oauth2_client_id?: string;
  oauth2_client_secret?: string;
  oauth2_scope?: string;
  oauth2_grant_type?: string;
  pagination?: {
    enabled?: boolean;
    mode?: 'page' | 'offset';
    page_param?: string;
    page_start?: number;
    page_size_param?: string;
    page_size?: number;
    offset_param?: string;
    offset_start?: number;
    limit_param?: string;
    limit?: number;
    max_pages?: number;
  };
  sftp_host?: string;
  sftp_port?: number;
  sftp_username?: string;
  sftp_password?: string;
  sftp_private_key?: string;
  sftp_path?: string;
  sftp_file_type?: 'csv' | 'json';
};

function detectDelimiter(headerLine: string): string {
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestCount = 0;
  for (const delim of candidates) {
    let count = 0;
    let inQuotes = false;
    for (const ch of headerLine) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === delim && !inQuotes) count++;
    }
    if (count > bestCount) {
      best = delim;
      bestCount = count;
    }
  }
  return best;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCsvPreview(text: string): Record<string, string>[] {
  const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  const lines = clean.split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const delimiter = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter).map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length && rows.length < 5; i++) {
    const values = splitCsvLine(lines[i], delimiter);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = (values[idx] || '').trim(); });
    rows.push(row);
  }
  return rows;
}

function pickJsonPath(input: unknown, jsonPath?: string): unknown {
  if (!jsonPath) return input;
  let data = input;
  for (const part of jsonPath.split('.')) {
    if (data && typeof data === 'object' && part in (data as Record<string, unknown>)) {
      data = (data as Record<string, unknown>)[part];
    }
  }
  return data;
}

function parseJsonPreview(text: string, jsonPath?: string): Record<string, string>[] {
  const parsed = JSON.parse(text);
  const picked = pickJsonPath(parsed, jsonPath);
  if (!Array.isArray(picked)) throw new Error('JSON response is not an array (check json_path)');
  return picked.slice(0, 5).map((item) => {
    const row: Record<string, string> = {};
    if (item && typeof item === 'object') {
      for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
        row[k] = v == null ? '' : String(v);
      }
    }
    return row;
  });
}

function inferFileType(path: string): 'csv' | 'json' {
  const ext = path.split('.').pop()?.toLowerCase();
  return ext === 'json' ? 'json' : 'csv';
}

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildSuggestedMapping(entityType: string, detectedColumns: string[]): Record<string, string> {
  const entity = ENTITY_DEFS[entityType as keyof typeof ENTITY_DEFS];
  if (!entity) return {};
  const byNorm = new Map(detectedColumns.map((c) => [normalizeKey(c), c]));
  const out: Record<string, string> = {};
  for (const field of entity.fields) {
    const direct = detectedColumns.find((c) => c.toLowerCase() === field.key.toLowerCase());
    if (direct) {
      out[direct] = field.key;
      continue;
    }
    const matched = byNorm.get(normalizeKey(field.key));
    if (matched) out[matched] = field.key;
  }
  return out;
}

async function fetchOAuth2Token(cfg: SourceConfig): Promise<string> {
  if (!cfg.oauth2_token_url || !cfg.oauth2_client_id || !cfg.oauth2_client_secret) {
    throw new Error('OAuth2 requires token URL, client ID, and client secret');
  }
  const params = new URLSearchParams({
    grant_type: cfg.oauth2_grant_type || 'client_credentials',
    client_id: cfg.oauth2_client_id,
    client_secret: cfg.oauth2_client_secret,
  });
  if (cfg.oauth2_scope) params.set('scope', cfg.oauth2_scope);
  const response = await fetch(cfg.oauth2_token_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: params.toString(),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`OAuth2 token request failed: ${response.status} ${response.statusText}`);
  const data = JSON.parse(text) as { access_token?: string };
  if (!data.access_token) throw new Error('OAuth2 response missing access_token');
  return data.access_token;
}

async function fetchSftpPreview(cfg: SourceConfig): Promise<{ rows: Record<string, string>[]; contentType: string }> {
  if (!cfg.sftp_host || !cfg.sftp_username || !cfg.sftp_path) {
    throw new Error('SFTP config requires host, username, and file path');
  }
  const sftp = new SftpClient();
  try {
    const connectOpts: Record<string, unknown> = {
      host: cfg.sftp_host,
      port: cfg.sftp_port || 22,
      username: cfg.sftp_username,
    };
    if (cfg.sftp_private_key) connectOpts.privateKey = cfg.sftp_private_key;
    else if (cfg.sftp_password) connectOpts.password = cfg.sftp_password;
    await sftp.connect(connectOpts);
    const buffer = await sftp.get(cfg.sftp_path) as Buffer;
    const text = buffer.toString('utf-8');
    const fileType = cfg.sftp_file_type || inferFileType(cfg.sftp_path);
    if (fileType === 'json') {
      return { rows: parseJsonPreview(text, cfg.json_path), contentType: 'application/json' };
    }
    return { rows: parseCsvPreview(text), contentType: 'text/csv' };
  } finally {
    await sftp.end();
  }
}

async function resolveCredentialForDataSourcePreview(
  sourceConfig: SourceConfig,
  tenantId: string,
  userId: string,
): Promise<SourceConfig> {
  const slug = sourceConfig.credential_slug?.trim();
  if (!slug) return sourceConfig;
  if (!config.credentials.masterKey || config.credentials.masterKey.length < 16) {
    throw new Error('CREDENTIALS_MASTER_KEY is not set or too short on the API server');
  }
  return db.withTenantTransaction(tenantId, userId, 'admin', async (client) => {
    const r = await client.query<{ secret: string }>(
      `SELECT pgp_sym_decrypt(secret_enc, $1)::text AS secret
       FROM tenant_credentials
       WHERE tenant_id = current_tenant_id() AND slug = $2`,
      [config.credentials.masterKey, slug],
    );
    if (r.rows.length === 0) throw new Error(`Unknown credential slug: ${slug}`);
    const secret = r.rows[0].secret;
    const next: SourceConfig = { ...sourceConfig };
    if (next.auth_type === 'oauth2') {
      next.oauth2_client_secret = secret;
    } else {
      next.bearer_token = secret;
      if (!next.auth_type || next.auth_type === 'none') next.auth_type = 'bearer';
    }
    if (next.sftp_host && !next.sftp_private_key) {
      next.sftp_password = secret;
    }
    return next;
  });
}

// ─── POST /api/datasources/test-source ───
router.post('/test-source', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sourceType = req.body?.source_type as SourceType;
    let sourceConfig = (req.body?.source_config || {}) as SourceConfig;
    sourceConfig = await resolveCredentialForDataSourcePreview(
      sourceConfig,
      req.user!.tenant_id,
      req.user!.id,
    );
    const entityType = String(req.body?.entity_type || '');

    if (!sourceType) { res.status(400).json({ error: 'source_type is required' }); return; }
    let rows: Record<string, string>[] = [];
    let contentType = '';
    if (sourceType === 'sftp') {
      const r = await fetchSftpPreview(sourceConfig);
      rows = r.rows;
      contentType = r.contentType;
    } else {
      if (!sourceConfig.url) { res.status(400).json({ error: 'source_config.url is required' }); return; }
      const headers: Record<string, string> = { ...(sourceConfig.headers || {}) };
      if (sourceType === 'json_url' || sourceType === 'rest_api') {
        headers.Accept = headers.Accept || 'application/json';
      }
      if (sourceConfig.auth_type === 'oauth2') {
        const token = await fetchOAuth2Token(sourceConfig);
        headers.Authorization = `Bearer ${token}`;
      } else if (sourceConfig.auth_type === 'bearer' && sourceConfig.bearer_token) {
        headers.Authorization = `Bearer ${sourceConfig.bearer_token}`;
      }

      const requestUrl = new URL(sourceConfig.url);
      if (sourceType === 'rest_api' && sourceConfig.pagination?.enabled) {
        const p = sourceConfig.pagination;
        const mode = p.mode === 'offset' ? 'offset' : 'page';
        if (mode === 'page') {
          requestUrl.searchParams.set(p.page_param || 'page', String(p.page_start ?? 1));
          requestUrl.searchParams.set(p.page_size_param || 'limit', String(p.page_size ?? 100));
        } else {
          requestUrl.searchParams.set(p.offset_param || 'offset', String(p.offset_start ?? 0));
          requestUrl.searchParams.set(p.limit_param || 'limit', String(p.limit ?? 100));
        }
      }

      const response = await fetch(requestUrl.toString(), { headers });
      contentType = response.headers.get('content-type') || '';
      const text = await response.text();
      if (!response.ok) {
        const preview = text.slice(0, 300).replace(/\s+/g, ' ').trim();
        throw new Error(`Source request failed: ${response.status} ${response.statusText}. Preview: ${preview}`);
      }
      rows = (sourceType === 'csv_url' && !contentType.includes('json'))
        ? parseCsvPreview(text)
        : parseJsonPreview(text, sourceConfig.json_path);
    }

    const detectedColumns = rows.length > 0 ? Object.keys(rows[0]) : [];
    const suggestedMapping = entityType ? buildSuggestedMapping(entityType, detectedColumns) : {};

    res.json({
      result: {
        detected_columns: detectedColumns,
        sample_rows: rows,
        suggested_mapping: suggestedMapping,
        content_type: contentType,
      },
    });
  } catch (err) { next(err); }
});

// ─── GET /api/datasources ───
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const rows = await db.getMany(
      `SELECT ds.*, u.display_name AS created_by_name
       FROM data_sources ds
       LEFT JOIN users u ON u.id = ds.created_by
       WHERE ds.tenant_id = $1
       ORDER BY ds.name`,
      [tenantId],
    );
    res.json({ data_sources: rows });
  } catch (err) { next(err); }
});

// ─── GET /api/datasources/entity-types ───
router.get('/entity-types', (_req: Request, res: Response) => {
  const entities = Object.values(ENTITY_DEFS).map((e) => ({
    key: e.key,
    label: e.label,
    fields: e.fields.map((f) => ({ key: f.key, label: f.label, required: !!f.required })),
  }));
  res.json({ entities });
});

// ─── GET /api/datasources/:id ───
router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = req.user!.tenant_id;
    const row = await db.getOne(
      `SELECT * FROM data_sources WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, tenantId],
    );
    if (!row) { res.status(404).json({ error: 'Data source not found' }); return; }
    res.json({ data_source: row });
  } catch (err) { next(err); }
});

// ─── POST /api/datasources ───
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const {
      name, description, entity_type, source_type, source_config,
      column_mapping, schedule_cron, schedule_enabled, import_mode, upsert_key,
    } = req.body;

    if (!name || !entity_type) {
      res.status(400).json({ error: 'name and entity_type are required' }); return;
    }

    const result = await db.getOne<{ id: string }>(
      `INSERT INTO data_sources (
        tenant_id, name, description, entity_type, source_type, source_config,
        column_mapping, schedule_cron, schedule_enabled, import_mode, upsert_key, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id`,
      [
        tenantId, name, description || null, entity_type,
        source_type || 'csv_url',
        JSON.stringify(source_config || {}),
        JSON.stringify(column_mapping || {}),
        schedule_cron || '0 2 * * *',
        schedule_enabled || false,
        import_mode || 'insert',
        upsert_key || null,
        req.user!.id,
      ],
    );

    if (schedule_enabled && result) {
      try {
        await enqueueDataSourceScheduleStartJob({
          dataSourceId: result.id,
          tenantId,
          cronSchedule: schedule_cron || '0 2 * * *',
        });
      } catch { /* don't fail creation if Temporal is unavailable */ }
    }

    res.status(201).json({ id: result!.id });
  } catch (err) { next(err); }
});

// ─── PATCH /api/datasources/:id ───
router.patch('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = req.user!.tenant_id;
    const dsId = req.params.id;

    const existing = await db.getOne<{ id: string; schedule_enabled: boolean; schedule_cron: string }>(
      `SELECT id, schedule_enabled, schedule_cron FROM data_sources WHERE id = $1 AND tenant_id = $2`,
      [dsId, tenantId],
    );
    if (!existing) { res.status(404).json({ error: 'Data source not found' }); return; }

    const allowed = [
      'name', 'description', 'entity_type', 'source_type', 'source_config',
      'column_mapping', 'schedule_cron', 'schedule_enabled', 'import_mode', 'upsert_key',
    ];
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 0;

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        idx++;
        sets.push(`${key} = $${idx}`);
        const val = req.body[key];
        params.push(
          (key === 'source_config' || key === 'column_mapping') ? JSON.stringify(val) : val,
        );
      }
    }

    if (sets.length === 0) { res.json({ success: true }); return; }

    idx++;
    params.push(dsId);
    idx++;
    params.push(tenantId);
    await db.query(
      `UPDATE data_sources SET ${sets.join(', ')} WHERE id = $${idx - 1} AND tenant_id = $${idx}`,
      params,
    );

    const newEnabled = req.body.schedule_enabled ?? existing.schedule_enabled;
    const newCron = String(req.body.schedule_cron ?? existing.schedule_cron);

    try {
      if (newEnabled) {
        await enqueueDataSourceScheduleStartJob({
          dataSourceId: String(dsId),
          tenantId: String(tenantId),
          cronSchedule: newCron,
        });
      } else if (existing.schedule_enabled && !newEnabled) {
        await cancelDataSourceSchedule(String(dsId));
      }
    } catch { /* don't fail update */ }

    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── DELETE /api/datasources/:id ───
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    try { await cancelDataSourceSchedule(String(req.params.id)); } catch { /* ignore */ }
    await db.query(
      `DELETE FROM data_sources WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, tenantId],
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── POST /api/datasources/:id/run (manual trigger) ───
router.post('/:id/run', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = req.user!.tenant_id;
    const ds = await db.getOne<{ id: string; schedule_cron: string }>(
      `SELECT id, schedule_cron FROM data_sources WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, tenantId],
    );
    if (!ds) { res.status(404).json({ error: 'Data source not found' }); return; }

    const workflowId = await startDataSourceSync({
      dataSourceId: ds.id,
      tenantId,
      immediate: true,
    });
    res.json({ workflow_id: workflowId });
  } catch (err) { next(err); }
});

// ─── GET /api/datasources/:id/runs ───
router.get('/:id/runs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const rows = await db.getMany(
      `SELECT * FROM data_source_runs
       WHERE data_source_id = $1 AND tenant_id = $2
       ORDER BY started_at DESC
       LIMIT 50`,
      [req.params.id, tenantId],
    );
    res.json({ runs: rows });
  } catch (err) { next(err); }
});

export default router;
