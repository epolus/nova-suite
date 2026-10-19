/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import type { NotificationWebhook, NotificationWebhookChannel } from '../../../api/client';
import Card from '../../../components/Card';

interface WebhookConfigSectionProps {
  webhooks: NotificationWebhook[];
  saving: boolean;
  onCreate: (data: {
    channel: NotificationWebhookChannel;
    name: string;
    webhook_url: string;
    reply_channel_id?: string | null;
    api_token?: string | null;
    signing_secret?: string | null;
  }) => Promise<void>;
  onToggleActive: (webhook: NotificationWebhook) => Promise<void>;
  onTest: (webhook: NotificationWebhook) => Promise<void>;
  onDelete: (webhook: NotificationWebhook) => Promise<void>;
}

const emptyForm = {
  channel: 'slack' as NotificationWebhookChannel,
  name: '',
  webhook_url: '',
  reply_channel_id: '',
  api_token: '',
  signing_secret: '',
};

export default function WebhookConfigSection({
  webhooks,
  saving,
  onCreate,
  onToggleActive,
  onTest,
  onDelete,
}: WebhookConfigSectionProps) {
  const t = useTranslations('pages.admin.notificationConfig');
  const tActions = useTranslations('common.actions');
  const tStates = useTranslations('common.states');
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);

  const submit = async () => {
    if (!form.name.trim() || !form.webhook_url.trim()) return;
    await onCreate({
      channel: form.channel,
      name: form.name.trim(),
      webhook_url: form.webhook_url.trim(),
      reply_channel_id: form.channel === 'slack' ? form.reply_channel_id.trim() || null : null,
      api_token: form.channel === 'slack' ? form.api_token.trim() || null : null,
      signing_secret: form.channel === 'slack' ? form.signing_secret.trim() || null : null,
    });
    setForm(emptyForm);
    setOpen(false);
  };

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{t('webhooksTitle')}</h2>
          <p className="text-sm text-gray-500 mt-1">{t('webhooksDescription')}</p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            {t('newWebhook')}
          </button>
        )}
      </div>

      {open && (
        <Card className="mb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('webhookChannel')}</label>
              <select
                value={form.channel}
                onChange={(e) => setForm({ ...form, channel: e.target.value as NotificationWebhookChannel })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-hidden focus:ring-2 focus:ring-indigo-500"
              >
                <option value="slack">{t('channelSlack')}</option>
                <option value="teams">{t('channelTeams')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('webhookName')}</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-hidden focus:ring-2 focus:ring-indigo-500"
                placeholder={t('webhookNamePlaceholder')}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('webhookUrl')}</label>
              <input
                value={form.webhook_url}
                onChange={(e) => setForm({ ...form, webhook_url: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-hidden focus:ring-2 focus:ring-indigo-500 font-mono"
                placeholder={t('webhookUrlPlaceholder')}
              />
            </div>
            {form.channel === 'slack' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('replyChannelId')}</label>
                  <input
                    value={form.reply_channel_id}
                    onChange={(e) => setForm({ ...form, reply_channel_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-hidden focus:ring-2 focus:ring-indigo-500 font-mono"
                    placeholder={t('replyChannelIdPlaceholder')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('botToken')}</label>
                  <input
                    type="password"
                    value={form.api_token}
                    onChange={(e) => setForm({ ...form, api_token: e.target.value })}
                    autoComplete="off"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-hidden focus:ring-2 focus:ring-indigo-500 font-mono"
                    placeholder={t('botTokenPlaceholder')}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('signingSecret')}</label>
                  <input
                    type="password"
                    value={form.signing_secret}
                    onChange={(e) => setForm({ ...form, signing_secret: e.target.value })}
                    autoComplete="off"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-hidden focus:ring-2 focus:ring-indigo-500 font-mono"
                    placeholder={t('signingSecretPlaceholder')}
                  />
                  <p className="text-xs text-gray-500 mt-1">{t('slackThreadHint')}</p>
                </div>
              </>
            )}
          </div>
          <div className="mt-4 flex gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving || !form.name.trim() || !form.webhook_url.trim()}
              className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? tActions('saving') : t('createWebhook')}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setForm(emptyForm); }}
              className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {tActions('cancel')}
            </button>
          </div>
        </Card>
      )}

      <div className="space-y-3">
        {webhooks.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">{t('noWebhooks')}</div>
        ) : (
          webhooks.map((webhook) => (
            <Card key={webhook.id} className={!webhook.is_active ? 'opacity-50' : ''}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900">{webhook.name}</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                      {t(`channels.${webhook.channel}` as Parameters<typeof t>[0])}
                    </span>
                    {!webhook.is_active && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                        {tStates('inactive')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-2 font-mono truncate">{webhook.webhook_url}</p>
                  {webhook.channel === 'slack' && (webhook.reply_channel_id || webhook.has_api_token) && (
                    <p className="text-xs text-gray-500 mt-1">
                      {t('threadRepliesReady', { channel: webhook.reply_channel_id || t('botToken') })}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => void onTest(webhook)}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title={t('testWebhook')}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.868v4.264a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => void onToggleActive(webhook)}
                    className={`p-2 rounded-lg transition-colors ${webhook.is_active ? 'text-green-500 hover:text-red-500 hover:bg-red-50' : 'text-gray-400 hover:text-green-500 hover:bg-green-50'}`}
                    title={webhook.is_active ? t('deactivate') : t('activate')}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={webhook.is_active ? 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z' : 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'} /></svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDelete(webhook)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title={tActions('delete')}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
