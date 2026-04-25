/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback } from 'react';
import { admin, type CostCenterItem } from '../../api/client';
import MasterDataPage, { type ColumnDef, type FieldDef } from './MasterDataPage';

const columns: ColumnDef<CostCenterItem>[] = [
  {
    key: 'code',
    label: 'Code',
    sortable: true,
    render: (cc) => <span className="font-mono text-xs font-medium text-gray-900">{cc.code}</span>,
  },
  {
    key: 'name',
    label: 'Name',
    sortable: true,
    render: (cc) => <span className="font-medium text-gray-900">{cc.name}</span>,
  },
  {
    key: 'description',
    label: 'Description',
    sortable: true,
    render: (cc) => <span className="text-gray-500">{cc.description || '—'}</span>,
    className: 'max-w-xs truncate',
  },
  {
    key: 'user_count',
    label: 'Users',
    sortable: true,
    render: (cc) => (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
        {cc.user_count}
      </span>
    ),
  },
];

const fields: FieldDef[] = [
  { key: 'code', label: 'Code', type: 'text', required: true, placeholder: 'e.g. CC-ENG-002' },
  { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Engineering R&D' },
  { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Purpose of this cost center' },
];

export default function CostCentersPage() {
  const fetchItems = useCallback(async () => {
    const res = await admin.costCenters();
    return res.cost_centers;
  }, []);

  return (
    <MasterDataPage<CostCenterItem>
      title="Cost Centers"
      description="Manage cost centers for budgeting and chargebacks."
      storageKey="admin_costcenters"
      detailBasePath="/admin/cost-centers"
      columns={columns}
      fields={fields}
      fetchItems={fetchItems}
      createItem={(data) => admin.createCostCenter(data as { code: string; name: string; description?: string })}
      updateItem={(id, data) => admin.updateCostCenter(id, data)}
      getDefaults={(item) => ({
        code: item?.code ?? '',
        name: item?.name ?? '',
        description: item?.description ?? '',
      })}
      searchFilter={(item, q) =>
        item.code.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        (item.description?.toLowerCase().includes(q) ?? false)
      }
    />
  );
}
