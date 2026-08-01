/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslations } from 'use-intl';
import { admin, type CompanyItem } from '../../api/client';
import MasterDataPage, { type ColumnDef, type FieldDef } from './MasterDataPage';

export default function CompaniesPage() {
  const t = useTranslations('pages.admin.companies');
  const tFields = useTranslations('common.fields');
  const tTable = useTranslations('common.table');
  const tMaster = useTranslations('common.masterData');

  const columns = useMemo((): ColumnDef<CompanyItem>[] => [
    {
      key: 'name',
      label: tFields('name'),
      sortable: true,
      render: (c) => <span className="font-medium text-gray-900">{c.name}</span>,
    },
    {
      key: 'code',
      label: tFields('code'),
      sortable: true,
      render: (c) => <span className="font-mono text-xs text-gray-700">{c.code || tTable('emDash')}</span>,
    },
    {
      key: 'country',
      label: tFields('country'),
      sortable: true,
      render: (c) => <span className="text-gray-600">{c.country || tTable('emDash')}</span>,
    },
    {
      key: 'city',
      label: tFields('city'),
      sortable: true,
      render: (c) => <span className="text-gray-600">{c.city || tTable('emDash')}</span>,
    },
    {
      key: 'parent_company_name',
      label: tFields('parent'),
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
          <span className="text-gray-400">{tTable('emDash')}</span>
        ),
    },
    {
      key: 'contact_user_name',
      label: tFields('contact'),
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
          <span className="text-gray-400">{tTable('emDash')}</span>
        ),
    },
    {
      key: 'location_count',
      label: tFields('locations'),
      sortable: true,
      render: (c) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
          {c.location_count}
        </span>
      ),
    },
  ], [tFields, tTable]);

  const fields = useMemo((): FieldDef[] => [
    { key: 'name', label: tFields('name'), type: 'text', required: true, placeholder: t('placeholderName') },
    { key: 'code', label: tFields('code'), type: 'text', placeholder: t('placeholderCode') },
    { key: 'website', label: tFields('website'), type: 'text', placeholder: t('placeholderWebsite') },
    { key: 'phone', label: tFields('phone'), type: 'text', placeholder: t('placeholderPhone') },
    { key: 'street', label: tFields('street'), type: 'text', placeholder: t('placeholderStreet') },
    { key: 'city', label: tFields('city'), type: 'text', placeholder: t('placeholderCity') },
    { key: 'state', label: tFields('state'), type: 'text', placeholder: t('placeholderState') },
    { key: 'zip', label: tFields('zip'), type: 'text', placeholder: t('placeholderZip') },
    { key: 'country', label: tFields('country'), type: 'text', placeholder: t('placeholderCountry') },
    { key: 'parent_company_id', label: tFields('parentCompany'), type: 'text', placeholder: t('placeholderOptionalUuid') },
    { key: 'contact_user_id', label: tFields('contactUserId'), type: 'text', placeholder: t('placeholderOptionalUuid') },
    { key: 'description', label: tFields('description'), type: 'textarea', placeholder: tMaster('optionalNotes') },
  ], [t, tFields, tMaster]);

  const fetchItems = useCallback(async () => {
    const res = await admin.companies();
    return res.companies;
  }, []);

  return (
    <MasterDataPage<CompanyItem>
      title={t('title')}
      description={t('description')}
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
