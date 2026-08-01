/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect } from 'react';
import { useTranslations } from 'use-intl';
import { Link } from 'react-router-dom';
import { importer } from '../../api/client';
import type { ImportJob } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Spinner from '../../components/Spinner';
import { formatDateTime } from '../../utils/dateTime';

const STATUS_BADGES: Record<string, string> = {
  uploaded: 'bg-blue-100 text-blue-700',
  validated: 'bg-yellow-100 text-yellow-700',
  committed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

export default function ImportHistoryPage() {
  const t = useTranslations('pages.admin.importHistory');
  const tActions = useTranslations('common.actions');
  const tTable = useTranslations('common.table');
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    importer.jobs().then((res) => {
      setJobs(res.jobs);
      setLoading(false);
    });
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm(t('confirmDelete'))) return;
    await importer.deleteJob(id);
    setJobs(jobs.filter((j) => j.id !== id));
  };

  const entityLabels: Record<string, string> = {
    departments: t('entities.departments'),
    cost_centers: t('entities.cost_centers'),
    users: t('entities.users'),
    assignment_groups: t('entities.assignment_groups'),
    cmdb: t('entities.cmdb'),
    incidents: t('entities.incidents'),
  };

  if (loading) return <Spinner />;

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        action={
          <Link
            to="/admin/import"
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            {t('newImport')}
          </Link>
        }
      />

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-500">{t('table.date')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">{t('table.entity')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">{t('table.file')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">{t('table.status')}</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">{t('table.total')}</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">{t('table.committed')}</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">{t('table.errors')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">{t('table.createdBy')}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-400">{t('empty')}</td>
                </tr>
              ) : jobs.map((job) => (
                <tr key={job.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {formatDateTime(job.created_at)}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{entityLabels[job.entity_type] || job.entity_type}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">{job.file_name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGES[job.status] || 'bg-gray-100 text-gray-600'}`}>
                      {job.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">{job.total_rows}</td>
                  <td className="px-4 py-3 text-right text-green-700">{job.committed_rows}</td>
                  <td className="px-4 py-3 text-right text-red-600">{job.error_rows}</td>
                  <td className="px-4 py-3 text-gray-600">{job.created_by_name || tTable('emDash')}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(job.id)}
                      className="text-xs text-red-600 hover:text-red-800"
                    >
                      {tActions('delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
