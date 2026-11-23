/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import {
  emailTemplates,
  type ChangeDetail,
  type Incident,
  type IncidentResolutionCode,
  type Problem,
} from '@/api/client';
import type { WorkbenchResolvedRecord } from '@/api/domains/workbench';
import ChecklistsCard from '@/components/ChecklistsCard';
import WorkLogsCard from '@/components/WorkLogsCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/AuthContext';
import { useReferenceIncidentResolutionCodes } from '@/hooks/queries';
import { Input } from '@/components/ui/input';
import { formatDateTime } from '@/utils/dateTime';
import type { ActivityItem } from './mergeActivity';
import type { StatusUpdate, useWorkbenchCommands } from './useWorkbenchCommands';

type Commands = ReturnType<typeof useWorkbenchCommands>;

type Props = {
  activeNumber: string | null;
  record: WorkbenchResolvedRecord | null;
  resolving: boolean;
  incident?: Incident;
  incidentLoading: boolean;
  problem?: Problem;
  change?: ChangeDetail;
  activity: ActivityItem[];
  activityLoading: boolean;
  commands: Commands;
  draft: string;
  onDraft: (value: string) => void;
  entryType: 'comment' | 'work_note';
  onEntryType: (value: 'comment' | 'work_note') => void;
  composerRef: React.RefObject<HTMLTextAreaElement | null>;
  statusOpen: boolean;
  onStatusOpen: (open: boolean) => void;
  statusIntent: 'current' | 'resolved';
  templateOpen: boolean;
  onTemplateOpen: (open: boolean) => void;
  onPosted: () => void;
};

const QUICK_STATUSES = ['in_progress', 'pending', 'resolved'] as const;

export default function WorkbenchStream({
  activeNumber,
  record,
  resolving,
  incident,
  incidentLoading,
  problem,
  change,
  activity,
  activityLoading,
  commands,
  draft,
  onDraft,
  entryType,
  onEntryType,
  composerRef,
  statusOpen,
  onStatusOpen,
  statusIntent,
  templateOpen,
  onTemplateOpen,
  onPosted,
}: Props) {
  const t = useTranslations('pages.workbench');
  const { user } = useAuth();
  const codes = useReferenceIncidentResolutionCodes(Boolean(incident));
  const templates = useQuery({
    queryKey: ['email-templates', 'agent'],
    queryFn: () => emailTemplates.list(),
    enabled: templateOpen,
  });

  if (!activeNumber) {
    return <p className="p-6 text-sm text-muted-foreground">{t('noActive')}</p>;
  }
  if (resolving || (record?.kind === 'incident' && incidentLoading && !incident)) {
    return <p className="p-6 text-sm text-muted-foreground">{t('loading')}</p>;
  }
  if (!record) {
    return <p className="p-6 text-sm text-muted-foreground">{t('notFound')}</p>;
  }

  const closed = incident?.status === 'closed' || incident?.status === 'cancelled';
  const fullPath = record.kind === 'incident'
    ? `/incidents/${record.id}`
    : record.kind === 'problem'
      ? `/problems/${record.id}`
      : record.kind === 'change'
        ? `/changes/${record.id}`
        : `/major-incidents/${record.id}`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold">
            {record.number}
            {incident ? ` — ${incident.title}` : ''}
            {problem ? ` — ${problem.title}` : ''}
            {change ? ` — ${change.title}` : ''}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {incident && <Badge variant="outline">{incident.status}</Badge>}
            {incident && <Badge variant="secondary">P{incident.priority}</Badge>}
            {problem && <Badge variant="outline">{problem.status}</Badge>}
            {change && <Badge variant="outline">{change.status}</Badge>}
            {record.kind === 'major_incident' && <Badge>{t('queues.major')}</Badge>}
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" asChild>
          <Link to={fullPath}>{record.kind === 'major_incident' ? t('openWarRoom') : t('openFull')}</Link>
        </Button>
      </div>

      {commands.error && (
        <p className="border-b bg-destructive/10 px-3 py-2 text-sm text-destructive">{commands.error}</p>
      )}

      {incident && (
        <div className="flex flex-wrap gap-2 border-b p-3">
          <Button type="button" size="sm" variant="outline" disabled={commands.busy || closed || incident.assigned_to === user?.id} onClick={() => { void commands.assignToMe(); }}>
            {t('assignToMe')}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={commands.busy || !incident.assignment_group_id || closed} onClick={() => { void commands.escalate(); }}>
            {t('escalate')}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={commands.busy || incident.status !== 'resolved'} onClick={() => { void commands.reopen(); }}>
            {t('reopen')}
          </Button>
          <Popover open={statusOpen} onOpenChange={onStatusOpen}>
            <PopoverTrigger asChild>
              <Button type="button" size="sm" disabled={commands.busy || closed}>{t('status')}</Button>
            </PopoverTrigger>
            <PopoverContent className="w-96 space-y-3" align="start">
              {incident && statusOpen && (
                <StatusEditor
                  key={`${incident.id}:${statusIntent}`}
                  incident={incident}
                  statusIntent={statusIntent}
                  codes={codes.data ?? []}
                  busy={commands.busy}
                  onSave={(update) => {
                    void commands.applyStatus(update).then((saved) => {
                      if (saved) onStatusOpen(false);
                    });
                  }}
                />
              )}
            </PopoverContent>
          </Popover>
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-3">
          {incident && (
            <section>
              <h2 className="text-xs font-medium text-muted-foreground">{t('description')}</h2>
              <p className={`mt-1 whitespace-pre-wrap text-sm ${incident.description?.trim() ? '' : 'text-muted-foreground'}`}>
                {incident.description?.trim() || t('noDescription')}
              </p>
            </section>
          )}
          {incident && <ChecklistsCard entityType="incident" entityId={incident.id} />}
          {change && <ChecklistsCard entityType="change" entityId={change.id} />}
          {change && <WorkLogsCard entityType="change" entityId={change.id} />}
          {problem && (
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{problem.description}</p>
          )}
          {record.kind === 'major_incident' && (
            <p className="text-sm text-muted-foreground">{t('majorHint')}</p>
          )}
          {incident && (
            <div className="space-y-3">
              {activityLoading && activity.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('loading')}</p>
              )}
              {!activityLoading && activity.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('activityEmpty')}</p>
              )}
              {activity.map((item) => (
                <article key={item.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{t(`activityKind.${item.kind}`)}</Badge>
                    <span>{item.actor}</span>
                    <span>{formatDateTime(item.at)}</span>
                    {item.kind === 'work_log' && <span>{t('workLogMinutes', { minutes: item.summary })}</span>}
                    {item.kind !== 'work_log' && item.summary && <span>{item.summary}</span>}
                  </div>
                  {item.body && <p className="mt-2 whitespace-pre-wrap text-sm">{item.body}</p>}
                </article>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {incident && (
        <form
          className="space-y-2 border-t p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void commands.postJournal(draft, entryType).then((saved) => {
              if (saved) onPosted();
            });
          }}
        >
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant={entryType === 'comment' ? 'secondary' : 'ghost'} onClick={() => onEntryType('comment')}>
              {t('comment')}
            </Button>
            <Button type="button" size="sm" variant={entryType === 'work_note' ? 'secondary' : 'ghost'} onClick={() => onEntryType('work_note')}>
              {t('workNote')}
            </Button>
            <Popover open={templateOpen} onOpenChange={onTemplateOpen}>
              <PopoverTrigger asChild>
                <Button type="button" size="sm" variant="outline">{t('templates')}</Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-2">
                <div className="max-h-60 space-y-1 overflow-y-auto">
                  {(templates.data?.email_templates ?? []).length === 0 && (
                    <p className="px-2 py-3 text-sm text-muted-foreground">{t('noTemplates')}</p>
                  )}
                  {(templates.data?.email_templates ?? []).map((template) => (
                    <Button
                      key={template.id}
                      type="button"
                      variant="ghost"
                      className="h-auto w-full justify-start px-2 py-2 text-left"
                      onClick={() => {
                        onDraft(template.body);
                        onTemplateOpen(false);
                        composerRef.current?.focus();
                      }}
                    >
                      <span className="truncate">{template.name}</span>
                    </Button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <Textarea
            ref={composerRef}
            value={draft}
            onChange={(event) => onDraft(event.target.value)}
            placeholder={t('composerPlaceholder')}
            aria-label={t('composerPlaceholder')}
          />
          <Button type="submit" size="sm" disabled={commands.busy || !draft.trim()}>{t('send')}</Button>
        </form>
      )}
    </div>
  );
}

const fieldSelectClass = 'mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground';
const fieldOptionStyle = { color: '#0f172a', backgroundColor: '#ffffff' } as const;

function initialStatus(
  incident: Incident,
  statusIntent: 'current' | 'resolved',
): (typeof QUICK_STATUSES)[number] {
  if (statusIntent === 'resolved' || incident.status === 'resolved') return 'resolved';
  if (incident.status === 'pending') return 'pending';
  return 'in_progress';
}

function StatusEditor({
  incident,
  statusIntent,
  codes,
  busy,
  onSave,
}: {
  incident: Incident;
  statusIntent: 'current' | 'resolved';
  codes: IncidentResolutionCode[];
  busy: boolean;
  onSave: (update: StatusUpdate) => void;
}) {
  const t = useTranslations('pages.workbench');
  const [status, setStatus] = useState(initialStatus(incident, statusIntent));
  const [pendingReason, setPendingReason] = useState(incident.pending_reason ?? '');
  const [resolutionCodeId, setResolutionCodeId] = useState(incident.resolution_code_id ?? '');
  const [resolutionNotes, setResolutionNotes] = useState(incident.resolution_notes ?? '');

  return (
    <>
      <label className="block text-xs font-medium text-muted-foreground">
        {t('status')}
        <select
          className={fieldSelectClass}
          value={status}
          onChange={(event) => setStatus(event.target.value as (typeof QUICK_STATUSES)[number])}
        >
          {QUICK_STATUSES.map((value) => (
            <option key={value} value={value} style={fieldOptionStyle}>{value}</option>
          ))}
        </select>
      </label>
      {status === 'pending' && (
        <label className="block text-xs font-medium text-muted-foreground">
          {t('pendingReason')}
          <InputLike value={pendingReason} onChange={setPendingReason} />
        </label>
      )}
      {status === 'resolved' && (
        <>
          <label className="block text-xs font-medium text-muted-foreground">
            {t('resolutionCode')}
            <select
              className={fieldSelectClass}
              value={resolutionCodeId}
              onChange={(event) => setResolutionCodeId(event.target.value)}
            >
              <option value="" style={fieldOptionStyle}>{t('resolutionCode')}</option>
              {codes.map((code) => (
                <option key={code.id} value={code.id} style={fieldOptionStyle}>{code.code} — {code.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-muted-foreground">
            {t('resolutionNotes')}
            <Textarea className="mt-1" value={resolutionNotes} onChange={(event) => setResolutionNotes(event.target.value)} />
          </label>
        </>
      )}
      <Button
        type="button"
        size="sm"
        disabled={busy}
        onClick={() => onSave({ status, pendingReason, resolutionCodeId, resolutionNotes })}
      >
        {t('saveStatus')}
      </Button>
    </>
  );
}

function InputLike({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <Input className="mt-1" value={value} onChange={(event) => onChange(event.target.value)} />;
}
