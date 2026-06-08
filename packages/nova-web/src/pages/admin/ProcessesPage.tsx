/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useMemo } from 'react';
import { useTranslations } from 'use-intl';
import { admin, type ProcessItem } from '../../api/client';
import MasterDataPage, { type ColumnDef, type FieldDef } from './MasterDataPage';

export default function ProcessesPage() {
  const t = useTranslations('pages.admin.processes');
  const tFields = useTranslations('common.fields');
  const tTable = useTranslations('common.table');

  const columns = useMemo((): ColumnDef<ProcessItem>[] => [
    {
      key: 'name',
      label: tFields('name'),
      sortable: true,
      render: (p) => <span className="font-medium text-gray-900">{p.name}</span>,
    },
    {
      key: 'description',
      label: tFields('description'),
      sortable: true,
      render: (p) => <span className="text-gray-500">{p.description || tTable('emDash')}</span>,
      className: 'max-w-md',
    },
    {
      key: 'group_count',
      label: tFields('groups'),
      sortable: true,
      render: (p) => <span className="text-gray-600">{p.group_count}</span>,
    },
  ], [tFields, tTable]);

  const fields = useMemo((): FieldDef[] => [
    { key: 'name', label: tFields('name'), type: 'text', required: true, placeholder: t('placeholderName') },
    { key: 'description', label: tFields('description'), type: 'textarea', placeholder: t('placeholderDescription') },
  ], [t, tFields]);

  const fetchItems = useCallback(async () => {
    const res = await admin.processes();
    return res.processes;
  }, []);

  return (
    <MasterDataPage<ProcessItem>
      title={t('title')}
      description={t('description')}
      storageKey="admin_processes"
      columns={columns}
      fields={fields}
      fetchItems={fetchItems}
      createItem={(data) => admin.createProcess(data as { name: string; description?: string })}
      updateItem={(id, data) => admin.updateProcess(id, data)}
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
