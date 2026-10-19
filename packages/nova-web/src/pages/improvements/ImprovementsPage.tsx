/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useTranslations } from 'use-intl';
import { improvements } from '@/api/client';
import type { Improvement } from '@/api/client';
import PageHeader from '@/components/PageHeader';
import Card from '@/components/Card';
import Badge from '@/components/Badge';
import Spinner from '@/components/Spinner';
import { formatDateTime } from '@/utils/dateTime';

export default function ImprovementsPage() {
  const t = useTranslations('pages.improvements');
  const [items, setItems] = useState<Improvement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    improvements.list()
      .then((res) => setItems(res.improvements))
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
          <Link to="/improvements/new" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
            {t('newImprovement')}
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
                <th className="py-2 pr-4">{t('titleLabel')}</th>
                <th className="py-2 pr-4">{t('status')}</th>
                <th className="py-2 pr-4">{t('source')}</th>
                <th className="py-2 pr-4">{t('owner')}</th>
                <th className="py-2">{t('updated')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 pr-4">
                    <Link to={`/improvements/${item.id}`} className="text-indigo-600 font-medium hover:text-indigo-800">
                      {item.number}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{item.title}</td>
                  <td className="py-2 pr-4"><Badge value={item.status} /></td>
                  <td className="py-2 pr-4">{t(`sources.${item.source_type}`)}</td>
                  <td className="py-2 pr-4">{item.owner_name || '—'}</td>
                  <td className="py-2">{formatDateTime(item.updated_at)}</td>
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
