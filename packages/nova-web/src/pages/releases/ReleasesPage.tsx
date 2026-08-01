/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslations } from 'use-intl';
import { releases } from '@/api/client';
import type { Release } from '@/api/client';
import PageHeader from '@/components/PageHeader';
import Card from '@/components/Card';
import Badge from '@/components/Badge';
import Spinner from '@/components/Spinner';
import { formatDateTime } from '@/utils/dateTime';

export default function ReleasesPage() {
  const t = useTranslations('pages.releases');
  const [items, setItems] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    releases.list()
      .then((res) => setItems(res.releases))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : t('loadFailed')))
      .finally(() => setLoading(false));
  }, [t]);

  if (loading) return <Spinner />;

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        action={
          <Link to="/releases/new" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
            {t('newRelease')}
          </Link>
        }
      />
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 pr-4">{t('number')}</th>
                <th className="py-2 pr-4">{t('title')}</th>
                <th className="py-2 pr-4">{t('status')}</th>
                <th className="py-2 pr-4">{t('type')}</th>
                <th className="py-2 pr-4">{t('owner')}</th>
                <th className="py-2">{t('plannedStart')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((release) => (
                <tr key={release.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 pr-4">
                    <Link to={`/releases/${release.id}`} className="text-indigo-600 font-medium hover:text-indigo-800">
                      {release.number}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{release.title}</td>
                  <td className="py-2 pr-4"><Badge value={release.status} /></td>
                  <td className="py-2 pr-4 capitalize">{release.release_type}</td>
                  <td className="py-2 pr-4">{release.owner_name || '—'}</td>
                  <td className="py-2">{release.planned_start ? formatDateTime(release.planned_start) : '—'}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400">{t('empty')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
