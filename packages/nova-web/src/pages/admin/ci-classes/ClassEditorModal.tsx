/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import type { CIClass } from '../../../api/client';
import {
  ATTR_TYPES,
  REFERENCE_TABLES,
  formatAttrType,
  getInheritedAttrs,
  type ClassDraft,
} from './classHelpers';

type IconOption = { value: string; label: string; emoji: string };

export default function ClassEditorModal({
  editing,
  classes,
  icons,
  error,
  saving,
  onChange,
  onSave,
  onClose,
}: {
  editing: ClassDraft;
  classes: CIClass[];
  icons: IconOption[];
  error: string;
  saving: boolean;
  onChange: (draft: ClassDraft) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('pages.admin.ciClasses');
  const tFields = useTranslations('common.fields');
  const tActions = useTranslations('common.actions');
  const tStates = useTranslations('common.states');
  const tMaster = useTranslations('common.masterData');

  const addAttr = () => {
    onChange({ ...editing, attributes: [...editing.attributes, { key: '', type: 'string', reference_table: undefined }] });
  };

  const removeAttr = (idx: number) => {
    onChange({ ...editing, attributes: editing.attributes.filter((_, i) => i !== idx) });
  };

  const updateAttr = (idx: number, field: 'key' | 'type' | 'reference_table', value: string) => {
    const attrs = [...editing.attributes];
    const current = attrs[idx]!;
    if (field === 'key') {
      attrs[idx] = { ...current, key: value };
    } else if (field === 'type') {
      attrs[idx] = {
        ...current,
        type: value,
        reference_table: value === 'reference' ? (current.reference_table || 'users') : undefined,
      };
    } else {
      attrs[idx] = { ...current, reference_table: value };
    }
    onChange({ ...editing, attributes: attrs });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            {editing.id ? t('editClass') : t('newClassTitle')}
          </h2>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{tFields('systemName')} *</label>
              <input
                value={editing.name}
                onChange={(e) => onChange({ ...editing, name: e.target.value })}
                disabled={!!editing.id}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
                placeholder={t('placeholderSystemName')}
              />
              {!editing.id && (
                <p className="text-xs text-gray-400 mt-1">{t('systemNameHint')}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{tFields('displayName')} *</label>
              <input
                value={editing.display_name}
                onChange={(e) => onChange({ ...editing, display_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder={t('placeholderDisplayName')}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{tFields('description')}</label>
            <textarea
              value={editing.description}
              onChange={(e) => onChange({ ...editing, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              placeholder={t('placeholderDescription')}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{tFields('icon')}</label>
              <div className="flex flex-wrap gap-2">
                {icons.map((ic) => (
                  <button
                    key={ic.value}
                    onClick={() => onChange({ ...editing, icon: ic.value })}
                    className={`p-2 rounded-lg border-2 transition-all text-lg ${
                      editing.icon === ic.value
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-100 hover:border-gray-200'
                    }`}
                    title={ic.label}
                  >
                    {ic.emoji}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{tFields('parentClass')}</label>
              <select
                value={editing.parent_class}
                onChange={(e) => onChange({ ...editing, parent_class: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">{tStates('none')}</option>
                {classes.filter((c) => c.id !== editing.id).map((c) => (
                  <option key={c.id} value={c.id}>{c.display_name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Inherited attributes (read-only) */}
          {editing.parent_class && (() => {
            const inherited = getInheritedAttrs(editing.parent_class, classes);
            if (inherited.length === 0) return null;
            return (
              <div>
                <label className="text-xs font-medium text-gray-500 mb-2 block">
                  {t('inheritedAttributes')}
                  <span className="ml-1 text-gray-400 font-normal">{t('inheritedFromParent')}</span>
                </label>
                <div className="space-y-1.5">
                  {inherited.map((attr) => (
                    <div key={attr.key} className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-100 rounded-lg opacity-80">
                      <span className="text-xs text-amber-500 w-6 text-right">&#8627;</span>
                      <span className="flex-1 px-2.5 py-1.5 text-sm text-gray-500">{attr.key}</span>
                      <span className="px-2.5 py-1.5 text-sm text-gray-400">{formatAttrType(attr, t, tFields)}</span>
                      <span className="p-1 text-xs text-amber-500">{t('inheritedLabel')}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-amber-600 mt-1.5">
                  {t('inheritedHint')}
                </p>
              </div>
            );
          })()}

          {/* Attributes builder */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-medium text-gray-500">{t('ownAttributes')}</label>
              <button
                onClick={addAttr}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
              >
                {t('addAttribute')}
              </button>
            </div>

            {editing.attributes.length === 0 ? (
              <div className="text-center py-6 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                <p className="text-sm text-gray-400">{t('noAttributesYet')}</p>
                <button
                  onClick={addAttr}
                  className="mt-2 text-xs text-indigo-600 font-medium hover:text-indigo-800"
                >
                  {t('addFirstAttribute')}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {editing.attributes.map((attr, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-2 p-2 bg-gray-50 rounded-lg">
                    <span className="text-xs text-gray-400 w-6 text-right">{idx + 1}</span>
                    <input
                      value={attr.key}
                      onChange={(e) => updateAttr(idx, 'key', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                      className="flex-1 min-w-[120px] px-2.5 py-1.5 border border-gray-200 rounded-md text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder={t('placeholderAttributeName')}
                    />
                    <select
                      value={attr.type}
                      onChange={(e) => updateAttr(idx, 'type', e.target.value)}
                      className="w-28 px-2.5 py-1.5 border border-gray-200 rounded-md text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {ATTR_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                    {attr.type === 'reference' && (
                      <select
                        value={attr.reference_table || 'users'}
                        onChange={(e) => updateAttr(idx, 'reference_table', e.target.value)}
                        className="w-40 px-2.5 py-1.5 border border-indigo-200 bg-indigo-50 rounded-md text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {REFERENCE_TABLES.map((ref) => (
                          <option key={ref.value} value={ref.value}>{tFields(ref.fieldKey)}</option>
                        ))}
                      </select>
                    )}
                    <button
                      onClick={() => removeAttr(idx)}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                      title={tActions('remove')}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-gray-400 mt-2">
              {t('attributesHint')}
            </p>
          </div>
        </div>

        <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {tActions('cancel')}
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? tActions('saving') : editing.id ? tMaster('saveChanges') : t('createClass')}
          </button>
        </div>
      </div>
    </div>
  );
}
