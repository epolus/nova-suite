/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import type { FormField } from '../api/client';

export default function FormFieldPreview({ fields }: { fields: FormField[] }) {
  const t = useTranslations('components.formBuilder');
  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{t('formPreview')}</h4>
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
                {f.options?.length ? f.options.slice(0, 3).join(', ') + (f.options.length > 3 ? '...' : '') : t('noOptions')}
              </div>
            ) : f.type === 'checkbox' ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border border-gray-300 rounded" />
                <span className="text-sm text-gray-500">{f.label || f.name}</span>
              </div>
            ) : f.type === 'cmdb_ref' ? (
              <div className="w-full border border-gray-200 rounded-lg bg-gray-50 px-3 py-2">
                <span className="text-xs text-gray-400">{t('ciFilter')}{f.ci_class ? ` (${f.ci_class})` : ''}...</span>
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
                {t('fieldTypes.userRef')}...
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
  );
}
