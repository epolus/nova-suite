/* SPDX-License-Identifier: AGPL-3.0-only */
import { Link } from 'react-router-dom';
import type { SimilarIncident, KnowledgeSuggestion } from '../api/client';
import Badge from './Badge';

export function SimilarIncidentsSection({
  incidents,
  loading = false,
  onGoTo,
}: {
  incidents: SimilarIncident[];
  loading?: boolean;
  onGoTo?: (id: string) => void;
}) {
  return (
    <section>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Similar Incidents</h4>
      <div className="space-y-2">
        {!loading && incidents.length === 0 && <p className="text-sm text-gray-400">No similar incidents found.</p>}
        {incidents.map((si) => {
          const inner = (
            <>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono text-indigo-600">{si.number}</span>
                <Badge value={si.status} />
                <span className="ml-auto text-xs text-gray-400">Score {si.similarity_score}</span>
              </div>
              <p className="text-sm font-medium text-gray-900">{si.title}</p>
              <p className="text-xs text-gray-500 mt-1">{si.service_name || si.ci_display_name || si.ci_name || 'General'}</p>
            </>
          );
          return onGoTo ? (
            <button key={si.id} type="button" className="w-full text-left rounded-md border border-gray-200 p-3 hover:bg-gray-50" onClick={() => onGoTo(si.id)}>
              {inner}
            </button>
          ) : (
            <div key={si.id} className="rounded-md border border-gray-200 p-3">
              {inner}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function KbSuggestionsSection({
  articles,
  loading = false,
  onPreview,
}: {
  articles: KnowledgeSuggestion[];
  loading?: boolean;
  onPreview?: (id: string) => void;
}) {
  return (
    <section>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Suggested Knowledge</h4>
      <div className="space-y-2">
        {!loading && articles.length === 0 && <p className="text-sm text-gray-400">No article suggestions yet.</p>}
        {articles.map((article) => {
          const inner = (
            <>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono text-indigo-600">{article.number}</span>
                {article.category_name && <span className="text-xs text-gray-500">{article.category_name}</span>}
                <span className="ml-auto text-xs text-gray-400">Score {Number(article.suggestion_score || 0).toFixed(1)}</span>
              </div>
              <p className="text-sm font-medium text-gray-900">{article.title}</p>
              {article.excerpt && <p className="text-xs text-gray-500 mt-1 line-clamp-3">{article.excerpt}</p>}
            </>
          );
          return onPreview ? (
            <button
              key={article.id}
              type="button"
              className="w-full text-left rounded-md border border-gray-200 p-3 hover:bg-gray-50"
              onClick={() => onPreview(article.id)}
            >
              {inner}
            </button>
          ) : (
            <Link
              key={article.id}
              to={`/knowledge?articleId=${article.id}`}
              className="block rounded-md border border-gray-200 p-3 hover:bg-gray-50"
            >
              {inner}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
