/* SPDX-License-Identifier: AGPL-3.0-only */
import { Link } from 'react-router';
import { useTranslations } from 'use-intl';
import Card from '../../components/Card';
import { Button } from '../../components/ui/button';

export function WarRoomLinkedIncidents({
  related,
  primaryIncidentId,
  isPendingAcceptance,
  canManage,
  suggLoading,
  onRefresh,
  suggested,
  linkBusy,
  onLink,
}: {
  related: Record<string, unknown>[];
  primaryIncidentId: string;
  isPendingAcceptance: boolean;
  canManage: boolean;
  suggLoading: boolean;
  onRefresh: () => void;
  suggested: Record<string, unknown>[];
  linkBusy: string | null;
  onLink: (incidentId: string) => void;
}) {
  const t = useTranslations('pages.majorIncidents.warRoom');

  return (
    <Card>
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="font-semibold text-gray-900">{t('linkedIncidents')}</h3>
        {!isPendingAcceptance && canManage && (
          <Button type="button" variant="outline" className="text-xs h-8" onClick={onRefresh} disabled={suggLoading}>
            {suggLoading ? t('refreshing') : t('refreshSuggestions')}
          </Button>
        )}
      </div>
      {related.length === 0 ? (
        <p className="text-xs text-gray-500">{t('noLinkedIncidents')}</p>
      ) : (
        <ul className="text-sm space-y-2">
          {related.map((r) => {
            const iid = String(r.incident_id);
            const isPrimary = primaryIncidentId !== '' && iid === primaryIncidentId;
            return (
              <li key={iid} className="flex flex-wrap items-center gap-2">
                <Link to={`/incidents/${iid}`} className="text-indigo-700 hover:underline font-medium">
                  {String(r.incident_number)} — {String(r.incident_title)}
                </Link>
                {isPrimary && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded-sm">
                    {t('primary')}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!isPendingAcceptance && canManage && suggested.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-600 mb-2">{t('suggestedSameWindow')}</p>
          <ul className="text-sm space-y-2">
            {suggested.map((s) => {
              const sid = String(s.id);
              return (
                <li key={sid} className="flex items-center justify-between gap-2">
                  <Link to={`/incidents/${sid}`} className="text-indigo-700 hover:underline truncate">
                    {String(s.number)} — {String(s.title)}
                  </Link>
                  <Button
                    type="button"
                    variant="outline"
                    className="text-xs h-8 shrink-0"
                    disabled={linkBusy !== null}
                    onClick={() => onLink(sid)}
                  >
                    {linkBusy === sid ? t('linking') : t('add')}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}
