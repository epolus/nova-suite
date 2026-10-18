/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect } from 'react';
import { incidents as incidentsApi, knowledge as knowledgeApi } from '../../api/client';
import type { SimilarIncident, KnowledgeSuggestion, KnownErrorSuggestion } from '../../api/client';

export function useIncidentSidebar(id: string | undefined, intelligenceOpen: boolean) {
  const [similarIncidents, setSimilarIncidents] = useState<SimilarIncident[]>([]);
  const [kbSuggestions, setKbSuggestions] = useState<KnowledgeSuggestion[]>([]);
  const [knownErrors, setKnownErrors] = useState<KnownErrorSuggestion[]>([]);
  const [loadingSidebar, setLoadingSidebar] = useState(false);
  const [sidebarError, setSidebarError] = useState<string | null>(null);

  const sidebarKey = `${id}|${intelligenceOpen}`;
  const [prevSidebarKey, setPrevSidebarKey] = useState(sidebarKey);
  if (sidebarKey !== prevSidebarKey) {
    setPrevSidebarKey(sidebarKey);
    if (id && intelligenceOpen) {
      setLoadingSidebar(true);
      setSidebarError(null);
    }
  }

  useEffect(() => {
    if (!id || !intelligenceOpen) return;
    Promise.all([
      incidentsApi.similar(id, { limit: 6 }),
      knowledgeApi.suggestionsForIncident(id, { limit: 6 }),
      incidentsApi.knownErrors(id),
    ])
      .then(([similarRes, kbRes, knownErrorRes]) => {
        setSimilarIncidents(similarRes.incidents);
        setKbSuggestions(kbRes.articles);
        setKnownErrors(knownErrorRes.known_errors);
      })
      .catch((err: Error) => {
        setSidebarError(err.message || 'Failed to load suggestions');
        setSimilarIncidents([]);
        setKbSuggestions([]);
        setKnownErrors([]);
      })
      .finally(() => setLoadingSidebar(false));
  }, [id, intelligenceOpen]);

  return { similarIncidents, kbSuggestions, knownErrors, loadingSidebar, sidebarError };
}
