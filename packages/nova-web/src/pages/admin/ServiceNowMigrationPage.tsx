/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import PageHeader from '../../components/PageHeader';
import { migrations } from '../../api/client';
import type { MigrationRunDetail, MigrationRunSummary } from '../../api/client';
import ConnectStep from './servicenowMigration/ConnectStep';
import SelectStep from './servicenowMigration/SelectStep';
import ReviewStep from './servicenowMigration/ReviewStep';
import { RunHistory, RunProgress } from './servicenowMigration/RunPanels';
import { ACTIVE_STATUSES, errorMessage, POLL_MS, secondaryButton, type Step } from './servicenowMigration/shared';
import { StepIndicator } from './servicenowMigration/ui';

export default function ServiceNowMigrationPage() {
  const t = useTranslations('pages.admin.serviceNowMigration');
  const [step, setStep] = useState<Step>('connect');
  const [instanceUrl, setInstanceUrl] = useState('');
  const [credentialSlug, setCredentialSlug] = useState('');
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<MigrationRunDetail | null>(null);
  const [runs, setRuns] = useState<MigrationRunSummary[]>([]);
  const [error, setError] = useState('');

  const loadRuns = useCallback(() => {
    migrations.serviceNowRuns().then((r) => setRuns(r.runs)).catch(() => undefined);
  }, []);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  useEffect(() => {
    if (!runId) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      try {
        const { run: next } = await migrations.serviceNowRun(runId);
        if (cancelled) return;
        setRun(next);
        if (ACTIVE_STATUSES.includes(next.status) && next.status !== 'applying') {
          timer = setTimeout(() => void poll(), POLL_MS);
          return;
        }
        if (next.report) setStep('review');
        else if (next.status === 'failed') setError(next.error ?? t('status.failed'));
        loadRuns();
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, t('status.failed')));
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [runId, loadRuns, t]);

  const openRun = (id: string) => {
    setError('');
    setRun(null);
    setStep('run');
    setRunId(id);
  };

  const reset = () => {
    setRunId(null);
    setRun(null);
    setError('');
    setStep('connect');
  };

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <div className="flex items-center justify-between">
        <StepIndicator step={step} />
        {step !== 'connect' && (
          <button type="button" className={secondaryButton} onClick={reset}>{t('newRun')}</button>
        )}
      </div>

      {error && <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

      {step === 'connect' && (
        <ConnectStep
          instanceUrl={instanceUrl}
          setInstanceUrl={setInstanceUrl}
          credentialSlug={credentialSlug}
          setCredentialSlug={setCredentialSlug}
          onConnected={() => setStep('select')}
        />
      )}
      {step === 'select' && (
        <SelectStep instanceUrl={instanceUrl} credentialSlug={credentialSlug} onStarted={openRun} />
      )}
      {step === 'run' && !error && <RunProgress run={run} />}
      {step === 'review' && run?.report && (
        <ReviewStep run={run} onApplied={loadRuns} />
      )}

      <RunHistory runs={runs} onOpen={openRun} />
    </>
  );
}
