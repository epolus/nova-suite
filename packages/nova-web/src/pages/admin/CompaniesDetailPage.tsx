/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { admin, type CompanyItem } from '../../api/client';
import type { FieldDef } from './MasterDataPage';
import MasterDataDetailPage from './MasterDataDetailPage';

export default function CompaniesDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [parentCompanyOptions, setParentCompanyOptions] = useState<Array<{ value: string; label: string }>>([
    { value: '', label: '— None —' },
  ]);
  const [contactUserOptions, setContactUserOptions] = useState<Array<{ value: string; label: string }>>([
    { value: '', label: '— None —' },
  ]);

  useEffect(() => {
    let alive = true;
    Promise.all([admin.companies(), admin.users()])
      .then(([companiesRes, usersRes]) => {
        if (!alive) return;
        setParentCompanyOptions([
          { value: '', label: '— None —' },
          ...companiesRes.companies
            .filter((c) => c.id !== id)
            .map((c) => ({ value: c.id, label: c.name })),
        ]);
        setContactUserOptions([
          { value: '', label: '— None —' },
          ...usersRes.users.map((u) => ({ value: u.id, label: u.display_name })),
        ]);
      })
      .catch(() => {
        // Non-blocking; free text fields still load.
      });
    return () => {
      alive = false;
    };
  }, [id]);

  const fields: FieldDef[] = useMemo(() => [
    { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. ACME AG' },
    { key: 'code', label: 'Code', type: 'text', placeholder: 'e.g. ACME-CH' },
    { key: 'website', label: 'Website', type: 'text', placeholder: 'e.g. https://acme.example' },
    { key: 'phone', label: 'Phone', type: 'text', placeholder: 'e.g. +41 44 123 45 67' },
    { key: 'street', label: 'Street', type: 'text', placeholder: 'e.g. Bahnhofstrasse 1' },
    { key: 'city', label: 'City', type: 'text', placeholder: 'e.g. Zurich' },
    { key: 'state', label: 'State', type: 'text', placeholder: 'e.g. ZH' },
    { key: 'zip', label: 'ZIP', type: 'text', placeholder: 'e.g. 8001' },
    { key: 'country', label: 'Country', type: 'text', placeholder: 'e.g. Switzerland' },
    { key: 'parent_company_id', label: 'Parent Company', type: 'select', options: parentCompanyOptions },
    { key: 'contact_user_id', label: 'Contact User', type: 'select', options: contactUserOptions },
    { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Optional notes' },
  ], [parentCompanyOptions, contactUserOptions]);

  const fetchItems = useCallback(async () => {
    const res = await admin.companies();
    return res.companies;
  }, []);

  return (
    <MasterDataDetailPage<CompanyItem>
      title="Companies"
      basePath="/admin/companies"
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
