/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import { type AdminUser } from '../../api/client';
import Badge from '../../components/Badge';
import { type DataColumnDef } from '../../components/DataTable';
import { formatDate, formatDateTime } from '../../utils/dateTime';

function userSourceLabel(
  tPage: ReturnType<typeof useTranslations<'pages.admin.usersPage'>>,
  source: AdminUser['source'],
): string {
  if (source === 'sso') return tPage('sources.sso');
  if (source === 'import') return tPage('sources.import');
  if (source === 'datasource') return tPage('sources.datasource');
  return tPage('sources.manual');
}

export function buildUserColumns(
  tFields: ReturnType<typeof useTranslations<'common.fields'>>,
  tTable: ReturnType<typeof useTranslations<'common.table'>>,
  tStates: ReturnType<typeof useTranslations<'common.states'>>,
  tPage: ReturnType<typeof useTranslations<'pages.admin.usersPage'>>,
): DataColumnDef<AdminUser>[] {
  return [
    {
      key: 'user',
      label: tFields('user'),
      sortable: true,
      defaultVisible: true,
      render: (u) => {
        const fullName = [u.first_name, u.last_name].filter(Boolean).join(' ');
        const showSubtitle = fullName && fullName !== u.display_name;
        return (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold shrink-0">
              {(u.first_name || u.display_name).charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="font-medium text-gray-900 truncate">{u.display_name}</p>
              <p className="text-xs text-gray-500 truncate">
                {showSubtitle ? `${fullName} · ${u.email}` : u.email}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      key: 'title',
      label: tFields('jobTitle'),
      sortable: true,
      defaultVisible: true,
      render: (u) => <span className="text-gray-600">{u.title || tTable('emDash')}</span>,
    },
    {
      key: 'user_id',
      label: tFields('employeeId'),
      sortable: true,
      defaultVisible: true,
      render: (u) => <span className="text-gray-500 font-mono text-xs">{u.user_id || tTable('emDash')}</span>,
    },
    {
      key: 'email',
      label: tFields('email'),
      sortable: true,
      defaultVisible: false,
      render: (u) => <span className="text-gray-600">{u.email}</span>,
    },
    {
      key: 'phone',
      label: tFields('phone'),
      sortable: true,
      defaultVisible: false,
      render: (u) => <span className="text-gray-500">{u.phone || tTable('emDash')}</span>,
    },
    {
      key: 'location',
      label: tFields('location'),
      sortable: true,
      defaultVisible: false,
      render: (u) => <span className="text-gray-500">{u.location || tTable('emDash')}</span>,
    },
    {
      key: 'employee_type',
      label: tFields('type'),
      sortable: true,
      defaultVisible: false,
      render: (u) => <span className="text-gray-600 capitalize">{u.employee_type}</span>,
    },
    {
      key: 'company_name',
      label: tFields('company'),
      sortable: true,
      defaultVisible: false,
      render: (u) => <span className="text-gray-500">{u.company_name || tTable('emDash')}</span>,
    },
    {
      key: 'department_name',
      label: tFields('department'),
      sortable: true,
      defaultVisible: true,
      render: (u) => <span className="text-gray-600">{u.department_name || tTable('emDash')}</span>,
    },
    {
      key: 'cost_center_name',
      label: tFields('costCenter'),
      sortable: true,
      defaultVisible: false,
      render: (u) => (
        <span className="text-gray-500">
          {u.cost_center_code ? `${u.cost_center_code} – ${u.cost_center_name}` : tTable('emDash')}
        </span>
      ),
    },
    {
      key: 'manager_name',
      label: tFields('manager'),
      sortable: true,
      defaultVisible: true,
      render: (u) => <span className="text-gray-500">{u.manager_name || tTable('emDash')}</span>,
    },
    {
      key: 'roles',
      label: tFields('roles'),
      sortable: false,
      defaultVisible: true,
      render: (u) => (
        <div className="flex flex-wrap gap-1">
          {u.roles.length > 0 ? (
            u.roles.map((r) => <Badge key={r} value={r} />)
          ) : (
            <span className="text-gray-400 text-xs">{tPage('noRoles')}</span>
          )}
        </div>
      ),
    },
    {
      key: 'start_date',
      label: tFields('startDate'),
      sortable: true,
      defaultVisible: false,
      render: (u) => (
        <span className="text-gray-500 text-xs">{formatDate(u.start_date)}</span>
      ),
    },
    {
      key: '_status',
      label: tFields('status'),
      sortable: true,
      defaultVisible: true,
      render: (u) =>
        u.is_active ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            {tStates('active')}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
            {tStates('inactive')}
          </span>
        ),
    },
    {
      key: 'employee_number',
      label: tFields('employeeNumber'),
      sortable: true,
      defaultVisible: false,
      render: (u) => <span className="text-gray-500 font-mono text-xs">{u.employee_number || tTable('emDash')}</span>,
    },
    {
      key: 'vip',
      label: tFields('vip'),
      sortable: true,
      defaultVisible: false,
      render: (u) => u.vip
        ? <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-medium">{tFields('vip')}</span>
        : <span className="text-gray-400">{tTable('emDash')}</span>,
    },
    {
      key: 'locked_out',
      label: tFields('lockedOut'),
      sortable: true,
      defaultVisible: false,
      render: (u) => u.locked_out
        ? <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />{tFields('lockedOut')}</span>
        : <span className="text-gray-400">{tTable('emDash')}</span>,
    },
    {
      key: 'source',
      label: tFields('source'),
      sortable: true,
      defaultVisible: false,
      render: (u) => <span className="text-gray-600">{userSourceLabel(tPage, u.source)}</span>,
    },
    {
      key: 'last_login_at',
      label: tFields('lastLogin'),
      sortable: true,
      defaultVisible: false,
      render: (u) => <span className="text-gray-500 text-xs">{u.last_login_at ? formatDateTime(u.last_login_at) : tTable('emDash')}</span>,
    },
    {
      key: 'created_at',
      label: tFields('created'),
      sortable: true,
      defaultVisible: false,
      render: (u) => (
        <span className="text-gray-500 text-xs">{formatDate(u.created_at)}</span>
      ),
    },
  ];
}
