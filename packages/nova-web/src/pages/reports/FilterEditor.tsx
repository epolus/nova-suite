/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import type { ReportDatasetKey, ReportFilter, ReportFilterOperator } from '../../api/client';
import { DATASET_FIELDS } from './reportBuilderConfig';

export function FilterEditor({
  dataset,
  filter,
  onChange,
}: {
  dataset: ReportDatasetKey;
  filter: ReportFilter | null;
  onChange: (filter: ReportFilter | null) => void;
}) {
  const t = useTranslations('pages.reports');
  const fields = DATASET_FIELDS[dataset];
  const defaultField = fields[0]?.key || '';
  const selectedField = fields.find((entry) => entry.key === filter?.field) || fields[0];
  const operator = (filter?.operator || 'eq') as ReportFilterOperator;
  const rawValue = filter ? String(filter.value) : '';
  const disableValue = operator === 'in';

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <select
          value={filter?.field || defaultField}
          onChange={(event) => {
            const next: ReportFilter = {
              field: event.target.value,
              operator: filter?.operator || 'eq',
              value: '',
            };
            onChange(next);
          }}
          className="px-2 py-1.5 border border-gray-200 rounded-md text-xs"
        >
          {fields.map((field) => (
            <option key={field.key} value={field.key}>{field.label}</option>
          ))}
        </select>
        <select
          value={operator}
          onChange={(event) => {
            const nextOperator = event.target.value as ReportFilterOperator;
            const next: ReportFilter = {
              field: filter?.field || defaultField,
              operator: nextOperator,
              value: nextOperator === 'in' ? [] : '',
            };
            onChange(next);
          }}
          className="px-2 py-1.5 border border-gray-200 rounded-md text-xs"
        >
          <option value="eq">{t('filterOperators.eq')}</option>
          <option value="neq">{t('filterOperators.neq')}</option>
          <option value="contains">{t('filterOperators.contains')}</option>
          <option value="gte">{t('filterOperators.gte')}</option>
          <option value="lte">{t('filterOperators.lte')}</option>
          <option value="in">{t('filterOperators.in')}</option>
        </select>
      </div>
      <input
        disabled={disableValue}
        value={rawValue}
        onChange={(event) => {
          if (!selectedField) return;
          const value = event.target.value;
          let parsed: string | number | boolean = value;
          if (selectedField.type === 'number') parsed = Number.parseFloat(value);
          if (selectedField.type === 'boolean') parsed = value.toLowerCase() === 'true';
          onChange({
            field: filter?.field || defaultField,
            operator,
            value: value.length === 0 ? '' : parsed,
          });
        }}
        placeholder={disableValue ? t('filterListHint') : t('filterValue')}
        className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-xs disabled:bg-gray-100 disabled:text-gray-400"
      />
      <button
        onClick={() => onChange(null)}
        className="text-xs text-gray-500 hover:text-gray-700"
      >
        {t('clearFilter')}
      </button>
    </div>
  );
}
