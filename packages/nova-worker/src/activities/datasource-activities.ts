/* SPDX-License-Identifier: AGPL-3.0-only */
import { log } from '@temporalio/activity';
import type { PoolClient } from 'pg';
import { withTenantContext } from '../db';
import SftpClient from 'ssh2-sftp-client';
import { decryptCredentialSecret } from '../credentials/vault';

interface SourceConfig {
  url?: string;
  headers?: Record<string, string>;
  json_path?: string;
  /** When set, secret value is loaded from tenant_credentials (same as catalog {{cred.slug}}). */
  credential_slug?: string;
  // OAuth2 (for rest_api)
  auth_type?: 'none' | 'bearer' | 'oauth2';
  bearer_token?: string;
  oauth2_token_url?: string;
  oauth2_client_id?: string;
  oauth2_client_secret?: string;
  oauth2_scope?: string;
  oauth2_grant_type?: string;
  // REST pagination
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
  // SFTP
  sftp_host?: string;
  sftp_port?: number;
  sftp_username?: string;
  sftp_password?: string;
  sftp_private_key?: string;
  sftp_path?: string;
  sftp_file_type?: 'csv' | 'json';
  // CSV options
  csv_delimiter?: string;
  csv_has_headers?: boolean;
}

interface DataSourceRow {
  [key: string]: unknown;
  id: string;
  tenant_id: string;
  entity_type: string;
  source_type: string;
  source_config: SourceConfig;
  column_mapping: Record<string, string | string[]>;
  import_mode: string;
  upsert_key: string | null;
}

async function resolveSourceConfigSecrets(
  client: PoolClient,
  tenantId: string,
  cfg: SourceConfig,
): Promise<SourceConfig> {
  const slug = typeof cfg.credential_slug === 'string' ? cfg.credential_slug.trim() : '';
  if (!slug) return cfg;
  const secret = await decryptCredentialSecret(client, tenantId, slug);
  const next: SourceConfig = { ...cfg };
  if (next.auth_type === 'oauth2') {
    next.oauth2_client_secret = secret;
  } else {
    next.bearer_token = secret;
    if (!next.auth_type || next.auth_type === 'none') {
      next.auth_type = 'bearer';
    }
  }
  if (next.sftp_host && !next.sftp_private_key) {
    next.sftp_password = secret;
  }
  return next;
}

export async function runDataSourceImport(
  dataSourceId: string,
  tenantId: string,
  triggerType: 'manual' | 'scheduled',
): Promise<void> {
  log.info('Starting data source import', { dataSourceId, triggerType });

  return withTenantContext(tenantId, async (client) => {
    const dsRes = await client.query<DataSourceRow>(
      `SELECT * FROM data_sources WHERE id = $1`,
      [dataSourceId],
    );
    if (dsRes.rows.length === 0) throw new Error(`Data source ${dataSourceId} not found`);
    const row = dsRes.rows[0];
    const source_config = await resolveSourceConfigSecrets(
      client,
      tenantId,
      row.source_config as SourceConfig,
    );
    const ds: DataSourceRow = { ...row, source_config };

    const runRows = await client.query<{ id: string }>(
      `INSERT INTO data_source_runs (data_source_id, tenant_id, status, trigger_type)
       VALUES ($1, $2, 'running', $3) RETURNING id`,
      [dataSourceId, tenantId, triggerType],
    );
    const runId = runRows.rows[0].id;

    try {
      const rawData = await fetchData(ds);
      log.info('Fetched data', { rows: rawData.length, dataSourceId });

      if (rawData.length === 0) {
        await completeRun(client, runId, 'completed', 0, 0, 0, 0);
        await client.query(
          `UPDATE data_sources SET last_run_at = now(), last_run_status = 'completed' WHERE id = $1`,
          [dataSourceId],
        );
        return;
      }

      const mapping = ds.column_mapping || {};
      const invertedMap: Record<string, string> = {};
      for (const [srcCol, targetFields] of Object.entries(mapping)) {
        if (typeof targetFields === 'string' && targetFields) {
          invertedMap[targetFields] = srcCol;
          continue;
        }
        if (Array.isArray(targetFields)) {
          for (const targetField of targetFields) {
            if (typeof targetField === 'string' && targetField) {
              invertedMap[targetField] = srcCol;
            }
          }
        }
      }

      let committed = 0;
      let errors = 0;
      let skipped = 0;
      const errorSamples: { row_index: number; error: string; data: Record<string, string>; mapped_data?: Record<string, unknown> }[] = [];

      if (rawData.length > 0) {
        const srcColumns = Object.keys(rawData[0]);
        const mappingSrcCols = Object.keys(mapping);
        const unmatchedMappings = mappingSrcCols.filter((c) => !srcColumns.includes(c));
        if (unmatchedMappings.length > 0) {
          log.warn('Column mapping mismatch: some mapped source columns not found in data', {
            mapped_columns: mappingSrcCols,
            source_columns: srcColumns,
            unmatched: unmatchedMappings,
          });
        }
      }

      const fkCaches = await buildFkCaches(client, ds.entity_type);

      for (let rowIdx = 0; rowIdx < rawData.length; rowIdx++) {
        const rawRow = rawData[rowIdx];
        let mappedData: Record<string, unknown> | undefined;
        try {
          mappedData = applyMapping(rawRow, invertedMap);
          const resolved = resolveForeignKeys(mappedData, ds.entity_type, fkCaches);

          if (ds.import_mode === 'upsert') {
            const didUpsert = await upsertRow(client, ds.entity_type, resolved, tenantId, ds.upsert_key);
            if (didUpsert) committed++;
            else skipped++;
          } else {
            await insertRow(client, ds.entity_type, resolved, tenantId);
            committed++;
          }
        } catch (err) {
          errors++;
          const errMsg = err instanceof Error ? err.message : String(err);
          if (errorSamples.length < 10) {
            errorSamples.push({
              row_index: rowIdx + 1,
              error: errMsg,
              data: rawRow,
              mapped_data: mappedData,
            });
          }
          if (errors <= 5) {
            log.warn('Row import error', { error: errMsg, mapped: JSON.stringify(mappedData || {}).slice(0, 200) });
          }
        }
      }

      const runMeta: Record<string, unknown> = {};
      if (rawData.length > 0) {
        runMeta.detected_columns = Object.keys(rawData[0]);
      }
      runMeta.mapping_used = mapping;
      if (ds.source_config.csv_delimiter) runMeta.csv_delimiter = ds.source_config.csv_delimiter;
      if (ds.source_config.csv_has_headers === false) runMeta.csv_has_headers = false;

      await completeRun(client, runId, 'completed', rawData.length, committed, errors, skipped, errorSamples, runMeta);
      await client.query(
        `UPDATE data_sources SET last_run_at = now(), last_run_status = 'completed' WHERE id = $1`,
        [dataSourceId],
      );

      log.info('Data source import completed', { dataSourceId, total: rawData.length, committed, errors, skipped });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('Data source import failed', { dataSourceId, error: msg });
      await failRun(client, runId, msg);
      await client.query(
        `UPDATE data_sources SET last_run_at = now(), last_run_status = 'failed' WHERE id = $1`,
        [dataSourceId],
      );
      throw err;
    }
  });
}

async function fetchData(ds: DataSourceRow): Promise<Record<string, string>[]> {
  if (ds.source_type === 'sftp') {
    return fetchViaSftp(ds.source_config);
  }
  return fetchViaHttp(ds);
}

async function fetchOAuth2Token(cfg: SourceConfig): Promise<string> {
  if (!cfg.oauth2_token_url || !cfg.oauth2_client_id || !cfg.oauth2_client_secret) {
    throw new Error('OAuth2 configuration incomplete: token_url, client_id, and client_secret required');
  }

  const grantType = cfg.oauth2_grant_type || 'client_credentials';
  const params = new URLSearchParams({
    grant_type: grantType,
    client_id: cfg.oauth2_client_id,
    client_secret: cfg.oauth2_client_secret,
  });
  if (cfg.oauth2_scope) params.set('scope', cfg.oauth2_scope);

  log.info('Fetching OAuth2 token', { tokenUrl: cfg.oauth2_token_url, grantType });

  const response = await fetch(cfg.oauth2_token_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OAuth2 token request failed: ${response.status} – ${body.slice(0, 200)}`);
  }

  const text = await response.text();
  let data: { access_token?: string };
  try {
    data = JSON.parse(text) as { access_token?: string };
  } catch {
    const preview = text.slice(0, 200).replace(/\s+/g, ' ').trim();
    const looksLikeHtml = /^\s*</.test(text) || /<!doctype html>/i.test(text);
    if (looksLikeHtml) {
      throw new Error(`OAuth2 token endpoint returned HTML instead of JSON. Preview: ${preview}`);
    }
    throw new Error(`OAuth2 token endpoint returned invalid JSON. Preview: ${preview}`);
  }
  if (!data.access_token) throw new Error('OAuth2 response missing access_token');

  log.info('OAuth2 token obtained');
  return data.access_token;
}

async function fetchViaHttp(ds: DataSourceRow): Promise<Record<string, string>[]> {
  const cfg = ds.source_config;
  if (!cfg.url) throw new Error('Source URL is not configured');

  const headers: Record<string, string> = { ...(cfg.headers || {}) };
  if (ds.source_type === 'json_url' || ds.source_type === 'rest_api') {
    headers.Accept = headers.Accept || 'application/json';
  }

  // Apply authentication
  if (cfg.auth_type === 'oauth2') {
    const token = await fetchOAuth2Token(cfg);
    headers['Authorization'] = `Bearer ${token}`;
  } else if (cfg.auth_type === 'bearer' && cfg.bearer_token) {
    headers['Authorization'] = `Bearer ${cfg.bearer_token}`;
  }

  if (ds.source_type === 'rest_api' && cfg.pagination?.enabled) {
    return fetchRestWithPagination(cfg, headers);
  }

  const response = await fetch(cfg.url, { headers });
  if (!response.ok) throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);

  const contentType = response.headers.get('content-type') || '';
  const bodyText = await response.text();

  if (ds.source_type === 'json_url' || ds.source_type === 'rest_api' || contentType.includes('json')) {
    if (!contentType.includes('json') && (/^\s*</.test(bodyText) || /<!doctype html>/i.test(bodyText))) {
      const preview = bodyText.slice(0, 200).replace(/\s+/g, ' ').trim();
      throw new Error(
        `Expected JSON but received HTML from ${cfg.url} (content-type: ${contentType || 'unknown'}). `
        + `This often means wrong endpoint, auth/login page, or proxy fallback. Preview: ${preview}`,
      );
    }
    return parseJsonResponse(bodyText, cfg.json_path);
  }

  return parseCsv(bodyText, {
    delimiter: cfg.csv_delimiter,
    hasHeaders: cfg.csv_has_headers,
  });
}

async function fetchRestWithPagination(
  cfg: SourceConfig,
  headers: Record<string, string>,
): Promise<Record<string, string>[]> {
  if (!cfg.url) throw new Error('Source URL is not configured');
  const pag = cfg.pagination || {};
  const mode = pag.mode === 'offset' ? 'offset' : 'page';
  const maxPages = Math.max(1, Math.min(500, Number(pag.max_pages) || 20));
  const rows: Record<string, string>[] = [];

  for (let idx = 0; idx < maxPages; idx++) {
    const u = new URL(cfg.url);
    const pageSize = Math.max(1, Number(pag.page_size || pag.limit) || 100);
    if (mode === 'page') {
      const pageParam = pag.page_param || 'page';
      const pageSizeParam = pag.page_size_param || 'limit';
      const pageStart = Number(pag.page_start ?? 1);
      u.searchParams.set(pageParam, String(pageStart + idx));
      u.searchParams.set(pageSizeParam, String(pageSize));
    } else {
      const offsetParam = pag.offset_param || 'offset';
      const limitParam = pag.limit_param || 'limit';
      const offsetStart = Number(pag.offset_start ?? 0);
      u.searchParams.set(offsetParam, String(offsetStart + idx * pageSize));
      u.searchParams.set(limitParam, String(pageSize));
    }

    const response = await fetch(u.toString(), { headers });
    if (!response.ok) {
      throw new Error(`Fetch failed on page ${idx + 1}: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    const bodyText = await response.text();
    if (!contentType.includes('json') && (/^\s*</.test(bodyText) || /<!doctype html>/i.test(bodyText))) {
      const preview = bodyText.slice(0, 200).replace(/\s+/g, ' ').trim();
      throw new Error(
        `Expected JSON but received HTML while paginating ${cfg.url} (page ${idx + 1}). `
        + `Preview: ${preview}`,
      );
    }

    const pageRows = parseJsonResponse(bodyText, cfg.json_path);
    rows.push(...pageRows);
    if (pageRows.length === 0 || pageRows.length < pageSize) break;
  }

  return rows;
}

async function fetchViaSftp(cfg: SourceConfig): Promise<Record<string, string>[]> {
  if (!cfg.sftp_host || !cfg.sftp_username || !cfg.sftp_path) {
    throw new Error('SFTP configuration incomplete: host, username, and path required');
  }

  const sftp = new SftpClient();
  try {
    log.info('Connecting to SFTP', { host: cfg.sftp_host, port: cfg.sftp_port || 22, user: cfg.sftp_username });

    const connectOpts: Record<string, unknown> = {
      host: cfg.sftp_host,
      port: cfg.sftp_port || 22,
      username: cfg.sftp_username,
    };
    if (cfg.sftp_private_key) {
      connectOpts.privateKey = cfg.sftp_private_key;
    } else if (cfg.sftp_password) {
      connectOpts.password = cfg.sftp_password;
    }

    await sftp.connect(connectOpts);
    log.info('SFTP connected, downloading file', { path: cfg.sftp_path });

    const buffer = await sftp.get(cfg.sftp_path) as Buffer;
    const text = buffer.toString('utf-8');

    const fileType = cfg.sftp_file_type || inferFileType(cfg.sftp_path);

    if (fileType === 'json') {
      return parseJsonResponse(text, cfg.json_path);
    }
    return parseCsv(text, {
      delimiter: cfg.csv_delimiter,
      hasHeaders: cfg.csv_has_headers,
    });
  } finally {
    await sftp.end();
  }
}

function inferFileType(path: string): 'csv' | 'json' {
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'json') return 'json';
  return 'csv';
}

function parseJsonResponse(text: string, jsonPath?: string): Record<string, string>[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    const preview = text.slice(0, 200).replace(/\s+/g, ' ').trim();
    const looksLikeHtml = /^\s*</.test(text) || /<!doctype html>/i.test(text);
    if (looksLikeHtml) {
      throw new Error(`Expected JSON response but received HTML. Preview: ${preview}`);
    }
    throw new Error(`Expected JSON response but could not parse it. Preview: ${preview}`);
  }
  if (jsonPath) {
    const parts = jsonPath.split('.');
    for (const p of parts) {
      if (data && typeof data === 'object' && p in (data as Record<string, unknown>)) {
        data = (data as Record<string, unknown>)[p];
      }
    }
  }
  if (!Array.isArray(data)) throw new Error('JSON response is not an array');
  return data.map((item: unknown) => {
    const row: Record<string, string> = {};
    if (item && typeof item === 'object') {
      for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
        row[k] = v == null ? '' : String(v);
      }
    }
    return row;
  });
}

interface CsvOptions {
  delimiter?: string;
  hasHeaders?: boolean;
}

function parseCsv(text: string, opts: CsvOptions = {}): Record<string, string>[] {
  // Strip BOM
  const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  const lines = clean.split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const hasHeaders = opts.hasHeaders !== false;
  const delimiter = opts.delimiter && opts.delimiter !== 'auto' ? opts.delimiter : detectDelimiter(lines[0]);
  log.info('CSV parsing', {
    delimiter: delimiter === '\t' ? 'TAB' : delimiter,
    hasHeaders,
    explicit: !!(opts.delimiter && opts.delimiter !== 'auto'),
  });

  let headers: string[];
  let dataStart: number;

  if (hasHeaders) {
    if (lines.length < 2) return [];
    headers = splitCsvLine(lines[0], delimiter).map((h) => h.trim());
    dataStart = 1;
  } else {
    const colCount = splitCsvLine(lines[0], delimiter).length;
    headers = Array.from({ length: colCount }, (_, i) => `col_${i + 1}`);
    dataStart = 0;
  }

  log.info('CSV columns', { columns: headers, count: headers.length, fromHeader: hasHeaders });

  const rows: Record<string, string>[] = [];
  for (let i = dataStart; i < lines.length; i++) {
    const values = splitCsvLine(lines[i], delimiter);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] || '').trim();
    });
    rows.push(row);
  }
  return rows;
}

function detectDelimiter(headerLine: string): string {
  // Count occurrences of common delimiters outside of quotes
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
      bestCount = count;
      best = delim;
    }
  }
  return best;
}

function splitCsvLine(line: string, delimiter: string = ','): string[] {
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

function applyMapping(
  rawRow: Record<string, string>,
  invertedMap: Record<string, string>,
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [targetField, srcCol] of Object.entries(invertedMap)) {
    const val = rawRow[srcCol];
    if (val !== undefined && val !== null && val !== '') {
      mapped[targetField] = val.trim();
    }
  }
  // Also pass through unmapped fields if mapping is empty (direct column names)
  if (Object.keys(invertedMap).length === 0) {
    for (const [k, v] of Object.entries(rawRow)) {
      if (v !== undefined && v !== null && v !== '') {
        mapped[k] = v.trim();
      }
    }
  }
  return mapped;
}

type FkCache = Map<string, string>;

const ENTITY_FK_FIELDS: Record<string, { field: string; table: string; matchCol: string; idField: string }[]> = {
  users: [
    { field: 'manager', table: 'users', matchCol: 'email', idField: 'manager_id' },
    { field: 'department', table: 'departments', matchCol: 'name', idField: 'department_id' },
    { field: 'cost_center', table: 'cost_centers', matchCol: 'code', idField: 'cost_center_id' },
  ],
  cmdb: [
    { field: 'class', table: 'ci_classes', matchCol: 'name', idField: 'class_id' },
    { field: 'managed_by', table: 'users', matchCol: 'email', idField: 'managed_by_id' },
  ],
  incidents: [
    { field: 'assigned_to', table: 'users', matchCol: 'email', idField: 'assigned_to_id' },
    { field: 'caller', table: 'users', matchCol: 'email', idField: 'caller_id' },
    { field: 'assignment_group', table: 'assignment_groups', matchCol: 'name', idField: 'assignment_group_id' },
    { field: 'configuration_item', table: 'configuration_items', matchCol: 'name', idField: 'configuration_item_id' },
  ],
  assignment_groups: [
    { field: 'manager', table: 'users', matchCol: 'email', idField: 'manager_id' },
    { field: 'cost_center', table: 'cost_centers', matchCol: 'code', idField: 'cost_center_id' },
    { field: 'parent_group', table: 'assignment_groups', matchCol: 'name', idField: 'parent_group_id' },
  ],
  departments: [],
  cost_centers: [],
};

async function buildFkCaches(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  entityType: string,
): Promise<Record<string, FkCache>> {
  const caches: Record<string, FkCache> = {};
  const fkDefs = ENTITY_FK_FIELDS[entityType] || [];

  for (const fk of fkDefs) {
    const result = await client.query(`SELECT id, ${fk.matchCol} FROM ${fk.table}`);
    const map = new Map<string, string>();
    for (const row of result.rows) {
      map.set(String(row[fk.matchCol]).toLowerCase(), String(row.id));
    }
    caches[fk.field] = map;
  }
  return caches;
}

function resolveForeignKeys(
  mapped: Record<string, unknown>,
  entityType: string,
  caches: Record<string, FkCache>,
): Record<string, unknown> {
  const fkDefs = ENTITY_FK_FIELDS[entityType] || [];
  for (const fk of fkDefs) {
    const val = mapped[fk.field];
    if (val && typeof val === 'string') {
      const resolved = caches[fk.field]?.get(val.toLowerCase());
      if (resolved) {
        mapped[fk.idField] = resolved;
      }
    }
  }
  return mapped;
}

const ENTITY_TABLES: Record<string, string> = {
  departments: 'departments',
  cost_centers: 'cost_centers',
  users: 'users',
  assignment_groups: 'assignment_groups',
  cmdb: 'configuration_items',
  incidents: 'incidents',
};

const DEFAULT_UPSERT_KEYS: Record<string, string> = {
  departments: 'name',
  cost_centers: 'code',
  users: 'email',
  assignment_groups: 'name',
  cmdb: 'name',
};

const SAFE_COL_RE = /^[a-z_][a-z0-9_]*$/;

async function upsertRow(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  entityType: string,
  data: Record<string, unknown>,
  _tenantId: string,
  customUpsertKey?: string | null,
): Promise<boolean> {
  const table = ENTITY_TABLES[entityType];
  if (!table) {
    await insertRow(client, entityType, data, _tenantId);
    return true;
  }

  const matchCol = customUpsertKey || DEFAULT_UPSERT_KEYS[entityType];
  if (!matchCol) {
    await insertRow(client, entityType, data, _tenantId);
    return true;
  }

  if (!SAFE_COL_RE.test(matchCol)) {
    throw new Error(`Invalid upsert key column name: "${matchCol}"`);
  }

  const matchVal = data[matchCol];
  if (!matchVal) {
    await insertRow(client, entityType, data, _tenantId);
    return true;
  }

  const existing = await client.query(
    `SELECT id FROM ${table} WHERE ${matchCol} ILIKE $1`,
    [matchVal],
  );

  if (existing.rows.length > 0) {
    const id = existing.rows[0].id;
    const updateFields = getUpdateFields(entityType, data, matchCol);
    if (updateFields.sets.length > 0) {
      updateFields.params.push(id);
      await client.query(
        `UPDATE ${table} SET ${updateFields.sets.join(', ')} WHERE id = $${updateFields.params.length}`,
        updateFields.params,
      );
    }
    return true;
  }

  await insertRow(client, entityType, data, _tenantId);
  return true;
}

function getUpdateFields(
  entityType: string,
  data: Record<string, unknown>,
  matchCol?: string,
): { sets: string[]; params: unknown[] } {
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 0;

  const fieldMap: Record<string, string[]> = {
    departments: ['name', 'description', 'is_active'],
    cost_centers: ['code', 'name', 'description', 'is_active'],
    users: [
      'user_id', 'email', 'display_name', 'first_name', 'last_name', 'title', 'phone', 'mobile',
      'location', 'timezone', 'employee_type', 'company', 'preferred_language',
      'start_date', 'last_working_date', 'manager_id', 'department_id',
      'cost_center_id', 'is_active',
    ],
    assignment_groups: ['name', 'description', 'manager_id', 'cost_center_id', 'parent_group_id', 'is_active'],
    cmdb: ['name', 'display_name', 'class_id', 'status', 'environment', 'managed_by_id', 'location', 'notes'],
  };

  const allowed = fieldMap[entityType] || [];
  for (const col of allowed) {
    if (col === matchCol) continue;
    if (data[col] !== undefined) {
      idx++;
      sets.push(`${col} = $${idx}`);
      params.push(data[col]);
    }
  }

  return { sets, params };
}

async function insertRow(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  entityType: string,
  data: Record<string, unknown>,
  _tenantId: string,
): Promise<void> {
  switch (entityType) {
    case 'departments':
      await client.query(
        `INSERT INTO departments (tenant_id, name, description, is_active)
         VALUES (current_tenant_id(), $1, $2, $3)`,
        [data.name, data.description || null, data.is_active ?? true],
      );
      break;

    case 'cost_centers':
      await client.query(
        `INSERT INTO cost_centers (tenant_id, code, name, description, is_active)
         VALUES (current_tenant_id(), $1, $2, $3, $4)`,
        [data.code, data.name, data.description || null, data.is_active ?? true],
      );
      break;

    case 'users':
      let companyId: string | null = null;
      if (typeof data.company === 'string' && data.company.trim()) {
        const companyRef = data.company.trim();
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
      await client.query(
        `INSERT INTO users (
          tenant_id, user_id, email, password_hash,
          first_name, last_name, display_name, title,
          phone, mobile, location, timezone,
          employee_type, company, preferred_language,
          start_date, last_working_date,
          manager_id, department_id, cost_center_id, is_active
        ) VALUES (
          current_tenant_id(), $1, $2, '$2b$10$placeholder',
          $3, $4, $5, $6,
          $7, $8, $9, $10,
          $11, $12, $13,
          $14, $15,
          $16, $17, $18, $19
        )`,
        [
          data.user_id || null, data.email,
          data.first_name || null, data.last_name || null, data.display_name || data.email, data.title || null,
          data.phone || null, data.mobile || null, data.location || null, data.timezone || 'UTC',
          data.employee_type || 'employee', companyId, data.preferred_language || 'en',
          data.start_date || null, data.last_working_date || null,
          data.manager_id || null, data.department_id || null, data.cost_center_id || null,
          data.is_active ?? true,
        ],
      );
      break;

    case 'assignment_groups':
      await client.query(
        `INSERT INTO assignment_groups (tenant_id, name, description, manager_id, cost_center_id, parent_group_id, is_active)
         VALUES (current_tenant_id(), $1, $2, $3, $4, $5, $6)`,
        [
          data.name, data.description || null,
          data.manager_id || null, data.cost_center_id || null,
          data.parent_group_id || null, data.is_active ?? true,
        ],
      );
      break;

    case 'cmdb':
      await client.query(
        `INSERT INTO configuration_items (tenant_id, class_id, name, display_name, status, environment, managed_by, location, notes)
         VALUES (current_tenant_id(), $1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          data.class_id, data.name, data.display_name || null,
          data.status || 'active', data.environment || 'production',
          data.managed_by_id || null, data.location || null, data.notes || null,
        ],
      );
      break;

    case 'incidents': {
      const seqResult = await client.query("SELECT nextval('incident_number_seq')");
      const number = `INC${String(seqResult.rows[0].nextval).padStart(7, '0')}`;
      const priority = parseInt(String(data.priority || '3'), 10) || 3;
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

async function completeRun(
  client: PoolClient,
  runId: string,
  status: string,
  total: number,
  committed: number,
  errors: number,
  skipped: number,
  errorSamples: unknown[] = [],
  runMeta: Record<string, unknown> = {},
): Promise<void> {
  await client.query(
    `UPDATE data_source_runs SET status = $1, total_rows = $2, committed_rows = $3,
     error_rows = $4, skipped_rows = $5, error_samples = $6, run_meta = $7, completed_at = now() WHERE id = $8`,
    [status, total, committed, errors, skipped, JSON.stringify(errorSamples), JSON.stringify(runMeta), runId],
  );
}

async function failRun(client: PoolClient, runId: string, errorMessage: string): Promise<void> {
  await client.query(
    `UPDATE data_source_runs SET status = 'failed', error_message = $1, completed_at = now() WHERE id = $2`,
    [errorMessage.slice(0, 2000), runId],
  );
}
