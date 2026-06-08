/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import type { NotificationRule } from '../../../api/client';
import Card from '../../../components/Card';

interface NotificationListProps {
  rules: NotificationRule[];
  onTest: (rule: NotificationRule) => void;
  onEdit: (rule: NotificationRule) => void;
  onToggleActive: (rule: NotificationRule) => void;
  onDelete: (rule: NotificationRule) => void;
}

export default function NotificationList({ rules, onTest, onEdit, onToggleActive, onDelete }: NotificationListProps) {
  const t = useTranslations('pages.admin.notificationConfig');
  const tActions = useTranslations('common.actions');
  const tStates = useTranslations('common.states');

  return (
    <div className="space-y-3">
      {rules.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          {t('noRules')}
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
                      {t(`channels.${channel}` as Parameters<typeof t>[0])}
                    </span>
                  ))}
                  {!rule.is_active && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{tStates('inactive')}</span>}
                </div>
                {rule.description && <p className="text-sm text-gray-500 mt-1">{rule.description}</p>}
                <p className="text-xs text-gray-600 mt-2">
                  {t('titleLabel')} <span className="font-medium">{rule.title_template}</span>
                </p>
                {rule.body_template && (
                  <p className="text-xs text-gray-500 mt-1">{t('bodyLabel')} {rule.body_template}</p>
                )}
                {rule.templates && rule.templates.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    {t('localesLabel')} {rule.templates.map((template) => template.locale).join(', ')}
                  </p>
                )}
                {(rule.recipient_user_name || rule.recipient_group_name) && (
                  <p className="text-xs text-gray-500 mt-1">
                    {t('targetLabel')} {rule.recipient_user_name || rule.recipient_group_name}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => onTest(rule)}
                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title={t('testRule')}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.868v4.264a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </button>
                <button onClick={() => onEdit(rule)} className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title={tActions('edit')}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </button>
                <button
                  onClick={() => onToggleActive(rule)}
                  className={`p-2 rounded-lg transition-colors ${rule.is_active ? 'text-green-500 hover:text-red-500 hover:bg-red-50' : 'text-gray-400 hover:text-green-500 hover:bg-green-50'}`}
                  title={rule.is_active ? t('deactivate') : t('activate')}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={rule.is_active ? 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z' : 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'} /></svg>
                </button>
                <button onClick={() => onDelete(rule)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title={tActions('delete')}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
