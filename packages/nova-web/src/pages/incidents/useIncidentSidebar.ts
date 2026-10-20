/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect } from 'react';
import { incidents as incidentsApi, knowledge as knowledgeApi } from '../../api/client';
import type { CorrelationHint, SimilarIncident, KnowledgeSuggestion, KnownErrorSuggestion } from '../../api/client';

export function useIncidentSidebar(id: string | undefined, intelligenceOpen: boolean) {
  const [similarIncidents, setSimilarIncidents] = useState<SimilarIncident[]>([]);
  const [kbSuggestions, setKbSuggestions] = useState<KnowledgeSuggestion[]>([]);
  const [knownErrors, setKnownErrors] = useState<KnownErrorSuggestion[]>([]);
  const [correlations, setCorrelations] = useState<CorrelationHint[]>([]);
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
      incidentsApi.correlations(id),
    ])
      .then(([similarRes, kbRes, knownErrorRes, correlationRes]) => {
        setSimilarIncidents(similarRes.incidents);
        setKbSuggestions(kbRes.articles);
        setKnownErrors(knownErrorRes.known_errors);
        setCorrelations(correlationRes.hints);
      })
      .catch((err: Error) => {
        setSidebarError(err.message || 'Failed to load suggestions');
        setSimilarIncidents([]);
        setKbSuggestions([]);
        setKnownErrors([]);
        setCorrelations([]);
      })
      .finally(() => setLoadingSidebar(false));
  }, [id, intelligenceOpen]);

  return { similarIncidents, kbSuggestions, knownErrors, correlations, loadingSidebar, sidebarError };
}
