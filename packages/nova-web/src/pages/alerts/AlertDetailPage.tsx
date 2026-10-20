/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { useTranslations } from 'use-intl';
import { alerts as alertsApi } from '@/api/client';
import type { AlertDetail, AlertEvent } from '@/api/client';
import PageHeader from '@/components/PageHeader';
import Card from '@/components/Card';
import Badge from '@/components/Badge';
import Spinner from '@/components/Spinner';
import { formatDateTime } from '@/utils/dateTime';
import { useAuth } from '@/context/AuthContext';
import { canViewAlerts } from '@/utils/roles';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-sm text-gray-900">{children}</div>
    </div>
  );
}

export default function AlertDetailPage() {
  const t = useTranslations('pages.alerts');
  const { id } = useParams();
  const { user } = useAuth();
  const [alert, setAlert] = useState<AlertDetail | null>(null);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [prevId, setPrevId] = useState(id);
  if (id !== prevId) {
    setPrevId(id);
    setLoading(true);
    setError('');
    setAlert(null);
  }

  useEffect(() => {
    if (!id || !canViewAlerts(user?.roles)) return;
    let cancelled = false;
    alertsApi.get(id)
      .then((res) => {
        if (cancelled) return;
        setAlert(res.alert);
        setEvents(res.events);
      })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : t('loadFailed')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, t, user?.roles]);

  if (!canViewAlerts(user?.roles)) return <Navigate to="/" replace />;
  if (loading) return <Spinner />;

  const labels = alert?.labels && typeof alert.labels === 'object' ? alert.labels : {};

  return (
    <>
      <PageHeader
        title={alert ? `${alert.number} · ${alert.title}` : t('title')}
        description={alert?.source}
        action={(
          <Link to="/alerts" className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
            {t('backToList')}
          </Link>
        )}
      />
      {error && <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error || t('notFound')}</div>}
      {alert && (
        <>
          <Card className="mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label={t('status')}><Badge value={alert.status} /></Field>
              <Field label={t('severity')}><Badge value={alert.severity} /></Field>
              <Field label={t('fingerprint')}>{alert.fingerprint}</Field>
              <Field label={t('eventsTitle')}>{alert.event_count}</Field>
              <Field label={t('firstSeen')}>{formatDateTime(alert.first_seen_at)}</Field>
              <Field label={t('lastSeen')}>{formatDateTime(alert.last_seen_at)}</Field>
              <Field label={t('ci')}>
                {alert.configuration_item_id
                  ? <Link className="text-indigo-600 hover:text-indigo-800" to={`/cmdb/${alert.configuration_item_id}`}>{alert.ci_name}</Link>
                  : '—'}
              </Field>
              <Field label={t('incident')}>
                {alert.incident_id
                  ? <Link className="text-indigo-600 hover:text-indigo-800" to={`/incidents/${alert.incident_id}`}>{alert.incident_number}</Link>
                  : '—'}
              </Field>
              <Field label={t('definition')}>{alert.definition_name || '—'}</Field>
              <Field label={t('sourceUrl')}>
                {alert.source_url
                  ? <a className="text-indigo-600 hover:text-indigo-800 break-all" href={alert.source_url} target="_blank" rel="noreferrer">{alert.source_url}</a>
                  : '—'}
              </Field>
            </div>
            {alert.suppressed_reason && (
              <p className="mt-4 text-sm text-amber-700">{t('suppressed', { change: alert.suppressed_reason })}</p>
            )}
            <div className="mt-4">
              <div className="text-xs uppercase tracking-wide text-gray-500">{t('labels')}</div>
              {Object.keys(labels).length === 0
                ? <p className="mt-1 text-sm text-gray-400">{t('noLabels')}</p>
                : (
                  <dl className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    {Object.entries(labels).map(([key, value]) => (
                      <div key={key} className="flex gap-2">
                        <dt className="text-gray-500">{key}</dt>
                        <dd className="text-gray-900">{value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
            </div>
          </Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">{t('eventsTitle')}</h2>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="py-2 pr-4">{t('received')}</th>
                    <th className="py-2 pr-4">{t('occurred')}</th>
                    <th className="py-2 pr-4">{t('status')}</th>
                    <th className="py-2 pr-4">{t('severity')}</th>
                    <th className="py-2">{t('titleLabel')}</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id} className="border-b border-gray-100">
                      <td className="py-2 pr-4">{formatDateTime(event.received_at)}</td>
                      <td className="py-2 pr-4">{event.occurred_at ? formatDateTime(event.occurred_at) : '—'}</td>
                      <td className="py-2 pr-4"><Badge value={event.status} /></td>
                      <td className="py-2 pr-4"><Badge value={event.severity} /></td>
                      <td className="py-2">{event.title}</td>
                    </tr>
                  ))}
                  {events.length === 0 && (
                    <tr><td colSpan={5} className="py-8 text-center text-gray-400">{t('empty')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
