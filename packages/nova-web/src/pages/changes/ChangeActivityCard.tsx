/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import { changes } from '@/api/client';
import Badge from '../../components/Badge';
import Card from '../../components/Card';
import { Button } from '../../components/ui/button';
import { formatDateTime } from '../../utils/dateTime';

type Props = {
  changeId: string;
  readonly?: boolean;
};

export default function ChangeActivityCard({ changeId, readonly = false }: Props) {
  const t = useTranslations('pages.changes.activity');
  const tActions = useTranslations('common.actions');
  const queryClient = useQueryClient();
  const journalKey = ['change-journal', changeId] as const;
  const auditKey = ['change-audit', changeId] as const;

  const [tab, setTab] = useState<'journal' | 'audit'>('journal');
  const [content, setContent] = useState('');
  const [entryType, setEntryType] = useState<'comment' | 'work_note'>('comment');
  const [posting, setPosting] = useState(false);
  const [actionError, setActionError] = useState('');

  const journalQuery = useQuery({
    queryKey: journalKey,
    queryFn: () => changes.journal(changeId).then((r) => r.entries),
  });
  const auditQuery = useQuery({
    queryKey: auditKey,
    queryFn: () => changes.audit(changeId).then((r) => r.entries),
  });

  const journal = journalQuery.data ?? [];
  const audit = auditQuery.data ?? [];
  const loading = journalQuery.isLoading || auditQuery.isLoading;
  const loadError = journalQuery.error instanceof Error
    ? journalQuery.error.message
    : auditQuery.error instanceof Error
      ? auditQuery.error.message
      : (journalQuery.error || auditQuery.error)
        ? t('loadFailed')
        : '';
  const error = actionError || loadError;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!content.trim() || posting || readonly) return;
    setPosting(true);
    setActionError('');
    try {
      await changes.addJournal(changeId, {
        entry_type: entryType,
        content: content.trim(),
        is_customer_visible: false,
      });
      setContent('');
      await queryClient.invalidateQueries({ queryKey: journalKey });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('postFailed'));
    } finally {
      setPosting(false);
    }
  };

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-semibold text-gray-900">{t('title')}</h3>
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant={tab === 'journal' ? 'default' : 'outline'}
            onClick={() => setTab('journal')}
          >
            {t('journalTab')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={tab === 'audit' ? 'default' : 'outline'}
            onClick={() => setTab('audit')}
          >
            {t('auditTab')}
          </Button>
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {tab === 'journal' && (
        <>
          {!readonly && (
            <form onSubmit={onSubmit} className="mb-4">
              <label htmlFor="change-journal-content" className="sr-only">{t('composePlaceholder')}</label>
              <textarea
                id="change-journal-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={t('composePlaceholder')}
                rows={2}
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
              />
              <div className="mt-2 flex items-center gap-3">
                <select
                  value={entryType}
                  onChange={(e) => setEntryType(e.target.value as 'comment' | 'work_note')}
                  className="rounded-sm border border-gray-200 px-2 py-1 text-xs"
                >
                  <option value="comment">{t('comment')}</option>
                  <option value="work_note">{t('workNote')}</option>
                </select>
                <Button type="submit" size="sm" disabled={!content.trim() || posting} className="ml-auto">
                  {posting ? tActions('saving') : t('post')}
                </Button>
              </div>
            </form>
          )}

          <div className="space-y-3 divide-y divide-gray-50">
            {loading ? (
              <p className="py-4 text-center text-sm text-gray-500">{t('loading')}</p>
            ) : journal.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-400">{t('journalEmpty')}</p>
            ) : (
              journal.map((entry) => (
                <div key={entry.id} className="pt-3 first:pt-0">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{entry.author_name}</span>
                    <Badge value={entry.entry_type} />
                    <span className="text-xs text-gray-400">{formatDateTime(entry.created_at)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-gray-700">{entry.content}</p>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {tab === 'audit' && (
        <div className="space-y-3 divide-y divide-gray-50">
          {loading ? (
            <p className="py-4 text-center text-sm text-gray-500">{t('loading')}</p>
          ) : audit.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">{t('auditEmpty')}</p>
          ) : (
            audit.map((entry) => (
              <div key={entry.id} className="pt-3 first:pt-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">{entry.actor_name}</span>
                  <Badge value={entry.field_name} />
                  <span className="text-xs text-gray-400">{formatDateTime(entry.created_at)}</span>
                </div>
                <p className="text-sm text-gray-700">
                  <span className="text-gray-500">{entry.old_value ?? '—'}</span>
                  <span className="mx-2 text-gray-400">→</span>
                  <span>{entry.new_value ?? '—'}</span>
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </Card>
  );
}
