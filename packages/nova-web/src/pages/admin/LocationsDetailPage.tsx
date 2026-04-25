/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { admin, type LocationItem } from '../../api/client';
import type { FieldDef } from './MasterDataPage';
import MasterDataDetailPage from './MasterDataDetailPage';

export default function LocationsDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [companyOptions, setCompanyOptions] = useState<Array<{ value: string; label: string }>>([
    { value: '', label: '— None —' },
  ]);
  const [parentLocationOptions, setParentLocationOptions] = useState<Array<{ value: string; label: string }>>([
    { value: '', label: '— None —' },
  ]);

  useEffect(() => {
    let alive = true;
    Promise.all([admin.companies(), admin.locations()])
      .then(([companiesRes, locationsRes]) => {
        if (!alive) return;
        setCompanyOptions([
          { value: '', label: '— None —' },
          ...companiesRes.companies.map((c) => ({ value: c.id, label: c.name })),
        ]);
        setParentLocationOptions([
          { value: '', label: '— None —' },
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
  }, [id]);

  const fields: FieldDef[] = useMemo(() => [
    { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Zurich HQ' },
    { key: 'code', label: 'Code', type: 'text', required: true, placeholder: 'e.g. CH-ZRH-HQ' },
    {
      key: 'source',
      label: 'Source',
      type: 'select',
      options: [
        { value: 'manual', label: 'manual' },
        { value: 'import', label: 'import' },
        { value: 'integration', label: 'integration' },
      ],
    },
    { key: 'country', label: 'Country', type: 'text', placeholder: 'e.g. Switzerland' },
    { key: 'state', label: 'State', type: 'text', placeholder: 'e.g. ZH' },
    { key: 'city', label: 'City', type: 'text', placeholder: 'e.g. Zurich' },
    { key: 'zip', label: 'ZIP', type: 'text', placeholder: 'e.g. 8001' },
    { key: 'street', label: 'Street', type: 'text', placeholder: 'e.g. Bahnhofstrasse 1' },
    { key: 'company_id', label: 'Company', type: 'select', options: companyOptions },
    { key: 'parent_location_id', label: 'Parent Location', type: 'select', options: parentLocationOptions },
    { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Optional notes' },
  ], [companyOptions, parentLocationOptions]);

  const fetchItems = useCallback(async () => {
    const res = await admin.locations();
    return res.locations;
  }, []);

  return (
    <MasterDataDetailPage<LocationItem>
      title="Locations"
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
