/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import type { TenantCredentialListItem } from '@/api/client';
import Card from '@/components/Card';
import type { FormData } from './dataSourceForm';

interface DataSourceAuthFieldsProps {
  form: FormData;
  setField: (key: keyof FormData, value: string | boolean) => void;
  vaultCreds: TenantCredentialListItem[];
}

export default function DataSourceAuthFields({ form, setField, vaultCreds }: DataSourceAuthFieldsProps) {
  const t = useTranslations('pages.admin.dataSources');
  const tFields = useTranslations('common.fields');

  return (
    <>
      {(form.source_type === 'rest_api' || form.source_type === 'sftp') && (
        <Card>
          <h3 className="font-semibold text-gray-900 mb-4">{t('vaultSection')}</h3>
          <p className="text-xs text-gray-500 mb-3">
            {t('vaultHint')}
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('credentialSlug')}</label>
            <input
              list="nova-vault-slugs-ds"
              value={form.credential_slug}
              onChange={(e) => setField('credential_slug', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              placeholder="my_integration_secret"
            />
            <datalist id="nova-vault-slugs-ds">
              {vaultCreds.map((c) => (
                <option key={c.id} value={c.slug}>{c.label}</option>
              ))}
            </datalist>
          </div>
        </Card>
      )}

      {/* ── Authentication (REST API only) ── */}
      {form.source_type === 'rest_api' && (
        <Card>
          <h3 className="font-semibold text-gray-900 mb-4">{t('authentication')}</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('authType')}</label>
              <select
                value={form.auth_type}
                onChange={(e) => setField('auth_type', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                <option value="none">{t('authTypes.none')}</option>
                <option value="bearer">{t('authTypes.bearer')}</option>
                <option value="oauth2">{t('authTypes.oauth2')}</option>
              </select>
            </div>

            {form.auth_type === 'bearer' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('bearerToken')}</label>
                <input
                  type="password"
                  value={form.bearer_token}
                  onChange={(e) => setField('bearer_token', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder="your-api-token"
                />
              </div>
            )}

            {form.auth_type === 'oauth2' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{tFields('tokenUrl')}</label>
                  <input
                    type="url"
                    value={form.oauth2_token_url}
                    onChange={(e) => setField('oauth2_token_url', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    placeholder="https://auth.example.com/oauth/token"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{tFields('clientId')}</label>
                    <input
                      type="text"
                      value={form.oauth2_client_id}
                      onChange={(e) => setField('oauth2_client_id', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      placeholder="client-id"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{tFields('clientSecret')}</label>
                    <input
                      type="password"
                      value={form.oauth2_client_secret}
                      onChange={(e) => setField('oauth2_client_secret', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      placeholder="client-secret"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {tFields('scope')}
                    <span className="text-gray-400 font-normal ml-1">{t('scopeHint')}</span>
                  </label>
                  <input
                    type="text"
                    value={form.oauth2_scope}
                    onChange={(e) => setField('oauth2_scope', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    placeholder="read:users read:data"
                  />
                </div>
                <p className="text-xs text-gray-400">
                  {t('oauth2Hint')}
                </p>
              </>
            )}
          </div>
        </Card>
      )}

      {form.source_type === 'rest_api' && (
        <Card>
          <h3 className="font-semibold text-gray-900 mb-4">{t('paginationSection')}</h3>
          <div className="space-y-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.pagination_enabled}
                onChange={(e) => setField('pagination_enabled', e.target.checked)}
                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              />
              <span className="text-sm font-medium text-gray-700">{t('enablePagination')}</span>
            </label>

            {form.pagination_enabled && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('mode')}</label>
                  <select
                    value={form.pagination_mode}
                    onChange={(e) => setField('pagination_mode', e.target.value as 'page' | 'offset')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  >
                    <option value="page">{t('paginationModes.page')}</option>
                    <option value="offset">{t('paginationModes.offset')}</option>
                  </select>
                </div>

                {form.pagination_mode === 'page' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('pageParam')}</label>
                      <input
                        type="text"
                        value={form.pagination_page_param}
                        onChange={(e) => setField('pagination_page_param', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        placeholder="page"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('startPage')}</label>
                      <input
                        type="number"
                        value={form.pagination_page_start}
                        onChange={(e) => setField('pagination_page_start', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        placeholder="1"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('sizeParam')}</label>
                      <input
                        type="text"
                        value={form.pagination_page_size_param}
                        onChange={(e) => setField('pagination_page_size_param', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        placeholder="limit"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('pageSize')}</label>
                      <input
                        type="number"
                        value={form.pagination_page_size}
                        onChange={(e) => setField('pagination_page_size', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        placeholder="100"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('offsetParam')}</label>
                      <input
                        type="text"
                        value={form.pagination_offset_param}
                        onChange={(e) => setField('pagination_offset_param', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        placeholder="offset"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('startOffset')}</label>
                      <input
                        type="number"
                        value={form.pagination_offset_start}
                        onChange={(e) => setField('pagination_offset_start', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('limitParam')}</label>
                      <input
                        type="text"
                        value={form.pagination_limit_param}
                        onChange={(e) => setField('pagination_limit_param', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        placeholder="limit"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('limit')}</label>
                      <input
                        type="number"
                        value={form.pagination_limit}
                        onChange={(e) => setField('pagination_limit', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        placeholder="100"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('maxPages')}</label>
                  <input
                    type="number"
                    value={form.pagination_max_pages}
                    onChange={(e) => setField('pagination_max_pages', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    placeholder="20"
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    {t('maxPagesHelp')}
                  </p>
                </div>
              </>
            )}
          </div>
        </Card>
      )}
    </>
  );
}
