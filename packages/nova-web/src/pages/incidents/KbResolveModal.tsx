/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState } from 'react';
import { knowledge as knowledgeApi } from '../../api/client';
import type { KnowledgeSuggestion } from '../../api/client';
import { useTranslations } from 'use-intl';

export function KbResolveModal({
  kbSuggestions,
  saving,
  onResolve,
  onClose,
}: {
  kbSuggestions: KnowledgeSuggestion[];
  saving: boolean;
  onResolve: (kbId: string, notes: string) => Promise<void>;
  onClose: () => void;
}) {
  const tIncidents = useTranslations('pages.incidents');
  const tActions = useTranslations('common.actions');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<KnowledgeSuggestion[]>(kbSuggestions);
  const [searching, setSearching] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<KnowledgeSuggestion | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');

  const handleSearch = async (q: string) => {
    setSearch(q);
    if (!q.trim()) {
      setResults(kbSuggestions);
      return;
    }
    setSearching(true);
    try {
      const res = await knowledgeApi.suggestionsByText({ title: q, limit: 8 });
      setResults(res.articles);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">{tIncidents('kbResolve.title')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
        </div>

        <input
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder={tIncidents('kbResolve.searchPlaceholder')}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          autoFocus
        />

        <div className="max-h-52 overflow-y-auto space-y-1 border border-gray-100 rounded-lg">
          {searching && <p className="text-sm text-gray-400 p-3">{tIncidents('kbResolve.searching')}</p>}
          {!searching && results.length === 0 && <p className="text-sm text-gray-400 p-3">{tIncidents('kbResolve.noArticles')}</p>}
          {!searching && results.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelectedArticle(a)}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                selectedArticle?.id === a.id
                  ? 'bg-indigo-50 border-l-2 border-indigo-500'
                  : 'hover:bg-gray-50 border-l-2 border-transparent'
              }`}
            >
              <span className="text-xs text-gray-400 mr-2">{a.number}</span>
              <span className="font-medium text-gray-900">{a.title}</span>
              {a.category_name && <span className="text-xs text-gray-400 ml-2">• {a.category_name}</span>}
            </button>
          ))}
        </div>

        {selectedArticle && (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
            {tIncidents('kbResolve.selected')} <span className="font-medium">{selectedArticle.title}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{tIncidents('resolutionNotes')}</label>
          <textarea
            value={resolutionNotes}
            onChange={(e) => setResolutionNotes(e.target.value)}
            rows={3}
            placeholder={tIncidents('kbResolve.resolveNotesPlaceholder')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
          />
        </div>

        <div className="flex items-center gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
            {tActions('cancel')}
          </button>
          <button
            onClick={() => selectedArticle && onResolve(selectedArticle.id, resolutionNotes)}
            disabled={!selectedArticle || saving}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? tIncidents('kbResolve.resolving') : tIncidents('kbResolve.resolveIncident')}
          </button>
        </div>
      </div>
    </div>
  );
}
