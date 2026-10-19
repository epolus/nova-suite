/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'use-intl';
import { improvements } from '@/api/client';
import type { ImprovementJournalEntry } from '@/api/client';
import Card from '@/components/Card';
import Badge from '@/components/Badge';
import { formatDateTime } from '@/utils/dateTime';

export function ImprovementJournal({ improvementId, revision }: { improvementId: string; revision: number }) {
  const t = useTranslations('pages.improvements');
  const tStates = useTranslations('common.states');
  const [entries, setEntries] = useState<ImprovementJournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [entryType, setEntryType] = useState<'comment' | 'work_note'>('comment');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');

  const loadKey = `${improvementId}:${revision}`;
  const [prevKey, setPrevKey] = useState(loadKey);
  if (loadKey !== prevKey) {
    setPrevKey(loadKey);
    setLoading(true);
  }

  useEffect(() => {
    let cancelled = false;
    improvements.journal(improvementId)
      .then((res) => {
        if (!cancelled) setEntries(res.entries);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : t('journalFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [improvementId, revision, t]);

  const post = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) return;
    setPosting(true);
    setError('');
    try {
      await improvements.addJournal(improvementId, { entry_type: entryType, content: trimmed });
      setContent('');
      const res = await improvements.journal(improvementId);
      setEntries(res.entries);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('journalFailed'));
    } finally {
      setPosting(false);
    }
  };

  return (
    <Card>
      <h3 className="font-semibold text-gray-900 mb-4">{t('activityJournal')}</h3>
      <form onSubmit={(event) => void post(event)} className="mb-4">
        <label htmlFor="improvement-journal" className="sr-only">{t('journalPlaceholder')}</label>
        <textarea
          id="improvement-journal"
          name="journal"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder={t('journalPlaceholder')}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-hidden resize-none"
        />
        <div className="flex items-center gap-3 mt-2">
          <label htmlFor="improvement-journal-type" className="sr-only">{t('journalComment')}</label>
          <select
            id="improvement-journal-type"
            name="entry_type"
            value={entryType}
            onChange={(event) => setEntryType(event.target.value as 'comment' | 'work_note')}
            className="px-2 py-1 border border-gray-200 rounded-sm text-xs bg-white"
          >
            <option value="comment">{t('journalComment')}</option>
            <option value="work_note">{t('journalWorkNote')}</option>
          </select>
          <button
            type="submit"
            disabled={posting || !content.trim()}
            className="ml-auto px-3 py-1 bg-indigo-600 text-white rounded-sm text-xs font-medium hover:bg-indigo-700 disabled:opacity-40"
          >
            {t('journalPost')}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </form>
      <div className="space-y-3 divide-y divide-gray-50">
        {loading ? (
          <p className="text-sm text-gray-500 text-center py-4">{tStates('loading')}</p>
        ) : entries.map((entry) => (
          <div key={entry.id} className="pt-3 first:pt-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-gray-900">{entry.author_name}</span>
              <Badge value={entry.entry_type} />
              <span className="text-xs text-gray-400 ml-auto">{formatDateTime(entry.created_at)}</span>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{entry.content}</p>
          </div>
        ))}
        {!loading && entries.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">{t('noActivity')}</p>
        )}
      </div>
    </Card>
  );
}
