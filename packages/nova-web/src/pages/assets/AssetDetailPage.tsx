/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useTranslations } from 'use-intl';
import { assets } from '@/api/client';
import PageHeader from '@/components/PageHeader';
import Card from '@/components/Card';
import Spinner from '@/components/Spinner';
import UnsavedChangesDialog from '@/components/ui/UnsavedChangesDialog';
import { Button } from '@/components/ui/button';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { useStatusLabel } from '@/i18n/hooks';
import UserDateInput from '@/components/UserDateInput';

const ASSET_STATUSES = ['ordered', 'received', 'in_stock', 'in_use', 'maintenance', 'retired', 'disposed'] as const;

interface AssetForm {
  asset_tag: string;
  name: string;
  category: string;
  status: string;
  vendor_name: string;
  purchase_cost: string;
  purchase_currency: string;
  purchase_date: string;
  warranty_expires_at: string;
  contract_ref: string;
  depreciation_months: string;
  notes: string;
}

const EMPTY_FORM: AssetForm = {
  asset_tag: '',
  name: '',
  category: 'hardware',
  status: 'in_use',
  vendor_name: '',
  purchase_cost: '',
  purchase_currency: 'USD',
  purchase_date: '',
  warranty_expires_at: '',
  contract_ref: '',
  depreciation_months: '',
  notes: '',
};

function dateInput(value: string | null | undefined): string {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function textInput(value: string | number | null | undefined): string {
  if (value == null) return '';
  return String(value);
}

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const t = useTranslations('pages.assets');
  const tActions = useTranslations('common.actions');
  const tTable = useTranslations('common.table');
  const statusLabel = useStatusLabel();

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [baseline, setBaseline] = useState(EMPTY_FORM);
  const [linkedCi, setLinkedCi] = useState<{ id: string; name: string } | null>(null);
  const [prevId, setPrevId] = useState(id);

  if (id !== prevId) {
    setPrevId(id);
    setLoading(!isNew);
    setError('');
    if (isNew) {
      setForm(EMPTY_FORM);
      setBaseline(EMPTY_FORM);
      setLinkedCi(null);
    }
  }

  useEffect(() => {
    if (isNew || !id) return;
    let cancelled = false;
    assets.get(id)
      .then((asset) => {
        if (cancelled) return;
        const next: AssetForm = {
          asset_tag: asset.asset_tag,
          name: asset.name,
          category: asset.category,
          status: asset.status,
          vendor_name: asset.vendor_name || '',
          purchase_cost: textInput(asset.purchase_cost),
          purchase_currency: asset.purchase_currency || 'USD',
          purchase_date: dateInput(asset.purchase_date),
          warranty_expires_at: dateInput(asset.warranty_expires_at),
          contract_ref: asset.contract_ref || '',
          depreciation_months: textInput(asset.depreciation_months),
          notes: asset.notes || '',
        };
        setForm(next);
        setBaseline(next);
        setLinkedCi(asset.linked_ci_id
          ? { id: asset.linked_ci_id, name: asset.linked_ci_name || asset.linked_ci_id }
          : null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : t('loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
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
    const costText = form.purchase_cost.trim();
    const purchaseCost = costText === '' ? null : Number(costText);
    if (purchaseCost != null && !Number.isFinite(purchaseCost)) {
      setError(t('invalidCost'));
      return false;
    }
    const depreciationText = form.depreciation_months.trim();
    const depreciationMonths = depreciationText === '' ? null : Number(depreciationText);
    if (depreciationMonths != null && (!Number.isInteger(depreciationMonths) || depreciationMonths < 0)) {
      setError(t('invalidDepreciation'));
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
        purchase_cost: purchaseCost,
        purchase_currency: form.purchase_currency.trim() || 'USD',
        purchase_date: form.purchase_date || null,
        warranty_expires_at: form.warranty_expires_at || null,
        contract_ref: form.contract_ref.trim() || null,
        depreciation_months: depreciationMonths,
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

  useEffect(() => {
    saveRef.current = handleSave;
  });

  if (loading) return <Spinner />;

  const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-hidden focus:ring-2 focus:ring-indigo-500';

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
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('configurationItem')}</label>
            {linkedCi ? (
              <Link to={`/cmdb/${linkedCi.id}`} className="text-sm text-indigo-700 hover:underline">
                {linkedCi.name}
              </Link>
            ) : (
              <p className="text-sm text-gray-400">{tTable('emDash')}</p>
            )}
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
                {ASSET_STATUSES.map((status) => (
                  <option key={status} value={status}>{statusLabel(status)}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('vendor')}</label>
            <input value={form.vendor_name} onChange={(e) => setForm((p) => ({ ...p, vendor_name: e.target.value }))} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('purchaseCost')}</label>
              <input type="number" step="0.01" value={form.purchase_cost} onChange={(e) => setForm((p) => ({ ...p, purchase_cost: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('purchaseCurrency')}</label>
              <input value={form.purchase_currency} maxLength={8} onChange={(e) => setForm((p) => ({ ...p, purchase_currency: e.target.value }))} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('purchaseDate')}</label>
              <UserDateInput value={form.purchase_date} onChange={(value) => setForm((p) => ({ ...p, purchase_date: value }))} className={`${inputCls} pr-10`} ariaLabel={t('purchaseDate')} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('warrantyExpires')}</label>
              <UserDateInput value={form.warranty_expires_at} onChange={(value) => setForm((p) => ({ ...p, warranty_expires_at: value }))} className={`${inputCls} pr-10`} ariaLabel={t('warrantyExpires')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('contractRef')}</label>
              <input value={form.contract_ref} onChange={(e) => setForm((p) => ({ ...p, contract_ref: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('depreciationMonths')}</label>
              <input type="number" min="0" step="1" value={form.depreciation_months} onChange={(e) => setForm((p) => ({ ...p, depreciation_months: e.target.value }))} className={inputCls} />
            </div>
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
