/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'use-intl';
import { admin, type CostCenterItem, type DepartmentItem } from '../../api/client';
import MasterDataPage, { type ColumnDef, type FieldDef } from './MasterDataPage';

export default function DepartmentsPage() {
  const t = useTranslations('pages.admin.departments');
  const tFields = useTranslations('common.fields');
  const tTable = useTranslations('common.table');
  const tStates = useTranslations('common.states');

  const columns = useMemo((): ColumnDef<DepartmentItem>[] => [
    {
      key: 'name',
      label: tFields('name'),
      sortable: true,
      render: (d) => <span className="font-medium text-gray-900">{d.name}</span>,
    },
    {
      key: 'description',
      label: tFields('description'),
      sortable: true,
      render: (d) => <span className="text-gray-500">{d.description || tTable('emDash')}</span>,
      className: 'max-w-xs truncate',
    },
    {
      key: 'parent_department_name',
      label: tFields('parentDepartment'),
      sortable: true,
      render: (d) => <span className="text-gray-500">{d.parent_department_name || tTable('emDash')}</span>,
    },
    {
      key: 'cost_center_name',
      label: tFields('costCenter'),
      sortable: true,
      render: (d) => <span className="text-gray-500">{d.cost_center_name || tTable('emDash')}</span>,
    },
    {
      key: 'user_count',
      label: tFields('users'),
      sortable: true,
      render: (d) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
          {d.user_count}
        </span>
      ),
    },
  ], [tFields, tTable]);

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

  const noneOption = `— ${tStates('none')} —`;

  const fields: FieldDef[] = useMemo(() => [
    { key: 'name', label: tFields('name'), type: 'text', required: true, placeholder: t('placeholderName') },
    { key: 'description', label: tFields('description'), type: 'textarea', placeholder: t('placeholderDescription') },
    {
      key: 'parent_department_id',
      label: tFields('parentDepartment'),
      type: 'select',
      options: [
        { value: '', label: noneOption },
        ...allDepartmentsForOptions
          .filter((d) => d.is_active)
          .map((d) => ({ value: d.id, label: d.name })),
      ],
    },
    {
      key: 'cost_center_id',
      label: tFields('costCenter'),
      type: 'select',
      options: [
        { value: '', label: noneOption },
        ...allCostCentersForOptions
          .filter((cc) => cc.is_active)
          .map((cc) => ({ value: cc.id, label: `${cc.code} - ${cc.name}` })),
      ],
    },
  ], [allCostCentersForOptions, allDepartmentsForOptions, noneOption, t, tFields]);

  return (
    <MasterDataPage<DepartmentItem>
      title={t('title')}
      description={t('description')}
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
