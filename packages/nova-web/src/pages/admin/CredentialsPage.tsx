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
  const [saving, setSaving] = useState(false);

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
      if (mode === 'create') {
        await credentialsApi.create({
          slug: slug.trim(),
          label: label.trim(),
          description: description.trim() || null,
          secret,
        });
      } else if (editId) {
        await credentialsApi.update(editId, {
          label: label.trim(),
          description: description.trim() || null,
          ...(secret.trim() ? { secret: secret.trim() } : {}),
        });
      }
      await load();
      setMode('list');
      setEditId(null);
      setDetail(null);
      setSecret('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
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
        description="Encrypted integration secrets (PostgreSQL pgcrypto). Use {{cred.slug}} in catalog automation or credential_slug in data sources. Set CREDENTIALS_MASTER_KEY on API and worker."
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
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={saving || (mode === 'create' && (!slug.trim() || !label.trim() || !secret))}
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
