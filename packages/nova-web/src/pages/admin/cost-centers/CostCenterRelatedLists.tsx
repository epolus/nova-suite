/* SPDX-License-Identifier: AGPL-3.0-only */
import { Link } from 'react-router';
import { useTranslations } from 'use-intl';
import type { AdminUser, DepartmentItem } from '../../../api/client';
import Card from '../../../components/Card';

export default function CostCenterRelatedLists({
  departments,
  users,
}: {
  departments: DepartmentItem[];
  users: AdminUser[];
}) {
  const t = useTranslations('pages.admin.costCenters');
  const tStates = useTranslations('common.states');
  const tTable = useTranslations('common.table');

  return (
    <>
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">
            {t('relatedDepartments', { count: departments.length })}
          </h2>
        </div>
        {departments.length === 0 ? (
          <p className="text-sm text-gray-500">{t('noRelatedDepartments')}</p>
        ) : (
          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {departments.map((dept) => (
              <li key={dept.id}>
                <Link
                  to={`/admin/departments/${dept.id}`}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{dept.name}</p>
                    {dept.parent_department_name && (
                      <p className="text-xs text-gray-500 truncate">{dept.parent_department_name}</p>
                    )}
                  </div>
                  <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    dept.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {dept.is_active ? tStates('active') : tStates('inactive')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">
            {t('relatedUsers', { count: users.length })}
          </h2>
        </div>
        {users.length === 0 ? (
          <p className="text-sm text-gray-500">{t('noRelatedUsers')}</p>
        ) : (
          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {users.map((user) => (
              <li key={user.id}>
                <Link
                  to={`/admin/users/${user.id}`}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{user.display_name}</p>
                    <p className="text-xs text-gray-500 truncate">{user.email || tTable('emDash')}</p>
                  </div>
                  <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    user.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {user.is_active ? tStates('active') : tStates('inactive')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
