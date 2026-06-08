/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useMemo } from 'react';
import { useTranslations } from 'use-intl';
import { admin, type ServiceAdminItem } from '../../api/client';
import MasterDataPage, { type ColumnDef, type FieldDef } from './MasterDataPage';

export default function ServicesPage() {
  const t = useTranslations('pages.admin.services');
  const tFields = useTranslations('common.fields');
  const tTable = useTranslations('common.table');

  const columns = useMemo((): ColumnDef<ServiceAdminItem>[] => [
    {
      key: 'name',
      label: tFields('name'),
      sortable: true,
      render: (s) => <span className="font-medium text-gray-900">{s.name}</span>,
    },
    {
      key: 'description',
      label: tFields('description'),
      sortable: true,
      render: (s) => <span className="text-gray-500">{s.description || tTable('emDash')}</span>,
      className: 'max-w-xs truncate',
    },
  ], [tFields, tTable]);

  const fields = useMemo((): FieldDef[] => [
    { key: 'name', label: tFields('name'), type: 'text', required: true, placeholder: t('placeholderName') },
    { key: 'description', label: tFields('description'), type: 'textarea', placeholder: t('placeholderDescription') },
  ], [t, tFields]);

  const fetchItems = useCallback(async () => {
    const res = await admin.services();
    return res.services;
  }, []);

  return (
    <MasterDataPage<ServiceAdminItem>
      title={t('title')}
      description={t('description')}
      storageKey="admin_services"
      columns={columns}
      fields={fields}
      fetchItems={fetchItems}
      createItem={(data) => admin.createService(data as { name: string; description?: string })}
      updateItem={(id, data) => admin.updateService(id, data)}
      getDefaults={(item) => ({
        name: item?.name ?? '',
        description: item?.description ?? '',
      })}
      searchFilter={(item, q) =>
        item.name.toLowerCase().includes(q) ||
        (item.description?.toLowerCase().includes(q) ?? false)
      }
    />
  );
}
