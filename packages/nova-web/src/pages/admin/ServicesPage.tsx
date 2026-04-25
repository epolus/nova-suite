/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback } from 'react';
import { admin, type ServiceAdminItem } from '../../api/client';
import MasterDataPage, { type ColumnDef, type FieldDef } from './MasterDataPage';

const columns: ColumnDef<ServiceAdminItem>[] = [
  {
    key: 'name',
    label: 'Name',
    sortable: true,
    render: (s) => <span className="font-medium text-gray-900">{s.name}</span>,
  },
  {
    key: 'description',
    label: 'Description',
    sortable: true,
    render: (s) => <span className="text-gray-500">{s.description || '—'}</span>,
    className: 'max-w-xs truncate',
  },
];

const fields: FieldDef[] = [
  { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Email Service' },
  { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Brief description of the service' },
];

export default function ServicesPage() {
  const fetchItems = useCallback(async () => {
    const res = await admin.services();
    return res.services;
  }, []);

  return (
    <MasterDataPage<ServiceAdminItem>
      title="Services"
      description="Manage IT and business services that can be linked to incidents."
      storageKey="admin_services"
      columns={columns}
      fields={fields}
      fetchItems={fetchItems}
      createItem={(data) => admin.createService(data as { name: string; description?: string })}
      updateItem={(id, data) => admin.updateService(id, data)}
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
