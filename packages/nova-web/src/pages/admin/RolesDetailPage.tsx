/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback } from 'react';
import { admin, type RoleItem } from '../../api/client';
import type { FieldDef } from './MasterDataPage';
import MasterDataDetailPage from './MasterDataDetailPage';

const fields: FieldDef[] = [
  { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. change_manager' },
  { key: 'description', label: 'Description', type: 'textarea', placeholder: 'What this role allows the user to do' },
];

export default function RolesDetailPage() {
  const fetchItems = useCallback(async () => {
    const res = await admin.roles();
    return res.roles;
  }, []);

  return (
    <MasterDataDetailPage<RoleItem>
      title="Roles"
      basePath="/admin/roles"
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
