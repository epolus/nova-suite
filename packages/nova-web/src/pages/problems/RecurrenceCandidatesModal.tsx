/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslations } from 'use-intl';
import { problems as problemsApi } from '@/api/client';
import type { AssignmentGroupItem, RecurrenceCandidate } from '@/api/client';
import { Button } from '../../components/ui/button';
import Spinner from '../../components/Spinner';

export function RecurrenceCandidatesModal({ onClose }: { onClose: () => void }) {
  const tProblems = useTranslations('pages.problems');
  const tActions = useTranslations('common.actions');
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<RecurrenceCandidate[]>([]);
  const [groups, setGroups] = useState<AssignmentGroupItem[]>([]);
  const [groupId, setGroupId] = useState('');
  const [selectedSeed, setSelectedSeed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [candRes, groupsRes] = await Promise.all([
          problemsApi.recurrenceCandidates(),
          problemsApi.assignmentGroups(),
        ]);
        if (cancelled) return;
        setCandidates(candRes.candidates);
        setGroups(groupsRes.assignment_groups);
        if (groupsRes.assignment_groups.length > 0) {
          setGroupId(groupsRes.assignment_groups[0].id);
        }
        if (candRes.candidates.length > 0) {
          setSelectedSeed(candRes.candidates[0].seed_id);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : tProblems('recurrenceLoadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tProblems]);

  const selected = candidates.find((c) => c.seed_id === selectedSeed) || null;

  const createProblem = async () => {
    if (!selected || !groupId) return;
    setCreating(true);
    setError(null);
    try {
      const created = await problemsApi.createFromRecurringIncidents({
        incident_ids: selected.incident_ids,
        assignment_group_id: groupId,
        title: selected.representative_title,
        affected_ci: selected.configuration_item_id,
      });
      onClose();
      navigate(`/problems/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : tProblems('recurrenceCreateFailed'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 p-5 space-y-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">{tProblems('createFromRecurring')}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
        </div>
        <p className="text-sm text-gray-500">{tProblems('recurrenceDescription')}</p>

        {loading && (
          <div className="flex justify-center py-8"><Spinner /></div>
        )}

        {!loading && error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        {!loading && !error && candidates.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">{tProblems('noRecurrenceCandidates')}</p>
        )}

        {!loading && candidates.length > 0 && (
          <>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {candidates.map((c) => (
                <button
                  key={c.seed_id}
                  type="button"
                  onClick={() => setSelectedSeed(c.seed_id)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedSeed === c.seed_id
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.representative_title}</p>
                    <span className="text-xs text-gray-500 shrink-0">
                      {tProblems('recurrenceCount', { count: c.incident_count })}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {[c.configuration_item_name, c.service_name].filter(Boolean).join(' · ')
                      || tProblems('recurrenceNoCiService')}
                  </p>
                  <p className="text-xs text-gray-400 mt-1 truncate">
                    {c.incidents.map((i) => i.number).join(', ')}
                  </p>
                </button>
              ))}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{tProblems('selectAssignmentGroup')}</label>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>{tActions('cancel')}</Button>
              <Button onClick={createProblem} disabled={!selected || !groupId || creating}>
                {creating ? tProblems('creatingProblem') : tProblems('createProblem')}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
