/* SPDX-License-Identifier: AGPL-3.0-only */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import { incidents as incidentsApi, type UserListItem } from '@/api/client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { queryKeys } from '@/hooks/queries/keys';
import { useReferenceAssignmentGroups } from '@/hooks/queries/useReferenceDataQuery';
import { useFieldLabel, useImpactUrgencyLabel } from '@/i18n/hooks';

const fieldSelectClass = 'mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground';
const fieldOptionStyle = { color: '#0f172a', backgroundColor: '#ffffff' } as const;
const LEVELS = ['low', 'medium', 'high'] as const;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (number: string) => void;
};

export default function WorkbenchNewIncident({ open, onOpenChange, onCreated }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        {open && (
          <NewIncidentForm
            onCancel={() => onOpenChange(false)}
            onCreated={onCreated}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function NewIncidentForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (number: string) => void;
}) {
  const t = useTranslations('pages.workbench');
  const tActions = useTranslations('common.actions');
  const fieldLabel = useFieldLabel();
  const levelLabel = useImpactUrgencyLabel();
  const groups = useReferenceAssignmentGroups(true);
  const callers = useQuery({
    queryKey: queryKeys.incidents.callers(),
    queryFn: () => incidentsApi.callers().then((res) => res.users),
  });
  const [callerQuery, setCallerQuery] = useState('');
  const [callerId, setCallerId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [impact, setImpact] = useState<(typeof LEVELS)[number]>('medium');
  const [urgency, setUrgency] = useState<(typeof LEVELS)[number]>('medium');
  const [assignmentGroupId, setAssignmentGroupId] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const selectedCaller = (callers.data ?? []).find((user) => user.id === callerId);
  const matches = useMemo(() => {
    const needle = callerQuery.trim().toLowerCase();
    const users = callers.data ?? [];
    if (!needle) return users.slice(0, 8);
    return users
      .filter((user) => `${user.display_name} ${user.email}`.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [callerQuery, callers.data]);

  const submit = async () => {
    if (!title.trim()) {
      setError(t('titleRequired'));
      return;
    }
    if (!callerId) {
      setError(t('callerRequired'));
      return;
    }
    if (!assignmentGroupId) {
      setError(t('assignmentGroupRequired'));
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const created = await incidentsApi.create({
        title: title.trim(),
        description: description.trim() || undefined,
        impact,
        urgency,
        caller_id: callerId,
        assignment_group_id: assignmentGroupId,
      });
      onCreated(created.number);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('createFailed'));
      setSubmitting(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('newIncident')}</DialogTitle>
        <DialogDescription>{t('newIncidentHint')}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        <div className="text-sm">
          <label className="font-medium" htmlFor="workbench-caller">{t('caller')}</label>
          <Input
            id="workbench-caller"
            className="mt-1"
            value={selectedCaller && !callerQuery ? selectedCaller.display_name : callerQuery}
            placeholder={t('searchCaller')}
            aria-label={t('searchCaller')}
            onChange={(event) => {
              setCallerQuery(event.target.value);
              setCallerId('');
            }}
          />
          {(!selectedCaller || callerQuery) && (
            <ul className="mt-1 max-h-36 overflow-y-auto rounded-md border">
              {matches.map((user) => (
                <li key={user.id}>
                  <CallerOption
                    user={user}
                    selected={user.id === callerId}
                    onSelect={() => {
                      setCallerId(user.id);
                      setCallerQuery('');
                    }}
                  />
                </li>
              ))}
              {matches.length === 0 && (
                <li className="px-2 py-1.5 text-xs text-muted-foreground">
                  {callers.isLoading ? t('loadingCallers') : t('noCallers')}
                </li>
              )}
            </ul>
          )}
        </div>
        <label className="text-sm">
          <span className="font-medium">{fieldLabel('title')}</span>
          <Input className="mt-1" value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="text-sm">
          <span className="font-medium">{fieldLabel('description')}</span>
          <Textarea
            className="mt-1"
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="font-medium">{fieldLabel('impact')}</span>
            <select
              className={fieldSelectClass}
              value={impact}
              onChange={(event) => setImpact(event.target.value as (typeof LEVELS)[number])}
            >
              {LEVELS.map((level) => (
                <option key={level} value={level} style={fieldOptionStyle}>{levelLabel.impact(level)}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="font-medium">{fieldLabel('urgency')}</span>
            <select
              className={fieldSelectClass}
              value={urgency}
              onChange={(event) => setUrgency(event.target.value as (typeof LEVELS)[number])}
            >
              {LEVELS.map((level) => (
                <option key={level} value={level} style={fieldOptionStyle}>{levelLabel.urgency(level)}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="text-sm">
          <span className="font-medium">{fieldLabel('assignmentGroup')}</span>
          <select
            className={fieldSelectClass}
            value={assignmentGroupId}
            onChange={(event) => setAssignmentGroupId(event.target.value)}
          >
            <option value="" style={fieldOptionStyle}>{t('selectAssignmentGroup')}</option>
            {(groups.data ?? []).map((group) => (
              <option key={group.id} value={group.id} style={fieldOptionStyle}>{group.name}</option>
            ))}
          </select>
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>{tActions('cancel')}</Button>
        <Button type="button" disabled={submitting} onClick={() => { void submit(); }}>
          {submitting ? t('creating') : t('createIncident')}
        </Button>
      </DialogFooter>
    </>
  );
}

function CallerOption({
  user,
  selected,
  onSelect,
}: {
  user: UserListItem;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full flex-col px-2 py-1.5 text-left text-sm hover:bg-accent ${selected ? 'bg-accent' : ''}`}
    >
      <span>{user.display_name}</span>
      <span className="text-xs text-muted-foreground">{user.email}</span>
    </button>
  );
}
