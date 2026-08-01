/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslations } from 'use-intl';
import {
  admin,
  type AdminUser,
} from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Badge from '../../components/Badge';
import Spinner from '../../components/Spinner';
import SearchBar from '../../components/SearchBar';
import DataTable, { type DataColumnDef } from '../../components/DataTable';
import { useListParams } from '../../hooks/useListParams';
import { formatDate } from '../../utils/dateTime';

const DEFAULT_COLS = ['user', 'title', 'user_id', 'department_name', 'manager_name', 'roles', '_status'];

function buildColumns(
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
            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
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

export default function UsersPage() {
  const tPage = useTranslations('pages.admin.usersPage');
  const tFields = useTranslations('common.fields');
  const tTable = useTranslations('common.table');
  const tStates = useTranslations('common.states');

  const { params, setSearch, setSort, setCols, setFilter, setColumnFilter } = useListParams({
    defaultCols: DEFAULT_COLS,
    filterKeys: ['active'],
    storageKey: 'admin_users',
  });

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const activeFilter = params.filters.active || 'all';

  const loadData = useCallback(async () => {
    try {
      const usersRes = await admin.users();
      setUsers(usersRes.users);
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    let list = users;
    if (activeFilter === 'active') list = list.filter((u) => u.is_active);
    else if (activeFilter === 'inactive') list = list.filter((u) => !u.is_active);
    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter(
        (u) =>
          u.display_name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.first_name && u.first_name.toLowerCase().includes(q)) ||
          (u.last_name && u.last_name.toLowerCase().includes(q)) ||
          (u.user_id && u.user_id.toLowerCase().includes(q)) ||
          (u.title && u.title.toLowerCase().includes(q)) ||
          (u.location && u.location.toLowerCase().includes(q)) ||
          u.roles.some((r) => r.toLowerCase().includes(q)) ||
          (u.department_name && u.department_name.toLowerCase().includes(q)),
      );
    }
    for (const [col, val] of Object.entries(params.columnFilters)) {
      if (!val) continue;
      const lower = val.toLowerCase();
      list = list.filter((u) => {
        if (col === '_status') return (u.is_active ? 'active' : 'inactive').startsWith(lower);
        if (col === 'user') return u.display_name.toLowerCase().startsWith(lower) || u.email.toLowerCase().startsWith(lower);
        if (col === 'roles') return u.roles.some((r) => r.toLowerCase().startsWith(lower));
        const raw = (u as unknown as Record<string, unknown>)[col];
        return raw != null && String(raw).toLowerCase().startsWith(lower);
      });
    }
    return list;
  }, [users, activeFilter, params.search, params.columnFilters]);

  const sorted = useMemo(() => {
    if (!params.sort) return filtered;
    return [...filtered].sort((a, b) => {
      const aVal = getSortValue(a, params.sort);
      const bVal = getSortValue(b, params.sort);
      const cmp = compareValues(aVal, bVal);
      return params.dir === 'desc' ? -cmp : cmp;
    });
  }, [filtered, params.sort, params.dir]);

  const getListParams = useCallback((): Record<string, string> => {
    const lp: Record<string, string> = {};
    if (activeFilter && activeFilter !== 'all') lp.active = activeFilter;
    if (params.search) lp.search = params.search;
    if (params.sort) {
      lp.sort_by = params.sort;
      lp.sort_dir = params.dir;
    }
    for (const [col, val] of Object.entries(params.columnFilters)) {
      if (val) lp[`cf.${col}`] = val;
    }
    return lp;
  }, [activeFilter, params.search, params.sort, params.dir, params.columnFilters]);

  const columns = useMemo(
    () => buildColumns(tFields, tTable, tStates, tPage),
    [tFields, tPage, tStates, tTable],
  );

  if (loading) return <Spinner />;

  return (
    <>
      <PageHeader
        title={tPage('title')}
        description={tPage('description')}
        action={
          <button
            onClick={() => navigate('/admin/users/new', { state: { listParams: getListParams() } })}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            {tPage('newUser')}
          </button>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="w-full sm:w-80">
          <SearchBar
            value={params.search}
            onChange={setSearch}
            placeholder={tPage('searchPlaceholder')}
          />
        </div>
        <div className="flex gap-2 items-center">
          {(['all', 'active', 'inactive'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter('active', f === 'all' ? '' : f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors capitalize ${
                (activeFilter === f || (f === 'all' && !activeFilter))
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {f === 'all' ? tStates('all') : f === 'active' ? tStates('active') : tStates('inactive')}
            </button>
          ))}
        </div>
        <div className="ml-auto text-sm text-gray-500 self-center">
          {tPage('count', { count: sorted.length })}
        </div>
      </div>

      <DataTable
        columns={columns}
        data={sorted}
        visibleColumns={params.cols}
        onColumnsChange={setCols}
        sortKey={params.sort}
        sortDir={params.dir}
        onSort={setSort}
        columnFilters={params.columnFilters}
        onColumnFilter={setColumnFilter}
        emptyMessage={params.search ? tPage('emptySearch', { query: params.search }) : tPage('empty')}
        onRowClick={(u) => navigate(`/admin/users/${u.id}`, { state: { listParams: getListParams() } })}
      />
    </>
  );
}

function getSortValue(user: AdminUser, key: string): unknown {
  if (key === 'user') return user.display_name;
  if (key === '_status') return user.is_active ? 0 : 1;
  return (user as unknown as Record<string, unknown>)[key];
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
}
