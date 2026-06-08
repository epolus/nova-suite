/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslations } from 'use-intl';
import { admin, type LocationItem } from '../../api/client';
import type { FieldDef } from './MasterDataPage';
import MasterDataDetailPage from './MasterDataDetailPage';

export default function LocationsDetailPage() {
  const t = useTranslations('pages.admin.locations');
  const tFields = useTranslations('common.fields');
  const tMaster = useTranslations('common.masterData');
  const tStates = useTranslations('common.states');
  const { id } = useParams<{ id: string }>();
  const [companyOptions, setCompanyOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [parentLocationOptions, setParentLocationOptions] = useState<Array<{ value: string; label: string }>>([]);

  const noneOption = `— ${tStates('none')} —`;

  useEffect(() => {
    let alive = true;
    Promise.all([admin.companies(), admin.locations()])
      .then(([companiesRes, locationsRes]) => {
        if (!alive) return;
        setCompanyOptions([
          { value: '', label: noneOption },
          ...companiesRes.companies.map((c) => ({ value: c.id, label: c.name })),
        ]);
        setParentLocationOptions([
          { value: '', label: noneOption },
          ...locationsRes.locations
            .filter((l) => l.id !== id)
            .map((l) => ({ value: l.id, label: `${l.code} — ${l.name}` })),
        ]);
      })
      .catch(() => {
        // Non-blocking.
      });
    return () => {
      alive = false;
    };
  }, [id, noneOption]);

  const fields: FieldDef[] = useMemo(() => [
    { key: 'name', label: tFields('name'), type: 'text', required: true, placeholder: t('placeholderName') },
    { key: 'code', label: tFields('code'), type: 'text', required: true, placeholder: t('placeholderCode') },
    {
      key: 'source',
      label: tFields('source'),
      type: 'select',
      options: [
        { value: 'manual', label: t('sourceOptions.manual') },
        { value: 'import', label: t('sourceOptions.import') },
        { value: 'integration', label: t('sourceOptions.integration') },
      ],
    },
    { key: 'country', label: tFields('country'), type: 'text', placeholder: t('placeholderCountry') },
    { key: 'state', label: tFields('state'), type: 'text', placeholder: t('placeholderState') },
    { key: 'city', label: tFields('city'), type: 'text', placeholder: t('placeholderCity') },
    { key: 'zip', label: tFields('zip'), type: 'text', placeholder: t('placeholderZip') },
    { key: 'street', label: tFields('street'), type: 'text', placeholder: t('placeholderStreet') },
    { key: 'company_id', label: tFields('company'), type: 'select', options: companyOptions },
    { key: 'parent_location_id', label: tFields('parentLocation'), type: 'select', options: parentLocationOptions },
    { key: 'description', label: tFields('description'), type: 'textarea', placeholder: tMaster('optionalNotes') },
  ], [t, tFields, tMaster, companyOptions, parentLocationOptions]);

  const fetchItems = useCallback(async () => {
    const res = await admin.locations();
    return res.locations;
  }, []);

  return (
    <MasterDataDetailPage<LocationItem>
      title={t('title')}
      basePath="/admin/locations"
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
