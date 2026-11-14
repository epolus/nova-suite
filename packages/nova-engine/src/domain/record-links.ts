/* SPDX-License-Identifier: AGPL-3.0-only */
import type { PoolClient } from 'pg';
import { AppError } from '../middleware/errorHandler';

export const RECORD_LINK_ENTITY_TYPES = [
  'incident',
  'request',
  'problem',
  'change',
  'configuration_item',
  'asset',
] as const;
export type RecordLinkEntityType = (typeof RECORD_LINK_ENTITY_TYPES)[number];

export const RECORD_LINK_TYPES = ['related', 'parent', 'duplicate'] as const;
export type RecordLinkType = (typeof RECORD_LINK_TYPES)[number];

const ENTITY_TABLE: Record<RecordLinkEntityType, string> = {
  incident: 'incidents',
  request: 'requests',
  problem: 'problems',
  change: 'changes',
  configuration_item: 'configuration_items',
  asset: 'assets',
};

const ENTITY_PATH: Record<RecordLinkEntityType, (id: string) => string> = {
  incident: (id) => `/incidents/${id}`,
  request: (id) => `/requests/${id}`,
  problem: (id) => `/problems/${id}`,
  change: (id) => `/changes/${id}`,
  configuration_item: (id) => `/cmdb/${id}`,
  asset: (id) => `/assets/${id}`,
};

export type RecordLinkRow = {
  id: string;
  source_type: RecordLinkEntityType;
  source_id: string;
  target_type: RecordLinkEntityType;
  target_id: string;
  link_type: RecordLinkType;
  created_by: string | null;
  created_at: string;
};

export type RecordLinkView = RecordLinkRow & {
  /** Entity on the other side of the link relative to the queried record. */
  other_type: RecordLinkEntityType;
  other_id: string;
  other_identifier: string;
  other_title: string;
  other_status: string | null;
  other_path: string;
  /** For parent links: whether the queried entity is the parent. */
  direction: 'outgoing' | 'incoming';
};

export function isRecordLinkEntityType(value: unknown): value is RecordLinkEntityType {
  return typeof value === 'string'
    && (RECORD_LINK_ENTITY_TYPES as readonly string[]).includes(value);
}

export function isRecordLinkType(value: unknown): value is RecordLinkType {
  return typeof value === 'string'
    && (RECORD_LINK_TYPES as readonly string[]).includes(value);
}

/**
 * Pairs covered by dedicated incident FKs / join tables — use those instead of record_links.
 * - configuration_item → incidents.configuration_item_id
 * - problem → problem_incidents / related problem field
 */
export function isDisallowedRecordLinkPair(
  a: RecordLinkEntityType,
  b: RecordLinkEntityType,
): boolean {
  const pair = new Set([a, b]);
  return (pair.has('incident') && pair.has('configuration_item'))
    || (pair.has('incident') && pair.has('problem'));
}

async function assertEntityExists(
  client: PoolClient,
  entityType: RecordLinkEntityType,
  entityId: string,
): Promise<void> {
  const table = ENTITY_TABLE[entityType];
  const result = await client.query(
    `SELECT 1 FROM ${table} WHERE id = $1 LIMIT 1`,
    [entityId],
  );
  if (result.rows.length === 0) {
    throw new AppError(404, `${entityType} not found`);
  }
}

type DisplayRow = {
  identifier: string;
  title: string;
  status: string | null;
};

async function loadDisplay(
  client: PoolClient,
  entityType: RecordLinkEntityType,
  entityId: string,
): Promise<DisplayRow> {
  switch (entityType) {
    case 'incident': {
      const r = await client.query(
        `SELECT number AS identifier, title, status::text AS status FROM incidents WHERE id = $1`,
        [entityId],
      );
      return r.rows[0] || { identifier: entityId, title: entityId, status: null };
    }
    case 'request': {
      const r = await client.query(
        `SELECT r.number AS identifier,
                COALESCE(si.name, r.number) AS title,
                r.status::text AS status
         FROM requests r
         LEFT JOIN service_items si ON si.id = r.service_item_id
         WHERE r.id = $1`,
        [entityId],
      );
      return r.rows[0] || { identifier: entityId, title: entityId, status: null };
    }
    case 'problem': {
      const r = await client.query(
        `SELECT number AS identifier, title, status::text AS status FROM problems WHERE id = $1`,
        [entityId],
      );
      return r.rows[0] || { identifier: entityId, title: entityId, status: null };
    }
    case 'change': {
      const r = await client.query(
        `SELECT number AS identifier, title, status::text AS status FROM changes WHERE id = $1`,
        [entityId],
      );
      return r.rows[0] || { identifier: entityId, title: entityId, status: null };
    }
    case 'configuration_item': {
      const r = await client.query(
        `SELECT name AS identifier, COALESCE(display_name, name) AS title, status::text AS status
         FROM configuration_items WHERE id = $1`,
        [entityId],
      );
      return r.rows[0] || { identifier: entityId, title: entityId, status: null };
    }
    case 'asset': {
      const r = await client.query(
        `SELECT asset_tag AS identifier, name AS title, status::text AS status
         FROM assets WHERE id = $1`,
        [entityId],
      );
      return r.rows[0] || { identifier: entityId, title: entityId, status: null };
    }
    default:
      return { identifier: entityId, title: entityId, status: null };
  }
}

export async function listRecordLinks(
  client: PoolClient,
  entityType: RecordLinkEntityType,
  entityId: string,
): Promise<RecordLinkView[]> {
  const result = await client.query(
    `SELECT id, source_type, source_id, target_type, target_id, link_type, created_by, created_at
     FROM record_links
     WHERE (source_type = $1 AND source_id = $2)
        OR (target_type = $1 AND target_id = $2)
     ORDER BY created_at DESC`,
    [entityType, entityId],
  );

  const views: RecordLinkView[] = [];
  for (const row of result.rows as RecordLinkRow[]) {
    const outgoing = row.source_type === entityType && row.source_id === entityId;
    const otherType = (outgoing ? row.target_type : row.source_type) as RecordLinkEntityType;
    const otherId = outgoing ? row.target_id : row.source_id;
    const display = await loadDisplay(client, otherType, otherId);
    views.push({
      ...row,
      other_type: otherType,
      other_id: otherId,
      other_identifier: display.identifier,
      other_title: display.title,
      other_status: display.status,
      other_path: ENTITY_PATH[otherType](otherId),
      direction: outgoing ? 'outgoing' : 'incoming',
    });
  }
  return views;
}

export async function createRecordLink(
  client: PoolClient,
  input: {
    source_type: RecordLinkEntityType;
    source_id: string;
    target_type: RecordLinkEntityType;
    target_id: string;
    link_type: RecordLinkType;
    created_by: string | null;
  },
): Promise<RecordLinkRow> {
  if (input.source_type === input.target_type && input.source_id === input.target_id) {
    throw new AppError(400, 'Cannot link a record to itself');
  }
  if (isDisallowedRecordLinkPair(input.source_type, input.target_type)) {
    const types = new Set([input.source_type, input.target_type]);
    if (types.has('problem')) {
      throw new AppError(
        400,
        'Link incidents to problems with the incident Related Problem field',
      );
    }
    throw new AppError(
      400,
      'Link incidents to configuration items with the incident Configuration Item field',
    );
  }

  await assertEntityExists(client, input.source_type, input.source_id);
  await assertEntityExists(client, input.target_type, input.target_id);

  try {
    const result = await client.query(
      `INSERT INTO record_links (
         tenant_id, source_type, source_id, target_type, target_id, link_type, created_by
       ) VALUES (
         current_tenant_id(), $1, $2, $3, $4, $5, $6
       )
       RETURNING id, source_type, source_id, target_type, target_id, link_type, created_by, created_at`,
      [
        input.source_type,
        input.source_id,
        input.target_type,
        input.target_id,
        input.link_type,
        input.created_by,
      ],
    );
    return result.rows[0] as RecordLinkRow;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === '23505') {
      throw new AppError(409, 'A link between these records already exists');
    }
    throw err;
  }
}

export async function deleteRecordLink(
  client: PoolClient,
  linkId: string,
): Promise<boolean> {
  const result = await client.query(
    `DELETE FROM record_links WHERE id = $1 RETURNING id`,
    [linkId],
  );
  return result.rows.length > 0;
}

export type RecordLinkSearchHit = {
  id: string;
  entity_type: RecordLinkEntityType;
  identifier: string;
  title: string;
  status: string | null;
  path: string;
};

/** Lightweight picker search for one allowlisted entity type. */
export async function searchRecordLinkTargets(
  client: PoolClient,
  entityType: RecordLinkEntityType,
  q: string,
  limit = 15,
): Promise<RecordLinkSearchHit[]> {
  const term = q.trim();
  if (!term) return [];
  const like = `%${term}%`;
  const capped = Math.min(Math.max(limit, 1), 30);

  let rows: Array<{ id: string; identifier: string; title: string; status: string | null }>;

  switch (entityType) {
    case 'incident': {
      const r = await client.query(
        `SELECT id, number AS identifier, title, status::text AS status
         FROM incidents
         WHERE number ILIKE $1 OR title ILIKE $1
         ORDER BY updated_at DESC
         LIMIT $2`,
        [like, capped],
      );
      rows = r.rows;
      break;
    }
    case 'request': {
      const r = await client.query(
        `SELECT r.id, r.number AS identifier, COALESCE(si.name, r.number) AS title, r.status::text AS status
         FROM requests r
         LEFT JOIN service_items si ON si.id = r.service_item_id
         WHERE r.number ILIKE $1 OR si.name ILIKE $1
         ORDER BY r.updated_at DESC
         LIMIT $2`,
        [like, capped],
      );
      rows = r.rows;
      break;
    }
    case 'problem': {
      const r = await client.query(
        `SELECT id, number AS identifier, title, status::text AS status
         FROM problems
         WHERE number ILIKE $1 OR title ILIKE $1
         ORDER BY updated_at DESC
         LIMIT $2`,
        [like, capped],
      );
      rows = r.rows;
      break;
    }
    case 'change': {
      const r = await client.query(
        `SELECT id, number AS identifier, title, status::text AS status
         FROM changes
         WHERE number ILIKE $1 OR title ILIKE $1
         ORDER BY updated_at DESC
         LIMIT $2`,
        [like, capped],
      );
      rows = r.rows;
      break;
    }
    case 'configuration_item': {
      const r = await client.query(
        `SELECT id, name AS identifier, COALESCE(display_name, name) AS title, status::text AS status
         FROM configuration_items
         WHERE name ILIKE $1 OR display_name ILIKE $1
         ORDER BY updated_at DESC
         LIMIT $2`,
        [like, capped],
      );
      rows = r.rows;
      break;
    }
    case 'asset': {
      const r = await client.query(
        `SELECT id, asset_tag AS identifier, name AS title, status::text AS status
         FROM assets
         WHERE asset_tag ILIKE $1 OR name ILIKE $1
         ORDER BY updated_at DESC
         LIMIT $2`,
        [like, capped],
      );
      rows = r.rows;
      break;
    }
    default:
      return [];
  }

  return rows.map((row) => ({
    id: row.id,
    entity_type: entityType,
    identifier: row.identifier,
    title: row.title,
    status: row.status,
    path: ENTITY_PATH[entityType](row.id),
  }));
}
