/* SPDX-License-Identifier: AGPL-3.0-only */
import { db } from '../data/db';
import { logger } from '../logger';

export type AuditLevel = 'info' | 'warning' | 'critical';

export async function recordAuditEvent(input: {
  tenantId: string;
  actorUserId?: string | null;
  action: string;
  category: string;
  level?: AuditLevel;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.query(
      `INSERT INTO audit_events (
         tenant_id, actor_user_id, action, category, level, entity_type, entity_id, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        input.tenantId,
        input.actorUserId || null,
        input.action,
        input.category,
        input.level || 'info',
        input.entityType || null,
        input.entityId || null,
        JSON.stringify(input.metadata || {}),
      ],
    );
  } catch (err) {
    logger.warn({ err, action: input.action, category: input.category }, 'Failed to persist audit event');
  }
}
