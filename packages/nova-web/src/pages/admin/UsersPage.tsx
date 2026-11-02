/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useTranslations } from 'use-intl';
import {
  admin,
  type AdminUser,
} from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Spinner from '../../components/Spinner';
import SearchBar from '../../components/SearchBar';
import DataTable from '../../components/DataTable';
import { useListParams } from '../../hooks/useListParams';
import { buildUserColumns } from './userColumns';

const DEFAULT_COLS = ['user', 'title', 'user_id', 'department_name', 'manager_name', 'roles', '_status'];
const PAGE_SIZE_OPTIONS = [20, 50, 100];
const DEFAULT_PAGE_SIZE = 20;

export default function UsersPage() {
  const tPage = useTranslations('pages.admin.usersPage');
  const tFields = useTranslations('common.fields');
  const tTable = useTranslations('common.table');
  const tStates = useTranslations('common.states');

  const { params, setSearch, setSort, setCols, setPage, setFilter, setColumnFilter } = useListParams({
    defaultCols: DEFAULT_COLS,
    filterKeys: ['active'],
    storageKey: 'admin_users',
  });
  const [searchParams, setSearchParams] = useSearchParams();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const activeFilter = params.filters.active || 'all';
  const pageSize = useMemo(() => {
    const raw = Number.parseInt(searchParams.get('limit') || String(DEFAULT_PAGE_SIZE), 10);
    if (!Number.isFinite(raw) || raw < 1) return DEFAULT_PAGE_SIZE;
    return PAGE_SIZE_OPTIONS.includes(raw) ? raw : DEFAULT_PAGE_SIZE;
  }, [searchParams]);

  const setPageSize = useCallback((size: number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (size === DEFAULT_PAGE_SIZE) next.delete('limit');
      else next.set('limit', String(size));
      next.delete('page');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const loadData = useCallback(() => {
    admin.users()
      .then((usersRes) => {
        setUsers(usersRes.users);
      })
      .catch((err) => {
        console.error('Failed to load admin data:', err);
      })
      .finally(() => {
        setLoading(false);
      });
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
          (u.employee_number && u.employee_number.toLowerCase().includes(q)) ||
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

  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(params.page, pages);
  const pageRows = useMemo(
    () => sorted.slice((page - 1) * pageSize, page * pageSize),
    [sorted, page, pageSize],
  );

  useEffect(() => {
    if (params.page !== page) setPage(page);
  }, [params.page, page, setPage]);

  const getListParams = useCallback((): Record<string, string> => {
    const lp: Record<string, string> = {};
    if (activeFilter && activeFilter !== 'all') lp.active = activeFilter;
    if (params.search) lp.search = params.search;
    if (params.sort) {
      lp.sort_by = params.sort;
      lp.sort_dir = params.dir;
    }
    if (pageSize !== DEFAULT_PAGE_SIZE) lp.limit = String(pageSize);
    for (const [col, val] of Object.entries(params.columnFilters)) {
      if (val) lp[`cf.${col}`] = val;
    }
    return lp;
  }, [activeFilter, params.search, params.sort, params.dir, params.columnFilters, pageSize]);

  const columns = useMemo(
    () => buildUserColumns(tFields, tTable, tStates, tPage),
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
          {tPage('count', { count: total })}
        </div>
      </div>

      <DataTable
        columns={columns}
        data={pageRows}
        visibleColumns={params.cols}
        onColumnsChange={setCols}
        sortKey={params.sort}
        sortDir={params.dir}
        onSort={setSort}
        columnFilters={params.columnFilters}
        onColumnFilter={setColumnFilter}
        emptyMessage={params.search ? tPage('emptySearch', { query: params.search }) : tPage('empty')}
        onRowClick={(u) => navigate(`/admin/users/${u.id}`, { state: { listParams: getListParams() } })}
        pagination={{
          page,
          pages,
          total,
          onPageChange: setPage,
          pageSize,
          pageSizeOptions: PAGE_SIZE_OPTIONS,
          onPageSizeChange: setPageSize,
        }}
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
