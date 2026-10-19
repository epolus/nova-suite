/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useTranslations } from 'use-intl';
import { improvements, type ImprovementSource } from '@/api/client';
import { Button } from '@/components/ui/button';

export function ImprovementSourceLink({
  sourceType,
  sourceId,
  actionItemId,
  existingId,
  canRegister,
  onRegistered,
}: {
  sourceType: ImprovementSource;
  sourceId: string;
  actionItemId?: string;
  existingId?: string | null;
  canRegister: boolean;
  onRegistered?: () => void | Promise<void>;
}) {
  const t = useTranslations('pages.improvements');
  const [improvementId, setImprovementId] = useState<string | null>(existingId || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [prevExisting, setPrevExisting] = useState(existingId);
  if (existingId !== prevExisting) {
    setPrevExisting(existingId);
    if (existingId) setImprovementId(existingId);
  }

  useEffect(() => {
    if (existingId || sourceType === 'postmortem') return;
    let cancelled = false;
    improvements.source(sourceType, sourceId, actionItemId)
      .then((res) => {
        if (!cancelled && res.improvement) setImprovementId(res.improvement.id);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [actionItemId, existingId, sourceId, sourceType]);

  const register = async () => {
    setBusy(true);
    setError('');
    try {
      const created = sourceType === 'postmortem' && actionItemId
        ? await improvements.fromPostmortem(sourceId, actionItemId)
        : sourceType === 'change'
          ? await improvements.fromChange(sourceId)
          : await improvements.fromProblem(sourceId);
      setImprovementId(created.id);
      await onRegistered?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('registerFailed'));
    } finally {
      setBusy(false);
    }
  };

  if (improvementId) {
    return (
      <Link to={`/improvements/${improvementId}`} className="text-xs text-indigo-700 hover:underline">
        {t('open')}
      </Link>
    );
  }
  if (!canRegister) return null;

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button type="button" size="sm" variant="outline" onClick={() => void register()} disabled={busy}>
        {busy ? t('registering') : t('register')}
      </Button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
