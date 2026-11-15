/* SPDX-License-Identifier: AGPL-3.0-only */
// Object-level authorization for attachments: a user may only touch files of a
// record they can see. Visibility comes from the parent table's RLS policy,
// evaluated on the request-scoped client.

import type { Request } from 'express';
import type { PoolClient } from 'pg';
import { BadRequest, Forbidden, NotFound } from '../../middleware/errorHandler';
import { hasChangeRole, hasKnowledgeRole, hasProblemRole, isAdminRole, isFulfillerRole } from '../roles';

export type AttachmentAccessMode = 'read' | 'write';

// Parents whose RLS policy already restricts rows per user (caller, requester, assignee, staff roles).
const ROW_SCOPED_PARENTS: Record<string, string> = {
  incident: 'incidents',
  request: 'requests',
  problem: 'problems',
  change: 'changes',
};

export const ATTACHMENT_ENTITY_TYPES: readonly string[] = [...Object.keys(ROW_SCOPED_PARENTS), 'knowledge_article'];

type Queryable = Pick<PoolClient, 'query'>;

export async function assertAttachmentAccess(
  client: Queryable,
  req: Request,
  entityType: string,
  entityId: string,
  mode: AttachmentAccessMode,
): Promise<void> {
  const table = ROW_SCOPED_PARENTS[entityType];
  if (table) {
    const visible = await client.query(`SELECT 1 FROM ${table} WHERE id = $1`, [entityId]);
    if (visible.rowCount === 0) throw NotFound('Record not found');
    return;
  }

  if (entityType === 'knowledge_article') {
    const article = await client.query<{ status: string }>(
      'SELECT status FROM knowledge_articles WHERE id = $1',
      [entityId],
    );
    const status = article.rows[0]?.status;
    if (!status) throw NotFound('Record not found');
    if (hasKnowledgeRole(req)) return;
    if (mode === 'read' && status === 'published') return;
    throw NotFound('Record not found');
  }

  if (mode === 'write') throw BadRequest(`Attachments are not supported for entity_type "${entityType}"`);
  if (!isAdminRole(req)) throw Forbidden();
}

/** Deleting also requires being the uploader or staff for that kind of record. */
export function canDeleteAttachment(req: Request, entityType: string, uploadedBy: string): boolean {
  if (uploadedBy === req.user?.id) return true;
  switch (entityType) {
    case 'knowledge_article': return hasKnowledgeRole(req);
    case 'problem': return hasProblemRole(req);
    case 'change': return hasChangeRole(req);
    default: return isFulfillerRole(req);
  }
}
