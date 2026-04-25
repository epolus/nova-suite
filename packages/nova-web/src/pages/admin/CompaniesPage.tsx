/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { admin, type CompanyItem } from '../../api/client';
import MasterDataPage, { type ColumnDef, type FieldDef } from './MasterDataPage';

const columns: ColumnDef<CompanyItem>[] = [
  {
    key: 'name',
    label: 'Name',
    sortable: true,
    render: (c) => <span className="font-medium text-gray-900">{c.name}</span>,
  },
  {
    key: 'code',
    label: 'Code',
    sortable: true,
    render: (c) => <span className="font-mono text-xs text-gray-700">{c.code || '—'}</span>,
  },
  {
    key: 'country',
    label: 'Country',
    sortable: true,
    render: (c) => <span className="text-gray-600">{c.country || '—'}</span>,
  },
  {
    key: 'city',
    label: 'City',
    sortable: true,
    render: (c) => <span className="text-gray-600">{c.city || '—'}</span>,
  },
  {
    key: 'parent_company_name',
    label: 'Parent',
    sortable: true,
    render: (c) =>
      c.parent_company_id && c.parent_company_name ? (
        <Link
          to={`/admin/companies/${c.parent_company_id}`}
          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
          onClick={(e) => e.stopPropagation()}
        >
          {c.parent_company_name}
        </Link>
      ) : (
        <span className="text-gray-400">—</span>
      ),
  },
  {
    key: 'contact_user_name',
    label: 'Contact',
    sortable: true,
    render: (c) =>
      c.contact_user_id && c.contact_user_name ? (
        <Link
          to={`/admin/users/${c.contact_user_id}`}
          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          onClick={(e) => e.stopPropagation()}
        >
          {c.contact_user_name}
        </Link>
      ) : (
        <span className="text-gray-400">—</span>
      ),
  },
  {
    key: 'location_count',
    label: 'Locations',
    sortable: true,
    render: (c) => (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
        {c.location_count}
      </span>
    ),
  },
];

const fields: FieldDef[] = [
  { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. ACME AG' },
  { key: 'code', label: 'Code', type: 'text', placeholder: 'e.g. ACME-CH' },
  { key: 'website', label: 'Website', type: 'text', placeholder: 'e.g. https://acme.example' },
  { key: 'phone', label: 'Phone', type: 'text', placeholder: 'e.g. +41 44 123 45 67' },
  { key: 'street', label: 'Street', type: 'text', placeholder: 'e.g. Bahnhofstrasse 1' },
  { key: 'city', label: 'City', type: 'text', placeholder: 'e.g. Zurich' },
  { key: 'state', label: 'State', type: 'text', placeholder: 'e.g. ZH' },
  { key: 'zip', label: 'ZIP', type: 'text', placeholder: 'e.g. 8001' },
  { key: 'country', label: 'Country', type: 'text', placeholder: 'e.g. Switzerland' },
  { key: 'parent_company_id', label: 'Parent Company ID', type: 'text', placeholder: 'Optional UUID' },
  { key: 'contact_user_id', label: 'Contact User ID', type: 'text', placeholder: 'Optional UUID' },
  { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Optional notes' },
];

export default function CompaniesPage() {
  const fetchItems = useCallback(async () => {
    const res = await admin.companies();
    return res.companies;
  }, []);

  return (
    <MasterDataPage<CompanyItem>
      title="Companies"
      description="Manage legal entities, business units, and hierarchy."
      storageKey="admin_companies"
      detailBasePath="/admin/companies"
      columns={columns}
      fields={fields}
      fetchItems={fetchItems}
      createItem={(data) => admin.createCompany(data as Partial<CompanyItem>)}
      updateItem={(id, data) => admin.updateCompany(id, data as Partial<CompanyItem>)}
      getDefaults={(item) => ({
        name: item?.name ?? '',
        code: item?.code ?? '',
        website: item?.website ?? '',
        phone: item?.phone ?? '',
        street: item?.street ?? '',
        city: item?.city ?? '',
        state: item?.state ?? '',
        zip: item?.zip ?? '',
        country: item?.country ?? '',
        parent_company_id: item?.parent_company_id ?? '',
        contact_user_id: item?.contact_user_id ?? '',
        description: item?.description ?? '',
      })}
      searchFilter={(item, q) =>
        item.name.toLowerCase().includes(q) ||
        (item.code?.toLowerCase().includes(q) ?? false) ||
        (item.country?.toLowerCase().includes(q) ?? false) ||
        (item.city?.toLowerCase().includes(q) ?? false) ||
        (item.description?.toLowerCase().includes(q) ?? false)
      }
    />
  );
}
