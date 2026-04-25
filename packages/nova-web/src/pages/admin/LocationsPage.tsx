/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { admin, type LocationItem } from '../../api/client';
import MasterDataPage, { type ColumnDef, type FieldDef } from './MasterDataPage';

const columns: ColumnDef<LocationItem>[] = [
  {
    key: 'code',
    label: 'Code',
    sortable: true,
    render: (l) => <span className="font-mono text-xs font-medium text-gray-900">{l.code}</span>,
  },
  {
    key: 'name',
    label: 'Name',
    sortable: true,
    render: (l) => <span className="font-medium text-gray-900">{l.name}</span>,
  },
  {
    key: 'source',
    label: 'Source',
    sortable: true,
    render: (l) => <span className="text-gray-600">{l.source}</span>,
  },
  {
    key: 'company_name',
    label: 'Company',
    sortable: true,
    render: (l) =>
      l.company_id && l.company_name ? (
        <Link
          to={`/admin/companies/${l.company_id}`}
          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
          onClick={(e) => e.stopPropagation()}
        >
          {l.company_name}
        </Link>
      ) : (
        <span className="text-gray-400">—</span>
      ),
  },
  {
    key: 'parent_location_name',
    label: 'Parent',
    sortable: true,
    render: (l) =>
      l.parent_location_id && l.parent_location_name ? (
        <Link
          to={`/admin/locations/${l.parent_location_id}`}
          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          onClick={(e) => e.stopPropagation()}
        >
          {l.parent_location_name}
        </Link>
      ) : (
        <span className="text-gray-400">—</span>
      ),
  },
  {
    key: 'city',
    label: 'City',
    sortable: true,
    render: (l) => <span className="text-gray-600">{l.city || '—'}</span>,
  },
  {
    key: 'country',
    label: 'Country',
    sortable: true,
    render: (l) => <span className="text-gray-600">{l.country || '—'}</span>,
  },
];

const fields: FieldDef[] = [
  { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Zurich HQ' },
  { key: 'code', label: 'Code', type: 'text', required: true, placeholder: 'e.g. CH-ZRH-HQ' },
  { key: 'source', label: 'Source', type: 'text', placeholder: 'e.g. manual' },
  { key: 'country', label: 'Country', type: 'text', placeholder: 'e.g. Switzerland' },
  { key: 'state', label: 'State', type: 'text', placeholder: 'e.g. ZH' },
  { key: 'city', label: 'City', type: 'text', placeholder: 'e.g. Zurich' },
  { key: 'zip', label: 'ZIP', type: 'text', placeholder: 'e.g. 8001' },
  { key: 'street', label: 'Street', type: 'text', placeholder: 'e.g. Bahnhofstrasse 1' },
  { key: 'company_id', label: 'Company ID', type: 'text', placeholder: 'Optional UUID' },
  { key: 'parent_location_id', label: 'Parent Location ID', type: 'text', placeholder: 'Optional UUID' },
  { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Optional notes' },
];

export default function LocationsPage() {
  const fetchItems = useCallback(async () => {
    const res = await admin.locations();
    return res.locations;
  }, []);

  return (
    <MasterDataPage<LocationItem>
      title="Locations"
      description="Manage physical and logical locations."
      storageKey="admin_locations"
      detailBasePath="/admin/locations"
      columns={columns}
      fields={fields}
      fetchItems={fetchItems}
      createItem={(data) => admin.createLocation(data as Partial<LocationItem>)}
      updateItem={(id, data) => admin.updateLocation(id, data as Partial<LocationItem>)}
      getDefaults={(item) => ({
        name: item?.name ?? '',
        code: item?.code ?? '',
        source: item?.source ?? 'manual',
        country: item?.country ?? '',
        state: item?.state ?? '',
        city: item?.city ?? '',
        zip: item?.zip ?? '',
        street: item?.street ?? '',
        company_id: item?.company_id ?? '',
        parent_location_id: item?.parent_location_id ?? '',
        description: item?.description ?? '',
      })}
      searchFilter={(item, q) =>
        item.code.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.source.toLowerCase().includes(q) ||
        (item.company_name?.toLowerCase().includes(q) ?? false) ||
        (item.city?.toLowerCase().includes(q) ?? false) ||
        (item.country?.toLowerCase().includes(q) ?? false)
      }
    />
  );
}
