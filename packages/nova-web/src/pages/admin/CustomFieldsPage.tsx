/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'use-intl';
import {
  admin,
  type CustomFieldDefinition,
  type CustomFieldEntityType,
  type CustomFieldType,
} from '../../api/client';
import MasterDataPage, { type ColumnDef, type FieldDef } from './MasterDataPage';

const ENTITY_TYPES: CustomFieldEntityType[] = ['incident', 'change', 'asset'];

const FIELD_TYPES: CustomFieldType[] = [
  'text', 'textarea', 'date', 'number', 'email', 'checkbox',
  'select', 'multiselect', 'cmdb_ref', 'user_ref', 'location_ref',
];

export default function CustomFieldsPage() {
  const t = useTranslations('pages.admin.customFields');
  const tFields = useTranslations('common.fields');
  const tTable = useTranslations('common.table');
  const tStates = useTranslations('common.states');

  const [entityType, setEntityType] = useState<CustomFieldEntityType>('incident');

  const noneOption = `— ${tStates('none')} —`;

  const columns = useMemo((): ColumnDef<CustomFieldDefinition>[] => [
    {
      key: 'field_key',
      label: t('fieldKey'),
      sortable: true,
      render: (item) => <span className="font-mono text-sm text-gray-900">{item.field_key}</span>,
    },
    {
      key: 'label',
      label: tFields('name'),
      sortable: true,
      render: (item) => <span className="font-medium text-gray-900">{item.label}</span>,
    },
    {
      key: 'field_type',
      label: t('fieldType'),
      sortable: true,
      render: (item) => <span className="text-gray-600">{item.field_type}</span>,
    },
    {
      key: 'required_on',
      label: t('requiredOn'),
      sortable: true,
      render: (item) => (
        <span className="text-gray-500">
          {item.required_on || tTable('emDash')}
        </span>
      ),
    },
    {
      key: 'sort_order',
      label: t('sortOrder'),
      sortable: true,
      render: (item) => <span className="text-gray-600">{item.sort_order}</span>,
    },
  ], [t, tFields, tTable]);

  const fields = useMemo((): FieldDef[] => [
    { key: 'field_key', label: t('fieldKey'), type: 'text', required: true, placeholder: 'e.g. business_impact' },
    { key: 'label', label: tFields('name'), type: 'text', required: true, placeholder: t('placeholderLabel') },
    {
      key: 'field_type',
      label: t('fieldType'),
      type: 'select',
      required: true,
      options: FIELD_TYPES.map((ft) => ({ value: ft, label: ft })),
    },
    {
      key: 'required_on',
      label: t('requiredOn'),
      type: 'select',
      options: [
        { value: '', label: noneOption },
        { value: 'create', label: t('requiredCreate') },
        ...(entityType === 'incident'
          ? [{ value: 'resolve', label: t('requiredResolve') }]
          : []),
      ],
    },
    { key: 'sort_order', label: t('sortOrder'), type: 'text', placeholder: '0' },
    {
      key: 'options',
      label: t('options'),
      type: 'textarea',
      placeholder: t('optionsHint'),
    },
  ], [entityType, noneOption, t, tFields]);

  const fetchItems = useCallback(async () => {
    const res = await admin.fieldDefinitions(entityType);
    return res.definitions;
  }, [entityType]);

  const parseOptions = (raw: unknown) => {
    const text = String(raw ?? '').trim();
    if (!text) return [];
    return text.split('\n').map((line, idx) => {
      const [value, label] = line.split('|').map((s) => s.trim());
      const v = value || '';
      return { value: v, label: label || v, sort_order: idx };
    }).filter((o) => o.value);
  };

  const formatOptions = (item: CustomFieldDefinition | null) =>
    (item?.options || [])
      .map((o) => (o.label && o.label !== o.value ? `${o.value}|${o.label}` : o.value))
      .join('\n');

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-gray-200">
        {ENTITY_TYPES.map((et) => (
          <button
            key={et}
            type="button"
            onClick={() => setEntityType(et)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px capitalize ${
              entityType === et
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t(`entity.${et}`)}
          </button>
        ))}
      </div>

      <MasterDataPage<CustomFieldDefinition>
        key={entityType}
        title={t('title')}
        description={t('description')}
        entityLabel={t('entityLabel')}
        storageKey={`admin_custom_fields_${entityType}`}
        columns={columns}
        fields={fields}
        fetchItems={fetchItems}
        createItem={(data) => admin.createFieldDefinition({
          entity_type: entityType,
          field_key: String(data.field_key ?? '').trim(),
          label: String(data.label ?? '').trim(),
          field_type: String(data.field_type ?? 'text'),
          required_on: String(data.required_on ?? ''),
          sort_order: Number(String(data.sort_order ?? '0')) || 0,
          options: parseOptions(data.options),
        })}
        updateItem={(id, data) => admin.updateFieldDefinition(id, {
          label: String(data.label ?? '').trim(),
          field_type: String(data.field_type ?? 'text'),
          required_on: String(data.required_on ?? ''),
          sort_order: Number(String(data.sort_order ?? '0')) || 0,
          is_active: Boolean(data.is_active),
          options: parseOptions(data.options),
        })}
        getDefaults={(item) => ({
          field_key: item?.field_key ?? '',
          label: item?.label ?? '',
          field_type: item?.field_type ?? 'text',
          required_on: item?.required_on ?? '',
          sort_order: item ? String(item.sort_order) : '0',
          options: formatOptions(item),
        })}
        searchFilter={(item, q) =>
          item.field_key.toLowerCase().includes(q)
          || item.label.toLowerCase().includes(q)
          || item.field_type.toLowerCase().includes(q)
        }
      />
    </div>
  );
}
