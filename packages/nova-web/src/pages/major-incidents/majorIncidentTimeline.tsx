/* SPDX-License-Identifier: AGPL-3.0-only */
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { formatDateTime } from '../../utils/dateTime';

export type TimelineAccent = 'indigo' | 'emerald' | 'amber' | 'slate' | 'rose';

export interface MajorIncidentFeedItem {
  id: string;
  at: string;
  accent: TimelineAccent;
  title: string;
  meta?: string;
  body?: ReactNode;
}

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

/** Maps API event_type + payload to readable copy for the war room feed. */
export function majorIncidentEventToFeedItem(
  eventType: string,
  payloadRaw: unknown,
  opts: {
    actorName: string | null;
    majorIncidentId: string;
  },
): Omit<MajorIncidentFeedItem, 'id' | 'at'> {
  const payload = parsePayload(payloadRaw);
  const actor = opts.actorName?.trim() || null;

  switch (eventType) {
    case 'promotion_requested':
      return {
        accent: 'amber',
        title: 'Promotion from incident',
        meta: metaLine(actor, 'Awaiting acceptance'),
        body:
          typeof payload.primary_incident_id === 'string' ? (
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              <Link
                to={`/incidents/${payload.primary_incident_id}`}
                className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
              >
                View source incident
              </Link>
              <span className="text-gray-400 dark:text-gray-500 ml-2 font-mono text-xs">({shortUuid(String(payload.primary_incident_id))})</span>
            </p>
          ) : undefined,
      };
    case 'accepted_as_major':
      return {
        accent: 'indigo',
        title: 'Accepted as major incident',
        meta: metaLine(actor, 'Response workflow can run'),
      };
    case 'created':
      return {
        accent: 'indigo',
        title: 'Major incident created',
        meta: metaLine(actor, undefined),
      };
    case 'declared':
      return {
        accent: 'indigo',
        title: 'Response workflow started',
        meta: metaLine(actor, 'Automated'),
        body:
          typeof payload.title === 'string' ? (
            <p className="text-sm text-gray-700 dark:text-gray-200 mt-1 leading-snug">{String(payload.title)}</p>
          ) : undefined,
      };
    case 'resolve_requested':
      return {
        accent: 'rose',
        title: 'Resolve requested',
        meta: metaLine(actor, 'Monitoring window before closure'),
      };
    case 'monitoring_window':
      return {
        accent: 'amber',
        title: 'Monitoring window',
        meta: metaLine(actor, 'Automated'),
        body: <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">Five-minute verification before the incident is marked resolved.</p>,
      };
    case 'resolved':
      return {
        accent: 'emerald',
        title: 'Marked resolved',
        meta: metaLine(actor, 'Automated'),
        body:
          typeof payload.postmortemId === 'string' ? (
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              <Link
                to={`/major-incidents/${opts.majorIncidentId}/postmortem`}
                className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
              >
                Open postmortem
              </Link>
            </p>
          ) : undefined,
      };
    case 'postmortem_published':
      return {
        accent: 'emerald',
        title: 'Postmortem published',
        meta: metaLine(actor, undefined),
        body:
          typeof payload.postmortemId === 'string' ? (
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              <Link
                to={`/major-incidents/${opts.majorIncidentId}/postmortem`}
                className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
              >
                View postmortem
              </Link>
            </p>
          ) : undefined,
      };
    case 'role_assigned': {
      const role = typeof payload.role === 'string' ? payload.role.replace(/_/g, ' ') : 'role';
      return {
        accent: 'indigo',
        title: `Role assigned: ${role}`,
        meta: metaLine(actor, undefined),
      };
    }
    case 'related_incident_linked':
      return {
        accent: 'slate',
        title: 'Related incident linked',
        meta: metaLine(actor, undefined),
      };
    case 'updated': {
      const fields = payload.fields;
      const summary =
        Array.isArray(fields) && fields.length > 0
          ? `Fields: ${fields.slice(0, 5).join(', ')}${fields.length > 5 ? '…' : ''}`
          : 'Record edited';
      return {
        accent: 'slate',
        title: 'Record updated',
        meta: metaLine(actor, summary),
      };
    }
    case 'nudge_no_commander':
      return {
        accent: 'amber',
        title: 'Reminder: no commander',
        meta: 'Automated check',
        body: <p className="text-sm text-amber-950/90 dark:text-amber-100 mt-1 leading-relaxed">No commander was assigned within the SLA window.</p>,
      };
    case 'nudge_stakeholder_comms':
      return {
        accent: 'amber',
        title: 'Reminder: stakeholder comms',
        meta: 'Automated check',
        body: <p className="text-sm text-amber-950/90 dark:text-amber-100 mt-1 leading-relaxed">Consider posting a stakeholder update.</p>,
      };
    case 'postmortem_reminder':
      return {
        accent: 'amber',
        title: 'Postmortem reminder',
        meta: metaLine(null, typeof payload.kind === 'string' ? payload.kind.replace(/_/g, ' ') : undefined),
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
                return `${k.replace(/_/g, ' ')}: ${s.length > 80 ? `${s.slice(0, 80)}…` : s}`;
              })
              .join(' · ');
      return {
        accent: 'slate',
        title: eventType.replace(/_/g, ' '),
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
      title: subject || 'Stakeholder update',
      meta: [audience, author].filter(Boolean).join(' · ') || undefined,
      body: <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{String(up.body ?? '')}</p>,
    });
    suIdx += 1;
  }
  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return items;
}

const ACCENT_RING: Record<TimelineAccent, string> = {
  indigo:
    'border-l-indigo-500 bg-indigo-50/50 dark:border-l-indigo-400 dark:bg-indigo-950/35',
  emerald:
    'border-l-emerald-500 bg-emerald-50/40 dark:border-l-emerald-400 dark:bg-emerald-950/30',
  amber:
    'border-l-amber-500 bg-amber-50/35 dark:border-l-amber-400 dark:bg-amber-950/40',
  slate:
    'border-l-slate-400 bg-slate-50/60 dark:border-l-slate-500 dark:bg-slate-900/45',
  rose: 'border-l-rose-500 bg-rose-50/40 dark:border-l-rose-400 dark:bg-rose-950/35',
};

export function MajorIncidentTimelineList({ items }: { items: MajorIncidentFeedItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center border border-dashed border-gray-200 dark:border-gray-600 rounded-lg">No activity yet.</p>;
  }

  return (
    <ul className="space-y-2.5 max-h-[36rem] overflow-y-auto pr-1">
      {items.map((row) => (
        <li
          key={row.id}
          className={`rounded-lg border border-gray-100/80 dark:border-gray-700/80 border-l-[3px] pl-4 pr-3 py-3 shadow-sm dark:shadow-none ${ACCENT_RING[row.accent]}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <span className="font-semibold text-gray-900 dark:text-gray-100">{row.title}</span>
            <time className="text-xs text-gray-500 dark:text-gray-400 tabular-nums shrink-0" dateTime={row.at}>
              {formatDateTime(row.at)}
            </time>
          </div>
          {row.meta && <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 leading-snug">{row.meta}</p>}
          {row.body != null && <div className="mt-1.5">{row.body}</div>}
        </li>
      ))}
    </ul>
  );
}
