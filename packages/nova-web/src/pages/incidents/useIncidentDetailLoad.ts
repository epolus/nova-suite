/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { incidents as incidentsApi } from '../../api/client';
import type { Incident, JournalEntry } from '../../api/client';

type LoadParams = {
  id: string | undefined;
  listParams: Record<string, string>;
  syncFields: (incident: Incident) => void;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setLoadError: Dispatch<SetStateAction<string | null>>;
  setInc: Dispatch<SetStateAction<Incident | null>>;
  setJournal: Dispatch<SetStateAction<JournalEntry[]>>;
  setJournalLoading: Dispatch<SetStateAction<boolean>>;
  setPrevId: Dispatch<SetStateAction<string | null>>;
  setNextId: Dispatch<SetStateAction<string | null>>;
};

export function useIncidentDetailLoad({
  id,
  listParams,
  syncFields,
  setLoading,
  setLoadError,
  setInc,
  setJournal,
  setJournalLoading,
  setPrevId,
  setNextId,
}: LoadParams) {
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    const incidentPromise = incidentsApi.get(id);

    setPrevId(null);
    setNextId(null);
    void incidentsApi
      .nav(id, listParams)
      .then((navRes) => {
        if (cancelled) return;
        setPrevId(navRes.prev_id);
        setNextId(navRes.next_id);
      })
      .catch(() => {
        if (cancelled) return;
        setPrevId(null);
        setNextId(null);
      });

    setJournal([]);
    setJournalLoading(true);
    void incidentsApi
      .journal(id)
      .then((jRes) => {
        if (cancelled) return;
        setJournal(jRes.entries);
      })
      .catch(() => {
        if (cancelled) return;
        setJournal([]);
      })
      .finally(() => {
        if (!cancelled) setJournalLoading(false);
      });

    const clearIncidentState = () => {
      setInc(null);
      setJournal([]);
      setPrevId(null);
      setNextId(null);
    };

    incidentPromise
      .then((incRes) => {
        if (cancelled) return;
        setInc(incRes);
        syncFields(incRes);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        clearIncidentState();
        setLoadError(err instanceof Error ? err.message : 'Failed to load incident');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load only when route/filter context changes
  }, [id, listParams]);
}
