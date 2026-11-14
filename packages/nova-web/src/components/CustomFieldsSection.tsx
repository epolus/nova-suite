/* SPDX-License-Identifier: AGPL-3.0-only */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import { customFields, type CustomFieldDefinition, type CustomFieldEntityType, type FormField } from '../api/client';
import DynamicFormField from './DynamicFormField';

type Props = {
  entityType: CustomFieldEntityType;
  values: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  readonly?: boolean;
  /** Only show fields required on create, or all active fields. */
  mode?: 'all' | 'create';
};

function toFormField(def: CustomFieldDefinition): FormField {
  const config = def.config || {};
  return {
    name: def.field_key,
    label: def.label,
    type: def.field_type,
    required: def.required_on === 'create' || def.required_on === 'resolve',
    options: (def.options || []).filter((o) => o.is_active !== false).map((o) => o.value),
    placeholder: typeof config.placeholder === 'string' ? config.placeholder : undefined,
    helpText: typeof config.helpText === 'string' ? config.helpText : undefined,
    min: typeof config.min === 'number' ? config.min : undefined,
    max: typeof config.max === 'number' ? config.max : undefined,
    pattern: typeof config.pattern === 'string' ? config.pattern : undefined,
    ci_class: typeof config.ci_class === 'string' ? config.ci_class : undefined,
  };
}

function valueToString(def: CustomFieldDefinition, raw: unknown): string {
  if (raw == null) return def.field_type === 'checkbox' ? 'false' : '';
  if (def.field_type === 'checkbox') return raw === true || raw === 'true' ? 'true' : 'false';
  if (def.field_type === 'multiselect') {
    if (Array.isArray(raw)) return JSON.stringify(raw);
    return String(raw);
  }
  return String(raw);
}

function stringToValue(def: CustomFieldDefinition, text: string): unknown {
  if (def.field_type === 'checkbox') return text === 'true';
  if (def.field_type === 'number') {
    if (!text.trim()) return null;
    const n = Number(text);
    return Number.isNaN(n) ? text : n;
  }
  if (def.field_type === 'multiselect') {
    if (!text.trim()) return [];
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [text];
    } catch {
      return text.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return text;
}

export default function CustomFieldsSection({
  entityType,
  values,
  onChange,
  readonly = false,
  mode = 'all',
}: Props) {
  const t = useTranslations('components.customFields');
  const { data } = useQuery({
    queryKey: ['custom-fields', entityType],
    queryFn: () => customFields.definitions(entityType).then((r) => r.definitions),
  });

  const definitions = useMemo(() => {
    const list = (data || []).filter((d) => d.is_active);
    if (mode === 'create') {
      return list.filter((d) => d.required_on === 'create' || d.required_on === '');
    }
    return list;
  }, [data, mode]);

  if (definitions.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-900">{t('title')}</h3>
      {definitions.map((def) => {
        const formField = toFormField(def);
        const textValue = valueToString(def, values[def.field_key]);
        if (readonly) {
          const display = def.field_type === 'checkbox'
            ? (values[def.field_key] === true ? t('yes') : t('no'))
            : (textValue || '—');
          return (
            <div key={def.id}>
              <dt className="text-xs font-medium text-gray-500">{def.label}</dt>
              <dd className="text-sm text-gray-900 mt-0.5 whitespace-pre-wrap">{display}</dd>
            </div>
          );
        }
        return (
          <DynamicFormField
            key={def.id}
            field={formField}
            value={textValue}
            onChange={(next) => {
              onChange({
                ...values,
                [def.field_key]: stringToValue(def, next),
              });
            }}
          />
        );
      })}
    </div>
  );
}
