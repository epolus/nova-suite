/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useTranslations } from 'use-intl';
import Card from '../../components/Card';
import { Button } from '../../components/ui/button';
import { changes as changesApi, majorIncidents as majorIncidentsApi, problems as problemsApi } from '../../api/client';
import type { AssignmentGroupItem, ChangeType } from '../../api/client';

type ActionItem = {
  id?: string;
  title: string;
  problem_id?: string | null;
  change_id?: string | null;
};

function readItems(value: unknown): ActionItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || typeof (item as { title?: unknown }).title !== 'string') return [];
    return [item as ActionItem];
  });
}

function FollowUpControls({
  majorIncidentId,
  item,
  problemGroups,
  changeGroups,
  changeTypes,
  onDone,
  onError,
}: {
  majorIncidentId: string;
  item: ActionItem;
  problemGroups: AssignmentGroupItem[];
  changeGroups: AssignmentGroupItem[];
  changeTypes: ChangeType[];
  onDone: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const t = useTranslations('pages.majorIncidents.postmortem');
  const [kindChoice, setKindChoice] = useState<'problem' | 'change'>('problem');
  const kind: 'problem' | 'change' = item.problem_id ? 'change' : item.change_id ? 'problem' : kindChoice;
  const [groupId, setGroupId] = useState('');
  const [changeTypeId, setChangeTypeId] = useState('');
  const [busy, setBusy] = useState(false);
  const groups = kind === 'problem' ? problemGroups : changeGroups;
  const selectedGroup = groups.some((group) => group.id === groupId) ? groupId : (groups[0]?.id ?? '');
  const selectedType = changeTypes.some((changeType) => changeType.id === changeTypeId)
    ? changeTypeId
    : (changeTypes[0]?.id ?? '');

  const create = async () => {
    if (!item.id || !selectedGroup) return;
    if (kind === 'change' && !selectedType) return;
    setBusy(true);
    try {
      await majorIncidentsApi.createPostmortemFollowUp(majorIncidentId, item.id, {
        kind,
        assignment_group_id: selectedGroup,
        ...(kind === 'change' ? { change_type_id: selectedType } : {}),
      });
      await onDone();
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : t('followUpFailed'));
    } finally {
      setBusy(false);
    }
  };

  if (item.problem_id && item.change_id) return null;
  if (!item.id) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <select
        value={kind}
        onChange={(event) => setKindChoice(event.target.value as 'problem' | 'change')}
        className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
      >
        {!item.problem_id && <option value="problem">{t('createProblem')}</option>}
        {!item.change_id && <option value="change">{t('createChange')}</option>}
      </select>
      <select
        value={selectedGroup}
        onChange={(event) => setGroupId(event.target.value)}
        className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
      >
        {groups.map((group) => (
          <option key={group.id} value={group.id}>{group.name}</option>
        ))}
      </select>
      {kind === 'change' && (
        <select
          value={selectedType}
          onChange={(event) => setChangeTypeId(event.target.value)}
          className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
        >
          {changeTypes.map((changeType) => (
            <option key={changeType.id} value={changeType.id}>{changeType.name}</option>
          ))}
        </select>
      )}
      <Button type="button" variant="outline" className="h-8 text-xs" onClick={() => void create()} disabled={busy || !selectedGroup || (kind === 'change' && !selectedType)}>
        {busy ? t('creatingFollowUp') : t('createFollowUp')}
      </Button>
    </div>
  );
}

export function PostmortemActionItems({
  majorIncidentId,
  actionItems,
  canManage,
  onChanged,
  onError,
}: {
  majorIncidentId: string;
  actionItems: unknown;
  canManage: boolean;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const t = useTranslations('pages.majorIncidents.postmortem');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [problemGroups, setProblemGroups] = useState<AssignmentGroupItem[]>([]);
  const [changeGroups, setChangeGroups] = useState<AssignmentGroupItem[]>([]);
  const [changeTypes, setChangeTypes] = useState<ChangeType[]>([]);
  const items = readItems(actionItems);

  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    Promise.all([
      problemsApi.assignmentGroups(),
      changesApi.assignmentGroups(),
      changesApi.types(),
    ])
      .then(([problems, changes, types]) => {
        if (cancelled) return;
        setProblemGroups(problems.assignment_groups);
        setChangeGroups(changes.assignment_groups);
        setChangeTypes(types.change_types.filter((changeType) => changeType.is_active));
      })
      .catch(() => {
        if (!cancelled) onError(t('followUpOptionsFailed'));
      });
    return () => { cancelled = true; };
  }, [canManage, t, onError]);

  const addItem = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await majorIncidentsApi.addPostmortemActionItem(majorIncidentId, { title: trimmed });
      setTitle('');
      await onChanged();
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : t('actionItemFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <h3 className="font-semibold text-gray-900 mb-1">{t('actionItems')}</h3>
      <p className="text-xs text-gray-500 mb-3">{t('actionItemsHint')}</p>
      {items.length === 0 && <p className="text-sm text-gray-500 mb-3">{t('noActionItems')}</p>}
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id || item.title} className="text-sm">
            <p className="font-medium text-gray-900">{item.title}</p>
            <div className="flex flex-wrap gap-3 mt-1 text-xs">
              {item.problem_id && (
                <Link to={`/problems/${item.problem_id}`} className="text-indigo-700 hover:underline">{t('openProblem')}</Link>
              )}
              {item.change_id && (
                <Link to={`/changes/${item.change_id}`} className="text-indigo-700 hover:underline">{t('openChange')}</Link>
              )}
            </div>
            {canManage && (
              <FollowUpControls
                majorIncidentId={majorIncidentId}
                item={item}
                problemGroups={problemGroups}
                changeGroups={changeGroups}
                changeTypes={changeTypes}
                onDone={onChanged}
                onError={onError}
              />
            )}
          </li>
        ))}
      </ul>
      {canManage && (
        <div className="mt-4 flex gap-2">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t('actionItemPlaceholder')}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <Button type="button" variant="outline" onClick={() => void addItem()} disabled={busy || !title.trim()}>
            {t('addActionItem')}
          </Button>
        </div>
      )}
    </Card>
  );
}
