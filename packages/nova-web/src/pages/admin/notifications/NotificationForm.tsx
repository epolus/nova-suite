/* SPDX-License-Identifier: AGPL-3.0-only */
import { useMemo } from 'react';
import { useTranslations } from 'use-intl';
import type { AssignmentGroupItem, AdminUser, NotificationRule } from '../../../api/client';
import Card from '../../../components/Card';
import {
  TRIGGER_DEFS,
  RECIPIENT_IDS,
  ENTITY_OPTIONS,
  TEMPLATE_LOCALES,
  type TemplateLocale,
  type NotificationRuleForm,
} from './constants';

interface NotificationFormProps {
  form: NotificationRuleForm;
  setForm: (form: NotificationRuleForm) => void;
  creating: boolean;
  saving: boolean;
  users: AdminUser[];
  groups: AssignmentGroupItem[];
  activeTemplateLocale: TemplateLocale;
  setActiveTemplateLocale: (locale: TemplateLocale) => void;
  onSave: () => void;
  onCancel: () => void;
}

export default function NotificationForm({
  form,
  setForm,
  creating,
  saving,
  users,
  groups,
  activeTemplateLocale,
  setActiveTemplateLocale,
  onSave,
  onCancel,
}: NotificationFormProps) {
  const t = useTranslations('pages.admin.notificationConfig');
  const tActions = useTranslations('common.actions');
  const tFields = useTranslations('common.fields');

  const triggers = useMemo(
    () => TRIGGER_DEFS.map((trigger) => ({
      ...trigger,
      label: t(`triggers.${trigger.id}` as Parameters<typeof t>[0]),
    })),
    [t],
  );

  const recipients = useMemo(
    () => RECIPIENT_IDS.map((id) => ({
      id,
      label: t(`recipients.${id}` as Parameters<typeof t>[0]),
    })),
    [t],
  );

  const availableTriggers = triggers.filter((trigger) => trigger.entity === (form.entity_type || 'incident'));
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

  return (
    <Card className="mb-6">
      <h3 className="font-semibold text-gray-900 text-lg mb-4">{creating ? t('newRuleTitle') : t('editRuleTitle')}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{tFields('name')} *</label>
          <input
            value={form.name || ''}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('entity')}</label>
          <select
            value={form.entity_type || 'incident'}
            onChange={(e) => {
              const entity = e.target.value as NotificationRule['entity_type'];
              const nextTrigger = triggers.find((trigger) => trigger.entity === entity)?.id || '';
              setForm({ ...form, entity_type: entity, trigger_key: nextTrigger });
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {ENTITY_OPTIONS.map((entity) => (
              <option key={entity} value={entity}>{t(`entityTypes.${entity}` as Parameters<typeof t>[0])}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('trigger')}</label>
          <select
            value={form.trigger_key || availableTriggers[0]?.id || ''}
            onChange={(e) => setForm({ ...form, trigger_key: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {availableTriggers.map((trigger) => <option key={trigger.id} value={trigger.id}>{trigger.label}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">{tFields('description')}</label>
          <input
            value={form.description || ''}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('recipient')}</label>
          <select
            value={form.recipient_type || 'assignee'}
            onChange={(e) => setForm({ ...form, recipient_type: e.target.value as NotificationRule['recipient_type'] })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {recipients.map((recipient) => <option key={recipient.id} value={recipient.id}>{recipient.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('channelsLabel')}</label>
          <div className="flex items-center gap-3 pt-2">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.channels.includes('in_app')}
                onChange={() => toggleChannel('in_app')}
              />
              {t('channelInApp')}
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.channels.includes('email')}
                onChange={() => toggleChannel('email')}
              />
              {t('channelEmail')}
            </label>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('sortOrder')}</label>
          <input
            type="number"
            value={form.sort_order ?? 100}
            onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value, 10) || 100 })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {form.recipient_type === 'specific_user' && (
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('recipientUser')}</label>
            <select
              value={form.recipient_user_id || ''}
              onChange={(e) => setForm({ ...form, recipient_user_id: e.target.value || null })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">{t('selectUser')}</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.display_name}</option>)}
            </select>
          </div>
        )}

        {form.recipient_type === 'assignment_group_members' && (
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('recipientGroup')}</label>
            <select
              value={form.recipient_group_id || ''}
              onChange={(e) => setForm({ ...form, recipient_group_id: e.target.value || null })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">{t('selectAssignmentGroup')}</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        )}

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">{t('localizedTemplates')}</label>
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
                  {t('subjectTemplate', { locale: activeTemplate.locale })}
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
                  placeholder={t('subjectPlaceholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {form.channels.includes('email') ? t('bodyTemplateRequired') : t('bodyTemplate')}
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
                  placeholder={t('bodyPlaceholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('htmlBodyTemplate')}</label>
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
                  placeholder={t('htmlPlaceholder')}
                />
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="mt-6 flex gap-3 pt-4 border-t border-gray-100">
        <button
          onClick={onSave}
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
          {saving ? tActions('saving') : creating ? t('createRule') : t('updateRule')}
        </button>
        <button
          onClick={onCancel}
          className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          {tActions('cancel')}
        </button>
      </div>
    </Card>
  );
}
