/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { admin as adminApi, type NotificationEmailDelivery, type NotificationEmailDeliverySummary } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';
import { formatDateTime } from '../../utils/dateTime';

const STATUS_OPTIONS = ['', 'queued', 'sent', 'failed'] as const;

export default function NotificationEmailDeliveriesPage() {
  const [deliveries, setDeliveries] = useState<NotificationEmailDelivery[]>([]);
  const [summary, setSummary] = useState<NotificationEmailDeliverySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [status, setStatus] = useState('');
  const [triggerKey, setTriggerKey] = useState('');
  const [recipient, setRecipient] = useState('');
  const [limit, setLimit] = useState(100);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await adminApi.notificationEmailDeliveries({
        status: status || undefined,
        trigger_key: triggerKey.trim() || undefined,
        recipient: recipient.trim() || undefined,
        limit,
      });
      setDeliveries(res.deliveries);
      setSummary(res.summary);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notification deliveries');
    } finally {
      if (background) setRefreshing(false);
      else setLoading(false);
    }
  }, [status, triggerKey, recipient, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  const summaryByStatus = useMemo(() => {
    const byStatus = new Map<string, number>();
    for (const item of summary) byStatus.set(item.status, item.count);
    return {
      queued: byStatus.get('queued') || 0,
      sent: byStatus.get('sent') || 0,
      failed: byStatus.get('failed') || 0,
    };
  }, [summary]);

  function getEntityPath(delivery: NotificationEmailDelivery): string | null {
    if (!delivery.entity_type || !delivery.entity_id) return null;
    if (delivery.entity_type === 'incident') return `/incidents/${delivery.entity_id}`;
    if (delivery.entity_type === 'request') return `/requests/${delivery.entity_id}`;
    if (delivery.entity_type === 'change') return `/changes/${delivery.entity_id}`;
    if (delivery.entity_type === 'problem') return `/problems/${delivery.entity_id}`;
    return null;
  }

  return (
    <>
      <PageHeader
        title="Notification Email Deliveries"
        description="Delivery log for workflow-driven notification emails."
      />

      <Card className="mb-4">
        <div className="flex flex-col xl:flex-row gap-3 items-start xl:items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            >
              {STATUS_OPTIONS.map((value) => (
                <option key={value || 'all'} value={value}>
                  {value ? value : 'all'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Trigger Key</label>
            <input
              value={triggerKey}
              onChange={(e) => setTriggerKey(e.target.value)}
              placeholder="assigned, status_changed, ..."
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm w-72"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Recipient Email</label>
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="name@example.com"
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm w-72"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rows</label>
            <select
              value={limit}
              onChange={(e) => setLimit(Number.parseInt(e.target.value, 10) || 100)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            >
              {[50, 100, 200, 500].map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => void load(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Card>
          <p className="text-xs text-gray-500">Queued (matching)</p>
          <p className="text-2xl font-semibold text-gray-900">{summaryByStatus.queued}</p>
        </Card>
        <Card>
          <p className="text-xs text-gray-500">Sent (matching)</p>
          <p className="text-2xl font-semibold text-green-700">{summaryByStatus.sent}</p>
        </Card>
        <Card>
          <p className="text-xs text-gray-500">Failed (matching)</p>
          <p className="text-2xl font-semibold text-red-700">{summaryByStatus.failed}</p>
        </Card>
      </div>

      <Card>
        {error && (
          <div className="mb-3 px-3 py-2 rounded-md border border-red-200 bg-red-50 text-red-700 text-sm">
            {error}
          </div>
        )}
        {loading ? (
          <Spinner />
        ) : deliveries.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400">No delivery logs found for current filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-3 py-2 text-left font-medium text-gray-500">When</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Status</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Recipient</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Trigger</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Entity</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Locale</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Subject</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {deliveries.map((delivery) => (
                  <tr key={delivery.id}>
                    <td className="px-3 py-2 text-xs text-gray-500">{formatDateTime(delivery.created_at)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        delivery.status === 'sent'
                          ? 'bg-green-100 text-green-700'
                          : delivery.status === 'failed'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-700'
                      }`}
                      >
                        {delivery.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <p className="text-gray-900">{delivery.recipient_email}</p>
                      {delivery.recipient_user_name && (
                        <p className="text-xs text-gray-500">{delivery.recipient_user_name}</p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <p className="text-xs text-gray-600">{delivery.entity_type}</p>
                      <p className="text-xs text-gray-500">{delivery.trigger_key}</p>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {(() => {
                        const entityPath = getEntityPath(delivery);
                        if (!entityPath) return <span className="text-gray-400">—</span>;
                        return (
                          <Link className="text-indigo-600 hover:text-indigo-700 underline" to={entityPath}>
                            Open
                          </Link>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">
                      {delivery.template_locale} (user {delivery.recipient_locale})
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-800 max-w-[26rem] truncate" title={delivery.subject}>
                      {delivery.subject}
                    </td>
                    <td className="px-3 py-2 text-xs text-red-600 max-w-[20rem]">
                      {delivery.last_error || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

