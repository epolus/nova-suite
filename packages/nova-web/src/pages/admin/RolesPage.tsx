/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useMemo } from 'react';
import { useTranslations } from 'use-intl';
import { admin, type RoleItem } from '../../api/client';
import MasterDataPage, { type ColumnDef, type FieldDef } from './MasterDataPage';

export default function RolesPage() {
  const t = useTranslations('pages.admin.roles');
  const tFields = useTranslations('common.fields');
  const tTable = useTranslations('common.table');

  const columns = useMemo((): ColumnDef<RoleItem>[] => [
    {
      key: 'name',
      label: tFields('name'),
      sortable: true,
      render: (r) => (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
          {r.name}
        </span>
      ),
    },
    {
      key: 'description',
      label: tFields('description'),
      sortable: true,
      render: (r) => <span className="text-gray-500">{r.description || tTable('emDash')}</span>,
      className: 'max-w-md',
    },
  ], [tFields, tTable]);

  const fields = useMemo((): FieldDef[] => [
    { key: 'name', label: tFields('name'), type: 'text', required: true, placeholder: t('placeholderName') },
    { key: 'description', label: tFields('description'), type: 'textarea', placeholder: t('placeholderDescription') },
  ], [t, tFields]);

  const fetchItems = useCallback(async () => {
    const res = await admin.roles();
    return res.roles;
  }, []);

  return (
    <MasterDataPage<RoleItem>
      title={t('title')}
      description={t('description')}
      storageKey="admin_roles"
      detailBasePath="/admin/roles"
      columns={columns}
      fields={fields}
      fetchItems={fetchItems}
      createItem={(data) => admin.createRole(data as { name: string; description?: string })}
      updateItem={(id, data) => admin.updateRole(id, data)}
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
