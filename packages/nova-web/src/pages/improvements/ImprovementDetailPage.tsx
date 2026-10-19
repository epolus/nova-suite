/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useTranslations } from 'use-intl';
import { improvements } from '@/api/client';
import type { Improvement } from '@/api/client';
import PageHeader from '@/components/PageHeader';
import Card from '@/components/Card';
import Spinner from '@/components/Spinner';
import UnsavedChangesDialog from '@/components/ui/UnsavedChangesDialog';
import { Button } from '@/components/ui/button';
import { UserRefPicker } from '@/components/UserRefPicker';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { useStatusLabel } from '@/i18n/hooks';
import { ImprovementJournal } from './ImprovementJournal';

const STATUSES = ['registered', 'in_progress', 'done', 'cancelled'] as const;

const EMPTY_FORM = {
  title: '',
  description: '',
  status: 'registered',
  owner_user_id: '',
};

export default function ImprovementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const t = useTranslations('pages.improvements');
  const tActions = useTranslations('common.actions');
  const statusLabel = useStatusLabel();

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [record, setRecord] = useState<Improvement | null>(null);
  const [journalRevision, setJournalRevision] = useState(0);
  const [form, setForm] = useState(EMPTY_FORM);
  const [baseline, setBaseline] = useState(EMPTY_FORM);

  const [prevId, setPrevId] = useState(id);
  if (id !== prevId) {
    setPrevId(id);
    setLoading(!isNew);
    setError('');
    setRecord(null);
    if (isNew) {
      setForm(EMPTY_FORM);
      setBaseline(EMPTY_FORM);
    }
  }

  useEffect(() => {
    if (isNew || !id) return;
    let cancelled = false;
    improvements.get(id)
      .then((item) => {
        if (cancelled) return;
        const next = {
          title: item.title,
          description: item.description || '',
          status: item.status,
          owner_user_id: item.owner_user_id || '',
        };
        setRecord(item);
        setForm(next);
        setBaseline(next);
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
    if (!form.title.trim()) {
      setError(t('titleRequired'));
      return false;
    }
    setSaving(true);
    setError('');
    try {
      if (isNew) {
        const created = await improvements.create({
          title: form.title.trim(),
          description: form.description || null,
        });
        allowNextNavigation();
        navigate(`/improvements/${created.id}`);
        return true;
      }
      if (!id) return false;
      const updated = await improvements.update(id, {
        title: form.title.trim(),
        description: form.description || null,
        status: form.status,
        owner_user_id: form.owner_user_id || null,
      });
      const next = {
        title: updated.title,
        description: updated.description || '',
        status: updated.status,
        owner_user_id: updated.owner_user_id || '',
      };
      setRecord((current) => (current ? { ...current, ...updated } : updated));
      setForm(next);
      setBaseline(next);
      setJournalRevision((current) => current + 1);
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
  }, [handleSave]);

  if (loading) return <Spinner />;

  const sourceHref = record?.source_type === 'postmortem' && record.major_incident_id
    ? `/major-incidents/${record.major_incident_id}/postmortem`
    : record?.source_type === 'change' && record.change_id
      ? `/changes/${record.change_id}`
      : record?.source_type === 'problem' && record.problem_id
        ? `/problems/${record.problem_id}`
        : null;
  const sourceLabel = record?.source_type === 'postmortem'
    ? record.major_incident_number
    : record?.source_type === 'change'
      ? record.change_number
      : record?.source_type === 'problem'
        ? record.problem_number
        : null;

  return (
    <>
      <PageHeader
        title={isNew ? t('newImprovement') : record?.number || t('title')}
        description={isNew ? t('description') : record?.title}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => guardNavigate('/improvements')}>{tActions('back')}</Button>
            <Button onClick={() => void handleSave()} disabled={saving}>{saving ? tActions('saving') : tActions('save')}</Button>
          </div>
        }
      />
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}
      <Card>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('titleLabel')}</label>
            <input
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('descriptionLabel')}</label>
            <textarea
              rows={5}
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          {!isNew && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('status')}</label>
                <select
                  value={form.status}
                  onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                >
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>{statusLabel(status)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('owner')}</label>
                <UserRefPicker
                  id="improvement-owner"
                  name="owner_user_id"
                  ariaLabel={t('owner')}
                  value={form.owner_user_id}
                  onChange={(value) => setForm((current) => ({ ...current, owner_user_id: value }))}
                />
              </div>
            </div>
          )}
          {record && record.source_type !== 'manual' && (
            <p className="text-sm text-gray-600">
              {t('source')}: {t(`sources.${record.source_type}`)}
              {sourceHref && sourceLabel && (
                <>
                  {' '}
                  <Link to={sourceHref} className="text-indigo-700 hover:underline">{sourceLabel}</Link>
                </>
              )}
            </p>
          )}
        </div>
      </Card>
      {!isNew && id && (
        <div className="mt-6">
          <ImprovementJournal improvementId={id} revision={journalRevision} />
        </div>
      )}
      <UnsavedChangesDialog
        open={dialogOpen}
        saving={dialogSaving}
        onStay={stayOnPage}
        onLeave={leaveWithoutSaving}
        onSaveAndLeave={saveAndLeave}
      />
    </>
  );
}
