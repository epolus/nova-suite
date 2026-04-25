/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback } from 'react';
import { admin, type ProcessItem } from '../../api/client';
import MasterDataPage, { type ColumnDef, type FieldDef } from './MasterDataPage';

const columns: ColumnDef<ProcessItem>[] = [
  {
    key: 'name',
    label: 'Name',
    sortable: true,
    render: (p) => <span className="font-medium text-gray-900">{p.name}</span>,
  },
  {
    key: 'description',
    label: 'Description',
    sortable: true,
    render: (p) => <span className="text-gray-500">{p.description || '—'}</span>,
    className: 'max-w-md',
  },
  {
    key: 'group_count',
    label: 'Groups',
    sortable: true,
    render: (p) => <span className="text-gray-600">{p.group_count}</span>,
  },
];

const fields: FieldDef[] = [
  { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Incident Management' },
  { key: 'description', label: 'Description', type: 'textarea', placeholder: 'What this process covers' },
];

export default function ProcessesPage() {
  const fetchItems = useCallback(async () => {
    const res = await admin.processes();
    return res.processes;
  }, []);

  return (
    <MasterDataPage<ProcessItem>
      title="Processes"
      description="Manage ITIL processes that assignment groups can cover."
      storageKey="admin_processes"
      columns={columns}
      fields={fields}
      fetchItems={fetchItems}
      createItem={(data) => admin.createProcess(data as { name: string; description?: string })}
      updateItem={(id, data) => admin.updateProcess(id, data)}
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
