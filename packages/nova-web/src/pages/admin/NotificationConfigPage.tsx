/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'use-intl';
import { admin as adminApi } from '../../api/client';
import type { AssignmentGroupItem, AdminUser, NotificationRule } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Spinner from '../../components/Spinner';
import NotificationForm from './notifications/NotificationForm';
import NotificationList from './notifications/NotificationList';
import {
  getTemplatesFromRule,
  type TemplateLocale,
  type NotificationRuleForm,
} from './notifications/constants';

export default function NotificationConfigPage() {
  const t = useTranslations('pages.admin.notificationConfig');

  const emptyForm = useMemo((): NotificationRuleForm => ({
    name: '',
    description: '',
    entity_type: 'incident',
    trigger_key: 'incident.assigned',
    recipient_type: 'assignee',
    recipient_user_id: null,
    recipient_group_id: null,
    channels: ['in_app'],
    templates: [
      {
        locale: 'en',
        title_template: t('defaultTitleTemplate'),
        body_template: t('defaultBodyTemplate'),
        body_html_template: null,
      },
    ],
    sort_order: 100,
  }), [t]);

  const [rules, setRules] = useState<NotificationRule[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [groups, setGroups] = useState<AssignmentGroupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<NotificationRuleForm>(emptyForm);
  const [activeTemplateLocale, setActiveTemplateLocale] = useState<TemplateLocale>('en');

  const load = async () => {
    const [rRes, uRes, gRes] = await Promise.all([
      adminApi.notificationRules(),
      adminApi.users(),
      adminApi.assignmentGroups(),
    ]);
    setRules(rRes.notification_rules);
    setUsers(uRes.users);
    setGroups(gRes.assignment_groups.filter((g) => g.is_active));
    setLoading(false);
  };

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, []);

  const isFormOpen = creating || editing !== null;

  const startCreate = () => {
    setCreating(true);
    setEditing(null);
    setForm({ ...emptyForm });
    setActiveTemplateLocale('en');
  };

  const startEdit = (rule: NotificationRule) => {
    setCreating(false);
    setEditing(rule.id);
    setForm({
      id: rule.id,
      name: rule.name,
      description: rule.description || '',
      entity_type: rule.entity_type,
      trigger_key: rule.trigger_key,
      recipient_type: rule.recipient_type,
      recipient_user_id: rule.recipient_user_id,
      recipient_group_id: rule.recipient_group_id,
      channels: rule.channels?.length ? rule.channels : ['in_app'],
      templates: getTemplatesFromRule(rule),
      sort_order: rule.sort_order,
    });
    setActiveTemplateLocale('en');
  };

  const cancelEdit = () => {
    setCreating(false);
    setEditing(null);
    setForm({ ...emptyForm });
    setActiveTemplateLocale('en');
  };

  const save = async () => {
    if (!form.name || !form.trigger_key || !form.recipient_type) return;
    if (form.templates.length === 0) return;
    if (form.templates.some((template) => !template.title_template.trim())) return;
    if (form.channels.includes('email') && form.templates.some((template) => !template.body_template?.trim())) return;
    setSaving(true);
    try {
      const payload: Partial<NotificationRule> = {
        name: form.name,
        description: form.description || null,
        entity_type: form.entity_type || 'incident',
        trigger_key: form.trigger_key,
        recipient_type: form.recipient_type,
        recipient_user_id: form.recipient_user_id || null,
        recipient_group_id: form.recipient_group_id || null,
        channels: form.channels,
        templates: form.templates.map((template) => ({
          locale: template.locale,
          title_template: template.title_template,
          body_template: template.body_template || null,
          body_html_template: template.body_html_template || null,
        })),
        title_template: form.templates[0]?.title_template || '',
        body_template: form.templates[0]?.body_template || null,
        sort_order: form.sort_order ?? 100,
      };
      if (creating) await adminApi.createNotificationRule(payload);
      if (editing) await adminApi.updateNotificationRule(editing, payload);
      await load();
      cancelEdit();
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (rule: NotificationRule) => {
    await adminApi.updateNotificationRule(rule.id, { is_active: !rule.is_active });
    await load();
  };

  const remove = async (rule: NotificationRule) => {
    if (!confirm(t('confirmDelete', { name: rule.name }))) return;
    await adminApi.deleteNotificationRule(rule.id);
    await load();
  };

  const testRule = async (rule: NotificationRule) => {
    const entityIdInput = prompt(t('testEntityIdPrompt', { entityType: rule.entity_type }));
    await adminApi.testNotificationRule(rule.id, { entity_id: entityIdInput || undefined });
    alert(t('testStarted'));
  };

  if (loading) return <Spinner />;

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        action={!isFormOpen ? (
          <button
            onClick={startCreate}
            className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            {t('newRule')}
          </button>
        ) : undefined}
      />

      {isFormOpen && (
        <NotificationForm
          form={form}
          setForm={setForm}
          creating={creating}
          saving={saving}
          users={users}
          groups={groups}
          activeTemplateLocale={activeTemplateLocale}
          setActiveTemplateLocale={setActiveTemplateLocale}
          onSave={save}
          onCancel={cancelEdit}
        />
      )}

      {!isFormOpen && (
        <NotificationList
          rules={rules}
          onTest={testRule}
          onEdit={startEdit}
          onToggleActive={toggleActive}
          onDelete={remove}
        />
      )}
    </>
  );
}
