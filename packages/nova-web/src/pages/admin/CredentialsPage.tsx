/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'use-intl';
import {
  credentials as credentialsApi,
  type TenantCredentialListItem,
  type TenantCredentialDetail,
} from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';
import { useAuth } from '../../context/AuthContext';
import { hasRole } from '../../utils/roles';
import { formatDateTime } from '../../utils/dateTime';
import CredentialForm, { type SecretMode } from './CredentialForm';

export default function CredentialsPage() {
  const t = useTranslations('pages.admin.credentials');
  const tFields = useTranslations('common.fields');
  const tActions = useTranslations('common.actions');
  const tTable = useTranslations('common.table');
  const { user } = useAuth();
  const canManage = hasRole(user?.roles, 'admin') || hasRole(user?.roles, 'credential_manager');

  const [items, setItems] = useState<TenantCredentialListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list');
  const [editId, setEditId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TenantCredentialDetail | null>(null);

  const [slug, setSlug] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [secret, setSecret] = useState('');
  const [secretMode, setSecretMode] = useState<SecretMode>('plain');
  const [oauthTokenUrl, setOauthTokenUrl] = useState('');
  const [oauthClientId, setOauthClientId] = useState('');
  const [oauthClientSecret, setOauthClientSecret] = useState('');
  const [oauthScope, setOauthScope] = useState('');
  const [oauthAudience, setOauthAudience] = useState('');
  const [saving, setSaving] = useState(false);
  const [tokenTestResult, setTokenTestResult] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await credentialsApi.list();
      setItems(res.credentials);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setMode('create');
    setEditId(null);
    setDetail(null);
    setSlug('');
    setLabel('');
    setDescription('');
    setSecret('');
    setSecretMode('plain');
    setOauthTokenUrl('');
    setOauthClientId('');
    setOauthClientSecret('');
    setOauthScope('');
    setOauthAudience('');
    setTokenTestResult('');
  };

  const openEdit = async (id: string) => {
    if (!canManage) return;
    setSaving(true);
    setError('');
    try {
      const res = await credentialsApi.get(id);
      const c = res.credential;
      setDetail(c);
      setEditId(id);
      setSlug(c.slug);
      setLabel(c.label);
      setDescription(c.description || '');
      setSecret('');
      if (c.secret_type === 'oauth2_client_credentials') {
        setSecretMode('oauth2_client_credentials');
        setOauthTokenUrl(c.oauth2?.token_url || '');
        setOauthClientId(c.oauth2?.client_id || '');
        setOauthClientSecret('');
        setOauthScope(c.oauth2?.scope || '');
        setOauthAudience(c.oauth2?.audience || '');
      } else {
        setSecretMode('plain');
        setOauthTokenUrl('');
        setOauthClientId('');
        setOauthClientSecret('');
        setOauthScope('');
        setOauthAudience('');
      }
      setTokenTestResult('');
      setMode('edit');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('loadCredentialFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!canManage) return;
    setSaving(true);
    setError('');
    try {
      const oauthSecretJson = JSON.stringify({
        auth_type: 'oauth2_client_credentials',
        token_url: oauthTokenUrl.trim(),
        client_id: oauthClientId.trim(),
        client_secret: oauthClientSecret.trim(),
        ...(oauthScope.trim() ? { scope: oauthScope.trim() } : {}),
        ...(oauthAudience.trim() ? { audience: oauthAudience.trim() } : {}),
      });
      const secretToSave = secretMode === 'oauth2_client_credentials' ? oauthSecretJson : secret.trim();
      if (mode === 'create') {
        if (secretMode === 'oauth2_client_credentials') {
          if (!oauthTokenUrl.trim() || !oauthClientId.trim() || !oauthClientSecret.trim()) {
            throw new Error('OAuth2 credentials require token URL, client ID, and client secret.');
          }
        } else if (!secret.trim()) {
          throw new Error('Secret is required on create.');
        }
        const created = await credentialsApi.create({
          slug: slug.trim(),
          label: label.trim(),
          description: description.trim() || null,
          secret: secretToSave,
        });
        const createdDetail = await credentialsApi.get(created.credential.id);
        const c = createdDetail.credential;
        setDetail(c);
        setEditId(c.id);
        setSlug(c.slug);
        setLabel(c.label);
        setDescription(c.description || '');
        setSecret('');
        setOauthClientSecret('');
        setMode('edit');
      } else if (editId) {
        const updateBody: {
          label: string;
          description: string | null;
          secret?: string;
          secret_type?: 'oauth2_client_credentials';
          oauth2?: { token_url: string; client_id: string; scope: string | null; audience: string | null };
        } = {
          label: label.trim(),
          description: description.trim() || null,
        };
        if (secretMode === 'oauth2_client_credentials') {
          if (!oauthTokenUrl.trim() || !oauthClientId.trim()) {
            throw new Error('OAuth2 credentials require token URL and client ID.');
          }
          updateBody.secret_type = 'oauth2_client_credentials';
          updateBody.oauth2 = {
            token_url: oauthTokenUrl.trim(),
            client_id: oauthClientId.trim(),
            scope: oauthScope.trim() || null,
            audience: oauthAudience.trim() || null,
          };
          if (oauthClientSecret.trim()) updateBody.secret = oauthSecretJson;
        } else if (secret.trim()) {
          updateBody.secret = secretToSave;
        }
        await credentialsApi.update(editId, {
          ...updateBody,
        });
        const updatedDetail = await credentialsApi.get(editId);
        const c = updatedDetail.credential;
        setDetail(c);
        setLabel(c.label);
        setDescription(c.description || '');
        setSecret('');
        setOauthClientSecret('');
        if (c.secret_type === 'oauth2_client_credentials') {
          setSecretMode('oauth2_client_credentials');
          setOauthTokenUrl(c.oauth2?.token_url || '');
          setOauthClientId(c.oauth2?.client_id || '');
          setOauthScope(c.oauth2?.scope || '');
          setOauthAudience(c.oauth2?.audience || '');
        }
      }
      await load();
      setTokenTestResult('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleTestToken = async () => {
    if (!canManage || !editId) return;
    setSaving(true);
    setError('');
    setTokenTestResult('');
    try {
      const result = await credentialsApi.testToken(editId);
      if (!result.ok) {
        setError(result.error || t('tokenTestFailed'));
        return;
      }
      const expiresInfo = result.expires_in ? `${result.expires_in}s` : 'unknown';
      setTokenTestResult(
        `OK - token_type=${result.token_type}, expires_in=${expiresInfo}, preview=${result.access_token_preview}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t('tokenTestFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!canManage || !window.confirm(t('confirmDelete'))) return;
    setSaving(true);
    setError('');
    try {
      await credentialsApi.remove(id);
      await load();
      if (mode === 'edit' && editId === id) {
        setMode('list');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('deleteFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading && items.length === 0 && mode === 'list') {
    return <Spinner />;
  }

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>
      )}

      {mode === 'list' && (
        <Card>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-600">
              {t('slugHint')} <code className="text-xs bg-gray-100 px-1 rounded">^[a-z][a-z0-9_]*$</code>.{' '}
              {t('permissionsHint')}
            </p>
            {canManage && (
              <button
                type="button"
                onClick={openCreate}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg bg-indigo-600 hover:bg-indigo-700"
              >
                {t('new')}
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2 pr-4 font-medium">{tFields('slug')}</th>
                  <th className="py-2 pr-4 font-medium">{tFields('label')}</th>
                  <th className="py-2 pr-4 font-medium">{tFields('updated')}</th>
                  {canManage && <th className="py-2 font-medium">{tTable('actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100">
                    <td className="py-2 pr-4 font-mono text-xs">{row.slug}</td>
                    <td className="py-2 pr-4">{row.label}</td>
                    <td className="py-2 pr-4 text-gray-500">{formatDateTime(row.updated_at)}</td>
                    {canManage && (
                      <td className="py-2 space-x-2">
                        <button type="button" className="text-indigo-600 hover:underline text-xs" onClick={() => openEdit(row.id)}>
                          {tActions('edit')}
                        </button>
                        <button type="button" className="text-red-600 hover:underline text-xs" onClick={() => handleDelete(row.id)}>
                          {tActions('delete')}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length === 0 && <p className="text-sm text-gray-500 py-6">{t('empty')}</p>}
          </div>
        </Card>
      )}

      {(mode === 'create' || mode === 'edit') && canManage && (
        <Card>
          <CredentialForm
            mode={mode}
            slug={slug}
            setSlug={setSlug}
            label={label}
            setLabel={setLabel}
            description={description}
            setDescription={setDescription}
            secret={secret}
            setSecret={setSecret}
            secretMode={secretMode}
            setSecretMode={setSecretMode}
            oauthTokenUrl={oauthTokenUrl}
            setOauthTokenUrl={setOauthTokenUrl}
            oauthClientId={oauthClientId}
            setOauthClientId={setOauthClientId}
            oauthClientSecret={oauthClientSecret}
            setOauthClientSecret={setOauthClientSecret}
            oauthScope={oauthScope}
            setOauthScope={setOauthScope}
            oauthAudience={oauthAudience}
            setOauthAudience={setOauthAudience}
            saving={saving}
            editId={editId}
            detail={detail}
            tokenTestResult={tokenTestResult}
            onSave={handleSave}
            onTestToken={handleTestToken}
            onCancel={() => {
              setMode('list');
              setSecret('');
              setDetail(null);
              setSecretMode('plain');
              setOauthTokenUrl('');
              setOauthClientId('');
              setOauthClientSecret('');
              setOauthScope('');
              setOauthAudience('');
            }}
          />
        </Card>
      )}
    </>
  );
}
