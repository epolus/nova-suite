/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import Card from '../../components/Card';

export type SlaAttainment = {
  response_met: number;
  response_breached: number;
  resolution_met: number;
  resolution_breached: number;
  response_attainment: number | null;
  resolution_attainment: number | null;
  pause_adjusted_mttr_hours: number | null;
};

function percent(rate: number | null): string {
  if (rate == null) return '—';
  return `${(rate * 100).toFixed(1)}%`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-900">{value}</p>
    </div>
  );
}

export function SlaAttainmentCard({ sla }: { sla: SlaAttainment }) {
  const t = useTranslations('pages.reports');

  return (
    <Card className="mb-4">
      <h3 className="text-sm font-semibold text-gray-900">{t('slaAttainment')}</h3>
      <p className="text-xs text-gray-500 mt-1">{t('slaAttainmentHint')}</p>
      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label={t('responseMet')} value={String(sla.response_met)} />
        <Stat label={t('responseBreached')} value={String(sla.response_breached)} />
        <Stat label={t('resolutionMet')} value={String(sla.resolution_met)} />
        <Stat label={t('resolutionBreached')} value={String(sla.resolution_breached)} />
        <Stat label={t('responseAttainment')} value={percent(sla.response_attainment)} />
        <Stat label={t('resolutionAttainment')} value={percent(sla.resolution_attainment)} />
        <Stat
          label={t('pauseAdjustedMttr')}
          value={sla.pause_adjusted_mttr_hours == null ? '—' : t('hoursValue', { hours: sla.pause_adjusted_mttr_hours.toFixed(2) })}
        />
      </div>
    </Card>
  );
}
