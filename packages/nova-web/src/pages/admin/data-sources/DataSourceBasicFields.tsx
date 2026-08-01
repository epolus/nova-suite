/* SPDX-License-Identifier: AGPL-3.0-only */
import { useMemo } from 'react';
import { useTranslations } from 'use-intl';
import type { EntityFieldDef } from '@/api/client';
import Card from '@/components/Card';
import type { FormData } from './dataSourceForm';

interface DataSourceBasicFieldsProps {
  form: FormData;
  setField: (key: keyof FormData, value: string | boolean) => void;
  entities: EntityFieldDef[];
}

export default function DataSourceBasicFields({ form, setField, entities }: DataSourceBasicFieldsProps) {
  const t = useTranslations('pages.admin.dataSources');
  const tFields = useTranslations('common.fields');
  const tStates = useTranslations('common.states');

  const SOURCE_TYPES = useMemo(() => [
    { value: 'csv_url', label: t('sourceTypes.csvUrl') },
    { value: 'json_url', label: t('sourceTypes.jsonUrl') },
    { value: 'rest_api', label: t('sourceTypes.restApi') },
    { value: 'sftp', label: t('sourceTypes.sftp') },
  ], [t]);

  const IMPORT_MODES = useMemo(() => [
    { value: 'insert', label: t('importModes.insert') },
    { value: 'upsert', label: t('importModes.upsert') },
  ], [t]);

  const entityFields = entities.find((e) => e.key === form.entity_type)?.fields || [];

  return (
    <>
      <Card>
        <h3 className="font-semibold text-gray-900 mb-4">{t('basicInfo')}</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{tFields('name')}</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              placeholder={t('placeholderName')}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{tFields('description')}</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              placeholder={t('placeholderDescription')}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('entityType')}</label>
              <select
                value={form.entity_type}
                onChange={(e) => setField('entity_type', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                <option value="">{t('select')}</option>
                {entities.map((e) => (
                  <option key={e.key} value={e.key}>{e.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('importMode')}</label>
              <select
                value={form.import_mode}
                onChange={(e) => setField('import_mode', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                {IMPORT_MODES.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>
          {form.import_mode === 'upsert' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('upsertKey')}
                <span className="text-gray-400 font-normal ml-1">{t('upsertKeyHint')}</span>
              </label>
              <select
                value={form.upsert_key}
                onChange={(e) => setField('upsert_key', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                <option value="">{t('upsertDefault')}</option>
                {entityFields.map((f) => (
                  <option key={f.key} value={f.key}>{f.key}{f.required ? ' *' : ''}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-400">
                {t('upsertHelp')}
                {!form.upsert_key && form.entity_type && (
                  <span className="text-indigo-500">
                    {' '}{t('upsertDefaultKey', {
                      key: { departments: 'name', cost_centers: 'code', users: 'email', assignment_groups: 'name', cmdb: 'name' }[form.entity_type] || tStates('none').toLowerCase(),
                    })}
                  </span>
                )}
              </p>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <h3 className="font-semibold text-gray-900 mb-4">{t('dataSourceSection')}</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('sourceType')}</label>
            <select
              value={form.source_type}
              onChange={(e) => setField('source_type', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            >
              {SOURCE_TYPES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* ── HTTP-based sources (csv_url, json_url, rest_api) ── */}
          {form.source_type !== 'sftp' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('url')}</label>
                <input
                  type="url"
                  value={form.url}
                  onChange={(e) => setField('url', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder={t('placeholderUrl')}
                />
              </div>
              {(form.source_type === 'json_url' || form.source_type === 'rest_api') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('jsonPath')}
                    <span className="text-gray-400 font-normal ml-1">{t('jsonPathHint')}</span>
                  </label>
                  <input
                    type="text"
                    value={form.json_path}
                    onChange={(e) => setField('json_path', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    placeholder="data.results"
                  />
                </div>
              )}
              {form.source_type === 'rest_api' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('httpHeaders')}
                    <span className="text-gray-400 font-normal ml-1">{t('httpHeadersHint')}</span>
                  </label>
                  <textarea
                    value={form.headers}
                    onChange={(e) => setField('headers', e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    placeholder='{"X-Custom-Header": "value"}'
                  />
                </div>
              )}
            </>
          )}

          {/* ── SFTP source ── */}
          {form.source_type === 'sftp' && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('sftpHost')}</label>
                  <input
                    type="text"
                    value={form.sftp_host}
                    onChange={(e) => setField('sftp_host', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    placeholder="sftp.example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('port')}</label>
                  <input
                    type="number"
                    value={form.sftp_port}
                    onChange={(e) => setField('sftp_port', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    placeholder="22"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('username')}</label>
                <input
                  type="text"
                  value={form.sftp_username}
                  onChange={(e) => setField('sftp_username', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder="sftp_user"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('password')}
                  <span className="text-gray-400 font-normal ml-1">{t('passwordHint')}</span>
                </label>
                <input
                  type="password"
                  value={form.sftp_password}
                  onChange={(e) => setField('sftp_password', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('sshPrivateKey')}
                  <span className="text-gray-400 font-normal ml-1">{t('sshPrivateKeyHint')}</span>
                </label>
                <textarea
                  value={form.sftp_private_key}
                  onChange={(e) => setField('sftp_private_key', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('remoteFilePath')}</label>
                  <input
                    type="text"
                    value={form.sftp_path}
                    onChange={(e) => setField('sftp_path', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    placeholder="/exports/users.csv"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('fileType')}</label>
                  <select
                    value={form.sftp_file_type}
                    onChange={(e) => setField('sftp_file_type', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  >
                    <option value="csv">CSV</option>
                    <option value="json">JSON</option>
                  </select>
                </div>
              </div>
              {form.sftp_file_type === 'json' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('jsonPath')}
                    <span className="text-gray-400 font-normal ml-1">{t('jsonPathHint')}</span>
                  </label>
                  <input
                    type="text"
                    value={form.json_path}
                    onChange={(e) => setField('json_path', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    placeholder="data.results"
                  />
                </div>
              )}
            </>
          )}
        </div>
      </Card>

      {/* ── CSV Options (csv_url, or sftp with csv file type) ── */}
      {(form.source_type === 'csv_url' || (form.source_type === 'sftp' && form.sftp_file_type === 'csv')) && (
        <Card>
          <h3 className="font-semibold text-gray-900 mb-4">{t('csvOptions')}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('delimiter')}</label>
              <select
                value={form.csv_delimiter}
                onChange={(e) => setField('csv_delimiter', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                <option value="auto">{t('delimiters.auto')}</option>
                <option value=",">{t('delimiters.comma')}</option>
                <option value=";">{t('delimiters.semicolon')}</option>
                <option value={'\t'}>{t('delimiters.tab')}</option>
                <option value="|">{t('delimiters.pipe')}</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer pb-2">
                <input
                  type="checkbox"
                  checked={form.csv_has_headers}
                  onChange={(e) => setField('csv_has_headers', e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
                <span className="text-sm font-medium text-gray-700">{t('firstRowHeaders')}</span>
              </label>
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-400">
            {t('csvHeadersHelp')}
          </p>
        </Card>
      )}
    </>
  );
}
