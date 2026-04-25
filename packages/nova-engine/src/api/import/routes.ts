/* SPDX-License-Identifier: AGPL-3.0-only */
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import bcrypt from 'bcrypt';
import { authenticate, requireRole, setTenantRLS, releaseTenantClient, getRequestClient } from '../../middleware/auth';
import { db } from '../../data/db';
import { ENTITY_DEFS, suggestMapping } from './entity-defs';
import type { FieldDef } from './entity-defs';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticate, requireRole('admin'));

// ─── GET /api/import/entities (must be before /:id routes) ───
router.get('/entities', (_req: Request, res: Response) => {
  const entities = Object.values(ENTITY_DEFS).map((e) => ({
    key: e.key,
    label: e.label,
    fields: e.fields.map((f) => ({ key: f.key, label: f.label, required: !!f.required })),
  }));
  res.json({ entities });
});

// ─── GET /api/import/jobs (must be before /:id routes) ───
router.get('/', setTenantRLS, releaseTenantClient,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const result = await client.query(
        `SELECT j.*, u.display_name AS created_by_name
         FROM import_jobs j
         LEFT JOIN users u ON u.id = j.created_by
         ORDER BY j.created_at DESC LIMIT 50`,
      );
      res.json({ jobs: result.rows });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Helper: parse uploaded file into rows ───
function parseFile(buffer: Buffer, filename: string): Record<string, string>[] {
  const ext = filename.toLowerCase().split('.').pop();

  if (ext === 'csv') {
    return parse(buffer, { columns: true, skip_empty_lines: true, trim: true, bom: true });
  }

  if (ext === 'xlsx' || ext === 'xls') {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' });
  }

  if (ext === 'json') {
    const data = JSON.parse(buffer.toString('utf-8'));
    if (Array.isArray(data)) return data;
    throw new Error('JSON file must contain an array of objects');
  }

  throw new Error(`Unsupported file type: .${ext}`);
}

// ─── POST /api/import/upload ───
router.post('/upload', upload.single('file'), setTenantRLS, releaseTenantClient,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const client = getRequestClient(req);
      const file = req.file;
      const entityType = req.body.entity_type as string;

      if (!file) { res.status(400).json({ error: 'No file uploaded' }); return; }
      if (!entityType || !ENTITY_DEFS[entityType]) {
        res.status(400).json({ error: `Invalid entity_type. Valid: ${Object.keys(ENTITY_DEFS).join(', ')}` }); return;
      }

      const rows = parseFile(file.buffer, file.originalname);
      if (rows.length === 0) { res.status(400).json({ error: 'File contains no data rows' }); return; }

      const fileColumns = Object.keys(rows[0]);
      const fields = await getImportFields(client, entityType);
      const suggestedMapping = suggestMapping(fileColumns, entityType, fields);

      const job = await client.query(
        `INSERT INTO import_jobs (tenant_id, created_by, entity_type, file_name, total_rows)
         VALUES (current_tenant_id(), $1, $2, $3, $4) RETURNING *`,
        [req.user!.id, entityType, file.originalname, rows.length],
      );
      const jobId = job.rows[0].id;

      // Batch insert rows (chunks of 100)
      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100);
        const values: string[] = [];
        const params: unknown[] = [jobId];
        let idx = 1;
        for (let j = 0; j < batch.length; j++) {
          idx++;
          const pRow = idx;
          idx++;
          const pData = idx;
          values.push(`($1, $${pRow}, $${pData})`);
          params.push(i + j + 1, JSON.stringify(batch[j]));
        }
        await client.query(
          `INSERT INTO import_rows (job_id, row_number, raw_data) VALUES ${values.join(', ')}`,
          params,
        );
      }

      res.status(201).json({
        id: jobId,
        entity_type: entityType,
        file_name: file.originalname,
        total_rows: rows.length,
        file_columns: fileColumns,
        suggested_mapping: suggestedMapping,
        fields: fields.map((f) => ({
          key: f.key,
          label: f.label,
          required: !!f.required,
          type: f.type || 'string',
          enum_values: f.enumValues || [],
          resolve_table: f.resolve?.table || null,
          resolve_match: f.resolve?.matchColumn || null,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/import/:id/validate ───
router.post('/:id/validate', setTenantRLS, releaseTenantClient,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const client = getRequestClient(req);
      const jobId = req.params.id;
      const { column_mapping, fixed_values } = req.body as {
        column_mapping: Record<string, string>;
        fixed_values?: Record<string, string>;
      };

      if (!column_mapping || typeof column_mapping !== 'object') {
        res.status(400).json({ error: 'column_mapping is required' }); return;
      }

      const jobResult = await client.query('SELECT * FROM import_jobs WHERE id = $1', [jobId]);
      if (jobResult.rows.length === 0) { res.status(404).json({ error: 'Import job not found' }); return; }
      const job = jobResult.rows[0];
      const entityDef = ENTITY_DEFS[job.entity_type as string];
      if (!entityDef) { res.status(400).json({ error: 'Unknown entity type' }); return; }
      const importFields = await getImportFields(client, job.entity_type as string);

      // Save mapping
      await client.query('UPDATE import_jobs SET column_mapping = $1 WHERE id = $2', [JSON.stringify(column_mapping), jobId]);

      // Invert mapping: target_field -> source_column
      const invertedMap: Record<string, string> = {};
      for (const [srcCol, targetField] of Object.entries(column_mapping)) {
        if (targetField) invertedMap[targetField] = srcCol;
      }
      const fixedValues: Record<string, string> = {};
      for (const [k, v] of Object.entries(fixed_values || {})) {
        if (!k) continue;
        const val = String(v ?? '').trim();
        if (val !== '') fixedValues[k] = val;
      }

      // Preload FK lookup caches
      const fkCaches = await buildFkCaches(client, importFields, job.tenant_id as string);

      // Process rows in batches
      const allRows = await client.query(
        'SELECT id, row_number, raw_data FROM import_rows WHERE job_id = $1 ORDER BY row_number', [jobId],
      );

      let validCount = 0, errorCount = 0, warningCount = 0;
      const seenUniques: Record<string, Set<string>> = {};

      for (const row of allRows.rows) {
        const raw = row.raw_data as Record<string, string>;
        const mapped: Record<string, unknown> = {};
        const errors: { field: string; message: string }[] = [];
        const warnings: { field: string; message: string }[] = [];

        // Apply mapping
        for (const field of importFields) {
          const srcCol = invertedMap[field.key];
          if (!srcCol) continue;
          const rawVal = raw[srcCol];
          if (rawVal !== undefined && rawVal !== null && rawVal !== '') {
            mapped[field.key] = String(rawVal).trim();
            continue;
          }
          const fixedVal = fixedValues[field.key];
          if (fixedVal !== undefined) {
            mapped[field.key] = fixedVal;
          }
        }

        // Validate each field
        for (const field of importFields) {
          const val = mapped[field.key] as string | undefined;

          if (field.required && (!val || val === '')) {
            errors.push({ field: field.key, message: `${field.label} is required` });
            continue;
          }
          if (!val || val === '') continue;

          // Type checks
          if (field.type === 'integer') {
            const n = parseInt(val, 10);
            if (isNaN(n)) errors.push({ field: field.key, message: `${field.label} must be a number` });
            else mapped[field.key] = n;
          }
          if (field.type === 'number') {
            const n = Number(val);
            if (isNaN(n)) errors.push({ field: field.key, message: `${field.label} must be a number` });
            else mapped[field.key] = n;
          }
          if (field.type === 'boolean') {
            const b = parseBool(val);
            if (b === null) errors.push({ field: field.key, message: `${field.label} must be true/false` });
            else mapped[field.key] = b;
          }
          if (field.type === 'date') {
            const d = new Date(val);
            if (isNaN(d.getTime())) errors.push({ field: field.key, message: `${field.label} is not a valid date` });
            else mapped[field.key] = d.toISOString().split('T')[0];
          }
          if (field.type === 'enum' && field.enumValues) {
            if (!field.enumValues.includes(val.toLowerCase())) {
              errors.push({ field: field.key, message: `${field.label} must be one of: ${field.enumValues.join(', ')}` });
            } else {
              mapped[field.key] = val.toLowerCase();
            }
          }

          // FK resolution
          if (field.resolve) {
            const cache = fkCaches[field.key];
            if (cache) {
              const resolved = cache.get(val.toLowerCase());
              if (!resolved) {
                errors.push({ field: field.key, message: `${field.label}: "${val}" not found` });
              } else {
                mapped[field.key + '_id'] = resolved;
              }
            }
          }

          // Uniqueness (within file)
          if (field.unique) {
            const cacheKey = `${field.unique.table}.${field.unique.column}`;
            if (!seenUniques[cacheKey]) seenUniques[cacheKey] = new Set();
            if (seenUniques[cacheKey].has(val.toLowerCase())) {
              errors.push({ field: field.key, message: `Duplicate ${field.label}: "${val}" (appears multiple times in file)` });
            } else {
              seenUniques[cacheKey].add(val.toLowerCase());
              // Check against DB
              const dbCache = fkCaches[`unique_${cacheKey}`];
              if (dbCache?.has(val.toLowerCase())) {
                warnings.push({ field: field.key, message: `${field.label} "${val}" already exists (will be skipped)` });
              }
            }
          }
        }

        const status = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'valid';
        if (status === 'valid') validCount++;
        else if (status === 'error') errorCount++;
        else warningCount++;

        await client.query(
          `UPDATE import_rows SET mapped_data = $1, status = $2, errors = $3, warnings = $4 WHERE id = $5`,
          [JSON.stringify(mapped), status, JSON.stringify(errors), JSON.stringify(warnings), row.id],
        );
      }

      await client.query(
        `UPDATE import_jobs SET status = 'validated', valid_rows = $1, error_rows = $2, warning_rows = $3, updated_at = now() WHERE id = $4`,
        [validCount, errorCount, warningCount, jobId],
      );

      res.json({ total: allRows.rows.length, valid: validCount, errors: errorCount, warnings: warningCount });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/import/:id ───
router.get('/:id', setTenantRLS, releaseTenantClient,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const client = getRequestClient(req);
      const result = await client.query('SELECT * FROM import_jobs WHERE id = $1', [req.params.id]);
      if (result.rows.length === 0) { res.status(404).json({ error: 'Import job not found' }); return; }
      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/import/:id/rows ───
router.get('/:id/rows', setTenantRLS, releaseTenantClient,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);
      const offset = (page - 1) * limit;
      const statusFilter = req.query.status as string;

      const conditions = ['job_id = $1'];
      const params: unknown[] = [req.params.id];
      let idx = 1;

      if (statusFilter && statusFilter !== 'all') {
        idx++;
        conditions.push(`status = $${idx}`);
        params.push(statusFilter);
      }

      const whereClause = conditions.join(' AND ');

      const countResult = await client.query(`SELECT count(*) FROM import_rows WHERE ${whereClause}`, params);
      const total = parseInt(countResult.rows[0].count, 10);

      idx++;
      params.push(limit);
      idx++;
      params.push(offset);
      const result = await client.query(
        `SELECT * FROM import_rows WHERE ${whereClause} ORDER BY row_number LIMIT $${idx - 1} OFFSET $${idx}`,
        params,
      );

      res.json({
        rows: result.rows,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/import/:id/commit ───
router.post('/:id/commit', setTenantRLS, releaseTenantClient,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const client = getRequestClient(req);
      const jobId = req.params.id;

      const jobResult = await client.query('SELECT * FROM import_jobs WHERE id = $1', [jobId]);
      if (jobResult.rows.length === 0) { res.status(404).json({ error: 'Import job not found' }); return; }
      const job = jobResult.rows[0];

      if (job.status !== 'validated') {
        res.status(400).json({ error: 'Job must be validated before committing' }); return;
      }

      const validRows = await client.query(
        `SELECT * FROM import_rows WHERE job_id = $1 AND status IN ('valid', 'warning') ORDER BY row_number`,
        [jobId],
      );

      let committed = 0;
      let failed = 0;

      for (const row of validRows.rows) {
        try {
          await commitRow(client, job.entity_type as string, row.mapped_data as Record<string, unknown>, req.user!);
          await client.query(`UPDATE import_rows SET status = 'committed' WHERE id = $1`, [row.id]);
          committed++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          await client.query(
            `UPDATE import_rows SET status = 'error', errors = $1 WHERE id = $2`,
            [JSON.stringify([{ field: '_commit', message: msg }]), row.id],
          );
          failed++;
        }
      }

      await client.query(
        `UPDATE import_jobs SET status = 'committed', committed_rows = $1, error_rows = error_rows + $2, updated_at = now() WHERE id = $3`,
        [committed, failed, jobId],
      );

      res.json({ committed, failed });
    } catch (err) {
      next(err);
    }
  },
);

// ─── DELETE /api/import/:id ───
router.delete('/:id', setTenantRLS, releaseTenantClient,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      await client.query('DELETE FROM import_jobs WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─── FK cache builder ───
async function buildFkCaches(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  fields: FieldDef[],
  _tenantId: string,
): Promise<Record<string, Map<string, string>>> {
  const caches: Record<string, Map<string, string>> = {};

  for (const field of fields) {
    if (field.resolve) {
      const { table, matchColumn, idColumn } = field.resolve;
      const id = idColumn || 'id';
      const result = await client.query(`SELECT ${id}, ${matchColumn} FROM ${table}`);
      const map = new Map<string, string>();
      for (const row of result.rows) {
        map.set(String(row[matchColumn]).toLowerCase(), String(row[id]));
      }
      caches[field.key] = map;
    }
    if (field.unique) {
      const { table, column } = field.unique;
      const cacheKey = `unique_${table}.${column}`;
      const result = await client.query(`SELECT ${column} FROM ${table}`);
      const set = new Map<string, string>();
      for (const row of result.rows) {
        set.set(String(row[column]).toLowerCase(), 'exists');
      }
      caches[cacheKey] = set;
    }
  }

  return caches;
}

// ─── Commit a single row to the real table ───
async function commitRow(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  entityType: string,
  data: Record<string, unknown>,
  user: { id: string; tenant_id: string },
): Promise<void> {
  switch (entityType) {
    case 'departments':
      await client.query(
        `INSERT INTO departments (tenant_id, name, description, is_active) VALUES (current_tenant_id(), $1, $2, $3)`,
        [data.name, data.description || null, data.is_active ?? true],
      );
      break;

    case 'cost_centers':
      await client.query(
        `INSERT INTO cost_centers (tenant_id, code, name, description, is_active) VALUES (current_tenant_id(), $1, $2, $3, $4)`,
        [data.code, data.name, data.description || null, data.is_active ?? true],
      );
      break;

    case 'users': {
      const password = (data.password as string) || 'TempPass123!';
      const passwordHash = await bcrypt.hash(password, 10);
      let companyId: string | null = null;
      const companyRef = typeof data.company === 'string' ? data.company.trim() : '';
      if (companyRef) {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(companyRef);
        if (isUuid) {
          companyId = companyRef;
        } else {
          const companyMatch = await client.query(
            `SELECT id
             FROM companies
             WHERE tenant_id = current_tenant_id()
               AND (name ILIKE $1 OR code ILIKE $1)
             ORDER BY name
             LIMIT 1`,
            [companyRef],
          );
          companyId = (companyMatch.rows[0]?.id as string | undefined) ?? null;
        }
      }
      const displayName = buildDisplayName(
        (data.first_name as string) || '',
        (data.last_name as string) || '',
        (data.user_id as string) || '',
        (data.email as string) || '',
        (data.display_name as string) || '',
      );
      const result = await client.query(
        `INSERT INTO users (
          tenant_id, user_id, email, password_hash,
          first_name, last_name, display_name, title,
          phone, mobile, location, timezone, time_format, date_format,
          employee_type, company, preferred_language,
          start_date, last_working_date,
          manager_id, department_id, cost_center_id, is_active
        ) VALUES (
          current_tenant_id(), $1, $2, $3,
          $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13,
          $14, $15, $16,
          $17, $18,
          $19, $20, $21, $22
        ) RETURNING id`,
        [
          data.user_id || null, data.email, passwordHash,
          data.first_name || null, data.last_name || null, displayName, data.title || null,
          data.phone || null, data.mobile || null, data.location || null, data.timezone || 'UTC', data.time_format || '24h', data.date_format || 'YYYY-MM-DD',
          data.employee_type || 'employee', companyId, data.preferred_language || 'en',
          data.start_date || null, data.last_working_date || null,
          data.manager_id || null, data.department_id || null, data.cost_center_id || null,
          data.is_active ?? true,
        ],
      );
      // Handle roles
      if (data.roles && typeof data.roles === 'string') {
        const userId = result.rows[0].id;
        const roleNames = (data.roles as string).split(',').map((r) => r.trim()).filter(Boolean);
        for (const roleName of roleNames) {
          const roleResult = await client.query('SELECT id FROM roles WHERE name ILIKE $1', [roleName]);
          if (roleResult.rows.length > 0) {
            await client.query(
              'INSERT INTO user_roles (tenant_id, user_id, role_id, granted_by) VALUES (current_tenant_id(), $1, $2, $3) ON CONFLICT DO NOTHING',
              [userId, roleResult.rows[0].id, user.id],
            );
          }
        }
      }
      break;
    }

    case 'assignment_groups': {
      const result = await client.query(
        `INSERT INTO assignment_groups (tenant_id, name, description, manager_id, cost_center_id, parent_group_id, is_active)
         VALUES (current_tenant_id(), $1, $2, $3, $4, $5, $6) RETURNING id`,
        [
          data.name, data.description || null,
          data.manager_id || null, data.cost_center_id || null,
          data.parent_group_id || null, data.is_active ?? true,
        ],
      );
      if (data.members && typeof data.members === 'string') {
        const groupId = result.rows[0].id;
        const emails = (data.members as string).split(',').map((e) => e.trim()).filter(Boolean);
        for (const email of emails) {
          const userResult = await client.query('SELECT id FROM users WHERE email ILIKE $1', [email]);
          if (userResult.rows.length > 0) {
            await client.query(
              'INSERT INTO assignment_group_members (tenant_id, group_id, user_id) VALUES (current_tenant_id(), $1, $2) ON CONFLICT DO NOTHING',
              [groupId, userResult.rows[0].id],
            );
          }
        }
      }
      break;
    }

    case 'cmdb':
      {
        const attributes: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(data)) {
          if (key.startsWith('attr.')) {
            attributes[key.slice(5)] = value;
          }
        }
      await client.query(
        `INSERT INTO configuration_items (tenant_id, class_id, name, display_name, status, environment, attributes, managed_by, location, notes)
         VALUES (current_tenant_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          data.class_id, data.name, data.display_name || null,
          data.status || 'active', data.environment || 'production',
          JSON.stringify(attributes),
          data.managed_by_id || null, data.location || null, data.notes || null,
        ],
      );
      break;
      }

    case 'incidents': {
      const seqResult = await client.query("SELECT nextval('incident_number_seq')");
      const number = `INC${String(seqResult.rows[0].nextval).padStart(7, '0')}`;
      const priority = (data.priority as number) || 3;
      const slaHoursMap: Record<number, number> = { 1: 4, 2: 8, 3: 24, 4: 48, 5: 72 };
      const slaDueAt = new Date();
      slaDueAt.setHours(slaDueAt.getHours() + (slaHoursMap[priority] || 24));

      await client.query(
        `INSERT INTO incidents (
          tenant_id, number, title, description,
          status, impact, urgency, priority,
          assigned_to, assignment_group_id, caller_id,
          contact_info, category, subcategory,
          configuration_item_id, sla_due_at
        ) VALUES (
          current_tenant_id(), $1, $2, $3,
          $4, $5, $6, $7,
          $8, $9, $10,
          $11, $12, $13,
          $14, $15
        )`,
        [
          number, data.title, data.description || null,
          data.status || 'new', data.impact || 'medium', data.urgency || 'medium', priority,
          data.assigned_to_id || null, data.assignment_group_id || null, data.caller_id || null,
          data.contact_info || null, data.category || null, data.subcategory || null,
          data.configuration_item_id || null, slaDueAt.toISOString(),
        ],
      );
      break;
    }

    default:
      throw new Error(`Unsupported entity type: ${entityType}`);
  }
}

function parseBool(val: string): boolean | null {
  const v = val.toLowerCase().trim();
  if (['true', '1', 'yes', 'y', 'on'].includes(v)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(v)) return false;
  return null;
}

function buildDisplayName(firstName: string, lastName: string, userId: string, email: string, explicit: string): string {
  const manual = explicit.trim();
  if (manual) return manual;

  const fn = firstName.trim();
  const ln = lastName.trim();
  const uid = userId.trim();
  const mail = email.trim();

  const parts: string[] = [];
  if (ln) parts.push(ln);
  if (fn) parts.push(fn);
  const name = ln && fn ? `${ln}, ${fn}` : parts.join(' ');
  if (name) return uid ? `${name} (${uid})` : name;

  if (uid) return uid;
  return mail || 'Imported User';
}

async function getImportFields(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  entityType: string,
): Promise<FieldDef[]> {
  const def = ENTITY_DEFS[entityType];
  if (!def) return [];
  const fields: FieldDef[] = def.fields.map((f) => ({ ...f }));

  if (entityType !== 'cmdb') return fields;

  const classRes = await client.query('SELECT attributes FROM ci_classes');
  const byKey = new Map<string, FieldDef>();

  const refResolveByTable: Record<string, { table: string; matchColumn: string; idColumn?: string }> = {
    users: { table: 'users', matchColumn: 'email' },
    assignment_groups: { table: 'assignment_groups', matchColumn: 'name' },
    departments: { table: 'departments', matchColumn: 'name' },
    cost_centers: { table: 'cost_centers', matchColumn: 'code' },
    services: { table: 'services', matchColumn: 'name' },
    configuration_items: { table: 'configuration_items', matchColumn: 'name' },
  };

  for (const row of classRes.rows) {
    const attrs = (row.attributes || {}) as Record<string, { type?: string; reference_table?: string }>;
    for (const [attrKey, attrDef] of Object.entries(attrs)) {
      const fieldKey = `attr.${attrKey}`;
      const existing = byKey.get(fieldKey);

      const mappedType: FieldDef['type'] =
        attrDef?.type === 'boolean' ? 'boolean'
          : attrDef?.type === 'integer' ? 'integer'
            : attrDef?.type === 'number' ? 'number'
              : 'string';

      const resolve = attrDef?.type === 'reference' && attrDef.reference_table
        ? refResolveByTable[attrDef.reference_table]
        : undefined;

      const nextField: FieldDef = {
        key: fieldKey,
        label: `Attribute: ${attrKey}`,
        type: mappedType,
        resolve,
      };

      if (!existing) {
        byKey.set(fieldKey, nextField);
      } else if (existing.type !== nextField.type) {
        // Same attribute key across classes with different types: fall back to string.
        byKey.set(fieldKey, { ...existing, type: 'string', resolve: undefined });
      }
    }
  }

  fields.push(...Array.from(byKey.values()).sort((a, b) => a.key.localeCompare(b.key)));
  return fields;
}

export default router;
