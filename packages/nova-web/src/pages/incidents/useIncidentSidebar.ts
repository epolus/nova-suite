/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect } from 'react';
import { incidents as incidentsApi, knowledge as knowledgeApi } from '../../api/client';
import type { SimilarIncident, KnowledgeSuggestion } from '../../api/client';

export function useIncidentSidebar(id: string | undefined, intelligenceOpen: boolean) {
  const [similarIncidents, setSimilarIncidents] = useState<SimilarIncident[]>([]);
  const [kbSuggestions, setKbSuggestions] = useState<KnowledgeSuggestion[]>([]);
  const [loadingSidebar, setLoadingSidebar] = useState(false);
  const [sidebarError, setSidebarError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !intelligenceOpen) return;
    setLoadingSidebar(true);
    setSidebarError(null);
    Promise.all([
      incidentsApi.similar(id, { limit: 6 }),
      knowledgeApi.suggestionsForIncident(id, { limit: 6 }),
    ])
      .then(([similarRes, kbRes]) => {
        setSimilarIncidents(similarRes.incidents);
        setKbSuggestions(kbRes.articles);
      })
      .catch((err: Error) => {
        setSidebarError(err.message || 'Failed to load suggestions');
        setSimilarIncidents([]);
        setKbSuggestions([]);
      })
      .finally(() => setLoadingSidebar(false));
  }, [id, intelligenceOpen]);

  return { similarIncidents, kbSuggestions, loadingSidebar, sidebarError };
}
