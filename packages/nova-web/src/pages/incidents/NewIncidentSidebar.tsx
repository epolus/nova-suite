/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { attachments as attachmentsApi, knowledge as knowledgeApi } from '../../api/client';
import type { KnowledgeArticleDetail, SimilarIncident, KnowledgeSuggestion } from '../../api/client';
import { Card as UiCard, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { SimilarIncidentsSection, KbSuggestionsSection } from '../../components/IncidentSidebarSections';
import { useTranslations } from 'use-intl';

export function NewIncidentSidebar({
  similarIncidents,
  kbSuggestions,
  loadingSidebar,
  navigate,
}: {
  similarIncidents: SimilarIncident[];
  kbSuggestions: KnowledgeSuggestion[];
  loadingSidebar: boolean;
  navigate: NavigateFunction;
}) {
  const tIncidents = useTranslations('pages.incidents');
  const tActions = useTranslations('common.actions');

  const [previewArticle, setPreviewArticle] = useState<KnowledgeArticleDetail | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewAttachmentUrls, setPreviewAttachmentUrls] = useState<Record<string, string>>({});

  const openKnowledgePreview = async (articleId: string) => {
    setPreviewError('');
    setPreviewLoading(true);
    try {
      const article = await knowledgeApi.article(articleId);
      setPreviewArticle(article);
    } catch (err: unknown) {
      setPreviewArticle(null);
      setPreviewError(err instanceof Error ? err.message : tIncidents('articlePreviewFailed'));
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (!previewArticle?.content) { setPreviewAttachmentUrls({}); return; }
    const imageMatches = Array.from(previewArticle.content.matchAll(/!\[[^\]]*]\(attachment:([^)]+)\)/g));
    const linkMatches = Array.from(previewArticle.content.matchAll(/\[[^\]]+]\(attachment:([^)]+)\)/g));
    const ids = Array.from(new Set(
      [...imageMatches, ...linkMatches]
        .map((m) => m[1])
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ));
    if (ids.length === 0) { setPreviewAttachmentUrls({}); return; }
    Promise.all(ids.map(async (id) => ({ id, url: await attachmentsApi.previewUrl(id) })))
      .then((pairs) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const p of pairs) map[p.id] = p.url;
        setPreviewAttachmentUrls(map);
      })
      .catch(() => { if (!cancelled) setPreviewAttachmentUrls({}); });
    return () => { cancelled = true; };
  }, [previewArticle?.content]);

  return (
    <div className="mt-6 xl:mt-0 xl:w-[320px] xl:shrink-0">
      <UiCard>
        <CardHeader>
          <CardTitle>{tIncidents('intelligentSidebar')}</CardTitle>
          <p className="text-xs text-gray-500">{tIncidents('intelligentSidebarDescription')}</p>
        </CardHeader>
        <CardContent className="space-y-5">
          {loadingSidebar && <div className="text-sm text-gray-500">{tIncidents('loadingRecommendations')}</div>}
          <SimilarIncidentsSection incidents={similarIncidents} />
          <KbSuggestionsSection articles={kbSuggestions} onPreview={openKnowledgePreview} />
          {(previewLoading || previewError || previewArticle) && (
            <section className="rounded-md border border-indigo-200 bg-indigo-50/40 p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <h5 className="text-xs font-semibold uppercase tracking-wide text-indigo-700">{tIncidents('knowledgePreview')}</h5>
                <button
                  type="button"
                  onClick={() => { setPreviewArticle(null); setPreviewError(''); }}
                  className="text-xs text-indigo-600 hover:text-indigo-800"
                >
                  {tActions('close')}
                </button>
              </div>
              {previewLoading && <p className="text-sm text-gray-500">{tIncidents('loadingArticle')}</p>}
              {previewError && <p className="text-sm text-red-600">{previewError}</p>}
              {previewArticle && !previewLoading && (
                <div className="space-y-2">
                  <p className="text-xs font-mono text-indigo-600">{previewArticle.number}</p>
                  <p className="text-sm font-semibold text-gray-900">{previewArticle.title}</p>
                  <div className="text-xs text-gray-700 whitespace-pre-wrap max-h-44 overflow-y-auto space-y-2">
                    {previewArticle.content
                      ? previewArticle.content.split('\n').map((line, idx) => {
                        const img = line.match(/^!\[([^\]]*)\]\(attachment:([^)]+)\)\s*$/);
                        if (img) {
                          const alt = img[1] || 'attachment image';
                          const url = previewAttachmentUrls[img[2] || ''];
                          return url
                            ? <img key={`img-${idx}`} src={url} alt={alt} className="max-w-full rounded border border-indigo-100" />
                            : <p key={`img-missing-${idx}`} className="text-gray-400">{tIncidents('imageNotAvailable', { alt })}</p>;
                        }
                        const link = line.match(/^\[([^\]]+)\]\(attachment:([^)]+)\)\s*$/);
                        if (link) {
                          const label = link[1] || 'attachment';
                          const url = previewAttachmentUrls[link[2] || ''];
                          return url
                            ? (
                              <a key={`link-${idx}`} href={url} target="_blank" rel="noreferrer" className="text-indigo-700 underline">
                                {label}
                              </a>
                            )
                            : <p key={`link-missing-${idx}`} className="text-gray-400">{tIncidents('attachmentNotAvailable', { label })}</p>;
                        }
                        return <p key={`line-${idx}`}>{line}</p>;
                      })
                      : <p>{tIncidents('noContent')}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(`/knowledge?articleId=${previewArticle.id}`)}
                    className="text-xs font-medium text-indigo-700 hover:text-indigo-900"
                  >
                    {tIncidents('openFullArticle')}
                  </button>
                </div>
              )}
            </section>
          )}
        </CardContent>
      </UiCard>
    </div>
  );
}
