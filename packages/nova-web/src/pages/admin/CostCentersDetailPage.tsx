/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback } from 'react';
import { admin, type CostCenterItem } from '../../api/client';
import type { FieldDef } from './MasterDataPage';
import MasterDataDetailPage from './MasterDataDetailPage';

const fields: FieldDef[] = [
  { key: 'code', label: 'Code', type: 'text', required: true, placeholder: 'e.g. CC-ENG-002' },
  { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Engineering R&D' },
  { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Purpose of this cost center' },
];

export default function CostCentersDetailPage() {
  const fetchItems = useCallback(async () => {
    const res = await admin.costCenters();
    return res.cost_centers;
  }, []);

  return (
    <MasterDataDetailPage<CostCenterItem>
      title="Cost Centers"
      basePath="/admin/cost-centers"
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
