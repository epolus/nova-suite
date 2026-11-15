/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Admin: Notification rules, webhooks, email deliveries ───

import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../../data/db';
import { AppError } from '../../middleware/errorHandler';
import { startNotificationDispatch } from '../../temporal/workflows';
import { assertPublicHttpUrl, postChatWebhook, UnsafeHttpUrlError } from '@nova-suite/shared/node';

const router = Router();

// ════════════════════════════════════════════
// NOTIFICATION RULES
// ════════════════════════════════════════════

type NotificationRuleChannel = 'in_app' | 'email' | 'slack' | 'teams';
type NotificationWebhookChannel = 'slack' | 'teams';
type NotificationRuleTemplateInput = {
  locale: string;
  title_template: string;
  body_template: string | null;
  body_html_template: string | null;
};

function normalizeNotificationChannels(raw: unknown): NotificationRuleChannel[] {
  if (raw === undefined || raw === null) return ['in_app'];
  if (!Array.isArray(raw)) throw new AppError(400, 'channels must be an array');
  const allowed = new Set<NotificationRuleChannel>(['in_app', 'email', 'slack', 'teams']);
  const channels = Array.from(new Set(raw.map((v) => String(v).trim())))
    .filter((v): v is NotificationRuleChannel => allowed.has(v as NotificationRuleChannel));
  if (channels.length === 0) throw new AppError(400, 'at least one valid channel is required');
  return channels;
}

function normalizeWebhookChannel(raw: unknown): NotificationWebhookChannel {
  const value = String(raw || '').trim().toLowerCase();
  if (value !== 'slack' && value !== 'teams') {
    throw new AppError(400, 'channel must be slack or teams');
  }
  return value;
}

function blankToNull(raw: unknown): string | null {
  if (raw == null) return null;
  const value = String(raw).trim();
  return value || null;
}

const WEBHOOK_PUBLIC_COLUMNS = `id, channel, name, webhook_url, reply_channel_id,
  (api_token IS NOT NULL) AS has_api_token,
  (signing_secret IS NOT NULL) AS has_signing_secret,
  is_active, created_at, updated_at`;

function normalizeNotificationTemplates(raw: unknown, legacyTitle?: unknown, legacyBody?: unknown): NotificationRuleTemplateInput[] {
  if (!Array.isArray(raw)) {
    const fallbackTitle = String(legacyTitle || '').trim();
    if (!fallbackTitle) throw new AppError(400, 'title_template is required');
    const fallbackBody = legacyBody == null ? null : String(legacyBody);
    return [{
      locale: 'en',
      title_template: fallbackTitle,
      body_template: fallbackBody,
      body_html_template: null,
    }];
  }

  const seen = new Set<string>();
  const templates: NotificationRuleTemplateInput[] = [];
  for (const entry of raw as Array<Record<string, unknown>>) {
    const locale = String(entry.locale || '').trim().toLowerCase();
    const titleTemplate = String(entry.title_template || '').trim();
    if (!locale) throw new AppError(400, 'template locale is required');
    if (!/^[a-z]{2}(?:-[a-z]{2})?$/.test(locale)) {
      throw new AppError(400, `unsupported locale format "${locale}"`);
    }
    if (!titleTemplate) throw new AppError(400, `title_template is required for locale "${locale}"`);
    if (seen.has(locale)) throw new AppError(400, `duplicate locale "${locale}" in templates`);
    seen.add(locale);
    templates.push({
      locale,
      title_template: titleTemplate,
      body_template: entry.body_template == null ? null : String(entry.body_template),
      body_html_template: entry.body_html_template == null ? null : String(entry.body_html_template),
    });
  }
  if (templates.length === 0) throw new AppError(400, 'at least one template locale is required');
  return templates;
}

function ensureEmailTemplateBodies(templates: NotificationRuleTemplateInput[]) {
  for (const template of templates) {
    if (!template.body_template || !template.body_template.trim()) {
      throw new AppError(400, `body_template is required for email template locale "${template.locale}"`);
    }
  }
}

async function loadNotificationRuleTemplates(tenantId: string, ruleId: string): Promise<NotificationRuleTemplateInput[]> {
  const rows = await db.getMany<NotificationRuleTemplateInput>(
    `SELECT locale, title_template, body_template, body_html_template
     FROM notification_rule_templates
     WHERE tenant_id = $1 AND notification_rule_id = $2
     ORDER BY locale`,
    [tenantId, ruleId],
  );
  return rows;
}

async function upsertNotificationRuleTemplates(
  tenantId: string,
  ruleId: string,
  templates: NotificationRuleTemplateInput[],
): Promise<void> {
  await db.query(
    `DELETE FROM notification_rule_templates
     WHERE tenant_id = $1 AND notification_rule_id = $2`,
    [tenantId, ruleId],
  );
  for (const template of templates) {
    await db.query(
      `INSERT INTO notification_rule_templates (
        tenant_id, notification_rule_id, locale, title_template, body_template, body_html_template
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        tenantId,
        ruleId,
        template.locale,
        template.title_template,
        template.body_template,
        template.body_html_template,
      ],
    );
  }
}

router.get('/notification-rules', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const rows = await db.getMany(
      `SELECT nr.*,
              u.display_name AS recipient_user_name,
              ag.name AS recipient_group_name,
              COALESCE(
                (
                  SELECT json_agg(
                    json_build_object(
                      'locale', nrt.locale,
                      'title_template', nrt.title_template,
                      'body_template', nrt.body_template,
                      'body_html_template', nrt.body_html_template
                    )
                    ORDER BY nrt.locale
                  )
                  FROM notification_rule_templates nrt
                  WHERE nrt.tenant_id = nr.tenant_id
                    AND nrt.notification_rule_id = nr.id
                ),
                '[]'::json
              ) AS templates
       FROM notification_rules nr
       LEFT JOIN users u ON u.id = nr.recipient_user_id
       LEFT JOIN assignment_groups ag ON ag.id = nr.recipient_group_id
       WHERE nr.tenant_id = $1
       ORDER BY nr.sort_order, nr.name`,
      [tenantId],
    );
    res.json({ notification_rules: rows });
  } catch (err) { next(err); }
});

router.post('/notification-rules', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const {
      name, description, entity_type, trigger_key, recipient_type,
      recipient_user_id, recipient_group_id, title_template, body_template, sort_order, channels, templates,
    } = req.body;

    if (!name) throw new AppError(400, 'name is required');
    if (!trigger_key) throw new AppError(400, 'trigger_key is required');
    if (!recipient_type) throw new AppError(400, 'recipient_type is required');

    if (recipient_type === 'specific_user' && !recipient_user_id) {
      throw new AppError(400, 'recipient_user_id is required for specific_user');
    }
    if (recipient_type === 'assignment_group_members' && !recipient_group_id) {
      throw new AppError(400, 'recipient_group_id is required for assignment_group_members');
    }

    const normalizedChannels = normalizeNotificationChannels(channels);
    const normalizedTemplates = normalizeNotificationTemplates(templates, title_template, body_template);
    if (normalizedChannels.includes('email')) ensureEmailTemplateBodies(normalizedTemplates);
    const defaultTemplate = normalizedTemplates.find((template) => template.locale === 'en') || normalizedTemplates[0];

    const row = await db.getOne<{ id: string }>(
      `INSERT INTO notification_rules (
        tenant_id, name, description, entity_type, trigger_key, recipient_type,
        recipient_user_id, recipient_group_id, channels, title_template, body_template, sort_order
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9::text[], $10, $11, $12
      ) RETURNING id`,
      [
        tenantId,
        name,
        description || null,
        entity_type || 'incident',
        trigger_key,
        recipient_type,
        recipient_user_id || null,
        recipient_group_id || null,
        normalizedChannels,
        defaultTemplate.title_template,
        defaultTemplate.body_template,
        sort_order ?? 100,
      ],
    );
    await upsertNotificationRuleTemplates(tenantId, row!.id, normalizedTemplates);
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.patch('/notification-rules/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const ruleId = String(req.params.id);
    const {
      name, description, entity_type, trigger_key, recipient_type,
      recipient_user_id, recipient_group_id, title_template, body_template,
      is_active, sort_order, channels, templates,
    } = req.body;

    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;

    if (name !== undefined) { sets.push(`name = $${i++}`); vals.push(name); }
    if (description !== undefined) { sets.push(`description = $${i++}`); vals.push(description || null); }
    if (entity_type !== undefined) { sets.push(`entity_type = $${i++}`); vals.push(entity_type); }
    if (trigger_key !== undefined) { sets.push(`trigger_key = $${i++}`); vals.push(trigger_key); }
    if (recipient_type !== undefined) { sets.push(`recipient_type = $${i++}`); vals.push(recipient_type); }
    if (recipient_user_id !== undefined) { sets.push(`recipient_user_id = $${i++}`); vals.push(recipient_user_id || null); }
    if (recipient_group_id !== undefined) { sets.push(`recipient_group_id = $${i++}`); vals.push(recipient_group_id || null); }
    if (channels !== undefined) {
      const normalizedChannels = normalizeNotificationChannels(channels);
      sets.push(`channels = $${i++}::text[]`);
      vals.push(normalizedChannels);
    }
    if (is_active !== undefined) { sets.push(`is_active = $${i++}`); vals.push(is_active); }
    if (sort_order !== undefined) { sets.push(`sort_order = $${i++}`); vals.push(sort_order); }

    let normalizedTemplates: NotificationRuleTemplateInput[] | null = null;
    if (templates !== undefined || title_template !== undefined || body_template !== undefined) {
      normalizedTemplates = normalizeNotificationTemplates(
        templates,
        title_template,
        body_template,
      );
      const defaultTemplate = normalizedTemplates.find((template) => template.locale === 'en') || normalizedTemplates[0];
      sets.push(`title_template = $${i++}`);
      vals.push(defaultTemplate.title_template);
      sets.push(`body_template = $${i++}`);
      vals.push(defaultTemplate.body_template);
    }

    if (sets.length === 0 && !normalizedTemplates) { res.json({ success: true }); return; }

    vals.push(ruleId, tenantId);
    const result = await db.query(
      `UPDATE notification_rules
       SET ${sets.join(', ')}
       WHERE id = $${i++} AND tenant_id = $${i}`,
      vals,
    );
    if (result.rowCount === 0) throw new AppError(404, 'Notification rule not found');

    if (normalizedTemplates) {
      await upsertNotificationRuleTemplates(tenantId, ruleId, normalizedTemplates);
    }

    const activeChannels = channels !== undefined
      ? normalizeNotificationChannels(channels)
      : (
        await db.getOne<{ channels: NotificationRuleChannel[] }>(
          'SELECT channels FROM notification_rules WHERE id = $1 AND tenant_id = $2',
          [ruleId, tenantId],
        )
      )?.channels || ['in_app'];

    if (activeChannels.includes('email')) {
      const effectiveTemplates = normalizedTemplates || await loadNotificationRuleTemplates(tenantId, ruleId);
      if (effectiveTemplates.length === 0) {
        throw new AppError(400, 'at least one locale template is required when email channel is enabled');
      }
      ensureEmailTemplateBodies(effectiveTemplates);
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});

router.delete('/notification-rules/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    await db.query(
      'DELETE FROM notification_rules WHERE id = $1 AND tenant_id = $2',
      [req.params.id, tenantId],
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/notification-rules/:id/test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const rule = await db.getOne<{
      id: string;
      entity_type: 'incident' | 'request' | 'change' | 'problem' | 'knowledge' | 'major_incident' | 'alert';
      trigger_key: string;
    }>(
      `SELECT id, entity_type, trigger_key
       FROM notification_rules
       WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, tenantId],
    );
    if (!rule) throw new AppError(404, 'Notification rule not found');

    let entityId = String(req.body?.entity_id || '').trim();
    if (!entityId) {
      const latestEntityByType: Record<string, string> = {
        incident: 'SELECT id FROM incidents WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1',
        request: 'SELECT id FROM requests WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1',
        change: 'SELECT id FROM changes WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1',
        problem: 'SELECT id FROM problems WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1',
        knowledge: 'SELECT id FROM knowledge_articles WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1',
        major_incident: 'SELECT id FROM major_incidents WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1',
        alert: 'SELECT id FROM alerts WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1',
      };
      const entityQuery = latestEntityByType[rule.entity_type];
      if (!entityQuery) throw new AppError(400, 'Unsupported entity type for test');
      const latest = await db.getOne<{ id: string }>(entityQuery, [tenantId]);
      if (!latest?.id) {
        throw new AppError(400, `No ${rule.entity_type} records available to test this rule`);
      }
      entityId = latest.id;
    }

    const workflowId = await startNotificationDispatch({
      tenantId,
      entityType: rule.entity_type,
      triggerKey: rule.trigger_key,
      entityId,
      actorUserId: req.user!.id,
    });

    res.json({ success: true, workflow_id: workflowId, entity_id: entityId });
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════
// NOTIFICATION WEBHOOKS (Slack / Teams)
// ════════════════════════════════════════════

router.get('/notification-webhooks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const rows = await db.getMany(
      `SELECT ${WEBHOOK_PUBLIC_COLUMNS}
       FROM tenant_notification_webhooks
       WHERE tenant_id = $1
       ORDER BY channel, name`,
      [tenantId],
    );
    res.json({ notification_webhooks: rows });
  } catch (err) { next(err); }
});

router.post('/notification-webhooks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const channel = normalizeWebhookChannel(req.body?.channel);
    const name = String(req.body?.name || '').trim();
    const webhookUrl = String(req.body?.webhook_url || '').trim();
    if (!name) throw new AppError(400, 'name is required');
    if (!webhookUrl) throw new AppError(400, 'webhook_url is required');
    try {
      await assertPublicHttpUrl(webhookUrl);
    } catch (err) {
      if (err instanceof UnsafeHttpUrlError) throw new AppError(400, err.message);
      throw err;
    }

    const slack = channel === 'slack';
    const row = await db.getOne(
      `INSERT INTO tenant_notification_webhooks (
        tenant_id, channel, name, webhook_url, reply_channel_id, api_token, signing_secret, is_active
      ) VALUES ($1, $2::notification_webhook_channel, $3, $4, $5, $6, $7, $8)
      RETURNING ${WEBHOOK_PUBLIC_COLUMNS}`,
      [
        tenantId,
        channel,
        name,
        webhookUrl,
        slack ? blankToNull(req.body?.reply_channel_id) : null,
        slack ? blankToNull(req.body?.api_token) : null,
        slack ? blankToNull(req.body?.signing_secret) : null,
        req.body?.is_active !== false,
      ],
    );
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.patch('/notification-webhooks/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const webhookId = String(req.params.id);
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;

    const nextChannel = req.body?.channel !== undefined
      ? normalizeWebhookChannel(req.body.channel)
      : undefined;
    if (nextChannel !== undefined) {
      sets.push(`channel = $${i++}::notification_webhook_channel`);
      vals.push(nextChannel);
    }
    if (req.body?.name !== undefined) {
      const name = String(req.body.name || '').trim();
      if (!name) throw new AppError(400, 'name is required');
      sets.push(`name = $${i++}`);
      vals.push(name);
    }
    if (req.body?.webhook_url !== undefined) {
      const webhookUrl = String(req.body.webhook_url || '').trim();
      if (!webhookUrl) throw new AppError(400, 'webhook_url is required');
      try {
        await assertPublicHttpUrl(webhookUrl);
      } catch (err) {
        if (err instanceof UnsafeHttpUrlError) throw new AppError(400, err.message);
        throw err;
      }
      sets.push(`webhook_url = $${i++}`);
      vals.push(webhookUrl);
    }
    if (req.body?.is_active !== undefined) {
      sets.push(`is_active = $${i++}`);
      vals.push(Boolean(req.body.is_active));
    }
    if (nextChannel === 'teams') {
      sets.push('reply_channel_id = NULL', 'api_token = NULL', 'signing_secret = NULL');
    } else {
      if (req.body?.reply_channel_id !== undefined) {
        sets.push(`reply_channel_id = $${i++}`);
        vals.push(blankToNull(req.body.reply_channel_id));
      }
      if (req.body?.api_token !== undefined) {
        sets.push(`api_token = $${i++}`);
        vals.push(blankToNull(req.body.api_token));
      }
      if (req.body?.signing_secret !== undefined) {
        sets.push(`signing_secret = $${i++}`);
        vals.push(blankToNull(req.body.signing_secret));
      }
    }
    if (sets.length === 0) { res.json({ success: true }); return; }

    vals.push(webhookId, tenantId);
    const result = await db.query(
      `UPDATE tenant_notification_webhooks
       SET ${sets.join(', ')}
       WHERE id = $${i++} AND tenant_id = $${i}
       RETURNING id`,
      vals,
    );
    if (result.rowCount === 0) throw new AppError(404, 'Notification webhook not found');
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.delete('/notification-webhooks/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const result = await db.query(
      'DELETE FROM tenant_notification_webhooks WHERE id = $1 AND tenant_id = $2',
      [req.params.id, tenantId],
    );
    if (result.rowCount === 0) throw new AppError(404, 'Notification webhook not found');
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/notification-webhooks/:id/test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const webhook = await db.getOne<{
      id: string;
      channel: NotificationWebhookChannel;
      webhook_url: string;
      name: string;
      api_token: string | null;
      reply_channel_id: string | null;
    }>(
      `SELECT id, channel, webhook_url, name, api_token, reply_channel_id
       FROM tenant_notification_webhooks
       WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, tenantId],
    );
    if (!webhook) throw new AppError(404, 'Notification webhook not found');

    const result = await postChatWebhook({
      channel: webhook.channel,
      webhookUrl: webhook.webhook_url,
      apiToken: webhook.api_token,
      replyChannelId: webhook.reply_channel_id,
    }, {
      title: 'Nova Suite connection test',
      text: `Test message from webhook "${webhook.name}".`,
    });
    if (!result.ok) {
      throw new AppError(502, result.error || 'Webhook test failed');
    }
    res.json({ success: true, status: result.status });
  } catch (err) { next(err); }
});

router.get('/notification-email-deliveries', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const status = String(req.query.status || '').trim();
    const triggerKey = String(req.query.trigger_key || '').trim();
    const recipient = String(req.query.recipient || '').trim();
    const limitRaw = Number.parseInt(String(req.query.limit || '100'), 10);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 500)) : 100;

    const filters: string[] = ['ned.tenant_id = $1'];
    const vals: unknown[] = [tenantId];
    let i = 2;

    if (status) {
      filters.push(`ned.status = $${i++}`);
      vals.push(status);
    }
    if (triggerKey) {
      filters.push(`ned.trigger_key = $${i++}`);
      vals.push(triggerKey);
    }
    if (recipient) {
      filters.push(`LOWER(ned.recipient_email) LIKE $${i++}`);
      vals.push(`%${recipient.toLowerCase()}%`);
    }

    const filterWhereClause = filters.join(' AND ');
    const filterValues = [...vals];

    vals.push(limit);
    const rows = await db.getMany(
      `SELECT
         ned.id,
         ned.notification_rule_id,
         nr.name AS notification_rule_name,
         ned.recipient_user_id,
         u.display_name AS recipient_user_name,
         ned.recipient_email,
         ned.recipient_locale,
         ned.entity_type,
         ned.entity_id,
         ned.trigger_key,
         ned.template_locale,
         ned.subject,
         ned.body_text,
         ned.body_html,
         ned.status,
         ned.provider,
         ned.provider_message_id,
         ned.retry_count,
         ned.last_error,
         ned.sent_at,
         ned.created_at,
         ned.updated_at
       FROM notification_email_deliveries ned
       LEFT JOIN notification_rules nr ON nr.id = ned.notification_rule_id
       LEFT JOIN users u ON u.id = ned.recipient_user_id
       WHERE ${filterWhereClause}
       ORDER BY ned.created_at DESC
       LIMIT $${i}`,
      vals,
    );

    const summary = await db.getMany<{ status: string; count: number }>(
      `SELECT status, count(*)::int AS count
       FROM notification_email_deliveries ned
       WHERE ${filterWhereClause}
       GROUP BY status
       ORDER BY status`,
      filterValues,
    );

    res.json({ deliveries: rows, summary });
  } catch (err) { next(err); }
});

export default router;
