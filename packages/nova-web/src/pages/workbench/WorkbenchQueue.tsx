/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import type { WorkbenchQueueItem } from '@/api/domains/workbench';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { slaCountdown } from './workbenchSla';
import { WORKBENCH_QUEUES, type WorkbenchQueue } from './workbenchUrl';

type Props = {
  bucket: WorkbenchQueue;
  onBucket: (bucket: WorkbenchQueue) => void;
  search: string;
  onSearch: (value: string) => void;
  items: WorkbenchQueueItem[];
  loading: boolean;
  highlight: number;
  onOpen: (item: WorkbenchQueueItem) => void;
};

function SlaBadge({ dueAt, breached }: { dueAt: string | null; breached: boolean }) {
  const t = useTranslations('pages.workbench');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const countdown = slaCountdown(dueAt, breached, now);
  if (countdown.tone === 'none') return null;
  if (countdown.tone === 'breached') {
    return <Badge variant="destructive">{t('slaBreached')}</Badge>;
  }
  const label = countdown.minutes >= 90
    ? t('slaHours', { hours: Math.max(1, Math.round(countdown.minutes / 60)) })
    : t('slaMinutes', { minutes: Math.max(1, countdown.minutes) });
  return <Badge variant={countdown.tone === 'soon' ? 'outline' : 'secondary'}>{label}</Badge>;
}

export default function WorkbenchQueue({
  bucket,
  onBucket,
  search,
  onSearch,
  items,
  loading,
  highlight,
  onOpen,
}: Props) {
  const t = useTranslations('pages.workbench');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b p-2">
        <Tabs value={bucket} onValueChange={(value) => {
          if (WORKBENCH_QUEUES.some((queue) => queue === value)) onBucket(value as WorkbenchQueue);
        }}>
          <TabsList className="grid !h-auto w-full grid-cols-2 !items-stretch gap-1">
            {WORKBENCH_QUEUES.map((queue) => (
              <TabsTrigger key={queue} value={queue} className="!h-auto flex-none whitespace-normal px-1.5 py-1.5 text-xs leading-tight">
                {t(`queues.${queue}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
        />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-1 p-2">
          {loading && items.length === 0 && (
            <p className="px-2 py-4 text-sm text-muted-foreground">{t('loading')}</p>
          )}
          {!loading && items.length === 0 && (
            <p className="px-2 py-4 text-sm text-muted-foreground">{t('emptyQueue')}</p>
          )}
          {items.map((item, index) => (
            <Button
              key={`${item.kind}:${item.id}`}
              type="button"
              variant={index === highlight ? 'secondary' : 'ghost'}
              data-queue-highlight={index === highlight ? 'true' : 'false'}
              className="h-auto w-full items-start justify-start px-2 py-2 text-left"
              onClick={() => onOpen(item)}
            >
              <span className="flex w-full min-w-0 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-1">
                  <span className="font-medium">{item.number}</span>
                  {item.priority != null && (
                    <Badge variant="outline">P{item.priority}</Badge>
                  )}
                  {item.vip && <Badge>{t('vip')}</Badge>}
                  <SlaBadge dueAt={item.sla_due_at} breached={item.sla_breached} />
                </span>
                <span className="truncate text-xs text-muted-foreground">{item.title}</span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {item.status}
                  {item.assignment_group_name ? ` · ${item.assignment_group_name}` : ''}
                </span>
              </span>
            </Button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
