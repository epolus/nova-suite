/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import type { TenantCredentialDetail } from '../../api/client';

export type SecretMode = 'plain' | 'oauth2_client_credentials';

interface CredentialFormProps {
  mode: 'create' | 'edit';
  slug: string;
  setSlug: (v: string) => void;
  label: string;
  setLabel: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  secret: string;
  setSecret: (v: string) => void;
  secretMode: SecretMode;
  setSecretMode: (v: SecretMode) => void;
  oauthTokenUrl: string;
  setOauthTokenUrl: (v: string) => void;
  oauthClientId: string;
  setOauthClientId: (v: string) => void;
  oauthClientSecret: string;
  setOauthClientSecret: (v: string) => void;
  oauthScope: string;
  setOauthScope: (v: string) => void;
  oauthAudience: string;
  setOauthAudience: (v: string) => void;
  saving: boolean;
  editId: string | null;
  detail: TenantCredentialDetail | null;
  tokenTestResult: string;
  onSave: () => void;
  onTestToken: () => void;
  onCancel: () => void;
}

export default function CredentialForm(props: CredentialFormProps) {
  const {
    mode, slug, setSlug, label, setLabel, description, setDescription,
    secret, setSecret, secretMode, setSecretMode,
    oauthTokenUrl, setOauthTokenUrl, oauthClientId, setOauthClientId,
    oauthClientSecret, setOauthClientSecret, oauthScope, setOauthScope,
    oauthAudience, setOauthAudience, saving, editId, detail, tokenTestResult,
    onSave, onTestToken, onCancel,
  } = props;
  const t = useTranslations('pages.admin.credentials');
  const tFields = useTranslations('common.fields');
  const tActions = useTranslations('common.actions');
  const tStates = useTranslations('common.states');

  return (
    <>
      <h3 className="font-semibold text-gray-900 mb-4">{mode === 'create' ? t('new') : t('edit')}</h3>
      <div className="space-y-4 max-w-lg">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{tFields('slug')}</label>
          <input
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm font-mono"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            disabled={mode === 'edit'}
            placeholder="my_api_token"
          />
          {mode === 'edit' && <p className="text-xs text-gray-400 mt-1">{t('slugImmutable')}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{tFields('label')}</label>
          <input
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t('labelPlaceholder')}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('descriptionOptional')}</label>
          <textarea
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{tFields('secretType')}</label>
          <select
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
            value={secretMode}
            onChange={(e) => setSecretMode(e.target.value as SecretMode)}
          >
            <option value="plain">{t('plainSecretOption')}</option>
            <option value="oauth2_client_credentials">{t('oauth2Option')}</option>
          </select>
        </div>
        {secretMode === 'oauth2_client_credentials' ? (
          <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs text-gray-600">
              {t('oauth2Hint')}
              {' '}
              <code className="rounded bg-gray-100 px-1 py-0.5">{"{{cred.slug.access_token}}"}</code>.
            </p>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{tFields('tokenUrl')}</label>
              <input
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                value={oauthTokenUrl}
                onChange={(e) => setOauthTokenUrl(e.target.value)}
                placeholder="https://idp.example.com/oauth/token"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{tFields('clientId')}</label>
              <input
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                value={oauthClientId}
                onChange={(e) => setOauthClientId(e.target.value)}
                placeholder="svc_catalog"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {tFields('clientSecret')} {mode === 'edit' ? t('clientSecretRotate') : ''}
              </label>
              <input
                type="password"
                autoComplete="new-password"
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                value={oauthClientSecret}
                onChange={(e) => setOauthClientSecret(e.target.value)}
                placeholder={mode === 'edit' ? '••••••••' : ''}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('scopeOptional')}</label>
              <input
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                value={oauthScope}
                onChange={(e) => setOauthScope(e.target.value)}
                placeholder="group.write users.read"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('audienceOptional')}</label>
              <input
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                value={oauthAudience}
                onChange={(e) => setOauthAudience(e.target.value)}
                placeholder="https://api.example.com"
              />
            </div>
            {mode === 'edit' && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={onTestToken}
                  disabled={saving || !editId}
                  className="px-3 py-1.5 text-xs font-medium text-indigo-700 border border-indigo-200 rounded-md hover:bg-indigo-50 disabled:opacity-50"
                >
                  {t('testToken')}
                </button>
              </div>
            )}
            {tokenTestResult && (
              <p className="text-xs text-emerald-700 rounded bg-emerald-50 border border-emerald-200 px-2 py-1">
                {tokenTestResult}
              </p>
            )}
          </div>
        ) : (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {tFields('secret')} {mode === 'edit' ? t('secretKeepExisting') : ''}
          </label>
          <input
            type="password"
            autoComplete="new-password"
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder={mode === 'edit' ? '••••••••' : ''}
          />
          {mode === 'edit' && detail && (
            <p className="text-xs text-gray-500 mt-1">{t('storedEncrypted', { value: detail.has_secret ? tStates('yes') : tStates('no') })}</p>
          )}
        </div>
        )}
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            disabled={
              saving
              || (mode === 'create' && !slug.trim())
              || (mode === 'create' && !label.trim())
              || (
                mode === 'create'
                && secretMode === 'plain'
                && !secret.trim()
              )
              || (
                mode === 'create'
                && secretMode === 'oauth2_client_credentials'
                && (!oauthTokenUrl.trim() || !oauthClientId.trim() || !oauthClientSecret.trim())
              )
            }
            onClick={onSave}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? tActions('saving') : tActions('save')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            {tActions('cancel')}
          </button>
        </div>
      </div>
    </>
  );
}
