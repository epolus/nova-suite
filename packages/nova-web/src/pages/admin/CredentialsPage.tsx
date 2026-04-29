/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useCallback } from 'react';
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

type SecretMode = 'plain' | 'oauth2_client_credentials';

export default function CredentialsPage() {
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
      setError(e instanceof Error ? e.message : 'Failed to load credentials');
    } finally {
      setLoading(false);
    }
  }, []);

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
      setError(e instanceof Error ? e.message : 'Failed to load credential');
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
      setError(e instanceof Error ? e.message : 'Save failed');
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
        setError(result.error || 'Token test failed');
        return;
      }
      const expiresInfo = result.expires_in ? `${result.expires_in}s` : 'unknown';
      setTokenTestResult(
        `OK - token_type=${result.token_type}, expires_in=${expiresInfo}, preview=${result.access_token_preview}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Token test failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!canManage || !window.confirm('Delete this credential? References in catalog automation or data sources will break.')) return;
    setSaving(true);
    setError('');
    try {
      await credentialsApi.remove(id);
      await load();
      if (mode === 'edit' && editId === id) {
        setMode('list');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
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
        title="Credentials"
        description="Encrypted integration secrets (PostgreSQL pgcrypto). Use {{cred.slug}} for plain secrets or {{cred.slug.access_token}} for OAuth2 client-credentials. Set CREDENTIALS_MASTER_KEY on API and worker."
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>
      )}

      {mode === 'list' && (
        <Card>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-600">
              Slugs must match <code className="text-xs bg-gray-100 px-1 rounded">^[a-z][a-z0-9_]*$</code>.
              Catalog designers can see names only; admins and credential managers can create and rotate secrets.
            </p>
            {canManage && (
              <button
                type="button"
                onClick={openCreate}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg bg-indigo-600 hover:bg-indigo-700"
              >
                New credential
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2 pr-4 font-medium">Slug</th>
                  <th className="py-2 pr-4 font-medium">Label</th>
                  <th className="py-2 pr-4 font-medium">Updated</th>
                  {canManage && <th className="py-2 font-medium">Actions</th>}
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
                          Edit
                        </button>
                        <button type="button" className="text-red-600 hover:underline text-xs" onClick={() => handleDelete(row.id)}>
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length === 0 && <p className="text-sm text-gray-500 py-6">No credentials yet.</p>}
          </div>
        </Card>
      )}

      {(mode === 'create' || mode === 'edit') && canManage && (
        <Card>
          <h3 className="font-semibold text-gray-900 mb-4">{mode === 'create' ? 'New credential' : 'Edit credential'}</h3>
          <div className="space-y-4 max-w-lg">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Slug</label>
              <input
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm font-mono"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                disabled={mode === 'edit'}
                placeholder="my_api_token"
              />
              {mode === 'edit' && <p className="text-xs text-gray-400 mt-1">Slug cannot be changed after creation.</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
              <input
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Production API"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Description (optional)</label>
              <textarea
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Secret Type</label>
              <select
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                value={secretMode}
                onChange={(e) => setSecretMode(e.target.value as SecretMode)}
              >
                <option value="plain">Plain secret (token/password/API key)</option>
                <option value="oauth2_client_credentials">OAuth2 client credentials</option>
              </select>
            </div>
            {secretMode === 'oauth2_client_credentials' ? (
              <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs text-gray-600">
                  Stored as encrypted JSON once in this credential. Automation tasks only reference the slug using
                  {' '}
                  <code className="rounded bg-gray-100 px-1 py-0.5">{"{{cred.slug.access_token}}"}</code>.
                </p>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Token URL</label>
                  <input
                    className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                    value={oauthTokenUrl}
                    onChange={(e) => setOauthTokenUrl(e.target.value)}
                    placeholder="https://idp.example.com/oauth/token"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Client ID</label>
                  <input
                    className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                    value={oauthClientId}
                    onChange={(e) => setOauthClientId(e.target.value)}
                    placeholder="svc_catalog"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Client Secret {mode === 'edit' ? '(fill to rotate, blank keeps existing)' : ''}
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
                  <label className="block text-xs font-medium text-gray-600 mb-1">Scope (optional)</label>
                  <input
                    className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                    value={oauthScope}
                    onChange={(e) => setOauthScope(e.target.value)}
                    placeholder="group.write users.read"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Audience (optional)</label>
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
                      onClick={handleTestToken}
                      disabled={saving || !editId}
                      className="px-3 py-1.5 text-xs font-medium text-indigo-700 border border-indigo-200 rounded-md hover:bg-indigo-50 disabled:opacity-50"
                    >
                      Get token (test)
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
                Secret {mode === 'edit' ? '(leave blank to keep existing)' : ''}
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
                <p className="text-xs text-gray-500 mt-1">Stored encrypted. has_secret: {detail.has_secret ? 'yes' : 'no'}</p>
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
                onClick={handleSave}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => {
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
                className="px-4 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
