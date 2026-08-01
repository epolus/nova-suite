/* SPDX-License-Identifier: AGPL-3.0-only */
import { useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslations } from 'use-intl';
import PageHeader from '../../components/PageHeader';
import SearchBar from '../../components/SearchBar';
import DataTable, { type DataColumnDef } from '../../components/DataTable';
import Spinner from '../../components/Spinner';
import Badge from '../../components/Badge';
import { useMajorIncidentsList } from '../../hooks/queries';
import { useListParams } from '../../hooks/useListParams';
import { formatDate } from '../../utils/dateTime';
import { useStatusLabel } from '@/i18n/hooks';
import { MAJOR_INCIDENT_STATUS_OPTIONS } from './majorIncidentListConfig';

export interface MajorIncidentListItem {
  id: string;
  number: string;
  title: string;
  status: string;
  priority: number;
  declared_major_at: string | null;
  participant_count?: number;
}

const DEFAULT_COLS = ['number', 'title', 'status', 'priority', 'declared_major_at', 'participant_count'];

function createMajorIncidentListParams(args: {
  statusFilter: string;
  search: string;
  sort: string;
  dir: string;
}): Record<string, string> {
  const apiParams: Record<string, string> = {};
  if (args.statusFilter === 'active') {
    apiParams.status_not_in = 'resolved,cancelled';
  } else if (args.statusFilter !== 'all') {
    apiParams.status = args.statusFilter;
  }
  if (args.search) apiParams.search = args.search;
  if (args.sort) {
    apiParams.sort_by = args.sort;
    apiParams.sort_dir = args.dir;
  }
  return apiParams;
}

function buildColumns(
  listParams: Record<string, string>,
  tFields: ReturnType<typeof useTranslations<'common.fields'>>,
  tTable: ReturnType<typeof useTranslations<'common.table'>>,
): DataColumnDef<MajorIncidentListItem>[] {
  return [
    {
      key: 'number',
      label: tFields('number'),
      sortable: true,
      defaultVisible: true,
      className: 'whitespace-nowrap font-mono text-xs',
      render: (row) => (
        <Link
          to={`/major-incidents/${row.id}`}
          state={{ listParams }}
          className="text-indigo-600 font-medium hover:text-indigo-800"
          onClick={(e) => e.stopPropagation()}
        >
          {row.number}
        </Link>
      ),
    },
    {
      key: 'title',
      label: tFields('title'),
      sortable: true,
      defaultVisible: true,
      className: 'max-w-xs truncate',
      render: (row) => (
        <Link
          to={`/major-incidents/${row.id}`}
          state={{ listParams }}
          className="text-indigo-600 font-medium hover:text-indigo-800"
          onClick={(e) => e.stopPropagation()}
        >
          {row.title}
        </Link>
      ),
    },
    {
      key: 'status',
      label: tFields('status'),
      sortable: true,
      defaultVisible: true,
      render: (row) => <Badge value={row.status} />,
    },
    {
      key: 'priority',
      label: tFields('priority'),
      sortable: true,
      defaultVisible: true,
      render: (row) => (
        <span className={`text-xs font-bold ${row.priority <= 1 ? 'text-red-600' : 'text-orange-600'}`}>
          P{row.priority}
        </span>
      ),
    },
    {
      key: 'declared_major_at',
      label: tFields('declared'),
      sortable: true,
      defaultVisible: true,
      render: (row) => (
        <span className="text-gray-500 text-xs">{row.declared_major_at ? formatDate(row.declared_major_at) : tTable('emDash')}</span>
      ),
    },
    {
      key: 'participant_count',
      label: tFields('participants'),
      sortable: false,
      defaultVisible: true,
      render: (row) => <span className="text-gray-600 text-sm">{row.participant_count ?? tTable('emDash')}</span>,
    },
  ];
}

export default function MajorIncidentsPage() {
  const t = useTranslations('pages.majorIncidents');
  const tFields = useTranslations('common.fields');
  const tTable = useTranslations('common.table');
  const tStates = useTranslations('common.states');
  const statusLabelFn = useStatusLabel();

  const { params, setSearch, setSort, setCols, setPage, setFilter } = useListParams({
    defaultCols: DEFAULT_COLS,
    filterKeys: ['status'],
    storageKey: 'major_incidents',
  });

  const navigate = useNavigate();

  const rawStatusFilter = params.filters.status || '';
  const statusFilter = rawStatusFilter || 'active';

  const apiParams = useMemo(
    () =>
      createMajorIncidentListParams({
        statusFilter,
        search: params.search,
        sort: params.sort,
        dir: params.dir,
      }),
    [statusFilter, params.search, params.sort, params.dir],
  );

  const { data: listResult, isLoading: loading, error: listError } = useMajorIncidentsList(
    apiParams,
    params.page,
    20,
  );

  const data = (listResult?.major_incidents ?? []) as unknown as MajorIncidentListItem[];
  const total = listResult?.total ?? 0;
  const err = listError instanceof Error ? listError.message : listError ? t('loadFailed') : '';

  const getListParams = useCallback((): Record<string, string> => {
    return createMajorIncidentListParams({
      statusFilter,
      search: params.search,
      sort: params.sort,
      dir: params.dir,
    });
  }, [statusFilter, params.search, params.sort, params.dir]);

  const columns = useMemo(
    () => buildColumns(getListParams(), tFields, tTable),
    [getListParams, tFields, tTable],
  );

  const pages = Math.max(1, Math.ceil(total / 20));

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
      />
      {err && <p className="text-sm text-red-600 mb-4">{err}</p>}

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="w-full sm:w-80">
          <SearchBar value={params.search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {MAJOR_INCIDENT_STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter('status', s === 'active' ? '' : s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors capitalize ${
                statusFilter === s ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {s === 'active' ? tStates('active') : s === 'all' ? tStates('all') : statusLabelFn(s)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <DataTable
          columns={columns}
          data={data}
          visibleColumns={params.cols}
          onColumnsChange={setCols}
          sortKey={params.sort}
          sortDir={params.dir}
          onSort={setSort}
          emptyMessage={params.search ? t('emptySearch', { query: params.search }) : t('empty')}
          onRowClick={(row) => navigate(`/major-incidents/${row.id}`, { state: { listParams: getListParams() } })}
          pagination={
            pages > 1
              ? {
                  page: params.page,
                  pages,
                  total,
                  onPageChange: setPage,
                }
              : undefined
          }
        />
      )}
    </>
  );
}
