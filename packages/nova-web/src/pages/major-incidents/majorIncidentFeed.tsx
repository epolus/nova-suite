/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { formatEnumFallback } from '@/i18n/labels';

export type TimelineAccent = 'indigo' | 'emerald' | 'amber' | 'slate' | 'rose';

export interface MajorIncidentFeedItem {
  id: string;
  at: string;
  accent: TimelineAccent;
  title: string;
  meta?: string;
  body?: ReactNode;
}

export type MajorIncidentTimelineT = ReturnType<typeof useTranslations<'pages.majorIncidents.timeline'>>;

function parsePayload(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return {};
}

function shortUuid(id: string): string {
  if (!id || id.length < 8) return id;
  return `${id.slice(0, 8)}…`;
}

function metaLine(actor: string | null, detail?: string): string | undefined {
  const parts: string[] = [];
  if (detail) parts.push(detail);
  if (actor) parts.push(actor);
  if (parts.length === 0) return undefined;
  return parts.join(' · ');
}

function resolutionSummaryBlock(t: MajorIncidentTimelineT, solution: string): ReactNode {
  return (
    <div className="mt-1 space-y-1">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        {t('labels.resolutionSummary')}
      </p>
      <p className="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap leading-relaxed">{solution}</p>
    </div>
  );
}

/** Maps API event_type + payload to readable copy for the war room feed. */
export function majorIncidentEventToFeedItem(
  eventType: string,
  payloadRaw: unknown,
  opts: {
    actorName: string | null;
    majorIncidentId: string;
    t: MajorIncidentTimelineT;
  },
): Omit<MajorIncidentFeedItem, 'id' | 'at'> {
  const payload = parsePayload(payloadRaw);
  const actor = opts.actorName?.trim() || null;
  const { t } = opts;

  switch (eventType) {
    case 'promotion_requested':
      return {
        accent: 'amber',
        title: t('events.promotionRequested.title'),
        meta: metaLine(actor, t('meta.awaitingAcceptance')),
        body:
          typeof payload.primary_incident_id === 'string' ? (
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              <Link
                to={`/incidents/${payload.primary_incident_id}`}
                className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
              >
                {t('events.promotionRequested.viewSourceIncident')}
              </Link>
              <span className="text-gray-400 dark:text-gray-500 ml-2 font-mono text-xs">({shortUuid(String(payload.primary_incident_id))})</span>
            </p>
          ) : undefined,
      };
    case 'accepted_as_major':
      return {
        accent: 'indigo',
        title: t('events.acceptedAsMajor.title'),
        meta: metaLine(actor, t('meta.responseWorkflowCanRun')),
      };
    case 'promotion_rejected':
      return {
        accent: 'rose',
        title: t('events.promotionRejected.title'),
        meta: metaLine(actor, t('meta.proposedNotAccepted')),
        body:
          typeof payload.reason === 'string' && payload.reason.trim() ? (
            <p className="text-sm text-gray-700 dark:text-gray-200 mt-1 whitespace-pre-wrap leading-relaxed">{payload.reason.trim()}</p>
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{t('events.promotionRejected.defaultBody')}</p>
          ),
      };
    case 'created':
      return {
        accent: 'indigo',
        title: t('events.created.title'),
        meta: metaLine(actor, undefined),
      };
    case 'declared':
      return {
        accent: 'indigo',
        title: t('events.declared.title'),
        meta: metaLine(actor, t('meta.automated')),
        body:
          typeof payload.title === 'string' ? (
            <p className="text-sm text-gray-700 dark:text-gray-200 mt-1 leading-snug">{String(payload.title)}</p>
          ) : undefined,
      };
    case 'resolve_requested':
      return {
        accent: 'rose',
        title: t('events.resolveRequested.title'),
        meta: metaLine(actor, t('meta.monitoringWindowBeforeClosure')),
        body:
          typeof payload.solution === 'string' && payload.solution.trim()
            ? resolutionSummaryBlock(t, payload.solution.trim())
            : undefined,
      };
    case 'monitoring_window':
      return {
        accent: 'amber',
        title: t('events.monitoringWindow.title'),
        meta: metaLine(actor, t('meta.automated')),
        body: <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">{t('events.monitoringWindow.body')}</p>,
      };
    case 'resolved':
      return {
        accent: 'emerald',
        title: t('events.resolved.title'),
        meta: metaLine(actor, t('meta.automated')),
        body: (
          <div className="mt-1 space-y-2">
            {typeof payload.solution === 'string' && payload.solution.trim() ? (
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  {t('labels.resolutionSummary')}
                </p>
                <p className="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap leading-relaxed">{payload.solution.trim()}</p>
              </div>
            ) : null}
            {typeof payload.postmortemId === 'string' ? (
              <p className="text-sm text-gray-600 dark:text-gray-300">
                <Link
                  to={`/major-incidents/${opts.majorIncidentId}/postmortem`}
                  className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                >
                  {t('events.resolved.openPostmortem')}
                </Link>
              </p>
            ) : null}
          </div>
        ),
      };
    case 'postmortem_published':
      return {
        accent: 'emerald',
        title: t('events.postmortemPublished.title'),
        meta: metaLine(actor, undefined),
        body:
          typeof payload.postmortemId === 'string' ? (
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              <Link
                to={`/major-incidents/${opts.majorIncidentId}/postmortem`}
                className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
              >
                {t('events.postmortemPublished.viewPostmortem')}
              </Link>
            </p>
          ) : undefined,
      };
    case 'role_assigned': {
      const role = typeof payload.role === 'string' ? payload.role.replace(/_/g, ' ') : 'role';
      return {
        accent: 'indigo',
        title: t('events.roleAssigned.title', { role }),
        meta: metaLine(actor, undefined),
      };
    }
    case 'related_incident_linked':
      return {
        accent: 'slate',
        title: t('events.relatedIncidentLinked.title'),
        meta: metaLine(actor, undefined),
      };
    case 'updated': {
      const fields = payload.fields;
      const summary =
        Array.isArray(fields) && fields.length > 0
          ? t('meta.fieldsSummary', {
              fields: fields.slice(0, 5).join(', '),
              ellipsis: fields.length > 5 ? '…' : '',
            })
          : t('meta.recordEdited');
      return {
        accent: 'slate',
        title: t('events.updated.title'),
        meta: metaLine(actor, summary),
      };
    }
    case 'nudge_no_commander':
      return {
        accent: 'amber',
        title: t('events.nudgeNoCommander.title'),
        meta: t('meta.automatedCheck'),
        body: <p className="text-sm text-amber-950/90 dark:text-amber-100 mt-1 leading-relaxed">{t('events.nudgeNoCommander.body')}</p>,
      };
    case 'nudge_stakeholder_comms':
      return {
        accent: 'amber',
        title: t('events.nudgeStakeholderComms.title'),
        meta: t('meta.automatedCheck'),
        body: <p className="text-sm text-amber-950/90 dark:text-amber-100 mt-1 leading-relaxed">{t('events.nudgeStakeholderComms.body')}</p>,
      };
    case 'postmortem_reminder':
      return {
        accent: 'amber',
        title: t('events.postmortemReminder.title'),
        meta: metaLine(null, typeof payload.kind === 'string' ? formatEnumFallback(payload.kind) : undefined),
      };
    default: {
      const keys = Object.keys(payload);
      const detail =
        keys.length === 0
          ? undefined
          : keys
              .slice(0, 4)
              .map((k) => {
                const v = payload[k];
                const s = typeof v === 'string' ? v : JSON.stringify(v);
                return `${formatEnumFallback(k)}: ${s.length > 80 ? `${s.slice(0, 80)}…` : s}`;
              })
              .join(' · ');
      return {
        accent: 'slate',
        title: formatEnumFallback(eventType),
        meta: metaLine(actor, undefined),
        body: detail ? <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed break-words">{detail}</p> : undefined,
      };
    }
  }
}

/** Merges API events and stakeholder updates into one reverse-chronological feed. */
export function buildMajorIncidentFeedItems(
  events: Record<string, unknown>[] | undefined,
  stakeholderUpdates: Record<string, unknown>[] | undefined,
  majorIncidentId: string,
  t: MajorIncidentTimelineT,
): MajorIncidentFeedItem[] {
  const items: MajorIncidentFeedItem[] = [];
  let evIdx = 0;
  for (const e of events || []) {
    const ev = e as Record<string, unknown>;
    const type = String(ev.event_type ?? '');
    if (type === 'stakeholder_update') continue;
    const id = String(ev.id ?? `ev-${evIdx}`);
    evIdx += 1;
    const mapped = majorIncidentEventToFeedItem(type, ev.payload, {
      actorName: ev.actor_name != null ? String(ev.actor_name) : null,
      majorIncidentId,
      t,
    });
    items.push({ id, at: String(ev.created_at ?? ''), ...mapped });
  }
  let suIdx = 0;
  for (const u of stakeholderUpdates || []) {
    const up = u as Record<string, unknown>;
    const sid = String(up.id ?? '');
    const audience = up.audience != null ? String(up.audience) : '';
    const author = up.author_name != null ? String(up.author_name) : '';
    const subject = up.subject != null ? String(up.subject).trim() : '';
    items.push({
      id: sid ? `su-${sid}` : `su-fallback-${suIdx}`,
      at: String(up.created_at ?? ''),
      accent: 'emerald',
      title: subject || t('stakeholderUpdate'),
      meta: [audience, author].filter(Boolean).join(' · ') || undefined,
      body: <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{String(up.body ?? '')}</p>,
    });
    suIdx += 1;
  }
  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return items;
}

export function useMajorIncidentTimeline() {
  const t = useTranslations('pages.majorIncidents.timeline');

  const buildFeedItems = useCallback(
    (
      events: Record<string, unknown>[] | undefined,
      stakeholderUpdates: Record<string, unknown>[] | undefined,
      majorIncidentId: string,
    ) => buildMajorIncidentFeedItems(events, stakeholderUpdates, majorIncidentId, t),
    [t],
  );

  return { t, buildFeedItems };
}
