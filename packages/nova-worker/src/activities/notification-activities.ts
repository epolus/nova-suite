/* SPDX-License-Identifier: AGPL-3.0-only */
import { log } from '@temporalio/activity';
import { withTenantContext } from '../db';

export interface NotificationDispatchInput {
  tenantId: string;
  entityType: 'incident' | 'request' | 'change' | 'problem' | 'knowledge';
  triggerKey: string;
  entityId: string;
  actorUserId?: string | null;
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_m, key: string) => vars[key] ?? '');
}

export async function dispatchConfiguredNotifications(input: NotificationDispatchInput): Promise<number> {
  return withTenantContext(input.tenantId, async (client) => {
    let entity: Record<string, string | null> | null = null;
    if (input.entityType === 'incident') {
      const r = await client.query(
        `SELECT i.id, i.number, i.title, i.caller_id, i.assigned_to, i.assignment_group_id, ag.manager_id AS assignment_group_manager_id
         FROM incidents i
         LEFT JOIN assignment_groups ag ON ag.id = i.assignment_group_id
         WHERE i.id = $1::uuid`,
        [input.entityId],
      );
      entity = (r.rows[0] as Record<string, string | null>) || null;
    } else if (input.entityType === 'request') {
      const r = await client.query(
        `SELECT r.id, r.number, si.name AS title, r.requester_id, r.requested_for
         FROM requests r
         JOIN service_items si ON si.id = r.service_item_id
         WHERE r.id = $1::uuid`,
        [input.entityId],
      );
      entity = (r.rows[0] as Record<string, string | null>) || null;
    } else if (input.entityType === 'change') {
      const r = await client.query(
        `SELECT c.id, c.number, c.title, c.requested_by, c.assigned_to, c.assignment_group_id, ag.manager_id AS assignment_group_manager_id
         FROM changes c
         LEFT JOIN assignment_groups ag ON ag.id = c.assignment_group_id
         WHERE c.id = $1::uuid`,
        [input.entityId],
      );
      entity = (r.rows[0] as Record<string, string | null>) || null;
    } else if (input.entityType === 'problem') {
      const r = await client.query(
        `SELECT p.id, p.number, p.title, p.reported_by, p.assigned_to, p.assignment_group_id, ag.manager_id AS assignment_group_manager_id
         FROM problems p
         LEFT JOIN assignment_groups ag ON ag.id = p.assignment_group_id
         WHERE p.id = $1::uuid`,
        [input.entityId],
      );
      entity = (r.rows[0] as Record<string, string | null>) || null;
    } else if (input.entityType === 'knowledge') {
      const r = await client.query(
        `SELECT a.id, a.number, a.title, a.author_id, a.assignment_group_id, ag.manager_id AS assignment_group_manager_id
         FROM knowledge_articles a
         LEFT JOIN assignment_groups ag ON ag.id = a.assignment_group_id
         WHERE a.id = $1::uuid`,
        [input.entityId],
      );
      entity = (r.rows[0] as Record<string, string | null>) || null;
    }
    if (!entity) return 0;

    const rulesRes = await client.query(
      `SELECT id, recipient_type, recipient_user_id, recipient_group_id, title_template, body_template
       FROM notification_rules
       WHERE tenant_id = current_tenant_id()
         AND entity_type = $1
         AND trigger_key = $2
         AND is_active = true
       ORDER BY sort_order, created_at`,
      [input.entityType, input.triggerKey],
    );

    const vars = {
      entity_number: String(entity.number || ''),
      entity_title: String(entity.title || ''),
      incident_number: String(entity.number || ''),
      incident_title: String(entity.title || ''),
      request_number: String(entity.number || ''),
      request_title: String(entity.title || ''),
      change_number: String(entity.number || ''),
      change_title: String(entity.title || ''),
      problem_number: String(entity.number || ''),
      problem_title: String(entity.title || ''),
      knowledge_number: String(entity.number || ''),
      knowledge_title: String(entity.title || ''),
    };

    let inserted = 0;
    for (const rule of rulesRes.rows as Array<Record<string, string | null>>) {
      const recipients = new Set<string>();
      const recipientType = String(rule.recipient_type || '');

      if (recipientType === 'caller' && entity.caller_id) recipients.add(entity.caller_id);
      if (recipientType === 'assignee' && entity.assigned_to) recipients.add(entity.assigned_to);
      if (recipientType === 'requester' && entity.requester_id) recipients.add(entity.requester_id);
      if (recipientType === 'requested_for' && entity.requested_for) recipients.add(entity.requested_for);
      if (recipientType === 'requested_by' && entity.requested_by) recipients.add(entity.requested_by);
      if (recipientType === 'reported_by' && entity.reported_by) recipients.add(entity.reported_by);
      if (recipientType === 'author' && entity.author_id) recipients.add(entity.author_id);
      if (recipientType === 'assignment_group_manager' && entity.assignment_group_manager_id) recipients.add(entity.assignment_group_manager_id);
      if (recipientType === 'specific_user' && rule.recipient_user_id) recipients.add(rule.recipient_user_id);
      if (recipientType === 'assignment_group_members') {
        const groupId = rule.recipient_group_id || entity.assignment_group_id;
        if (groupId) {
          const membersRes = await client.query(
            `SELECT user_id
             FROM assignment_group_members
             WHERE tenant_id = current_tenant_id()
               AND group_id = $1::uuid`,
            [groupId],
          );
          for (const m of membersRes.rows as Array<{ user_id: string }>) recipients.add(m.user_id);
        }
      }

      if (input.actorUserId) recipients.delete(input.actorUserId);
      if (recipients.size === 0) continue;

      const title = renderTemplate(String(rule.title_template || ''), vars).trim();
      const bodyTpl = String(rule.body_template || '');
      const body = bodyTpl ? renderTemplate(bodyTpl, vars) : null;

      for (const userId of recipients) {
        await client.query(
          `INSERT INTO notifications (tenant_id, user_id, type, title, body, entity_type, entity_id)
           VALUES (current_tenant_id(), $1::uuid, 'workflow', $2, $3, $4, $5::uuid)`,
          [userId, title || `${input.entityType} ${vars.entity_number} update`, body, input.entityType, input.entityId],
        );
        inserted += 1;
      }
    }

    log.info('Dispatched configured notifications', {
      triggerKey: input.triggerKey,
      incidentId: input.entityId,
      inserted,
    });
    return inserted;
  });
}
