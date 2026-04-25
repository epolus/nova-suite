/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { admin, type AssignmentGroupItem } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Spinner from '../../components/Spinner';
import SearchBar from '../../components/SearchBar';
import DataTable, { type DataColumnDef } from '../../components/DataTable';
import { useListParams } from '../../hooks/useListParams';

const DEFAULT_COLS = ['name', 'manager_name', 'member_count', 'processes', 'cost_center_name', '_status'];

const ALL_COLUMNS: DataColumnDef<AssignmentGroupItem>[] = [
  {
    key: 'name',
    label: 'Name',
    sortable: true,
    defaultVisible: true,
    render: (ag) => <span className="font-medium text-gray-900">{ag.name}</span>,
  },
  {
    key: 'description',
    label: 'Description',
    sortable: true,
    defaultVisible: false,
    className: 'max-w-xs truncate',
    render: (ag) => <span className="text-gray-500">{ag.description || '—'}</span>,
  },
  {
    key: 'manager_name',
    label: 'Manager',
    sortable: true,
    defaultVisible: true,
    render: (ag) => <span className="text-gray-700">{ag.manager_name || '—'}</span>,
  },
  {
    key: 'member_count',
    label: 'Members',
    sortable: true,
    defaultVisible: true,
    render: (ag) => <span className="text-gray-600">{ag.member_count}</span>,
  },
  {
    key: 'processes',
    label: 'Processes',
    sortable: false,
    defaultVisible: true,
    render: (ag) => (
      <div className="flex flex-wrap gap-1">
        {ag.processes.length > 0
          ? ag.processes.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
              >
                {p.name}
              </span>
            ))
          : <span className="text-gray-400">—</span>}
      </div>
    ),
  },
  {
    key: 'cost_center_name',
    label: 'Cost Center',
    sortable: true,
    defaultVisible: true,
    render: (ag) =>
      ag.cost_center_name ? (
        <span className="text-gray-600">
          {ag.cost_center_code} — {ag.cost_center_name}
        </span>
      ) : (
        <span className="text-gray-400">—</span>
      ),
  },
  {
    key: 'parent_group_name',
    label: 'Parent Group',
    sortable: true,
    defaultVisible: false,
    render: (ag) => <span className="text-gray-600">{ag.parent_group_name || '—'}</span>,
  },
  {
    key: '_status',
    label: 'Status',
    sortable: true,
    defaultVisible: true,
    render: (ag) =>
      ag.is_active ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          Active
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
          Inactive
        </span>
      ),
  },
];

export default function AssignmentGroupsPage() {
  const { params, setSearch, setSort, setCols, setFilter, setColumnFilter } = useListParams({
    defaultCols: DEFAULT_COLS,
    filterKeys: ['active'],
    storageKey: 'admin_groups',
  });

  const navigate = useNavigate();
  const [items, setItems] = useState<AssignmentGroupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const activeFilter = params.filters.active || 'all';

  const load = useCallback(async () => {
    try {
      const agRes = await admin.assignmentGroups();
      setItems(agRes.assignment_groups);
    } catch (err) {
      console.error('Failed to load:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = items;
    if (activeFilter === 'active') list = list.filter((i) => i.is_active);
    else if (activeFilter === 'inactive') list = list.filter((i) => !i.is_active);
    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter(
        (ag) =>
          ag.name.toLowerCase().includes(q) ||
          (ag.description?.toLowerCase().includes(q) ?? false) ||
          (ag.manager_name?.toLowerCase().includes(q) ?? false),
      );
    }
    for (const [col, val] of Object.entries(params.columnFilters)) {
      if (!val) continue;
      const lower = val.toLowerCase();
      list = list.filter((item) => {
        if (col === '_status') return (item.is_active ? 'active' : 'inactive').startsWith(lower);
        const raw = (item as unknown as Record<string, unknown>)[col];
        return raw != null && String(raw).toLowerCase().startsWith(lower);
      });
    }
    return list;
  }, [items, activeFilter, params.search, params.columnFilters]);

  const sorted = useMemo(() => {
    if (!params.sort) return filtered;
    return [...filtered].sort((a, b) => {
      const key = params.sort;
      let aVal: unknown;
      let bVal: unknown;
      if (key === '_status') {
        aVal = a.is_active ? 0 : 1;
        bVal = b.is_active ? 0 : 1;
      } else {
        aVal = (a as unknown as Record<string, unknown>)[key];
        bVal = (b as unknown as Record<string, unknown>)[key];
      }
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return -1;
      if (bVal == null) return 1;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return params.dir === 'desc' ? bVal - aVal : aVal - bVal;
      }
      const cmp = String(aVal).localeCompare(String(bVal), undefined, { sensitivity: 'base' });
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

  if (loading) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Assignment Groups"
        description="Manage assignment groups for incident routing and team organization."
        action={
          <button
            onClick={() => navigate('/admin/assignment-groups/new', { state: { listParams: getListParams() } })}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            + New Group
          </button>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="w-full sm:w-80">
          <SearchBar value={params.search} onChange={setSearch} placeholder="Search groups..." />
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
              {f}
            </button>
          ))}
        </div>
        <div className="ml-auto text-sm text-gray-500 self-center">
          {sorted.length} group{sorted.length !== 1 ? 's' : ''}
        </div>
      </div>

      <DataTable
        columns={ALL_COLUMNS}
        data={sorted}
        visibleColumns={params.cols}
        onColumnsChange={setCols}
        sortKey={params.sort}
        sortDir={params.dir}
        onSort={setSort}
        columnFilters={params.columnFilters}
        onColumnFilter={setColumnFilter}
        emptyMessage={params.search ? `No results for "${params.search}"` : 'No assignment groups found.'}
        onRowClick={(item) => navigate(`/admin/assignment-groups/${item.id}`, { state: { listParams: getListParams() } })}
      />
    </>
  );
}
