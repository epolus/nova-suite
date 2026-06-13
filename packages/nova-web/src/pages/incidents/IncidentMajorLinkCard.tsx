/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { incidents as incidentsApi } from '../../api/client';
import { useInvalidateMajorIncidents, useLinkableMajorIncidents } from '../../hooks/queries';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import { Button } from '../../components/ui/button';
import { useTranslations } from 'use-intl';
import type { IncidentDetailState } from './incidentDetailShared';

export function IncidentMajorLinkCard({ d }: { d: IncidentDetailState }) {
  const { inc, isFulfiller, readonly, isClosed, isResolved, refresh } = d;
  const tIncidents = useTranslations('pages.incidents');
  const tTable = useTranslations('common.table');
  const invalidateMajorIncidents = useInvalidateMajorIncidents();

  const showLinkUi = Boolean(inc?.id && isFulfiller && !readonly && !isClosed && !isResolved);
  const { data: linkableMajors = [] } = useLinkableMajorIncidents(showLinkUi);

  const [linkMajorSelect, setLinkMajorSelect] = useState('');
  const [linkMajorBusy, setLinkMajorBusy] = useState(false);
  const [linkMajorErr, setLinkMajorErr] = useState('');

  if (!inc) return null;

  const handleLinkMajor = async () => {
    if (!inc || !linkMajorSelect) return;
    setLinkMajorErr('');
    setLinkMajorBusy(true);
    try {
      await incidentsApi.linkMajorIncident(inc.id, { major_incident_id: linkMajorSelect });
      setLinkMajorSelect('');
      invalidateMajorIncidents.summaries();
      await refresh();
    } catch (err: unknown) {
      setLinkMajorErr(err instanceof Error ? err.message : tIncidents('linkFailed'));
    } finally {
      setLinkMajorBusy(false);
    }
  };

  const linkMajorSelectCls =
    'min-w-0 flex-1 text-sm py-1.5 px-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none sm:max-w-xs md:max-w-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100';

  const linkedMajor = inc.linked_major_incidents ?? [];
  const linkedMajorIds = new Set(linkedMajor.map((m) => m.id));
  const linkChoices = linkableMajors.filter((m) => !linkedMajorIds.has(m.id));

  if (!(linkedMajor.length > 0 || showLinkUi)) {
    return null;
  }

  return (
    <Card
      padding={false}
      className="mb-3 border-l-[3px] border-l-indigo-500 border-y border-r border-gray-200 rounded-lg bg-indigo-50/25 px-3 py-2 dark:border-gray-600 dark:border-l-indigo-400 dark:bg-indigo-950/55"
    >
      {linkedMajor.length === 0 && showLinkUi && linkChoices.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-indigo-900/90 dark:text-indigo-100 shrink-0">
            {tIncidents('majorIncident')}
          </span>
          <label htmlFor="link-major-select" className="sr-only">
            {tIncidents('linkToMajor')}
          </label>
          <select
            id="link-major-select"
            className={linkMajorSelectCls}
            value={linkMajorSelect}
            onChange={(e) => setLinkMajorSelect(e.target.value)}
          >
            <option value="">{tIncidents('selectMajorIncident')}</option>
            {linkChoices.map((m) => (
              <option key={m.id} value={m.id}>{m.number} — {m.title} ({m.status})</option>
            ))}
          </select>
          <Button type="button" variant="outline" size="sm" onClick={() => void handleLinkMajor()} disabled={!linkMajorSelect || linkMajorBusy}>
            {linkMajorBusy ? tIncidents('linking') : tIncidents('link')}
          </Button>
          {linkMajorErr && <p className="text-xs text-red-600 dark:text-red-400 basis-full">{linkMajorErr}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 min-h-[1.25rem]">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-indigo-900/90 dark:text-indigo-100 shrink-0">
              {tIncidents('majorIncident')}
            </span>
            {linkedMajor.length === 0 ? (
              <span className="text-xs text-gray-600 dark:text-gray-300 truncate">{tIncidents('noneLinked')}</span>
            ) : null}
          </div>
          {linkedMajor.length > 0 ? (
            <ul className="text-sm space-y-0.5">
              {linkedMajor.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 leading-snug">
                  <Link to={`/major-incidents/${m.id}`} className="text-indigo-700 dark:text-indigo-300 font-medium hover:underline truncate min-w-0">
                    <span className="font-mono text-xs text-gray-600 dark:text-gray-400 mr-1.5 tabular-nums">{m.number ?? tTable('emDash')}</span>
                    {m.title}
                  </Link>
                  <Badge value={m.status} />
                  {m.link_kind === 'primary' && (
                    <span className="text-[10px] font-semibold uppercase text-amber-900 bg-amber-100/90 dark:text-amber-100 dark:bg-amber-900/55 px-1 py-0.5 rounded">{tIncidents('primary')}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          {showLinkUi && linkChoices.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-indigo-100/60 dark:border-indigo-700/50">
              <label htmlFor="link-major-select-linked" className="sr-only">
                {tIncidents('linkToMajor')}
              </label>
              <select
                id="link-major-select-linked"
                className={linkMajorSelectCls}
                value={linkMajorSelect}
                onChange={(e) => setLinkMajorSelect(e.target.value)}
              >
                <option value="">{tIncidents('selectMajorIncident')}</option>
                {linkChoices.map((m) => (
                  <option key={m.id} value={m.id}>{m.number ?? tTable('emDash')} — {m.title} ({m.status})</option>
                ))}
              </select>
              <Button type="button" variant="outline" size="sm" onClick={() => void handleLinkMajor()} disabled={!linkMajorSelect || linkMajorBusy}>
                {linkMajorBusy ? tIncidents('linking') : tIncidents('link')}
              </Button>
            </div>
          )}
          {linkMajorErr && <p className="text-xs text-red-600 dark:text-red-400">{linkMajorErr}</p>}
        </div>
      )}
    </Card>
  );
}
