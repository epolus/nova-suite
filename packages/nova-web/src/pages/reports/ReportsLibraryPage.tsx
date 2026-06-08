/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslations } from 'use-intl';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';
import { reports, type ReportDefinitionSummary } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { hasReportingCreateRole, hasReportingViewRole } from '../../utils/roles';
import { formatDateTime } from '../../utils/dateTime';

function NewReportCard({ onCreate, creating }: { onCreate: (name: string) => Promise<void>; creating: boolean }) {
  const t = useTranslations('pages.reports');
  const tActions = useTranslations('common.actions');

  const [name, setName] = useState('');

  return (
    <Card>
      <h3 className="text-sm font-semibold text-gray-900">{t('createReport')}</h3>
      <p className="text-xs text-gray-500 mt-1">{t('createReportHint')}</p>
      <div className="mt-3 flex gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('reportNamePlaceholder')}
          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
        />
        <button
          disabled={!name.trim() || creating}
          onClick={() => {
            const trimmed = name.trim();
            if (!trimmed) return;
            void onCreate(trimmed).then(() => setName(''));
          }}
          className="px-3 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {creating ? t('creating') : tActions('create')}
        </button>
      </div>
    </Card>
  );
}

export default function ReportsLibraryPage() {
  const t = useTranslations('pages.reports');
  const tActions = useTranslations('common.actions');
  const navigate = useNavigate();
  const { user } = useAuth();
  const [items, setItems] = useState<ReportDefinitionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyDeleteId, setBusyDeleteId] = useState<string | null>(null);

  const canView = hasReportingViewRole(user?.roles);
  const canCreate = hasReportingCreateRole(user?.roles);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await reports.listDefinitions();
      setItems(res.reports);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    void load();
  }, [canView, load]);

  const privateCount = useMemo(() => items.filter((item) => !item.is_shared).length, [items]);

  const createReport = async (name: string) => {
    if (!canCreate) return;
    setCreating(true);
    try {
      const res = await reports.createDefinition({
        name,
        components: [],
        layout: { order: [] },
        is_shared: false,
        allowed_roles: [],
      });
      navigate(`/reports/${res.report.id}/builder`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('createFailed'));
    } finally {
      setCreating(false);
    }
  };

  const deleteReport = async (id: string) => {
    setBusyDeleteId(id);
    try {
      await reports.deleteDefinition(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('deleteFailed'));
    } finally {
      setBusyDeleteId(null);
    }
  };

  if (!canView) {
    return (
      <>
        <PageHeader title={t('title')} description={t('workspaceDescription')} />
        <Card>
          <p className="text-sm text-gray-600">{t('noPermissionView')}</p>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('sharedPrivateCounts', { shared: items.length - privateCount, private: privateCount })}
        action={
          <button
            onClick={() => void load()}
            className="px-3 py-2 rounded-lg text-sm border border-gray-200 hover:bg-gray-50"
          >
            {tActions('refresh')}
          </button>
        }
      />

      {error && (
        <Card className="mb-4">
          <p className="text-sm text-red-600">{error}</p>
        </Card>
      )}

      {canCreate && <NewReportCard onCreate={createReport} creating={creating} />}

      {loading ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          {items.map((item) => (
            <Card key={item.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 truncate">{item.name}</h3>
                  <p className="text-xs text-gray-500 mt-1">{item.description || t('noDescription')}</p>
                  <p className="text-xs text-gray-400 mt-2">
                    {t('updatedVersion', { date: formatDateTime(item.updated_at), version: item.version })}
                  </p>
                  <p className="text-xs mt-1 text-gray-500">
                    {item.is_shared
                      ? item.allowed_roles.length
                        ? t('sharedRoles', { roles: item.allowed_roles.join(', ') })
                        : t('sharedAllRoles')
                      : t('private')}
                  </p>
                </div>
                <div className="shrink-0 flex gap-2">
                  <Link
                    to={`/reports/${item.id}`}
                    className="px-2.5 py-1.5 rounded-md text-xs border border-gray-200 hover:bg-gray-50"
                  >
                    {tActions('view')}
                  </Link>
                  {item.can_edit && (
                    <Link
                      to={`/reports/${item.id}/builder`}
                      className="px-2.5 py-1.5 rounded-md text-xs bg-indigo-600 text-white hover:bg-indigo-700"
                    >
                      {tActions('edit')}
                    </Link>
                  )}
                </div>
              </div>
              {item.can_edit && (
                <div className="mt-3 pt-3 border-t border-gray-100 flex justify-end">
                  <button
                    onClick={() => void deleteReport(item.id)}
                    disabled={busyDeleteId === item.id}
                    className="text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
                  >
                    {busyDeleteId === item.id ? t('deleting') : tActions('delete')}
                  </button>
                </div>
              )}
            </Card>
          ))}
          {items.length === 0 && (
            <Card>
              <p className="text-sm text-gray-500">{t('emptyLibrary')}</p>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
