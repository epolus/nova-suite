/* SPDX-License-Identifier: AGPL-3.0-only */
import { Link } from 'react-router-dom';
import { useTranslations } from 'use-intl';
import { useMajorIncidentsActiveBanner } from '../hooks/queries';

export default function MajorIncidentBanner() {
  const t = useTranslations('components.majorIncidentBanner');
  const { data: items = [] } = useMajorIncidentsActiveBanner();

  if (items.length === 0) return null;

  return (
    <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold uppercase tracking-wide text-red-800">{t('label')}</span>
        {items.map((it) => (
          <Link
            key={it.id}
            to={`/major-incidents/${it.id}`}
            className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700"
          >
            P{it.priority} · {it.number} · {it.title}
          </Link>
        ))}
      </div>
    </div>
  );
}
