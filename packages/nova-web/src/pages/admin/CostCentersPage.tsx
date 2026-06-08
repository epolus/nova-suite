/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useMemo } from 'react';
import { useTranslations } from 'use-intl';
import { admin, type CostCenterItem } from '../../api/client';
import MasterDataPage, { type ColumnDef, type FieldDef } from './MasterDataPage';

export default function CostCentersPage() {
  const t = useTranslations('pages.admin.costCenters');
  const tFields = useTranslations('common.fields');
  const tTable = useTranslations('common.table');

  const columns = useMemo((): ColumnDef<CostCenterItem>[] => [
    {
      key: 'code',
      label: tFields('code'),
      sortable: true,
      render: (cc) => <span className="font-mono text-xs font-medium text-gray-900">{cc.code}</span>,
    },
    {
      key: 'name',
      label: tFields('name'),
      sortable: true,
      render: (cc) => <span className="font-medium text-gray-900">{cc.name}</span>,
    },
    {
      key: 'description',
      label: tFields('description'),
      sortable: true,
      render: (cc) => <span className="text-gray-500">{cc.description || tTable('emDash')}</span>,
      className: 'max-w-xs truncate',
    },
    {
      key: 'user_count',
      label: tFields('users'),
      sortable: true,
      render: (cc) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
          {cc.user_count}
        </span>
      ),
    },
  ], [tFields, tTable]);

  const fields = useMemo((): FieldDef[] => [
    { key: 'code', label: tFields('code'), type: 'text', required: true, placeholder: t('placeholderCode') },
    { key: 'name', label: tFields('name'), type: 'text', required: true, placeholder: t('placeholderName') },
    { key: 'description', label: tFields('description'), type: 'textarea', placeholder: t('placeholderDescription') },
  ], [t, tFields]);

  const fetchItems = useCallback(async () => {
    const res = await admin.costCenters();
    return res.cost_centers;
  }, []);

  return (
    <MasterDataPage<CostCenterItem>
      title={t('title')}
      description={t('description')}
      storageKey="admin_costcenters"
      detailBasePath="/admin/cost-centers"
      columns={columns}
      fields={fields}
      fetchItems={fetchItems}
      createItem={(data) => admin.createCostCenter(data as { code: string; name: string; description?: string })}
      updateItem={(id, data) => admin.updateCostCenter(id, data)}
      getDefaults={(item) => ({
        code: item?.code ?? '',
        name: item?.name ?? '',
        description: item?.description ?? '',
      })}
      searchFilter={(item, q) =>
        item.code.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        (item.description?.toLowerCase().includes(q) ?? false)
      }
    />
  );
}
