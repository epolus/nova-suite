/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useTranslations } from 'use-intl';
import { admin, type AdminUser, type CostCenterItem, type DepartmentItem } from '../../api/client';
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
      key: 'manager_name',
      label: tFields('manager'),
      sortable: true,
      render: (d) =>
        d.manager_id && d.manager_name ? (
          <Link
            to={`/admin/users/${d.manager_id}`}
            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            onClick={(e) => e.stopPropagation()}
          >
            {d.manager_name}
          </Link>
        ) : (
          <span className="text-gray-400">{tTable('emDash')}</span>
        ),
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
  const [allUsersForOptions, setAllUsersForOptions] = useState<AdminUser[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([admin.departments(), admin.costCenters(), admin.users()])
      .then(([departmentsRes, costCentersRes, usersRes]) => {
        if (!active) return;
        setAllDepartmentsForOptions(departmentsRes.departments);
        setAllCostCentersForOptions(costCentersRes.cost_centers);
        setAllUsersForOptions(usersRes.users);
      })
      .catch(() => {
        if (!active) return;
        setAllDepartmentsForOptions([]);
        setAllCostCentersForOptions([]);
        setAllUsersForOptions([]);
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
    {
      key: 'manager_id',
      label: tFields('manager'),
      type: 'select',
      options: [
        { value: '', label: noneOption },
        ...allUsersForOptions
          .filter((u) => u.is_active || allDepartmentsForOptions.some((d) => d.manager_id === u.id))
          .map((u) => ({ value: u.id, label: u.display_name })),
      ],
    },
  ], [allCostCentersForOptions, allDepartmentsForOptions, allUsersForOptions, noneOption, t, tFields]);

  return (
    <MasterDataPage<DepartmentItem>
      title={t('title')}
      description={t('description')}
      storageKey="admin_departments"
      detailBasePath="/admin/departments"
      columns={columns}
      fields={fields}
      fetchItems={fetchItems}
      createItem={(data) => admin.createDepartment(data as {
        name: string;
        description?: string;
        parent_department_id?: string;
        cost_center_id?: string;
        manager_id?: string | null;
      })}
      updateItem={(id, data) => admin.updateDepartment(id, data)}
      getDefaults={(item) => ({
        name: item?.name ?? '',
        description: item?.description ?? '',
        parent_department_id: item?.parent_department_id ?? '',
        cost_center_id: item?.cost_center_id ?? '',
        manager_id: item?.manager_id ?? '',
      })}
      searchFilter={(item, q) =>
        item.name.toLowerCase().includes(q) ||
        (item.description?.toLowerCase().includes(q) ?? false) ||
        (item.parent_department_name?.toLowerCase().includes(q) ?? false) ||
        (item.cost_center_name?.toLowerCase().includes(q) ?? false) ||
        (item.cost_center_code?.toLowerCase().includes(q) ?? false) ||
        (item.manager_name?.toLowerCase().includes(q) ?? false)
      }
    />
  );
}
