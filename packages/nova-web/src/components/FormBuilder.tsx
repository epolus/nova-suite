/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState } from 'react';
import type { FormField } from '../api/client';

const FIELD_TYPES: { value: FormField['type']; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Text Area' },
  { value: 'number', label: 'Number' },
  { value: 'email', label: 'Email' },
  { value: 'date', label: 'Date' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'select', label: 'Dropdown' },
  { value: 'multiselect', label: 'Multi-select' },
  { value: 'cmdb_ref', label: 'CMDB Reference' },
  { value: 'user_ref', label: 'User Reference' },
];

const TYPE_COLORS: Record<string, string> = {
  text: 'bg-blue-100 text-blue-700',
  textarea: 'bg-blue-100 text-blue-700',
  number: 'bg-green-100 text-green-700',
  email: 'bg-purple-100 text-purple-700',
  date: 'bg-orange-100 text-orange-700',
  checkbox: 'bg-pink-100 text-pink-700',
  select: 'bg-cyan-100 text-cyan-700',
  multiselect: 'bg-cyan-100 text-cyan-700',
  cmdb_ref: 'bg-amber-100 text-amber-700',
  user_ref: 'bg-indigo-100 text-indigo-700',
};

function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

const EMPTY_FIELD: FormField = {
  name: '',
  label: '',
  type: 'text',
  required: false,
};

interface Props {
  fields: FormField[];
  onChange: (fields: FormField[]) => void;
  ciClasses?: { id: string; name: string; display_name: string }[];
}

export default function FormBuilder({ fields, onChange, ciClasses = [] }: Props) {
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
        <p className="text-sm text-gray-400 mb-3">No form fields defined. Users will only see priority and notes when requesting this item.</p>
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
                  title="Move up"
                >&#9650;</button>
                <button
                  onClick={() => moveDown(idx)}
                  disabled={idx >= fields.length - 1}
                  className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs leading-none"
                  title="Move down"
                >&#9660;</button>
              </div>

              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-900">{f.label || f.name}</span>
                {f.required && <span className="text-red-500 text-xs ml-1">*</span>}
                <span className="text-xs text-gray-400 ml-2">({f.name})</span>
              </div>

              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[f.type] || 'bg-gray-100 text-gray-600'}`}>
                {FIELD_TYPES.find((t) => t.value === f.type)?.label || f.type}
              </span>

              <button onClick={() => startEdit(idx)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">Edit</button>
              <button onClick={() => remove(idx)} className="text-xs text-red-500 hover:text-red-700 font-medium">Remove</button>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Form */}
      {editIdx !== null ? (
        <div className="border border-indigo-200 bg-indigo-50/50 rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-semibold text-gray-900">
            {editIdx === -1 ? 'Add Field' : 'Edit Field'}
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Label *</label>
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
                placeholder="e.g. Operating System"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Field Name</label>
              <input
                value={draft.name || ''}
                onChange={(e) => setD('name', e.target.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase())}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                placeholder="auto-generated"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
              <select
                value={draft.type}
                onChange={(e) => setD('type', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
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
                Required
              </label>
            </div>
          </div>

          {/* Placeholder & Help */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Placeholder</label>
              <input
                value={draft.placeholder || ''}
                onChange={(e) => setD('placeholder', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Hint text inside the field"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Help Text</label>
              <input
                value={draft.helpText || ''}
                onChange={(e) => setD('helpText', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Description shown below the field"
              />
            </div>
          </div>

          {/* Default Value */}
          {draft.type !== 'checkbox' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Default Value</label>
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
              <label className="block text-xs font-medium text-gray-500 mb-1">Options</label>
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
                  placeholder="Type option and press Enter"
                />
                <button onClick={addOption} className="px-3 py-2 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50">Add</button>
              </div>
            </div>
          )}

          {/* Type-specific: Number min/max */}
          {showMinMax && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Min</label>
                <input
                  type="number"
                  value={draft.min ?? ''}
                  onChange={(e) => setD('min', e.target.value === '' ? undefined : Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Max</label>
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
              <label className="block text-xs font-medium text-gray-500 mb-1">Validation Pattern (regex)</label>
              <input
                value={draft.pattern || ''}
                onChange={(e) => setD('pattern', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                placeholder="e.g. ^[A-Z]{2,4}$"
              />
            </div>
          )}

          {/* Type-specific: CI Class filter */}
          {showCiClass && (
            <>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Restrict to CI Class</label>
              <select
                value={draft.ci_class || ''}
                onChange={(e) => setD('ci_class', e.target.value || undefined)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Any class</option>
                {ciClasses.map((c) => (
                  <option key={c.id} value={c.name}>{c.display_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Query Filters</label>
              <p className="text-xs text-gray-400 mb-2">
                Filter which CIs are shown. Use <code className="bg-gray-100 px-1 rounded">$current_user</code> to reference the logged-in user.
              </p>
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
                  <option value="">Select filter...</option>
                  <option value="status">Status</option>
                  <option value="environment">Environment</option>
                  <option value="managed_by">Managed By</option>
                </select>
                <input
                  value={filterVal}
                  onChange={(e) => setFilterVal(e.target.value)}
                  placeholder={filterKey === 'managed_by' ? '$current_user' : filterKey === 'status' ? 'active' : 'value'}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFilter(); } }}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button onClick={addFilter} disabled={!filterKey.trim()} className="px-3 py-2 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 disabled:opacity-40">Add</button>
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
              {editIdx === -1 ? 'Add Field' : 'Update Field'}
            </button>
            <button onClick={cancel} className="px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={startAdd}
          className="w-full px-4 py-2.5 border-2 border-dashed border-gray-200 rounded-lg text-sm font-medium text-gray-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
        >
          + Add Form Field
        </button>
      )}

      {/* Live Preview */}
      {fields.length > 0 && editIdx === null && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Form Preview</h4>
          <div className="space-y-3 border border-gray-200 rounded-xl p-4 bg-white">
            {fields.map((f) => (
              <div key={f.name}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {f.label || f.name}
                  {f.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                {f.type === 'textarea' ? (
                  <div className="w-full h-16 border border-gray-200 rounded-lg bg-gray-50" />
                ) : f.type === 'select' || f.type === 'multiselect' ? (
                  <div className="w-full h-9 border border-gray-200 rounded-lg bg-gray-50 px-3 flex items-center text-xs text-gray-400">
                    {f.options?.length ? f.options.slice(0, 3).join(', ') + (f.options.length > 3 ? '...' : '') : 'No options'}
                  </div>
                ) : f.type === 'checkbox' ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border border-gray-300 rounded" />
                    <span className="text-sm text-gray-500">{f.label || f.name}</span>
                  </div>
                ) : f.type === 'cmdb_ref' ? (
                  <div className="w-full border border-gray-200 rounded-lg bg-gray-50 px-3 py-2">
                    <span className="text-xs text-gray-400">Search CMDB{f.ci_class ? ` (${f.ci_class})` : ''}...</span>
                    {f.ci_filter && Object.keys(f.ci_filter).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {Object.entries(f.ci_filter).map(([k, v]) => (
                          <span key={k} className="text-xs bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded">{k}={v}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : f.type === 'user_ref' ? (
                  <div className="w-full h-9 border border-gray-200 rounded-lg bg-gray-50 px-3 flex items-center text-xs text-gray-400">
                    Search users...
                  </div>
                ) : (
                  <div className="w-full h-9 border border-gray-200 rounded-lg bg-gray-50 px-3 flex items-center text-xs text-gray-400">
                    {f.placeholder || f.type}
                  </div>
                )}
                {f.helpText && <p className="text-xs text-gray-400 mt-0.5">{f.helpText}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
