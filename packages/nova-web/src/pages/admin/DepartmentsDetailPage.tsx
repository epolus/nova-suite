/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback } from 'react';
import { admin, type DepartmentItem } from '../../api/client';
import type { FieldDef } from './MasterDataPage';
import MasterDataDetailPage from './MasterDataDetailPage';

const fields: FieldDef[] = [
  { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Engineering' },
  { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Brief description of the department' },
];

export default function DepartmentsDetailPage() {
  const fetchItems = useCallback(async () => {
    const res = await admin.departments();
    return res.departments;
  }, []);

  return (
    <MasterDataDetailPage<DepartmentItem>
      title="Departments"
      basePath="/admin/departments"
      fields={fields}
      fetchItems={fetchItems}
      createItem={(data) => admin.createDepartment(data as { name: string; description?: string })}
      updateItem={(id, data) => admin.updateDepartment(id, data)}
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
