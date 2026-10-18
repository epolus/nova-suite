/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import Card from '../../components/Card';
import { useStatusLabel } from '@/i18n/hooks';

const STEPS = ['pending_acceptance', 'declared', 'investigating', 'monitoring', 'resolved'] as const;

export function MajorIncidentProgress({ status }: { status: string }) {
  const t = useTranslations('pages.majorIncidents.warRoom');
  const statusLabel = useStatusLabel();
  const cancelled = status === 'cancelled';
  const index = STEPS.indexOf(status as (typeof STEPS)[number]);
  const current = index >= 0 ? index : 0;
  const percent = cancelled || index < 0 ? 0 : (current / (STEPS.length - 1)) * 100;

  return (
    <Card className="mb-4">
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h3 className="text-sm font-semibold text-gray-900">{t('processProgress')}</h3>
        <p className="text-xs text-gray-500">
          {cancelled
            ? statusLabel('cancelled')
            : t('processStep', { current: index >= 0 ? current + 1 : 1, total: STEPS.length })}
        </p>
      </div>
      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
        aria-valuenow={cancelled || index < 0 ? 0 : current + 1}
        aria-valuetext={cancelled ? statusLabel('cancelled') : statusLabel(status)}
      >
        <div className="relative">
          <div className="absolute top-3 left-[10%] right-[10%] h-1.5 rounded-full bg-gray-100" aria-hidden>
            <div
              className={`h-full rounded-full transition-all duration-500 ${cancelled ? 'bg-rose-500' : 'bg-indigo-600'}`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <ol className="relative grid grid-cols-5">
            {STEPS.map((step, stepIndex) => {
              const done = !cancelled && index >= 0 && stepIndex < current;
              const active = !cancelled && stepIndex === current && index >= 0;
              const failed = cancelled && stepIndex === 0;
              return (
                <li key={step} className="flex flex-col items-center text-center">
                  <span
                    className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${
                      failed
                        ? 'bg-rose-600 text-white ring-4 ring-rose-100'
                        : done || active
                          ? 'bg-indigo-600 text-white'
                          : 'border border-gray-300 bg-white text-gray-400'
                    } ${active ? 'ring-4 ring-indigo-100' : ''}`}
                  >
                    {stepIndex + 1}
                  </span>
                  <span
                    className={`mt-2 px-1 text-[11px] leading-tight ${
                      failed
                        ? 'font-semibold text-rose-700'
                        : active
                          ? 'font-semibold text-indigo-700'
                          : done
                            ? 'text-gray-700'
                            : 'text-gray-400'
                    }`}
                  >
                    {statusLabel(step)}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      {cancelled && <p className="mt-3 text-xs text-rose-700">{t('processCancelled')}</p>}
    </Card>
  );
}
