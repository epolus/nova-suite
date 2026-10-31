/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import type { Category, ServiceItem } from '../../api/client';
import type { DataColumnDef } from '../../components/DataTable';
import { formatCurrency } from '../../utils/currency';

export function buildServiceItemColumns(
  t: ReturnType<typeof useTranslations<'pages.admin.serviceItems'>>,
  tFields: ReturnType<typeof useTranslations<'common.fields'>>,
  tTable: ReturnType<typeof useTranslations<'common.table'>>,
  tStates: ReturnType<typeof useTranslations<'common.states'>>,
  currencyCode: string,
): DataColumnDef<ServiceItem>[] {
  return [
    {
      key: 'name',
      label: tFields('name'),
      sortable: true,
      render: (item) => (
        <div className="min-w-0">
          <p className={`font-medium truncate ${item.is_active ? 'text-gray-900' : 'text-gray-400'}`}>{item.name}</p>
        </div>
      ),
    },
    {
      key: 'category_name',
      label: tFields('category'),
      sortable: true,
      render: (item) => <span className="text-gray-600">{item.category_name || tTable('emDash')}</span>,
    },
    {
      key: 'short_description',
      label: tFields('shortDescription'),
      sortable: true,
      render: (item) => (
        <span className="text-gray-500 line-clamp-2">{item.short_description || tTable('emDash')}</span>
      ),
    },
    {
      key: 'price',
      label: tFields('price'),
      sortable: true,
      render: (item) => (
        <span className="text-gray-700">
          {item.price != null ? formatCurrency(Number(item.price), currencyCode) : tTable('emDash')}
        </span>
      ),
    },
    {
      key: 'sla_hours',
      label: tFields('sla'),
      sortable: true,
      defaultVisible: false,
      render: (item) => <span className="text-gray-500">{t('slaHours', { hours: item.sla_hours })}</span>,
    },
    {
      key: 'approval_required',
      label: t('approval'),
      sortable: true,
      defaultVisible: false,
      render: (item) => (
        item.approval_required
          ? <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{t('managerApproval')}</span>
          : <span className="text-gray-400">{tTable('emDash')}</span>
      ),
    },
    {
      key: 'task_count',
      label: t('tasks'),
      sortable: true,
      render: (item) => <span className="text-gray-600">{item.task_count ?? 0}</span>,
    },
    {
      key: '_status',
      label: tFields('status'),
      sortable: true,
      render: (item) =>
        item.is_active ? (
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
  ];
}

export function serviceItemSortValue(item: ServiceItem, key: string): unknown {
  if (key === '_status') return item.is_active ? 0 : 1;
  if (key === 'task_count') return item.task_count ?? 0;
  if (key === 'price') return item.price == null ? null : Number(item.price);
  if (key === 'approval_required') return item.approval_required ? 1 : 0;
  return (item as unknown as Record<string, unknown>)[key];
}

export function compareServiceItemValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
}

export function withServiceItemListMeta(item: ServiceItem, categories: Category[], previous?: ServiceItem): ServiceItem {
  return {
    ...item,
    category_name: item.category_name
      ?? categories.find((c) => c.id === item.category_id)?.name
      ?? previous?.category_name,
    task_count: item.task_count ?? previous?.task_count ?? 0,
  };
}
