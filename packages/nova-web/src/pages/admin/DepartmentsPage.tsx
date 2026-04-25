/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { admin, type CostCenterItem, type DepartmentItem } from '../../api/client';
import MasterDataPage, { type ColumnDef, type FieldDef } from './MasterDataPage';

const columns: ColumnDef<DepartmentItem>[] = [
  {
    key: 'name',
    label: 'Name',
    sortable: true,
    render: (d) => <span className="font-medium text-gray-900">{d.name}</span>,
  },
  {
    key: 'description',
    label: 'Description',
    sortable: true,
    render: (d) => <span className="text-gray-500">{d.description || '—'}</span>,
    className: 'max-w-xs truncate',
  },
  {
    key: 'parent_department_name',
    label: 'Parent Department',
    sortable: true,
    render: (d) => <span className="text-gray-500">{d.parent_department_name || '—'}</span>,
  },
  {
    key: 'cost_center_name',
    label: 'Cost Center',
    sortable: true,
    render: (d) => <span className="text-gray-500">{d.cost_center_name || '—'}</span>,
  },
  {
    key: 'user_count',
    label: 'Users',
    sortable: true,
    render: (d) => (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
        {d.user_count}
      </span>
    ),
  },
];

export default function DepartmentsPage() {
  const fetchItems = useCallback(async () => {
    const res = await admin.departments();
    return res.departments;
  }, []);
  const [allDepartmentsForOptions, setAllDepartmentsForOptions] = useState<DepartmentItem[]>([]);
  const [allCostCentersForOptions, setAllCostCentersForOptions] = useState<CostCenterItem[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([admin.departments(), admin.costCenters()])
      .then(([departmentsRes, costCentersRes]) => {
        if (!active) return;
        setAllDepartmentsForOptions(departmentsRes.departments);
        setAllCostCentersForOptions(costCentersRes.cost_centers);
      })
      .catch(() => {
        if (!active) return;
        setAllDepartmentsForOptions([]);
        setAllCostCentersForOptions([]);
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
    {
      key: 'cost_center_id',
      label: 'Cost Center',
      type: 'select',
      options: [
        { value: '', label: '— None —' },
        ...allCostCentersForOptions
          .filter((cc) => cc.is_active)
          .map((cc) => ({ value: cc.id, label: `${cc.code} - ${cc.name}` })),
      ],
    },
  ], [allCostCentersForOptions, allDepartmentsForOptions]);

  return (
    <MasterDataPage<DepartmentItem>
      title="Departments"
      description="Manage organizational departments."
      storageKey="admin_departments"
      detailBasePath="/admin/departments"
      columns={columns}
      fields={fields}
      fetchItems={fetchItems}
      createItem={(data) => admin.createDepartment(data as { name: string; description?: string; parent_department_id?: string; cost_center_id?: string })}
      updateItem={(id, data) => admin.updateDepartment(id, data)}
      getDefaults={(item) => ({
        name: item?.name ?? '',
        description: item?.description ?? '',
        parent_department_id: item?.parent_department_id ?? '',
        cost_center_id: item?.cost_center_id ?? '',
      })}
      searchFilter={(item, q) =>
        item.name.toLowerCase().includes(q) ||
        (item.description?.toLowerCase().includes(q) ?? false) ||
        (item.parent_department_name?.toLowerCase().includes(q) ?? false) ||
        (item.cost_center_name?.toLowerCase().includes(q) ?? false) ||
        (item.cost_center_code?.toLowerCase().includes(q) ?? false)
      }
    />
  );
}
