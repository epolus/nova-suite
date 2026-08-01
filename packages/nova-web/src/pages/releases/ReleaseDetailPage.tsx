/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslations } from 'use-intl';
import { releases } from '@/api/client';
import PageHeader from '@/components/PageHeader';
import Card from '@/components/Card';
import Spinner from '@/components/Spinner';
import UnsavedChangesDialog from '@/components/ui/UnsavedChangesDialog';
import UserDateTimeInput from '@/components/UserDateTimeInput';
import { Button } from '@/components/ui/button';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { toDatetimeLocalValue } from '@/utils/dateTime';

const EMPTY_FORM = {
  title: '',
  description: '',
  status: 'planned',
  release_type: 'minor',
  risk_level: 'medium',
  planned_start: '',
  planned_end: '',
  validation_notes: '',
  rollback_plan: '',
};

export default function ReleaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const t = useTranslations('pages.releases');
  const tActions = useTranslations('common.actions');

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [baseline, setBaseline] = useState(EMPTY_FORM);

  useEffect(() => {
    if (isNew || !id) return;
    setLoading(true);
    releases.get(id)
      .then((release) => {
        const next = {
          title: release.title,
          description: release.description || '',
          status: release.status,
          release_type: release.release_type,
          risk_level: release.risk_level,
          planned_start: toDatetimeLocalValue(release.planned_start),
          planned_end: toDatetimeLocalValue(release.planned_end),
          validation_notes: release.validation_notes || '',
          rollback_plan: release.rollback_plan || '',
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
    if (!form.title.trim()) {
      setError(t('titleRequired'));
      return false;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description || null,
        status: form.status,
        release_type: form.release_type,
        risk_level: form.risk_level,
        planned_start: form.planned_start ? new Date(form.planned_start).toISOString() : null,
        planned_end: form.planned_end ? new Date(form.planned_end).toISOString() : null,
        validation_notes: form.validation_notes || null,
        rollback_plan: form.rollback_plan || null,
      };
      if (isNew) {
        const created = await releases.create(payload);
        allowNextNavigation();
        navigate(`/releases/${created.id}`);
      } else if (id) {
        await releases.update(id, payload);
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
  const textareaCls = `${inputCls} resize-none`;

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
        title={isNew ? t('newRelease') : form.title || t('title')}
        action={
          <div className="flex gap-2">
            <Button onClick={() => { void handleSave(); }} disabled={saving}>{saving ? tActions('saving') : tActions('save')}</Button>
            <Button variant="outline" onClick={() => guardNavigate('/releases')}>{tActions('back')}</Button>
          </div>
        }
      />
      {error && <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
      <Card className="max-w-3xl">
        <div className="grid gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('title')} *</label>
            <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('descriptionLabel')}</label>
            <textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={4} className={textareaCls} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('status')}</label>
              <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))} className={inputCls}>
                <option value="planned">Planned</option>
                <option value="in_progress">In progress</option>
                <option value="deployed">Deployed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('type')}</label>
              <select value={form.release_type} onChange={(e) => setForm((p) => ({ ...p, release_type: e.target.value }))} className={inputCls}>
                <option value="major">Major</option>
                <option value="minor">Minor</option>
                <option value="emergency">Emergency</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('risk')}</label>
              <select value={form.risk_level} onChange={(e) => setForm((p) => ({ ...p, risk_level: e.target.value }))} className={inputCls}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('plannedStart')}</label>
              <UserDateTimeInput
                value={form.planned_start}
                onChange={(v) => setForm((p) => ({ ...p, planned_start: v }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('plannedEnd')}</label>
              <UserDateTimeInput
                value={form.planned_end}
                onChange={(v) => setForm((p) => ({ ...p, planned_end: v }))}
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('validationNotes')}</label>
            <textarea value={form.validation_notes} onChange={(e) => setForm((p) => ({ ...p, validation_notes: e.target.value }))} rows={3} className={textareaCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('rollbackPlan')}</label>
            <textarea value={form.rollback_plan} onChange={(e) => setForm((p) => ({ ...p, rollback_plan: e.target.value }))} rows={3} className={textareaCls} />
          </div>
        </div>
      </Card>
    </>
  );
}
