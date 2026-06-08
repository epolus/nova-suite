/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'use-intl';
import { admin, type CostCenterItem, type DepartmentItem } from '../../api/client';
import type { FieldDef } from './MasterDataPage';
import MasterDataDetailPage from './MasterDataDetailPage';

export default function DepartmentsDetailPage() {
  const t = useTranslations('pages.admin.departments');
  const tFields = useTranslations('common.fields');
  const tStates = useTranslations('common.states');

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
  ], [t, tFields, noneOption, allCostCentersForOptions, allDepartmentsForOptions]);

  return (
    <MasterDataDetailPage<DepartmentItem>
      title={t('title')}
      basePath="/admin/departments"
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
