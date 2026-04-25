/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { admin, type DepartmentItem } from '../../api/client';
import type { FieldDef } from './MasterDataPage';
import MasterDataDetailPage from './MasterDataDetailPage';

export default function DepartmentsDetailPage() {
  const fetchItems = useCallback(async () => {
    const res = await admin.departments();
    return res.departments;
  }, []);
  const [allDepartmentsForOptions, setAllDepartmentsForOptions] = useState<DepartmentItem[]>([]);

  useEffect(() => {
    let active = true;
    admin.departments().then((res) => {
      if (active) setAllDepartmentsForOptions(res.departments);
    }).catch(() => {
      if (active) setAllDepartmentsForOptions([]);
    });
    return () => {
      active = false;
    };
  }, []);

  const fields: FieldDef[] = useMemo(() => [
    { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Engineering' },
    { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Brief description of the department' },
    {
      key: 'parent_department_id',
      label: 'Parent Department',
      type: 'select',
      options: [
        { value: '', label: '— None —' },
        ...allDepartmentsForOptions
          .filter((d) => d.is_active)
          .map((d) => ({ value: d.id, label: d.name })),
      ],
    },
  ], [allDepartmentsForOptions]);

  return (
    <MasterDataDetailPage<DepartmentItem>
      title="Departments"
      basePath="/admin/departments"
      fields={fields}
      fetchItems={fetchItems}
      createItem={(data) => admin.createDepartment(data as { name: string; description?: string; parent_department_id?: string })}
      updateItem={(id, data) => admin.updateDepartment(id, data)}
      getDefaults={(item) => ({
        name: item?.name ?? '',
        description: item?.description ?? '',
        parent_department_id: item?.parent_department_id ?? '',
      })}
      searchFilter={(item, q) =>
        item.name.toLowerCase().includes(q) ||
        (item.description?.toLowerCase().includes(q) ?? false) ||
        (item.parent_department_name?.toLowerCase().includes(q) ?? false)
      }
    />
  );
}
