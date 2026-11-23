/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { knowledge as knowledgeApi, type KnowledgeArticleDetail } from '@/api/client';
import {
  CorrelationHintsSection,
  KbSuggestionsSection,
  KnownErrorsSection,
  SimilarIncidentsSection,
} from '@/components/IncidentSidebarSections';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useIncidentSidebar } from '@/pages/incidents/useIncidentSidebar';

type Props = {
  incidentId: string;
  active: boolean;
  onOpenNumber: (number: string) => void;
};

export default function WorkbenchInsights({ incidentId, active, onOpenNumber }: Props) {
  const tIncidents = useTranslations('pages.incidents');
  const tActions = useTranslations('common.actions');
  const {
    similarIncidents,
    kbSuggestions,
    knownErrors,
    correlations,
    loadingSidebar,
    sidebarError,
  } = useIncidentSidebar(active ? incidentId : undefined, active);
  const [preview, setPreview] = useState<KnowledgeArticleDetail | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  async function openPreview(articleId: string) {
    setPreviewError('');
    setPreviewLoading(true);
    try {
      setPreview(await knowledgeApi.article(articleId));
    } catch (err: unknown) {
      setPreview(null);
      setPreviewError(err instanceof Error ? err.message : tIncidents('articlePreviewFailed'));
    } finally {
      setPreviewLoading(false);
    }
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-3">
        <div>
          <h2 className="text-sm font-medium">{tIncidents('intelligentSidebar')}</h2>
          <p className="text-xs text-muted-foreground">{tIncidents('intelligentSidebarDescription')}</p>
        </div>
        {loadingSidebar && <p className="text-sm text-muted-foreground">{tIncidents('loadingRecommendations')}</p>}
        {sidebarError && <p className="text-sm text-destructive">{sidebarError}</p>}
        <KnownErrorsSection knownErrors={knownErrors} loading={loadingSidebar} />
        <CorrelationHintsSection hints={correlations} loading={loadingSidebar} />
        <SimilarIncidentsSection
          incidents={similarIncidents}
          loading={loadingSidebar}
          onGoTo={(id) => {
            const match = similarIncidents.find((item) => item.id === id);
            if (match?.number) onOpenNumber(match.number);
          }}
        />
        <KbSuggestionsSection articles={kbSuggestions} loading={loadingSidebar} onPreview={(id) => { void openPreview(id); }} />
        {(previewLoading || previewError || preview) && (
          <section className="rounded-md border p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide">{tIncidents('knowledgePreview')}</h3>
              <Button type="button" variant="ghost" size="sm" onClick={() => { setPreview(null); setPreviewError(''); }}>
                {tActions('close')}
              </Button>
            </div>
            {previewLoading && <p className="text-sm text-muted-foreground">{tIncidents('loadingArticle')}</p>}
            {previewError && <p className="text-sm text-destructive">{previewError}</p>}
            {preview && !previewLoading && (
              <div className="space-y-2">
                <p className="font-mono text-xs">{preview.number}</p>
                <p className="text-sm font-medium">{preview.title}</p>
                <p className="max-h-44 overflow-y-auto whitespace-pre-wrap text-xs text-muted-foreground">
                  {preview.content || tIncidents('noContent')}
                </p>
              </div>
            )}
          </section>
        )}
      </div>
    </ScrollArea>
  );
}
