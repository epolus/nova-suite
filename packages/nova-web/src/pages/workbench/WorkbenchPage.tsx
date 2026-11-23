/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { useDefaultLayout } from 'react-resizable-panels';
import { useTranslations } from 'use-intl';
import {
  incidents as incidentsApi,
  workLogs,
  workbench,
  type WorkbenchQueueItem,
} from '@/api/client';
import { Button } from '@/components/ui/button';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { useAuth } from '@/context/AuthContext';
import { isFulfillerRole } from '@/utils/roles';
import { queryKeys } from '@/hooks/queries/keys';
import { useChange, useIncidentDetailQuery, useIncidentJournal, useProblem } from '@/hooks/queries';
import { useReferenceProblemPicker } from '@/hooks/queries/useReferenceDataQuery';
import WorkbenchCommandPalette from './WorkbenchCommandPalette';
import WorkbenchInspector from './WorkbenchInspector';
import WorkbenchNewIncident from './WorkbenchNewIncident';
import WorkbenchQueue from './WorkbenchQueue';
import WorkbenchStream from './WorkbenchStream';
import { mergeActivity } from './mergeActivity';
import { shortcutFromKey } from './workbenchShortcuts';
import { recordKind } from './workbenchUrl';
import { useWorkbenchCommands } from './useWorkbenchCommands';
import { useWorkbenchUrl } from './useWorkbenchUrl';

export default function WorkbenchPage() {
  const t = useTranslations('pages.workbench');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canCreate = isFulfillerRole(user?.roles);
  const url = useWorkbenchUrl();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [highlight, setHighlight] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusIntent, setStatusIntent] = useState<'current' | 'resolved'>('current');
  const [templateOpen, setTemplateOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [entryType, setEntryType] = useState<'comment' | 'work_note'>('comment');
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const layout = useDefaultLayout({
    id: 'nova-workbench',
    panelIds: ['queue', 'stream', 'inspector'],
    storage: localStorage,
  });

  const queueKey = `${url.queue}|${deferredSearch}`;
  const [prevQueueKey, setPrevQueueKey] = useState(queueKey);
  if (queueKey !== prevQueueKey) {
    setPrevQueueKey(queueKey);
    setHighlight(0);
  }

  const queueQuery = useQuery({
    queryKey: queryKeys.workbench.queue(url.queue, deferredSearch),
    queryFn: () => workbench.queue({ bucket: url.queue, search: deferredSearch, limit: 50 }),
  });
  const resolveQuery = useQuery({
    queryKey: queryKeys.workbench.resolve(url.tabs),
    queryFn: () => workbench.resolve(url.tabs),
    enabled: url.tabs.length > 0,
  });

  const items = useMemo(() => queueQuery.data?.items ?? [], [queueQuery.data?.items]);
  const records = resolveQuery.data?.records ?? [];
  const active = records.find((record) => record.number === url.active) ?? null;
  const safeHighlight = items.length === 0 ? 0 : Math.min(highlight, items.length - 1);

  const incidentId = active?.kind === 'incident' ? active.id : undefined;
  const problemId = active?.kind === 'problem' ? active.id : undefined;
  const changeId = active?.kind === 'change' ? active.id : undefined;
  const incidentQuery = useIncidentDetailQuery(incidentId);
  const problemQuery = useProblem(problemId);
  const changeQuery = useChange(changeId);
  const journalQuery = useIncidentJournal(incidentId);
  const workLogQuery = useQuery({
    queryKey: ['work-logs', 'incident', incidentId ?? ''],
    queryFn: () => workLogs.list('incident', incidentId!),
    enabled: Boolean(incidentId),
  });
  const emailQuery = useQuery({
    queryKey: queryKeys.incidents.emails(incidentId ?? ''),
    queryFn: () => incidentsApi.emails(incidentId!),
    enabled: Boolean(incidentId),
  });
  const problems = useReferenceProblemPicker(paletteOpen && Boolean(incidentId));
  const incident = incidentQuery.data;
  const commands = useWorkbenchCommands(incident);

  const [composerRecord, setComposerRecord] = useState(url.active);
  if (url.active !== composerRecord) {
    setComposerRecord(url.active);
    setDraft('');
    setStatusOpen(false);
    setTemplateOpen(false);
  }

  const activity = mergeActivity({
    journal: journalQuery.data,
    workLogs: workLogQuery.data?.work_logs,
    emails: emailQuery.data?.emails,
  });

  useEffect(() => {
    const highlighted = document.querySelector('[data-queue-highlight="true"]');
    highlighted?.scrollIntoView({ block: 'nearest' });
  }, [safeHighlight, items.length, url.queue]);

  const openQueueItem = useCallback((item: WorkbenchQueueItem) => {
    if (item.kind === 'major_incident') {
      navigate(`/major-incidents/${item.id}`);
      return;
    }
    url.open(item.number);
  }, [navigate, url]);

  function openNumber(number: string) {
    const kind = recordKind(number);
    if (kind === 'major_incident') {
      const known = records.find((record) => record.number === number);
      if (known) {
        navigate(`/major-incidents/${known.id}`);
        return;
      }
    }
    url.open(number);
  }

  const moveHighlight = useCallback((direction: 1 | -1) => {
    setHighlight((current) => {
      if (items.length === 0) return 0;
      const base = Math.min(current, items.length - 1);
      return Math.max(0, Math.min(items.length - 1, base + direction));
    });
  }, [items.length]);

  const openStatus = useCallback((intent: 'current' | 'resolved') => {
    setStatusIntent(intent);
    setStatusOpen(true);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action = shortcutFromKey(event, { paletteOpen });
      if (!action) return;
      if (action === 'palette') {
        event.preventDefault();
        event.stopPropagation();
        setPaletteOpen((open) => !open);
        return;
      }
      if (paletteOpen) return;
      if (action === 'queue-next' || action === 'queue-prev') {
        event.preventDefault();
        moveHighlight(action === 'queue-next' ? 1 : -1);
        return;
      }
      if (action === 'composer') {
        event.preventDefault();
        composerRef.current?.focus();
        return;
      }
      if (action === 'status') {
        event.preventDefault();
        if (incident) openStatus('current');
        return;
      }
      if (action === 'open') {
        const item = items[safeHighlight];
        if (!item) return;
        event.preventDefault();
        openQueueItem(item);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [paletteOpen, incident, items, safeHighlight, moveHighlight, openQueueItem, openStatus]);

  const closed = incident?.status === 'closed' || incident?.status === 'cancelled';

  return (
    <div className="flex min-h-[70vh] flex-1 flex-col xl:h-full xl:min-h-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{t('title')}</h2>
        <div className="flex items-center gap-3">
          {canCreate && (
            <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
              {t('newIncident')}
            </Button>
          )}
          <p className="text-xs text-muted-foreground">{t('shortcutHint')}</p>
        </div>
      </div>
      <div className="mb-2 flex gap-1 overflow-x-auto">
        {url.tabs.map((number) => (
          <div key={number} className="flex shrink-0 items-center">
            <Button
              type="button"
              size="sm"
              variant={number === url.active ? 'secondary' : 'ghost'}
              onClick={() => url.activate(number)}
            >
              {number}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={t('closeTab')}
              onClick={() => url.close(number)}
            >
              ×
            </Button>
          </div>
        ))}
      </div>
      <ResizablePanelGroup
        id="nova-workbench"
        className="min-h-0 flex-1 rounded-md border"
        defaultLayout={layout.defaultLayout}
        onLayoutChanged={layout.onLayoutChanged}
      >
        <ResizablePanel id="queue" defaultSize="22%" minSize="12%" collapsible collapsedSize="0%" className="min-h-0">
          <WorkbenchQueue
            bucket={url.queue}
            onBucket={url.setQueue}
            search={search}
            onSearch={setSearch}
            items={items}
            loading={queueQuery.isLoading}
            highlight={safeHighlight}
            onOpen={openQueueItem}
          />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel id="stream" defaultSize="50%" minSize="30%" className="min-h-0">
          <WorkbenchStream
            activeNumber={url.active}
            record={active}
            resolving={resolveQuery.isLoading}
            incident={incident}
            incidentLoading={incidentQuery.isLoading}
            problem={problemQuery.data}
            change={changeQuery.data}
            activity={activity}
            activityLoading={journalQuery.isLoading || workLogQuery.isLoading || emailQuery.isLoading}
            commands={commands}
            draft={draft}
            onDraft={setDraft}
            entryType={entryType}
            onEntryType={setEntryType}
            composerRef={composerRef}
            statusOpen={statusOpen}
            onStatusOpen={setStatusOpen}
            statusIntent={statusIntent}
            templateOpen={templateOpen}
            onTemplateOpen={setTemplateOpen}
            onPosted={() => setDraft('')}
          />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel id="inspector" defaultSize="28%" minSize="16%" collapsible collapsedSize="0%" className="min-h-0">
          <WorkbenchInspector
            kind={active?.kind ?? null}
            incident={incident}
            change={changeQuery.data}
            entityId={active?.id}
            onOpenNumber={openNumber}
            onOpenMajor={(id) => navigate(`/major-incidents/${id}`)}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
      <WorkbenchCommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        canAssign={Boolean(incident) && !closed && incident?.assigned_to !== user?.id}
        canResolve={Boolean(incident) && !closed && incident?.status !== 'resolved'}
        canReopen={incident?.status === 'resolved'}
        canEscalate={Boolean(incident?.assignment_group_id) && !closed}
        canLink={Boolean(incident) && !closed}
        canTemplate={Boolean(incident)}
        canClose={Boolean(url.active)}
        canQueue={items.length > 0}
        canCreate={canCreate}
        problems={(problems.data ?? []).map((problem) => ({
          id: problem.id,
          number: problem.number,
          title: problem.title,
        }))}
        onLinkProblem={(problemId) => { void commands.linkProblem(problemId); }}
        onAction={(action) => {
          if (action === 'global-search') {
            window.dispatchEvent(new Event('nova:open-global-search'));
            return;
          }
          if (action === 'new-incident') setCreateOpen(true);
          if (action === 'assign') void commands.assignToMe();
          if (action === 'resolve') openStatus('resolved');
          if (action === 'reopen') void commands.reopen();
          if (action === 'escalate') void commands.escalate();
          if (action === 'templates') setTemplateOpen(true);
          if (action === 'close' && url.active) url.close(url.active);
          if (action === 'queue-next') moveHighlight(1);
          if (action === 'queue-prev') moveHighlight(-1);
        }}
      />
      {canCreate && (
        <WorkbenchNewIncident
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={(number) => {
            setCreateOpen(false);
            void queryClient.invalidateQueries({ queryKey: queryKeys.incidents.all });
            void queryClient.invalidateQueries({ queryKey: queryKeys.workbench.all });
            url.open(number);
          }}
        />
      )}
    </div>
  );
}
