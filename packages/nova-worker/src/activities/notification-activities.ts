/* SPDX-License-Identifier: AGPL-3.0-only */
import { log } from '@temporalio/activity';
import { withTenantContext } from '../db';
import { getEmailProvider } from './email-provider';

export interface NotificationDispatchInput {
  tenantId: string;
  entityType: 'incident' | 'request' | 'change' | 'problem' | 'knowledge' | 'major_incident';
  triggerKey: string;
  entityId: string;
  actorUserId?: string | null;
}

type NotificationRuleChannel = 'in_app' | 'email';
type NotificationRuleTemplate = {
  locale: string;
  title_template: string;
  body_template: string | null;
  body_html_template: string | null;
};

type NotificationRuleRow = {
  id: string;
  recipient_type: string;
  recipient_user_id: string | null;
  recipient_group_id: string | null;
  channels: NotificationRuleChannel[] | null;
  title_template: string | null;
  body_template: string | null;
};

type RecipientRow = {
  id: string;
  email: string;
  preferred_language: string | null;
  locale_preference: string | null;
};

const SUPPORTED_LOCALES = new Set(['en', 'de', 'de-ch', 'fr', 'it']);
const EMAIL_IDEMPOTENCY_WINDOW_MINUTES = 15;

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_m, key: string) => vars[key] ?? '');
}

function normalizeLocale(raw: string | null | undefined): string {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return '';
  if (SUPPORTED_LOCALES.has(value)) return value;
  const base = value.split('-')[0] || '';
  if (SUPPORTED_LOCALES.has(base)) return base;
  return '';
}

function resolveRecipientLocale(
  recipient: Pick<RecipientRow, 'locale_preference' | 'preferred_language'>,
  tenantDefaultLocale: string,
): string {
  return (
    normalizeLocale(recipient.locale_preference)
    || normalizeLocale(recipient.preferred_language)
    || normalizeLocale(tenantDefaultLocale)
    || 'en'
  );
}

function resolveTemplateForLocale(
  templates: NotificationRuleTemplate[],
  requestedLocale: string,
): { locale: string; template: NotificationRuleTemplate } {
  if (templates.length === 0) {
    return {
      locale: 'en',
      template: {
        locale: 'en',
        title_template: '',
        body_template: null,
        body_html_template: null,
      },
    };
  }

  const normalizedRequested = normalizeLocale(requestedLocale);
  const byLocale = new Map(templates.map((template) => [normalizeLocale(template.locale), template]));
  const exact = normalizedRequested ? byLocale.get(normalizedRequested) : undefined;
  if (exact) return { locale: normalizedRequested, template: exact };
  const base = normalizedRequested.split('-')[0] || '';
  if (base && byLocale.has(base)) {
    return { locale: base, template: byLocale.get(base)! };
  }
  const english = byLocale.get('en');
  if (english) return { locale: 'en', template: english };
  const first = templates[0]!;
  return { locale: normalizeLocale(first.locale) || 'en', template: first };
}

function toPlainTextFromHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function dispatchConfiguredNotifications(input: NotificationDispatchInput): Promise<number> {
  return withTenantContext(input.tenantId, async (client) => {
    const emailProvider = getEmailProvider();

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
    } else if (input.entityType === 'major_incident') {
      const r = await client.query(
        `SELECT id::text AS id, title, created_by
         FROM major_incidents
         WHERE id = $1::uuid`,
        [input.entityId],
      );
      entity = (r.rows[0] as Record<string, string | null>) || null;
    }
    if (!entity) {
      log.warn('Notification dispatch skipped: entity not found', {
        entityType: input.entityType,
        entityId: input.entityId,
        triggerKey: input.triggerKey,
      });
      return 0;
    }

    const tenantLocaleRes = await client.query<{ value: string }>(
      `SELECT value
       FROM tenant_settings
       WHERE tenant_id = current_tenant_id()
         AND key = 'default_locale'
       LIMIT 1`,
    );
    const tenantDefaultLocale = tenantLocaleRes.rows[0]?.value || 'en';

    const rulesRes = await client.query(
      `SELECT id, recipient_type, recipient_user_id, recipient_group_id, channels, title_template, body_template
       FROM notification_rules
       WHERE tenant_id = current_tenant_id()
         AND entity_type = $1
         AND trigger_key = $2
         AND is_active = true
       ORDER BY sort_order, created_at`,
      [input.entityType, input.triggerKey],
    );
    const rules = rulesRes.rows as NotificationRuleRow[];
    if (rules.length === 0) {
      log.warn('Notification dispatch: no active rules for trigger', {
        entityType: input.entityType,
        entityId: input.entityId,
        triggerKey: input.triggerKey,
      });
      return 0;
    }

    const ruleIds = rules.map((rule) => rule.id);
    const templateRes = await client.query<{
      notification_rule_id: string;
      locale: string;
      title_template: string;
      body_template: string | null;
      body_html_template: string | null;
    }>(
      `SELECT notification_rule_id, locale, title_template, body_template, body_html_template
       FROM notification_rule_templates
       WHERE tenant_id = current_tenant_id()
         AND notification_rule_id = ANY($1::uuid[])`,
      [ruleIds],
    );
    const templatesByRule = new Map<string, NotificationRuleTemplate[]>();
    for (const row of templateRes.rows) {
      const list = templatesByRule.get(row.notification_rule_id) || [];
      list.push({
        locale: row.locale,
        title_template: row.title_template,
        body_template: row.body_template,
        body_html_template: row.body_html_template,
      });
      templatesByRule.set(row.notification_rule_id, list);
    }

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
      major_incident_title: String(entity.title || ''),
    };

    let inserted = 0;
    let emailQueued = 0;
    let emailSent = 0;
    let emailFailed = 0;
    let emailSuppressedByIdempotency = 0;
    let localeFallbackCount = 0;
    for (const rule of rules) {
      const recipients = new Set<string>();
      const recipientType = String(rule.recipient_type);

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
      if (recipientType === 'role_major_incident_manager' || recipientType === 'role_fulfiller') {
        const roleName = recipientType === 'role_major_incident_manager' ? 'major_incident_manager' : 'fulfiller';
        const uidRes = await client.query<{ user_id: string }>(
          `SELECT DISTINCT uid AS user_id FROM (
             SELECT ur.user_id AS uid
             FROM user_roles ur
             JOIN roles r ON r.id = ur.role_id AND r.tenant_id = ur.tenant_id
             WHERE ur.tenant_id = current_tenant_id() AND r.name = $1
             UNION
             SELECT agm.user_id AS uid
             FROM assignment_group_members agm
             JOIN assignment_group_roles agr ON agr.group_id = agm.group_id AND agr.tenant_id = agm.tenant_id
             JOIN roles r ON r.id = agr.role_id AND r.tenant_id = agr.tenant_id
             WHERE agm.tenant_id = current_tenant_id() AND r.name = $1
           ) u`,
          [roleName],
        );
        for (const row of uidRes.rows) recipients.add(row.user_id);
      }

      if (input.actorUserId) recipients.delete(input.actorUserId);
      if (recipients.size === 0) continue;

      const recipientIds = Array.from(recipients);
      const recipientRes = await client.query<RecipientRow>(
        `SELECT u.id, u.email, u.preferred_language, up.value->>'value' AS locale_preference
         FROM users u
         LEFT JOIN user_preferences up
           ON up.tenant_id = current_tenant_id()
          AND up.user_id = u.id
          AND up.scope = 'ui:locale'
         WHERE u.tenant_id = current_tenant_id()
           AND u.id = ANY($1::uuid[])`,
        [recipientIds],
      );

      const channelSet = new Set<NotificationRuleChannel>((rule.channels || ['in_app']) as NotificationRuleChannel[]);
      const localizedTemplates = templatesByRule.get(rule.id) || [{
        locale: 'en',
        title_template: String(rule.title_template || ''),
        body_template: rule.body_template,
        body_html_template: null,
      }];

      for (const recipient of recipientRes.rows) {
        const recipientLocale = resolveRecipientLocale(recipient, tenantDefaultLocale);
        const resolved = resolveTemplateForLocale(localizedTemplates, recipientLocale);
        if (resolved.locale !== normalizeLocale(recipientLocale)) localeFallbackCount += 1;
        const subject = renderTemplate(String(resolved.template.title_template || ''), vars).trim()
          || `${input.entityType} ${vars.entity_number} update`;
        const textBody = resolved.template.body_template
          ? renderTemplate(resolved.template.body_template, vars)
          : null;
        const htmlBody = resolved.template.body_html_template
          ? renderTemplate(resolved.template.body_html_template, vars)
          : null;

        if (channelSet.has('in_app')) {
          await client.query(
            `INSERT INTO notifications (tenant_id, user_id, type, title, body, entity_type, entity_id)
             VALUES (current_tenant_id(), $1::uuid, 'workflow', $2, $3, $4, $5::uuid)`,
            [recipient.id, subject, textBody, input.entityType, input.entityId],
          );
          inserted += 1;
        }

        if (channelSet.has('email')) {
          const dedupeRes = await client.query<{ count: string }>(
            `SELECT count(*)::text AS count
             FROM notification_email_deliveries
             WHERE tenant_id = current_tenant_id()
               AND notification_rule_id = $1::uuid
               AND recipient_user_id = $2::uuid
               AND entity_type = $3
               AND entity_id = $4::uuid
               AND trigger_key = $5
               AND status IN ('queued', 'sent')
               AND created_at > now() - make_interval(mins => $6::int)`,
            [rule.id, recipient.id, input.entityType, input.entityId, input.triggerKey, EMAIL_IDEMPOTENCY_WINDOW_MINUTES],
          );
          if (Number.parseInt(dedupeRes.rows[0]?.count || '0', 10) > 0) {
            emailSuppressedByIdempotency += 1;
            continue;
          }

          const deliveryInsertRes = await client.query<{ id: string }>(
            `INSERT INTO notification_email_deliveries (
              tenant_id, notification_rule_id, recipient_user_id, recipient_email, recipient_locale,
              entity_type, entity_id, trigger_key, template_locale,
              subject, body_text, body_html, status, provider
            ) VALUES (
              current_tenant_id(), $1::uuid, $2::uuid, $3, $4, $5, $6::uuid, $7, $8, $9, $10, $11, 'queued', 'smtp'
            )
            RETURNING id`,
            [
              rule.id,
              recipient.id,
              recipient.email,
              recipientLocale,
              input.entityType,
              input.entityId,
              input.triggerKey,
              resolved.locale,
              subject,
              textBody,
              htmlBody,
            ],
          );
          const deliveryId = deliveryInsertRes.rows[0]?.id;
          if (!deliveryId) continue;
          emailQueued += 1;

          const emailResult = await emailProvider.send({
            to: recipient.email,
            subject,
            text: textBody || (htmlBody ? toPlainTextFromHtml(htmlBody) : null),
            html: htmlBody,
          });

          if (emailResult.accepted) {
            await client.query(
              `UPDATE notification_email_deliveries
               SET status = 'sent', provider_message_id = $2, sent_at = now(), updated_at = now()
               WHERE id = $1::uuid`,
              [deliveryId, emailResult.providerMessageId],
            );
            emailSent += 1;
          } else {
            await client.query(
              `UPDATE notification_email_deliveries
               SET status = 'failed', retry_count = retry_count + 1, last_error = $2, updated_at = now()
               WHERE id = $1::uuid`,
              [deliveryId, emailResult.error || 'email send failed'],
            );
            emailFailed += 1;
          }
        }
      }
    }

    if (inserted === 0 && emailQueued === 0 && rules.length > 0) {
      log.warn('Notification dispatch: rules matched but no deliveries (recipients empty or actor-only)', {
        entityType: input.entityType,
        entityId: input.entityId,
        triggerKey: input.triggerKey,
        ruleCount: rules.length,
      });
    }

    log.info('Dispatched configured notifications', {
      triggerKey: input.triggerKey,
      entityType: input.entityType,
      entityId: input.entityId,
      inserted,
      emailQueued,
      emailSent,
      emailFailed,
      emailSuppressedByIdempotency,
      localeFallbackCount,
    });
    return inserted;
  });
}

export const __test__ = {
  normalizeLocale,
  resolveRecipientLocale,
  resolveTemplateForLocale,
  toPlainTextFromHtml,
  renderTemplate,
};
