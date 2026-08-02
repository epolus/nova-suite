/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTranslations } from 'use-intl';
import { assets } from '@/api/client';
import PageHeader from '@/components/PageHeader';
import Card from '@/components/Card';
import Spinner from '@/components/Spinner';
import UnsavedChangesDialog from '@/components/ui/UnsavedChangesDialog';
import { Button } from '@/components/ui/button';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';

const EMPTY_FORM = {
  asset_tag: '',
  name: '',
  category: 'hardware',
  status: 'in_use',
  vendor_name: '',
  notes: '',
};

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const t = useTranslations('pages.assets');
  const tActions = useTranslations('common.actions');

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [baseline, setBaseline] = useState(EMPTY_FORM);

  useEffect(() => {
    if (isNew || !id) return;
    setLoading(true);
    assets.get(id)
      .then((asset) => {
        const next = {
          asset_tag: asset.asset_tag,
          name: asset.name,
          category: asset.category,
          status: asset.status,
          vendor_name: asset.vendor_name || '',
          notes: asset.notes || '',
        };
        setForm(next);
        setBaseline(next);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : t('loadFailed')))
      .finally(() => setLoading(false));
  }, [id, isNew, t]);

  const isDirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(baseline),
    [baseline, form],
  );

  const saveRef = useRef<() => Promise<boolean>>(async () => false);
  const {
    dialogOpen,
    saving: dialogSaving,
    guardNavigate,
    allowNextNavigation,
    stayOnPage,
    leaveWithoutSaving,
    saveAndLeave,
  } = useUnsavedChangesGuard({
    isDirty,
    onSave: useCallback(() => saveRef.current(), []),
  });

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!form.asset_tag.trim() || !form.name.trim()) {
      setError(t('requiredFields'));
      return false;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        asset_tag: form.asset_tag.trim(),
        name: form.name.trim(),
        category: form.category,
        status: form.status,
        vendor_name: form.vendor_name || null,
        notes: form.notes || null,
      };
      if (isNew) {
        const created = await assets.create(payload);
        allowNextNavigation();
        navigate(`/assets/${created.id}`);
      } else if (id) {
        await assets.update(id, payload);
        setBaseline(form);
      }
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('saveFailed'));
      return false;
    } finally {
      setSaving(false);
    }
  }, [allowNextNavigation, form, id, isNew, navigate, t]);

  saveRef.current = handleSave;

  if (loading) return <Spinner />;

  const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500';

  return (
    <>
      <UnsavedChangesDialog
        open={dialogOpen}
        saving={dialogSaving}
        onStay={stayOnPage}
        onLeave={leaveWithoutSaving}
        onSaveAndLeave={saveAndLeave}
      />
      <PageHeader
        title={isNew ? t('newAsset') : form.name || t('title')}
        action={
          <div className="flex gap-2">
            <Button onClick={() => { void handleSave(); }} disabled={saving}>{saving ? tActions('saving') : tActions('save')}</Button>
            <Button variant="outline" onClick={() => guardNavigate('/assets')}>{tActions('back')}</Button>
          </div>
        }
      />
      {error && <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
      <Card className="max-w-2xl">
        <div className="grid gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('assetTag')} *</label>
            <input value={form.asset_tag} onChange={(e) => setForm((p) => ({ ...p, asset_tag: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('name')} *</label>
            <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('category')}</label>
              <select value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} className={inputCls}>
                <option value="hardware">Hardware</option>
                <option value="software">Software</option>
                <option value="license">License</option>
                <option value="consumable">Consumable</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('status')}</label>
              <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))} className={inputCls}>
                <option value="in_use">In use</option>
                <option value="in_stock">In stock</option>
                <option value="retired">Retired</option>
                <option value="disposed">Disposed</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('vendor')}</label>
            <input value={form.vendor_name} onChange={(e) => setForm((p) => ({ ...p, vendor_name: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('notes')}</label>
            <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={4} className={`${inputCls} resize-none`} />
          </div>
        </div>
      </Card>
    </>
  );
}
