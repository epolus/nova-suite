/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslations } from 'use-intl';
import { admin, type CompanyItem } from '../../api/client';
import type { FieldDef } from './MasterDataPage';
import MasterDataDetailPage from './MasterDataDetailPage';

export default function CompaniesDetailPage() {
  const t = useTranslations('pages.admin.companies');
  const tFields = useTranslations('common.fields');
  const tMaster = useTranslations('common.masterData');
  const tStates = useTranslations('common.states');
  const { id } = useParams<{ id: string }>();
  const [parentCompanyOptions, setParentCompanyOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [contactUserOptions, setContactUserOptions] = useState<Array<{ value: string; label: string }>>([]);

  const noneOption = `— ${tStates('none')} —`;

  useEffect(() => {
    let alive = true;
    Promise.all([admin.companies(), admin.users()])
      .then(([companiesRes, usersRes]) => {
        if (!alive) return;
        setParentCompanyOptions([
          { value: '', label: noneOption },
          ...companiesRes.companies
            .filter((c) => c.id !== id)
            .map((c) => ({ value: c.id, label: c.name })),
        ]);
        setContactUserOptions([
          { value: '', label: noneOption },
          ...usersRes.users.map((u) => ({ value: u.id, label: u.display_name })),
        ]);
      })
      .catch(() => {
        // Non-blocking; free text fields still load.
      });
    return () => {
      alive = false;
    };
  }, [id, noneOption]);

  const fields: FieldDef[] = useMemo(() => [
    { key: 'name', label: tFields('name'), type: 'text', required: true, placeholder: t('placeholderName') },
    { key: 'code', label: tFields('code'), type: 'text', placeholder: t('placeholderCode') },
    { key: 'website', label: tFields('website'), type: 'text', placeholder: t('placeholderWebsite') },
    { key: 'phone', label: tFields('phone'), type: 'text', placeholder: t('placeholderPhone') },
    { key: 'street', label: tFields('street'), type: 'text', placeholder: t('placeholderStreet') },
    { key: 'city', label: tFields('city'), type: 'text', placeholder: t('placeholderCity') },
    { key: 'state', label: tFields('state'), type: 'text', placeholder: t('placeholderState') },
    { key: 'zip', label: tFields('zip'), type: 'text', placeholder: t('placeholderZip') },
    { key: 'country', label: tFields('country'), type: 'text', placeholder: t('placeholderCountry') },
    { key: 'parent_company_id', label: tFields('parentCompany'), type: 'select', options: parentCompanyOptions },
    { key: 'contact_user_id', label: tFields('contactUserId'), type: 'select', options: contactUserOptions },
    { key: 'description', label: tFields('description'), type: 'textarea', placeholder: tMaster('optionalNotes') },
  ], [t, tFields, tMaster, parentCompanyOptions, contactUserOptions]);

  const fetchItems = useCallback(async () => {
    const res = await admin.companies();
    return res.companies;
  }, []);

  return (
    <MasterDataDetailPage<CompanyItem>
      title={t('title')}
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
