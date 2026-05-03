/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useState } from 'react';
import { admin as adminApi } from '../../api/client';
import type { AssignmentGroupItem, AdminUser, NotificationRule, NotificationRuleTemplate } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';

const TRIGGERS = [
  { entity: 'incident', id: 'incident.created', label: 'Incident created' },
  { entity: 'incident', id: 'incident.assigned', label: 'Incident assigned' },
  { entity: 'incident', id: 'incident.resolved', label: 'Incident resolved' },
  { entity: 'incident', id: 'incident.commented', label: 'Incident commented' },
  { entity: 'request', id: 'request.created', label: 'Request created' },
  { entity: 'request', id: 'request.approved', label: 'Request approved' },
  { entity: 'request', id: 'request.rejected', label: 'Request rejected' },
  { entity: 'request', id: 'request.fulfilled', label: 'Request fulfilled' },
  { entity: 'request', id: 'request.cancelled', label: 'Request cancelled' },
  { entity: 'change', id: 'change.created', label: 'Change created' },
  { entity: 'change', id: 'change.pending_approval', label: 'Change pending approval' },
  { entity: 'change', id: 'change.approved', label: 'Change approved' },
  { entity: 'change', id: 'change.rejected', label: 'Change rejected' },
  { entity: 'change', id: 'change.scheduled', label: 'Change scheduled' },
  { entity: 'problem', id: 'problem.created', label: 'Problem created' },
  { entity: 'problem', id: 'problem.assigned', label: 'Problem assigned' },
  { entity: 'problem', id: 'problem.resolved', label: 'Problem resolved' },
  { entity: 'knowledge', id: 'knowledge.submitted_for_review', label: 'Knowledge submitted for review' },
  { entity: 'knowledge', id: 'knowledge.published', label: 'Knowledge published' },
  { entity: 'knowledge', id: 'knowledge.rejected', label: 'Knowledge rejected' },
];

const RECIPIENTS = [
  { id: 'caller', label: 'Caller' },
  { id: 'assignee', label: 'Assignee' },
  { id: 'requester', label: 'Requester' },
  { id: 'requested_for', label: 'Requested For' },
  { id: 'requested_by', label: 'Requested By' },
  { id: 'reported_by', label: 'Reported By' },
  { id: 'author', label: 'Author' },
  { id: 'assignment_group_manager', label: 'Assignment Group Manager' },
  { id: 'specific_user', label: 'Specific User' },
  { id: 'assignment_group_members', label: 'Assignment Group Members' },
];

const ENTITY_OPTIONS: NotificationRule['entity_type'][] = ['incident', 'request', 'change', 'problem', 'knowledge'];
const TEMPLATE_LOCALES = ['en', 'de', 'de-ch', 'fr', 'it'] as const;
type TemplateLocale = typeof TEMPLATE_LOCALES[number];

type NotificationRuleForm = {
  id?: string;
  name: string;
  description: string;
  entity_type: NotificationRule['entity_type'];
  trigger_key: string;
  recipient_type: NotificationRule['recipient_type'];
  recipient_user_id: string | null;
  recipient_group_id: string | null;
  channels: Array<'in_app' | 'email'>;
  templates: NotificationRuleTemplate[];
  sort_order: number;
};

const EMPTY_FORM: NotificationRuleForm = {
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
      title_template: 'Incident {incident_number} updated',
      body_template: '{incident_title}',
      body_html_template: null,
    },
  ],
  sort_order: 100,
};

function getTemplatesFromRule(rule: NotificationRule): NotificationRuleTemplate[] {
  if (Array.isArray(rule.templates) && rule.templates.length > 0) {
    return rule.templates.map((template) => ({
      locale: template.locale,
      title_template: template.title_template,
      body_template: template.body_template,
      body_html_template: template.body_html_template ?? null,
    }));
  }
  return [{
    locale: 'en',
    title_template: rule.title_template,
    body_template: rule.body_template,
    body_html_template: null,
  }];
}

export default function NotificationConfigPage() {
  const [rules, setRules] = useState<NotificationRule[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [groups, setGroups] = useState<AssignmentGroupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<NotificationRuleForm>(EMPTY_FORM);
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
    setForm({ ...EMPTY_FORM });
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
    setForm({ ...EMPTY_FORM });
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
    if (!confirm(`Delete notification rule "${rule.name}"?`)) return;
    await adminApi.deleteNotificationRule(rule.id);
    await load();
  };

  const testRule = async (rule: NotificationRule) => {
    const entityIdInput = prompt(`Optional: enter a ${rule.entity_type} ID for testing. Leave empty to use latest.`);
    await adminApi.testNotificationRule(rule.id, { entity_id: entityIdInput || undefined });
    alert('Test notification workflow started. Check the bell for dispatched notifications.');
  };

  const availableTriggers = TRIGGERS.filter((t) => t.entity === (form.entity_type || 'incident'));
  const activeTemplate = form.templates.find((template) => template.locale === activeTemplateLocale)
    || form.templates[0];
  const activeTemplateIndex = activeTemplate
    ? form.templates.findIndex((template) => template.locale === activeTemplate.locale)
    : -1;

  const toggleChannel = (channel: 'in_app' | 'email') => {
    const has = form.channels.includes(channel);
    const next = has ? form.channels.filter((c) => c !== channel) : [...form.channels, channel];
    setForm({ ...form, channels: next.length > 0 ? next : ['in_app'] });
  };

  const ensureLocaleTemplate = (locale: TemplateLocale) => {
    const existing = form.templates.find((template) => template.locale === locale);
    if (existing) return;
    setForm({
      ...form,
      templates: [
        ...form.templates,
        {
          locale,
          title_template: '',
          body_template: '',
          body_html_template: null,
        },
      ],
    });
  };

  if (loading) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Notification Workflow Configuration"
        description="Configure trigger-driven Temporal notification workflows and recipients."
        action={!isFormOpen ? (
          <button
            onClick={startCreate}
            className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            + New Notification Rule
          </button>
        ) : undefined}
      />

      {isFormOpen && (
        <Card className="mb-6">
          <h3 className="font-semibold text-gray-900 text-lg mb-4">{creating ? 'New Notification Rule' : 'Edit Notification Rule'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                value={form.name || ''}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Entity *</label>
              <select
                value={form.entity_type || 'incident'}
                onChange={(e) => {
                  const entity = e.target.value as NotificationRule['entity_type'];
                  const nextTrigger = TRIGGERS.find((t) => t.entity === entity)?.id || '';
                  setForm({ ...form, entity_type: entity, trigger_key: nextTrigger });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {ENTITY_OPTIONS.map((entity) => <option key={entity} value={entity}>{entity}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Trigger *</label>
              <select
                value={form.trigger_key || availableTriggers[0]?.id || ''}
                onChange={(e) => setForm({ ...form, trigger_key: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {availableTriggers.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input
                value={form.description || ''}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Recipient *</label>
              <select
                value={form.recipient_type || 'assignee'}
                onChange={(e) => setForm({ ...form, recipient_type: e.target.value as NotificationRule['recipient_type'] })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {RECIPIENTS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Channels</label>
              <div className="flex items-center gap-3 pt-2">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.channels.includes('in_app')}
                    onChange={() => toggleChannel('in_app')}
                  />
                  In-app
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.channels.includes('email')}
                    onChange={() => toggleChannel('email')}
                  />
                  Email
                </label>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
              <input
                type="number"
                value={form.sort_order ?? 100}
                onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value, 10) || 100 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {form.recipient_type === 'specific_user' && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Recipient User *</label>
                <select
                  value={form.recipient_user_id || ''}
                  onChange={(e) => setForm({ ...form, recipient_user_id: e.target.value || null })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select user</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.display_name}</option>)}
                </select>
              </div>
            )}

            {form.recipient_type === 'assignment_group_members' && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Recipient Group *</label>
                <select
                  value={form.recipient_group_id || ''}
                  onChange={(e) => setForm({ ...form, recipient_group_id: e.target.value || null })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select assignment group</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            )}

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Localized Templates</label>
              <div className="flex items-center gap-2 flex-wrap mb-3">
                {TEMPLATE_LOCALES.map((locale) => {
                  const hasTemplate = form.templates.some((template) => template.locale === locale);
                  return (
                    <button
                      key={locale}
                      type="button"
                      onClick={() => {
                        ensureLocaleTemplate(locale);
                        setActiveTemplateLocale(locale);
                      }}
                      className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                        activeTemplateLocale === locale
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : hasTemplate
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-100'
                            : 'bg-white text-gray-500 border-gray-200'
                      }`}
                    >
                      {locale}
                    </button>
                  );
                })}
              </div>

              {activeTemplate && activeTemplateIndex >= 0 && (
                <div className="space-y-3 rounded-lg border border-gray-200 p-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Subject Template * ({activeTemplate.locale})
                    </label>
                    <input
                      value={activeTemplate.title_template}
                      onChange={(e) => {
                        const templates = [...form.templates];
                        const currentTemplate = templates[activeTemplateIndex];
                        if (!currentTemplate) return;
                        templates[activeTemplateIndex] = { ...currentTemplate, title_template: e.target.value };
                        setForm({ ...form, templates });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="e.g. {entity_number} updated"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Body Template {form.channels.includes('email') ? '*' : ''}
                    </label>
                    <textarea
                      value={activeTemplate.body_template || ''}
                      onChange={(e) => {
                        const templates = [...form.templates];
                        const currentTemplate = templates[activeTemplateIndex];
                        if (!currentTemplate) return;
                        templates[activeTemplateIndex] = { ...currentTemplate, body_template: e.target.value };
                        setForm({ ...form, templates });
                      }}
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                      placeholder="Use placeholders like {entity_number} and {entity_title}"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">HTML Body Template (optional)</label>
                    <textarea
                      value={activeTemplate.body_html_template || ''}
                      onChange={(e) => {
                        const templates = [...form.templates];
                        const currentTemplate = templates[activeTemplateIndex];
                        if (!currentTemplate) return;
                        templates[activeTemplateIndex] = { ...currentTemplate, body_html_template: e.target.value };
                        setForm({ ...form, templates });
                      }}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-mono"
                      placeholder="<p>{entity_title}</p>"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="mt-6 flex gap-3 pt-4 border-t border-gray-100">
            <button
              onClick={save}
              disabled={
                saving
                || !form.name
                || !form.trigger_key
                || !form.recipient_type
                || form.templates.length === 0
                || form.templates.some((template) => !template.title_template.trim())
                || (form.channels.includes('email') && form.templates.some((template) => !template.body_template?.trim()))
              }
              className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : creating ? 'Create Rule' : 'Update Rule'}
            </button>
            <button
              onClick={cancelEdit}
              className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </Card>
      )}

      {!isFormOpen && (
        <div className="space-y-3">
          {rules.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">
              No notification rules configured yet.
            </div>
          ) : (
            rules.map((rule) => (
              <Card key={rule.id} className={!rule.is_active ? 'opacity-50' : ''}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{rule.name}</h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{rule.entity_type}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">{rule.trigger_key}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{rule.recipient_type}</span>
                      {(rule.channels?.length ? rule.channels : ['in_app']).map((channel) => (
                        <span key={channel} className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                          {channel}
                        </span>
                      ))}
                      {!rule.is_active && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Inactive</span>}
                    </div>
                    {rule.description && <p className="text-sm text-gray-500 mt-1">{rule.description}</p>}
                    <p className="text-xs text-gray-600 mt-2">
                      Title: <span className="font-medium">{rule.title_template}</span>
                    </p>
                    {rule.body_template && (
                      <p className="text-xs text-gray-500 mt-1">Body: {rule.body_template}</p>
                    )}
                    {rule.templates && rule.templates.length > 0 && (
                      <p className="text-xs text-gray-500 mt-1">
                        Locales: {rule.templates.map((template) => template.locale).join(', ')}
                      </p>
                    )}
                    {(rule.recipient_user_name || rule.recipient_group_name) && (
                      <p className="text-xs text-gray-500 mt-1">
                        Target: {rule.recipient_user_name || rule.recipient_group_name}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => testRule(rule)}
                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Test Rule"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.868v4.264a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </button>
                    <button onClick={() => startEdit(rule)} className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Edit">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button
                      onClick={() => toggleActive(rule)}
                      className={`p-2 rounded-lg transition-colors ${rule.is_active ? 'text-green-500 hover:text-red-500 hover:bg-red-50' : 'text-gray-400 hover:text-green-500 hover:bg-green-50'}`}
                      title={rule.is_active ? 'Deactivate' : 'Activate'}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={rule.is_active ? 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z' : 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'} /></svg>
                    </button>
                    <button onClick={() => remove(rule)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </>
  );
}
