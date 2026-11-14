/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import { csat as csatApi } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { isAgentRole } from '@/utils/roles';
import { formatDateTime } from '@/utils/dateTime';
import Card from './Card';
import { Button } from './ui/button';

type Props = {
  incidentId: string;
};

export default function SatisfactionCard({ incidentId }: Props) {
  const t = useTranslations('components.satisfaction');
  const { user } = useAuth();
  const isAgent = isAgentRole(user?.roles);
  const [copied, setCopied] = useState(false);

  const query = useQuery({
    queryKey: ['csat-incident', incidentId],
    queryFn: () => csatApi.getForIncident(incidentId),
  });

  const row = query.data?.satisfaction;
  if (query.isLoading) {
    return (
      <Card>
        <h3 className="text-sm font-semibold text-gray-900">{t('title')}</h3>
        <p className="mt-2 text-sm text-gray-500">{t('loading')}</p>
      </Card>
    );
  }

  if (!row) {
    return (
      <Card>
        <h3 className="text-sm font-semibold text-gray-900">{t('title')}</h3>
        <p className="mt-2 text-sm text-gray-500">{t('pendingResolve')}</p>
      </Card>
    );
  }

  const surveyUrl = row.token
    ? `${window.location.origin}/csat/${encodeURIComponent(row.token)}`
    : null;

  async function copyLink() {
    if (!surveyUrl) return;
    try {
      await navigator.clipboard.writeText(surveyUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Card>
      <h3 className="text-sm font-semibold text-gray-900">{t('title')}</h3>

      {row.submitted_at && row.score != null ? (
        <div className="mt-3 space-y-2">
          <p className="text-2xl font-semibold text-gray-900">
            {t('scoreValue', { score: row.score })}
          </p>
          <p className="text-xs text-gray-500">
            {t('submittedAt', { when: formatDateTime(row.submitted_at) })}
          </p>
          {row.comment && (
            <p className="text-sm text-gray-700 whitespace-pre-wrap border-t border-gray-100 pt-2">
              {row.comment}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-2 text-sm text-gray-500">{t('awaiting')}</p>
      )}

      {isAgent && surveyUrl && !row.submitted_at && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={copyLink}>
            {copied ? t('copied') : t('copyLink')}
          </Button>
          <a
            href={surveyUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-600 hover:underline truncate max-w-full"
          >
            {surveyUrl}
          </a>
        </div>
      )}
    </Card>
  );
}
