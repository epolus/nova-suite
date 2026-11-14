/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState } from 'react';
import { useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import { csat as csatApi } from '@/api/client';
import Card from '@/components/Card';
import Spinner from '@/components/Spinner';
import { Button } from '@/components/ui/button';

const SCORES = [1, 2, 3, 4, 5] as const;

export default function CsatSurveyPage() {
  const { token = '' } = useParams<{ token: string }>();
  const t = useTranslations('pages.csat');
  const queryClient = useQueryClient();
  const queryKey = ['csat', token] as const;

  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const query = useQuery({
    queryKey,
    queryFn: () => csatApi.getByToken(token),
    enabled: token.length >= 16,
  });

  if (!token || token.length < 16) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <Card className="max-w-lg w-full">
          <h1 className="text-lg font-semibold text-gray-900">{t('notFoundTitle')}</h1>
          <p className="mt-2 text-sm text-gray-600">{t('notFoundMessage')}</p>
        </Card>
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <Card className="max-w-lg w-full">
          <h1 className="text-lg font-semibold text-gray-900">{t('notFoundTitle')}</h1>
          <p className="mt-2 text-sm text-gray-600">
            {query.error instanceof Error ? query.error.message : t('notFoundMessage')}
          </p>
        </Card>
      </div>
    );
  }

  const view = query.data;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (score == null) {
      setSubmitError(t('scoreRequired'));
      return;
    }
    setSaving(true);
    setSubmitError('');
    try {
      const updated = await csatApi.submitByToken(token, {
        score,
        comment: comment.trim() || null,
      });
      queryClient.setQueryData(queryKey, updated);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t('submitFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <Card className="max-w-lg w-full">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{t('brand')}</p>
        <h1 className="mt-2 text-xl font-semibold text-gray-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-gray-600">
          {t('aboutIncident', { number: view.incident_number, title: view.incident_title })}
        </p>

        {view.submitted ? (
          <div className="mt-6 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3">
            <p className="text-sm font-medium text-emerald-800">{t('thanks')}</p>
            <p className="mt-1 text-sm text-emerald-700">
              {t('yourScore', { score: view.score ?? 0 })}
            </p>
            {view.comment && (
              <p className="mt-2 text-sm text-emerald-700 whitespace-pre-wrap">{view.comment}</p>
            )}
          </div>
        ) : (
          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <fieldset>
              <legend className="text-sm font-medium text-gray-800">{t('scoreLabel')}</legend>
              <div className="mt-3 flex flex-wrap gap-2">
                {SCORES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setScore(n)}
                    className={[
                      'h-11 w-11 rounded-lg border text-sm font-semibold transition-colors',
                      score === n
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-gray-300 bg-white text-gray-800 hover:border-blue-400',
                    ].join(' ')}
                    aria-pressed={score === n}
                    aria-label={t('scoreOption', { score: n })}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-500">{t('scoreHint')}</p>
            </fieldset>

            <div>
              <label htmlFor="csat-comment" className="text-sm font-medium text-gray-800">
                {t('commentLabel')}
              </label>
              <textarea
                id="csat-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                maxLength={4000}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                placeholder={t('commentPlaceholder')}
              />
            </div>

            {submitError && (
              <p className="text-sm text-red-600">{submitError}</p>
            )}

            <Button type="submit" disabled={saving || score == null}>
              {saving ? t('submitting') : t('submit')}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
