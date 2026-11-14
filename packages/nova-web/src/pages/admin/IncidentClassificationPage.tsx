/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import { admin, type IncidentCategory, type IncidentResolutionCode } from '../../api/client';
import MasterDataPage, { type ColumnDef, type FieldDef } from './MasterDataPage';

const ADMIN_INCIDENT_CATEGORIES_KEY = ['admin', 'incident-categories'] as const;

export default function IncidentClassificationPage() {
  const t = useTranslations('pages.admin.incidentClassification');
  const tFields = useTranslations('common.fields');
  const tTable = useTranslations('common.table');
  const tStates = useTranslations('common.states');
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<'categories' | 'codes'>('categories');

  const categoriesQuery = useQuery({
    queryKey: ADMIN_INCIDENT_CATEGORIES_KEY,
    queryFn: () => admin.incidentCategories().then((r) => r.categories),
  });
  const categories = categoriesQuery.data ?? [];

  const noneOption = `— ${tStates('none')} —`;

  const categoryColumns = useMemo((): ColumnDef<IncidentCategory>[] => [
    {
      key: 'name',
      label: tFields('name'),
      sortable: true,
      render: (item) => <span className="font-medium text-gray-900">{item.name}</span>,
    },
    {
      key: 'parent_name',
      label: t('parent'),
      sortable: true,
      render: (item) => (
        <span className="text-gray-500">{item.parent_name || tTable('emDash')}</span>
      ),
    },
    {
      key: 'description',
      label: tFields('description'),
      sortable: true,
      render: (item) => (
        <span className="text-gray-500">{item.description || tTable('emDash')}</span>
      ),
      className: 'max-w-xs truncate',
    },
  ], [t, tFields, tTable]);

  const categoryFields = useMemo((): FieldDef[] => [
    { key: 'name', label: tFields('name'), type: 'text', required: true, placeholder: t('placeholderCategory') },
    { key: 'description', label: tFields('description'), type: 'textarea', placeholder: t('placeholderDescription') },
    {
      key: 'parent_id',
      label: t('parent'),
      type: 'select',
      options: [
        { value: '', label: noneOption },
        ...categories
          .filter((c) => c.is_active && !c.parent_id)
          .map((c) => ({ value: c.id, label: c.name })),
      ],
    },
  ], [categories, noneOption, t, tFields]);

  const codeColumns = useMemo((): ColumnDef<IncidentResolutionCode>[] => [
    {
      key: 'code',
      label: t('code'),
      sortable: true,
      render: (item) => <span className="font-mono text-sm text-gray-900">{item.code}</span>,
    },
    {
      key: 'label',
      label: tFields('name'),
      sortable: true,
      render: (item) => <span className="font-medium text-gray-900">{item.label}</span>,
    },
  ], [t, tFields]);

  const codeFields = useMemo((): FieldDef[] => [
    { key: 'code', label: t('code'), type: 'text', required: true, placeholder: t('placeholderCode') },
    { key: 'label', label: tFields('name'), type: 'text', required: true, placeholder: t('placeholderLabel') },
  ], [t, tFields]);

  const fetchCategories = useCallback(async () => {
    const res = await admin.incidentCategories();
    queryClient.setQueryData(ADMIN_INCIDENT_CATEGORIES_KEY, res.categories);
    return res.categories;
  }, [queryClient]);

  const fetchCodes = useCallback(async () => {
    const res = await admin.incidentResolutionCodes();
    return res.resolution_codes;
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setTab('categories')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === 'categories'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {t('categoriesTab')}
        </button>
        <button
          type="button"
          onClick={() => setTab('codes')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === 'codes'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {t('codesTab')}
        </button>
      </div>

      {tab === 'categories' ? (
        <MasterDataPage<IncidentCategory>
          title={t('categoriesTitle')}
          description={t('categoriesDescription')}
          entityLabel={t('categoryEntity')}
          storageKey="admin_incident_categories"
          columns={categoryColumns}
          fields={categoryFields}
          fetchItems={fetchCategories}
          createItem={(data) => admin.createIncidentCategory({
            name: String(data.name ?? '').trim(),
            description: String(data.description ?? '').trim() || null,
            parent_id: String(data.parent_id ?? '').trim() || null,
          })}
          updateItem={(id, data) => admin.updateIncidentCategory(id, {
            name: String(data.name ?? '').trim(),
            description: String(data.description ?? '').trim() || null,
            parent_id: String(data.parent_id ?? '').trim() || null,
            is_active: Boolean(data.is_active),
          })}
          getDefaults={(item) => ({
            name: item?.name ?? '',
            description: item?.description ?? '',
            parent_id: item?.parent_id ?? '',
          })}
          searchFilter={(item, q) =>
            item.name.toLowerCase().includes(q)
            || (item.description?.toLowerCase().includes(q) ?? false)
            || (item.parent_name?.toLowerCase().includes(q) ?? false)
          }
          onAfterMutate={() => { void categoriesQuery.refetch(); }}
        />
      ) : (
        <MasterDataPage<IncidentResolutionCode>
          title={t('codesTitle')}
          description={t('codesDescription')}
          entityLabel={t('codeEntity')}
          storageKey="admin_incident_resolution_codes"
          columns={codeColumns}
          fields={codeFields}
          fetchItems={fetchCodes}
          createItem={(data) => admin.createIncidentResolutionCode({
            code: String(data.code ?? '').trim(),
            label: String(data.label ?? '').trim(),
          })}
          updateItem={(id, data) => admin.updateIncidentResolutionCode(id, {
            code: String(data.code ?? '').trim(),
            label: String(data.label ?? '').trim(),
            is_active: Boolean(data.is_active),
          })}
          getDefaults={(item) => ({
            code: item?.code ?? '',
            label: item?.label ?? '',
          })}
          searchFilter={(item, q) =>
            item.code.toLowerCase().includes(q)
            || item.label.toLowerCase().includes(q)
          }
        />
      )}
    </div>
  );
}
