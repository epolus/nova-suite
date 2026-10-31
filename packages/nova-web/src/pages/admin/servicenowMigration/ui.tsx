/* SPDX-License-Identifier: AGPL-3.0-only */
import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { STATUS_STYLES, type Step } from './shared';

export function Pill({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[tone] ?? 'bg-gray-100 text-gray-700'}`}>
      {children}
    </span>
  );
}

export function StepIndicator({ step }: { step: Step }) {
  const t = useTranslations('pages.admin.serviceNowMigration.steps');
  const steps: Step[] = ['connect', 'select', 'run', 'review'];
  const current = steps.indexOf(step);
  return (
    <ol className="flex flex-wrap gap-2 mb-6">
      {steps.map((s, i) => (
        <li
          key={s}
          className={`px-3 py-1 rounded-full text-xs font-medium ${
            i === current ? 'bg-indigo-600 text-white' : i < current ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {i + 1}. {t(s)}
        </li>
      ))}
    </ol>
  );
}
