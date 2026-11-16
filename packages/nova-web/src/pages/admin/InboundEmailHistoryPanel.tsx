/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import {
  inboundEmail as inboundEmailApi,
  type MailboxItem,
} from '@/api/client';
import Badge from '@/components/Badge';
import Card from '@/components/Card';
import Spinner from '@/components/Spinner';
import { formatDateTime } from '@/utils/dateTime';

type Props = {
  mailboxes: MailboxItem[];
};

const HISTORY_QUERY_KEY = ['admin', 'inbound-email', 'history'] as const;

export default function InboundEmailHistoryPanel({ mailboxes }: Props) {
  const t = useTranslations('pages.admin.inboundEmail');
  const [mailboxId, setMailboxId] = useState('');

  const query = useQuery({
    queryKey: [...HISTORY_QUERY_KEY, mailboxId],
    queryFn: () =>
      inboundEmailApi.messages({
        mailboxId: mailboxId || undefined,
        limit: 100,
      }),
  });

  const messages = query.data?.messages ?? [];
  const loadError = query.error instanceof Error ? query.error.message : query.error ? t('loadFailed') : '';

  return (
    <>
      <Card className="mb-4">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
          <label className="block text-sm min-w-[12rem]">
            <span className="font-medium text-gray-700">{t('mailbox')}</span>
            <select
              value={mailboxId}
              onChange={(e) => setMailboxId(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="">{t('allMailboxes')}</option>
              {mailboxes.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {query.isFetching ? t('refreshing') : t('refresh')}
          </button>
        </div>
      </Card>

      {loadError && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{loadError}</div>
      )}

      {query.isLoading ? (
        <Spinner />
      ) : (
        <div className="overflow-x-auto border border-gray-100 rounded-lg bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-3 py-2 font-medium">{t('receivedAt')}</th>
                <th className="text-left px-3 py-2 font-medium">{t('mailbox')}</th>
                <th className="text-left px-3 py-2 font-medium">{t('from')}</th>
                <th className="text-left px-3 py-2 font-medium">{t('subject')}</th>
                <th className="text-left px-3 py-2 font-medium">{t('status')}</th>
                <th className="text-left px-3 py-2 font-medium">{t('matchedRule')}</th>
                <th className="text-left px-3 py-2 font-medium">{t('incident')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {messages.map((msg) => (
                <tr key={msg.id} className="align-top hover:bg-gray-50/80">
                  <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                    {formatDateTime(msg.processed_at || msg.created_at)}
                  </td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                    {msg.mailbox_name || '—'}
                  </td>
                  <td className="px-3 py-2 text-gray-700 max-w-[14rem] truncate" title={msg.from_address}>
                    {msg.from_address}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900 max-w-[18rem] truncate" title={msg.subject}>
                      {msg.subject || t('noSubject')}
                    </div>
                    {msg.processing_notes && (
                      <div className="text-xs text-gray-500 mt-0.5 max-w-[22rem]" title={msg.processing_notes}>
                        {msg.processing_notes}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge value={msg.processing_status} />
                  </td>
                  <td className="px-3 py-2">
                    {msg.matched_rule_name ? (
                      <div>
                        <span className="text-gray-900">{msg.matched_rule_name}</span>
                        {msg.matched_rule_action && (
                          <div className="text-xs text-gray-500 mt-0.5">
                            {msg.matched_rule_action === 'create_incident'
                              ? t('actionCreate')
                              : msg.matched_rule_action === 'update_incident'
                                ? t('actionUpdate')
                                : t('actionIgnore')}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">{t('noRule')}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {msg.incident_id && msg.incident_number ? (
                      <Link
                        to={`/incidents/${msg.incident_id}`}
                        className="text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        {msg.incident_number}
                      </Link>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {messages.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-gray-400">
                    {t('noMessages')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
