/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import type { FieldDef } from './types';

interface FormModalProps<T extends { id: string; is_active: boolean }> {
  item: T | null;
  fields: FieldDef[];
  getDefaults: (item: T | null) => Record<string, string>;
  createItem: (data: Record<string, unknown>) => Promise<unknown>;
  updateItem: (id: string, data: Record<string, unknown>) => Promise<unknown>;
  onNavigate: (itemId: string) => void;
  prevItemId?: string | null;
  nextItemId?: string | null;
  onClose: () => void;
  onSaved: () => void;
  entityLabel: string;
}

export default function MasterDataFormModal<T extends { id: string; is_active: boolean }>({
  item,
  fields,
  getDefaults,
  createItem,
  updateItem,
  onNavigate,
  prevItemId,
  nextItemId,
  onClose,
  onSaved,
  entityLabel,
}: FormModalProps<T>) {
  const tMaster = useTranslations('common.masterData');
  const tActions = useTranslations('common.actions');
  const tFields = useTranslations('common.fields');
  const tErrors = useTranslations('errors');
  const isNew = !item;
  const [form, setForm] = useState<Record<string, string>>(() => getDefaults(item));
  const [isActive, setIsActive] = useState(item?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isNew) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'ArrowLeft' && prevItemId) onNavigate(prevItemId);
      if (e.key === 'ArrowRight' && nextItemId) onNavigate(nextItemId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isNew, prevItemId, nextItemId, onNavigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (isNew) {
        await createItem(form);
      } else {
        await updateItem(item.id, { ...form, is_active: isActive });
      }
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : tErrors('generic'));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto mx-4">
        <form onSubmit={handleSubmit}>
          <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 rounded-t-2xl flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                {isNew ? tMaster('createItem', { entity: entityLabel }) : tMaster('editItem', { entity: entityLabel })}
              </h2>
              {!isNew && (prevItemId || nextItemId) && (
                <p className="text-xs text-gray-500 mt-0.5">{tMaster('navigateRecords')}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!isNew && (
                <>
                  <button
                    type="button"
                    disabled={!prevItemId}
                    onClick={() => prevItemId && onNavigate(prevItemId)}
                    className="p-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                    title={tMaster('previousEntity', { entity: entityLabel.toLowerCase() })}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    disabled={!nextItemId}
                    onClick={() => nextItemId && onNavigate(nextItemId)}
                    className="p-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                    title={tMaster('nextEntity', { entity: entityLabel.toLowerCase() })}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </>
              )}
              <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
                &times;
              </button>
            </div>
          </div>

          <div className="px-6 py-5 space-y-4">
            {error && (
              <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
            )}

            {fields.map((field) => (
              <div key={field.key}>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  {field.label}{field.required ? ' *' : ''}
                </label>
                {field.type === 'textarea' ? (
                  <textarea
                    value={form[field.key] || ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
                  />
                ) : (
                  <input
                    type="text"
                    required={field.required}
                    value={form[field.key] || ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  />
                )}
              </div>
            ))}

            {!isNew && (
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">{tFields('status')}</label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-gray-200 rounded-full peer-checked:bg-indigo-600 transition-colors" />
                    <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform" />
                  </div>
                  <span className="text-sm text-gray-700">
                    {isActive ? tMaster('activeStatus') : tMaster('inactiveStatus')}
                  </span>
                </label>
              </div>
            )}
          </div>

          <div className="sticky bottom-0 bg-gray-50 border-t border-gray-100 px-6 py-4 rounded-b-2xl flex items-center justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors">
              {tActions('cancel')}
            </button>
            <button type="submit" disabled={saving} className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {saving
                ? tActions('saving')
                : isNew
                  ? tMaster('createItem', { entity: entityLabel })
                  : tMaster('saveChanges')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
