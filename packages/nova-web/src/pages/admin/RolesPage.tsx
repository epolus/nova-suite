/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback } from 'react';
import { admin, type RoleItem } from '../../api/client';
import MasterDataPage, { type ColumnDef, type FieldDef } from './MasterDataPage';

const columns: ColumnDef<RoleItem>[] = [
  {
    key: 'name',
    label: 'Name',
    sortable: true,
    render: (r) => (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
        {r.name}
      </span>
    ),
  },
  {
    key: 'description',
    label: 'Description',
    sortable: true,
    render: (r) => <span className="text-gray-500">{r.description || '—'}</span>,
    className: 'max-w-md',
  },
];

const fields: FieldDef[] = [
  { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. change_manager' },
  { key: 'description', label: 'Description', type: 'textarea', placeholder: 'What this role allows the user to do' },
];

export default function RolesPage() {
  const fetchItems = useCallback(async () => {
    const res = await admin.roles();
    return res.roles;
  }, []);

  return (
    <MasterDataPage<RoleItem>
      title="Roles"
      description="Manage roles that can be assigned to users."
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
