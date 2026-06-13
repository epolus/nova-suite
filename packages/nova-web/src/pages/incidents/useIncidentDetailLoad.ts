/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  incidents as incidentsApi,
  admin as adminApi,
  auth as authApi,
  cmdb as cmdbApi,
  problems as problemsApi,
} from '../../api/client';
import type {
  Incident,
  JournalEntry,
  AssignmentGroupItem,
  ServiceListItem,
  UserListItem,
  CI,
  Problem,
} from '../../api/client';
import type { EMPTY_FIELDS } from './incidentDetailFields';

type FieldKey = keyof typeof EMPTY_FIELDS;

type LoadParams = {
  id: string | undefined;
  isFulfiller: boolean;
  listParams: Record<string, string>;
  syncFields: (incident: Incident) => void;
  setField: (key: FieldKey, val: string) => void;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setLoadError: Dispatch<SetStateAction<string | null>>;
  setInc: Dispatch<SetStateAction<Incident | null>>;
  setJournal: Dispatch<SetStateAction<JournalEntry[]>>;
  setJournalLoading: Dispatch<SetStateAction<boolean>>;
  setPrevId: Dispatch<SetStateAction<string | null>>;
  setNextId: Dispatch<SetStateAction<string | null>>;
  setAssignmentGroups: Dispatch<SetStateAction<AssignmentGroupItem[]>>;
  setServices: Dispatch<SetStateAction<ServiceListItem[]>>;
  setCiOptions: Dispatch<SetStateAction<CI[]>>;
  setUsers: Dispatch<SetStateAction<UserListItem[]>>;
  setProblemOptions: Dispatch<SetStateAction<Problem[]>>;
  setLinkedProblemIds: Dispatch<SetStateAction<string[]>>;
};

export function useIncidentDetailLoad({
  id,
  isFulfiller,
  listParams,
  syncFields,
  setField,
  setLoading,
  setLoadError,
  setInc,
  setJournal,
  setJournalLoading,
  setPrevId,
  setNextId,
  setAssignmentGroups,
  setServices,
  setCiOptions,
  setUsers,
  setProblemOptions,
  setLinkedProblemIds,
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
      setAssignmentGroups([]);
      setServices([]);
      setCiOptions([]);
      setUsers([]);
      setProblemOptions([]);
      setLinkedProblemIds([]);
    };

    setAssignmentGroups([]);
    setServices([]);
    setCiOptions([]);
    setUsers([]);
    setProblemOptions([]);
    setLinkedProblemIds([]);

    if (isFulfiller) {
      void adminApi
        .assignmentGroups()
        .then((res) => {
          if (!cancelled) setAssignmentGroups(res.assignment_groups);
        })
        .catch(() => {
          if (!cancelled) setAssignmentGroups([]);
        });
      void incidentsApi
        .services()
        .then((res) => {
          if (!cancelled) setServices(res.services);
        })
        .catch(() => {
          if (!cancelled) setServices([]);
        });
      void cmdbApi
        .items({ status: 'active' }, 1, 100)
        .then((res) => {
          if (!cancelled) setCiOptions(res.items);
        })
        .catch(() => {
          if (!cancelled) setCiOptions([]);
        });
      void authApi
        .users()
        .then((res) => {
          if (!cancelled) setUsers(res.users);
        })
        .catch(() => {
          if (!cancelled) setUsers([]);
        });
      void problemsApi
        .list({}, 1, 100)
        .then((res) => {
          if (!cancelled) setProblemOptions(res.problems);
        })
        .catch(() => {
          if (!cancelled) setProblemOptions([]);
        });
      void incidentsApi
        .linkedProblems(id)
        .then((res) => {
          if (cancelled) return;
          const linkedIds = res.problems.map((p) => p.problem_id);
          setLinkedProblemIds(linkedIds);
          setField('relatedProblemId', linkedIds[0] || '');
        })
        .catch(() => {
          if (!cancelled) setLinkedProblemIds([]);
        });
    }

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
  }, [
    id,
    isFulfiller,
    listParams,
    syncFields,
    setField,
    setLoading,
    setLoadError,
    setInc,
    setJournal,
    setJournalLoading,
    setPrevId,
    setNextId,
    setAssignmentGroups,
    setServices,
    setCiOptions,
    setUsers,
    setProblemOptions,
    setLinkedProblemIds,
  ]);
}
