/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslations } from 'use-intl';
import { admin, type LocationItem } from '../../api/client';
import MasterDataPage, { type ColumnDef, type FieldDef } from './MasterDataPage';

export default function LocationsPage() {
  const t = useTranslations('pages.admin.locations');
  const tFields = useTranslations('common.fields');
  const tTable = useTranslations('common.table');
  const tMaster = useTranslations('common.masterData');

  const columns = useMemo((): ColumnDef<LocationItem>[] => [
    {
      key: 'code',
      label: tFields('code'),
      sortable: true,
      render: (l) => <span className="font-mono text-xs font-medium text-gray-900">{l.code}</span>,
    },
    {
      key: 'name',
      label: tFields('name'),
      sortable: true,
      render: (l) => <span className="font-medium text-gray-900">{l.name}</span>,
    },
    {
      key: 'source',
      label: tFields('source'),
      sortable: true,
      render: (l) => <span className="text-gray-600">{l.source}</span>,
    },
    {
      key: 'company_name',
      label: tFields('company'),
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
          <span className="text-gray-400">{tTable('emDash')}</span>
        ),
    },
    {
      key: 'parent_location_name',
      label: tFields('parent'),
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
          <span className="text-gray-400">{tTable('emDash')}</span>
        ),
    },
    {
      key: 'city',
      label: tFields('city'),
      sortable: true,
      render: (l) => <span className="text-gray-600">{l.city || tTable('emDash')}</span>,
    },
    {
      key: 'country',
      label: tFields('country'),
      sortable: true,
      render: (l) => <span className="text-gray-600">{l.country || tTable('emDash')}</span>,
    },
  ], [tFields, tTable]);

  const fields = useMemo((): FieldDef[] => [
    { key: 'name', label: tFields('name'), type: 'text', required: true, placeholder: t('placeholderName') },
    { key: 'code', label: tFields('code'), type: 'text', required: true, placeholder: t('placeholderCode') },
    { key: 'source', label: tFields('source'), type: 'text', placeholder: t('placeholderSource') },
    { key: 'country', label: tFields('country'), type: 'text', placeholder: t('placeholderCountry') },
    { key: 'state', label: tFields('state'), type: 'text', placeholder: t('placeholderState') },
    { key: 'city', label: tFields('city'), type: 'text', placeholder: t('placeholderCity') },
    { key: 'zip', label: tFields('zip'), type: 'text', placeholder: t('placeholderZip') },
    { key: 'street', label: tFields('street'), type: 'text', placeholder: t('placeholderStreet') },
    { key: 'company_id', label: tFields('companyId'), type: 'text', placeholder: t('placeholderOptionalUuid') },
    { key: 'parent_location_id', label: tFields('parentLocationId'), type: 'text', placeholder: t('placeholderOptionalUuid') },
    { key: 'description', label: tFields('description'), type: 'textarea', placeholder: tMaster('optionalNotes') },
  ], [t, tFields, tMaster]);

  const fetchItems = useCallback(async () => {
    const res = await admin.locations();
    return res.locations;
  }, []);

  return (
    <MasterDataPage<LocationItem>
      title={t('title')}
      description={t('description')}
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
