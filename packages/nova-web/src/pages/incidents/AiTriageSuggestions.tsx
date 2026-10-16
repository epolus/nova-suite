/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import { incidents as incidentsApi, type IncidentAiSuggestion } from '../../api/client';

type Props = {
  incidentId: string;
  readonly: boolean;
  onApplied?: () => Promise<void> | void;
};

export function AiTriageSuggestions({ incidentId, readonly, onApplied }: Props) {
  const t = useTranslations('pages.incidents');
  const tActions = useTranslations('common.actions');
  const [suggestions, setSuggestions] = useState<IncidentAiSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [prevIncidentId, setPrevIncidentId] = useState(incidentId);
  if (incidentId !== prevIncidentId) {
    setPrevIncidentId(incidentId);
    setSuggestions([]);
    setError('');
    setLoading(true);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await incidentsApi.aiSuggestions(incidentId);
        if (cancelled) return;
        setSuggestions(res.suggestions);
        setError('');
      } catch (err: unknown) {
        if (cancelled) return;
        setSuggestions([]);
        setError(err instanceof Error ? err.message : t('aiTriageLoadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [incidentId, t, reloadToken]);

  const pending = suggestions.filter((s) => s.status === 'pending');
  if (!loading && !error && pending.length === 0 && suggestions.length === 0) {
    return null;
  }

  const refresh = () => {
    setLoading(true);
    setReloadToken((n) => n + 1);
  };

  const accept = async (id: string) => {
    setBusyId(id);
    try {
      await incidentsApi.acceptAiSuggestion(incidentId, id);
      refresh();
      await onApplied?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('aiTriageAcceptFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (id: string) => {
    setBusyId(id);
    try {
      await incidentsApi.rejectAiSuggestion(incidentId, id);
      refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('aiTriageRejectFailed'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 mb-4 dark:border-amber-800 dark:bg-amber-950/40">
      <h3 className="text-sm font-semibold text-amber-900 mb-1 dark:text-amber-100">{t('aiTriageTitle')}</h3>
      <p className="text-xs text-amber-800/80 mb-3 dark:text-amber-200/80">{t('aiTriageDescription')}</p>
      {loading && <p className="text-sm text-gray-500 dark:text-gray-400">{t('loadingRecommendations')}</p>}
      {error && <p className="text-sm text-red-600 mb-2 dark:text-red-400">{error}</p>}
      {!loading && pending.length === 0 && suggestions.length > 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('aiTriageNonePending')}</p>
      )}
      <ul className="space-y-3">
        {pending.map((s) => (
          <li key={s.id} className="rounded-md border border-amber-200 bg-white p-3 dark:border-amber-800 dark:bg-gray-900">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-800 dark:text-gray-200">
              {s.suggested_category && (
                <span>{t('aiTriageCategory')}: <strong>{s.suggested_category}</strong></span>
              )}
              {s.suggested_impact && (
                <span>{t('aiTriageImpact')}: <strong>{s.suggested_impact}</strong></span>
              )}
              {s.suggested_urgency && (
                <span>{t('aiTriageUrgency')}: <strong>{s.suggested_urgency}</strong></span>
              )}
              {s.sentiment && (
                <span>{t('aiTriageSentiment')}: <strong>{s.sentiment}</strong></span>
              )}
              {s.confidence != null && (
                <span>{t('aiTriageConfidence')}: <strong>{Math.round(Number(s.confidence) * 100)}%</strong></span>
              )}
            </div>
            {s.suggested_tags?.length > 0 && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t('aiTriageTags')}: {s.suggested_tags.join(', ')}
              </p>
            )}
            {!readonly && (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={busyId === s.id}
                  onClick={() => void accept(s.id)}
                  className="px-3 py-1.5 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {tActions('accept')}
                </button>
                <button
                  type="button"
                  disabled={busyId === s.id}
                  onClick={() => void reject(s.id)}
                  className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  {tActions('reject')}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
