/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslations } from 'use-intl';
import { assets } from '@/api/client';
import type { Asset } from '@/api/client';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import Spinner from '@/components/Spinner';
import SearchBar from '@/components/SearchBar';
import DataTable, { type DataColumnDef } from '@/components/DataTable';
import { useListParams } from '@/hooks/useListParams';
import { formatDateTime } from '@/utils/dateTime';

const DEFAULT_COLS = ['asset_tag', 'name', 'category', 'status', 'owner_name', 'linked_ci_name', 'updated_at'];

function columnValue(asset: Asset, key: string): string {
  if (key === 'updated_at') return asset.updated_at || '';
  const raw = (asset as unknown as Record<string, unknown>)[key];
  return raw == null ? '' : String(raw);
}

export default function AssetsPage() {
  const navigate = useNavigate();
  const t = useTranslations('pages.assets');
  const tTable = useTranslations('common.table');
  const { params, setSearch, setSort, setCols, setColumnFilter } = useListParams({
    defaultCols: DEFAULT_COLS,
    storageKey: 'assets',
  });
  const [items, setItems] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    assets.list()
      .then((res) => setItems(res.assets))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : t('loadFailed')))
      .finally(() => setLoading(false));
  }, [t]);

  const filtered = useMemo(() => {
    let list = items;
    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter((asset) => (
        asset.asset_tag.toLowerCase().includes(q)
        || asset.name.toLowerCase().includes(q)
        || asset.category.toLowerCase().includes(q)
        || asset.status.toLowerCase().includes(q)
        || (asset.owner_name || '').toLowerCase().includes(q)
        || (asset.linked_ci_name || '').toLowerCase().includes(q)
      ));
    }
    for (const [col, val] of Object.entries(params.columnFilters)) {
      if (!val) continue;
      const lower = val.toLowerCase();
      list = list.filter((asset) => columnValue(asset, col).toLowerCase().startsWith(lower));
    }
    return list;
  }, [items, params.search, params.columnFilters]);

  const sorted = useMemo(() => {
    if (!params.sort) return filtered;
    return [...filtered].sort((a, b) => {
      const cmp = columnValue(a, params.sort).localeCompare(columnValue(b, params.sort), undefined, { sensitivity: 'base', numeric: true });
      return params.dir === 'desc' ? -cmp : cmp;
    });
  }, [filtered, params.sort, params.dir]);

  const columns = useMemo((): DataColumnDef<Asset>[] => [
    {
      key: 'asset_tag',
      label: t('assetTag'),
      sortable: true,
      render: (asset) => <span className="font-medium text-indigo-700">{asset.asset_tag}</span>,
    },
    {
      key: 'name',
      label: t('name'),
      sortable: true,
      render: (asset) => <span className="text-gray-900">{asset.name}</span>,
    },
    {
      key: 'category',
      label: t('category'),
      sortable: true,
      render: (asset) => <span className="capitalize text-gray-600">{asset.category}</span>,
    },
    {
      key: 'status',
      label: t('status'),
      sortable: true,
      render: (asset) => <Badge value={asset.status} />,
    },
    {
      key: 'owner_name',
      label: t('owner'),
      sortable: true,
      render: (asset) => <span className="text-gray-600">{asset.owner_name || tTable('emDash')}</span>,
    },
    {
      key: 'linked_ci_name',
      label: t('configurationItem'),
      sortable: true,
      render: (asset) => asset.linked_ci_id ? (
        <Link
          to={`/cmdb/${asset.linked_ci_id}`}
          onClick={(event) => event.stopPropagation()}
          className="text-indigo-700 hover:underline"
        >
          {asset.linked_ci_name || asset.linked_ci_id}
        </Link>
      ) : (
        <span className="text-gray-400">{tTable('emDash')}</span>
      ),
    },
    {
      key: 'updated_at',
      label: t('updated'),
      sortable: true,
      render: (asset) => <span className="text-gray-500">{formatDateTime(asset.updated_at)}</span>,
    },
  ], [t, tTable]);

  if (loading) return <Spinner />;

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        action={
          <Link to="/assets/new" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
            {t('newAsset')}
          </Link>
        }
      />
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="w-full sm:w-80">
          <SearchBar value={params.search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
        </div>
        <div className="ml-auto text-sm text-gray-500 self-center">
          {t('count', { count: sorted.length })}
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
        emptyMessage={params.search ? t('emptySearch', { query: params.search }) : t('empty')}
        onRowClick={(asset) => navigate(`/assets/${asset.id}`)}
      />
    </>
  );
}
