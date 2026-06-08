/* SPDX-License-Identifier: AGPL-3.0-only */
import { useMemo, useState } from 'react';
import { useTranslations } from 'use-intl';
import type { FormField } from '../api/client';
import { FIELD_TYPE_VALUES, TYPE_COLORS, slugify, EMPTY_FIELD } from './formBuilderConfig';
import FormFieldPreview from './FormFieldPreview';

interface Props {
  fields: FormField[];
  onChange: (fields: FormField[]) => void;
  ciClasses?: { id: string; name: string; display_name: string }[];
}

export default function FormBuilder({ fields, onChange, ciClasses = [] }: Props) {
  const t = useTranslations('components.formBuilder');
  const tActions = useTranslations('common.actions');
  const tFields = useTranslations('common.fields');
  const tStates = useTranslations('common.states');
  const fieldTypes = useMemo(
    () => FIELD_TYPE_VALUES.map((value) => ({ value, label: t(`fieldTypes.${value === 'cmdb_ref' ? 'cmdbRef' : value === 'user_ref' ? 'userRef' : value === 'multiselect' ? 'multiselect' : value}` as never) })),
    [t],
  );
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<FormField>({ ...EMPTY_FIELD });
  const [optionInput, setOptionInput] = useState('');
  const [filterKey, setFilterKey] = useState('');
  const [filterVal, setFilterVal] = useState('');

  const startAdd = () => {
    setDraft({ ...EMPTY_FIELD });
    setEditIdx(-1);
  };

  const startEdit = (idx: number) => {
    setDraft({ ...fields[idx]! });
    setEditIdx(idx);
    setOptionInput('');
    setFilterKey('');
    setFilterVal('');
  };

  const cancel = () => {
    setEditIdx(null);
    setDraft({ ...EMPTY_FIELD });
    setOptionInput('');
    setFilterKey('');
    setFilterVal('');
  };

  const save = () => {
    const field = {
      ...draft,
      name: draft.name || slugify(draft.label || 'field'),
    };
    if (!field.label?.trim()) return;

    if (editIdx === -1) {
      onChange([...fields, field]);
    } else if (editIdx !== null) {
      const updated = [...fields];
      updated[editIdx] = field;
      onChange(updated);
    }
    cancel();
  };

  const remove = (idx: number) => {
    onChange(fields.filter((_, i) => i !== idx));
    if (editIdx === idx) cancel();
  };

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const updated = [...fields];
    const temp = updated[idx]!;
    updated[idx] = updated[idx - 1]!;
    updated[idx - 1] = temp;
    onChange(updated);
  };

  const moveDown = (idx: number) => {
    if (idx >= fields.length - 1) return;
    const updated = [...fields];
    const temp = updated[idx]!;
    updated[idx] = updated[idx + 1]!;
    updated[idx + 1] = temp;
    onChange(updated);
  };

  const addOption = () => {
    if (!optionInput.trim()) return;
    setDraft({ ...draft, options: [...(draft.options || []), optionInput.trim()] });
    setOptionInput('');
  };

  const removeOption = (idx: number) => {
    setDraft({ ...draft, options: (draft.options || []).filter((_, i) => i !== idx) });
  };

  const addFilter = () => {
    if (!filterKey.trim()) return;
    setDraft({ ...draft, ci_filter: { ...(draft.ci_filter || {}), [filterKey.trim()]: filterVal.trim() } });
    setFilterKey('');
    setFilterVal('');
  };

  const removeFilter = (key: string) => {
    const updated = { ...(draft.ci_filter || {}) };
    delete updated[key];
    setDraft({ ...draft, ci_filter: Object.keys(updated).length > 0 ? updated : undefined });
  };

  const setD = (key: string, value: unknown) => setDraft({ ...draft, [key]: value });

  const showOptions = draft.type === 'select' || draft.type === 'multiselect';
  const showMinMax = draft.type === 'number';
  const showPattern = draft.type === 'text' || draft.type === 'email';
  const showCiClass = draft.type === 'cmdb_ref';

  return (
    <div>
      {/* Field List */}
      {fields.length === 0 && editIdx === null && (
        <p className="text-sm text-gray-400 mb-3">{t('noFields')}</p>
      )}

      {fields.length > 0 && (
        <div className="space-y-1 mb-4">
          {fields.map((f, idx) => (
            <div
              key={idx}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                editIdx === idx ? 'border-indigo-300 bg-indigo-50' : 'border-gray-100 bg-gray-50 hover:bg-gray-100'
              }`}
            >
              {/* Reorder */}
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => moveUp(idx)}
                  disabled={idx === 0}
                  className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs leading-none"
                  title={t('moveUp')}
                >&#9650;</button>
                <button
                  onClick={() => moveDown(idx)}
                  disabled={idx >= fields.length - 1}
                  className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs leading-none"
                  title={t('moveDown')}
                >&#9660;</button>
              </div>

              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-900">{f.label || f.name}</span>
                {f.required && <span className="text-red-500 text-xs ml-1">*</span>}
                <span className="text-xs text-gray-400 ml-2">({f.name})</span>
              </div>

              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[f.type] || 'bg-gray-100 text-gray-600'}`}>
                {fieldTypes.find((ft) => ft.value === f.type)?.label || f.type}
              </span>

              <button onClick={() => startEdit(idx)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">{tActions('edit')}</button>
              <button onClick={() => remove(idx)} className="text-xs text-red-500 hover:text-red-700 font-medium">{t('remove')}</button>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Form */}
      {editIdx !== null ? (
        <div className="border border-indigo-200 bg-indigo-50/50 rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-semibold text-gray-900">
            {editIdx === -1 ? t('addField') : t('editField')}
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('labelRequired')}</label>
              <input
                value={draft.label || ''}
                onChange={(e) => {
                  const label = e.target.value;
                  const autoName = editIdx === -1 || draft.name === slugify(draft.label || '');
                  setDraft({
                    ...draft,
                    label,
                    name: autoName ? slugify(label) : draft.name,
                  });
                }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder={t('labelPlaceholder')}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('fieldName')}</label>
              <input
                value={draft.name || ''}
                onChange={(e) => setD('name', e.target.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase())}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                placeholder={t('autoGenerated')}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('fieldType')}</label>
              <select
                value={draft.type}
                onChange={(e) => setD('type', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {fieldTypes.map((ft) => (
                  <option key={ft.value} value={ft.value}>{ft.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-4 pb-1">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!draft.required}
                  onChange={(e) => setD('required', e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded border-gray-300"
                />
                {tStates('required')}
              </label>
            </div>
          </div>

          {/* Placeholder & Help */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('placeholder')}</label>
              <input
                value={draft.placeholder || ''}
                onChange={(e) => setD('placeholder', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder={t('placeholderHint')}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('helpText')}</label>
              <input
                value={draft.helpText || ''}
                onChange={(e) => setD('helpText', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder={t('helpTextHint')}
              />
            </div>
          </div>

          {/* Default Value */}
          {draft.type !== 'checkbox' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('defaultValue')}</label>
              <input
                value={draft.defaultValue || ''}
                onChange={(e) => setD('defaultValue', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          {/* Type-specific: Options */}
          {showOptions && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('options')}</label>
              <div className="flex flex-wrap gap-1 mb-2">
                {(draft.options || []).map((opt, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-xs bg-white border border-gray-200 rounded-full px-2 py-1">
                    {opt}
                    <button onClick={() => removeOption(i)} className="text-red-400 hover:text-red-600">&times;</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={optionInput}
                  onChange={(e) => setOptionInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder={t('optionPlaceholder')}
                />
                <button onClick={addOption} className="px-3 py-2 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50">{t('addOption')}</button>
              </div>
            </div>
          )}

          {/* Type-specific: Number min/max */}
          {showMinMax && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('min')}</label>
                <input
                  type="number"
                  value={draft.min ?? ''}
                  onChange={(e) => setD('min', e.target.value === '' ? undefined : Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('max')}</label>
                <input
                  type="number"
                  value={draft.max ?? ''}
                  onChange={(e) => setD('max', e.target.value === '' ? undefined : Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          )}

          {/* Type-specific: Pattern */}
          {showPattern && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('validationPattern')}</label>
              <input
                value={draft.pattern || ''}
                onChange={(e) => setD('pattern', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                placeholder={t('patternPlaceholder')}
              />
            </div>
          )}

          {/* Type-specific: CI Class filter */}
          {showCiClass && (
            <>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('ciClass')}</label>
              <select
                value={draft.ci_class || ''}
                onChange={(e) => setD('ci_class', e.target.value || undefined)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">{t('anyClass')}</option>
                {ciClasses.map((c) => (
                  <option key={c.id} value={c.name}>{c.display_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('ciFilter')}</label>
              <p className="text-xs text-gray-400 mb-2">{t('ciFilterHelp')}</p>
              {draft.ci_filter && Object.keys(draft.ci_filter).length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {Object.entries(draft.ci_filter).map(([k, v]) => (
                    <span key={k} className="inline-flex items-center gap-1 text-xs bg-white border border-amber-200 rounded-full px-2 py-1">
                      <span className="font-medium text-amber-700">{k}</span>
                      <span className="text-gray-400">=</span>
                      <span className="text-gray-700">{v}</span>
                      <button onClick={() => removeFilter(k)} className="text-red-400 hover:text-red-600 ml-0.5">&times;</button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <select
                  value={filterKey}
                  onChange={(e) => setFilterKey(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">{t('selectFilter')}</option>
                  <option value="status">{tFields('status')}</option>
                  <option value="environment">{tFields('environment')}</option>
                  <option value="managed_by">{tFields('managedBy')}</option>
                </select>
                <input
                  value={filterVal}
                  onChange={(e) => setFilterVal(e.target.value)}
                  placeholder={filterKey === 'managed_by' ? '$current_user' : filterKey === 'status' ? 'active' : 'value'}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFilter(); } }}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button onClick={addFilter} disabled={!filterKey.trim()} className="px-3 py-2 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 disabled:opacity-40">{t('addOption')}</button>
              </div>
            </div>
            </>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={save}
              disabled={!draft.label?.trim()}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {editIdx === -1 ? t('addField') : t('updateField')}
            </button>
            <button onClick={cancel} className="px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
              {tActions('cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={startAdd}
          className="w-full px-4 py-2.5 border-2 border-dashed border-gray-200 rounded-lg text-sm font-medium text-gray-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
        >
          {t('addFormField')}
        </button>
      )}

      {/* Live Preview */}
      {fields.length > 0 && editIdx === null && (
        <FormFieldPreview fields={fields} />
      )}
    </div>
  );
}
