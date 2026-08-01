/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import type { ImportUploadResult } from '../../api/client';
import Card from '../../components/Card';

interface ImportMappingStepProps {
  uploadResult: ImportUploadResult;
  mapping: Record<string, string>;
  setMapping: (m: Record<string, string>) => void;
  fixedValues: Record<string, string>;
  setFixedValues: (m: Record<string, string>) => void;
  validating: boolean;
  onBack: () => void;
  onValidate: () => void;
}

export default function ImportMappingStep({
  uploadResult,
  mapping,
  setMapping,
  fixedValues,
  setFixedValues,
  validating,
  onBack,
  onValidate,
}: ImportMappingStepProps) {
  const t = useTranslations('pages.admin.import');
  const tActions = useTranslations('common.actions');

  return (
    <Card>
      <h3 className="font-semibold text-gray-900 mb-1">{t('mapColumns')}</h3>
      <p className="text-sm text-gray-500 mb-4">
        {t('rowsParsed', { count: uploadResult.total_rows, fileName: uploadResult.file_name })}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-2 font-medium text-gray-500">{t('sourceColumn')}</th>
              <th className="text-left px-4 py-2 font-medium text-gray-500">{t('targetField')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {uploadResult.file_columns.map((col) => (
              <tr key={col}>
                <td className="px-4 py-2 font-mono text-gray-700">{col}</td>
                <td className="px-4 py-2">
                  <select
                    value={mapping[col] || ''}
                    onChange={(e) => setMapping({ ...mapping, [col]: e.target.value })}
                    className="w-full max-w-xs px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  >
                    <option value="">{t('skip')}</option>
                    {uploadResult.fields.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}{f.required ? ' *' : ''}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-6">
        <h4 className="font-medium text-gray-900 mb-2">{t('optionalFixedValues')}</h4>
        <p className="text-xs text-gray-500 mb-3">
          {t('fixedValuesHint')}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-2 font-medium text-gray-500">{t('targetField')}</th>
                <th className="text-left px-4 py-2 font-medium text-gray-500">{t('fixedValue')}</th>
                <th className="text-left px-4 py-2 font-medium text-gray-500">{t('expectedFormat')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {uploadResult.fields.map((f) => (
                <tr key={`fixed-${f.key}`}>
                  <td className="px-4 py-2">
                    <span className="font-medium text-gray-700">{f.label}</span>
                    {f.required && <span className="text-red-500 ml-1">*</span>}
                  </td>
                  <td className="px-4 py-2">
                    <input
                      value={fixedValues[f.key] || ''}
                      onChange={(e) => setFixedValues({ ...fixedValues, [f.key]: e.target.value })}
                      placeholder={t('optionalDefaultValue')}
                      className="w-full max-w-xs px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">
                    {f.resolve_table && f.resolve_match
                      ? `${f.resolve_table}.${f.resolve_match}`
                      : f.type === 'enum' && f.enum_values && f.enum_values.length > 0
                        ? f.enum_values.join(', ')
                        : f.type || 'string'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={onBack}
          className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          {tActions('back')}
        </button>
        <button
          onClick={onValidate}
          disabled={validating || (Object.values(mapping).filter(Boolean).length === 0 && Object.values(fixedValues).filter((v) => String(v).trim() !== '').length === 0)}
          className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {validating ? t('validating') : t('validate')}
        </button>
      </div>
    </Card>
  );
}
