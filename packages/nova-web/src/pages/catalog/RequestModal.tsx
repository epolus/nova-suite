/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, type FormEvent, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslations } from 'use-intl';
import { requests } from '../../api/client';
import type { ServiceItem, FormField } from '../../api/client';
import DynamicFormField from '../../components/DynamicFormField';
import { useStatusLabel } from '@/i18n/hooks';

function validateFormData(
  fields: FormField[],
  data: Record<string, string>,
  t: (key: 'fieldRequired' | 'mustBeNumber' | 'minValue' | 'maxValue' | 'dateNotPast' | 'patternMismatch', values?: Record<string, string | number>) => string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  for (const field of fields) {
    const val = data[field.name] || '';
    if (field.required && !val.trim() && field.type !== 'checkbox') {
      errors[field.name] = t('fieldRequired', { field: field.label || field.name });
      continue;
    }
    if (!val) continue;
    if (field.type === 'number') {
      const n = Number(val);
      if (Number.isNaN(n)) { errors[field.name] = t('mustBeNumber'); continue; }
      if (field.min != null && n < field.min) { errors[field.name] = t('minValue', { min: field.min }); continue; }
      if (field.max != null && n > field.max) { errors[field.name] = t('maxValue', { max: field.max }); continue; }
    }
    if (field.type === 'date') {
      if (val < todayIso) {
        errors[field.name] = t('dateNotPast');
      }
      continue;
    }
    if (field.pattern) {
      try {
        if (!new RegExp(field.pattern).test(val)) {
          errors[field.name] = t('patternMismatch');
        }
      } catch {}
    }
  }
  return errors;
}

const PRIORITY_VALUES = ['low', 'medium', 'high', 'critical'] as const;

interface Props {
  item: ServiceItem;
  onClose: () => void;
}

export default function RequestModal({ item, onClose }: Props) {
  const t = useTranslations('pages.catalog');
  const tActions = useTranslations('common.actions');
  const tValidation = useTranslations('common.validation');
  const tFields = useTranslations('common.fields');
  const statusLabel = useStatusLabel();
  const navigate = useNavigate();
  const fields: FormField[] = item.form_schema?.fields || [];
  const [formData, setFormData] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const f of fields) {
      if (f.defaultValue) initial[f.name] = f.defaultValue;
    }
    return initial;
  });
  const [priority, setPriority] = useState('medium');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const validate = useCallback(
    (fieldsToValidate: FormField[], data: Record<string, string>) =>
      validateFormData(fieldsToValidate, data, tValidation),
    [tValidation],
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errs = validate(fields, formData);
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await requests.create({
        service_item_id: item.id,
        form_data: formData,
        priority,
      });
      navigate(`/requests/${res.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('submitFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">{item.name}</h2>
          <p className="text-sm text-gray-500">{item.short_description}</p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}

          {fields.map((field) => (
            <div key={field.name}>
              <DynamicFormField
                field={field}
                value={formData[field.name] || ''}
                onChange={(val) => {
                  setFormData({ ...formData, [field.name]: val });
                  if (fieldErrors[field.name]) {
                    const { [field.name]: _, ...rest } = fieldErrors;
                    setFieldErrors(rest);
                  }
                }}
              />
              {fieldErrors[field.name] && (
                <p className="text-xs text-red-500 mt-1">{fieldErrors[field.name]}</p>
              )}
            </div>
          ))}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{tFields('priority')}</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            >
              {PRIORITY_VALUES.map((value) => (
                <option key={value} value={value}>{statusLabel(value)}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {tActions('cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? t('submitting') : t('submitRequest')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
