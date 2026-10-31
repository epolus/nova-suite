/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useTranslations } from 'use-intl';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';
import { Button } from '@/components/ui/button';
import { reports, type ReportComponentConfig, type ReportComponentResult } from '../../api/client';
import { hasReportingViewRole } from '../../utils/roles';
import { useAuth } from '../../context/AuthContext';
import { useUserPreferenceState } from '../../hooks/useUserPreferenceState';
import ReportViewerGrid from './ReportViewerGrid';
import { ReportResultCard } from './reportResult';
import {
  componentWidgetId,
  resolveReportLayout,
  sameBoxes,
  savedBoxesForReport,
  type ReportViewerLayoutStore,
  type ReportWidgetBox,
} from './reportViewerLayout';


export default function ReportViewerPage() {
  const t = useTranslations('pages.reports');
  const { reportId = '' } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState<string | null>(null);
  const [results, setResults] = useState<Array<{ component: ReportComponentConfig; result: ReportComponentResult }>>([]);
  const [autoRefreshSeconds, setAutoRefreshSeconds] = useUserPreferenceState<number>(
    'reports:viewer:auto_refresh_seconds',
    0,
    'nova_report_viewer_auto_refresh_seconds',
  );
  const [widgetLayouts, setWidgetLayouts] = useUserPreferenceState<ReportViewerLayoutStore>(
    'reports:viewer:layouts',
    { byId: {} },
  );
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState<number>(0);
  const [arranging, setArranging] = useState(false);
  const [liveBoxes, setLiveBoxes] = useState<ReportWidgetBox[] | null>(null);

  const canView = useMemo(() => hasReportingViewRole(user?.roles), [user?.roles]);
  const widgets = useMemo(
    () => results.map((item, index) => ({
      ...item,
      component: { ...item.component, id: componentWidgetId(item.component, index) },
    })),
    [results],
  );
  const widgetBoxes = useMemo(
    () => resolveReportLayout(
      widgets.map((item) => ({ id: item.component.id, type: item.component.type })),
      savedBoxesForReport(widgetLayouts, reportId),
    ),
    [widgets, widgetLayouts, reportId],
  );

  const displayBoxes = liveBoxes ?? widgetBoxes;

  const saveWidgetBoxes = (next: ReportWidgetBox[]) => {
    if (sameBoxes(next, widgetBoxes)) return;
    setWidgetLayouts((prev) => {
      const byId = prev && typeof prev === 'object' && prev.byId ? prev.byId : {};
      return { byId: { ...byId, [reportId]: next } };
    });
  };

  const previewWidgetBoxes = (next: ReportWidgetBox[]) => {
    setLiveBoxes((prev) => (prev && sameBoxes(prev, next) ? prev : next));
  };

  const commitWidgetBoxes = (next: ReportWidgetBox[]) => {
    setLiveBoxes(next);
    saveWidgetBoxes(next);
  };

  const toggleArranging = () => {
    if (arranging && liveBoxes) saveWidgetBoxes(liveBoxes);
    setArranging((current) => !current);
  };

  useEffect(() => {
    const allowed = new Set([0, 30, 60, 300]);
    if (!allowed.has(autoRefreshSeconds)) {
      setAutoRefreshSeconds(0);
    }
  }, [autoRefreshSeconds, setAutoRefreshSeconds]);

  const runNow = async () => {
    setRunning(true);
    setError(null);
    try {
      const run = await reports.runDefinition(reportId);
      setResults(run.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('runFailed'));
    } finally {
      setRunning(false);
      if (autoRefreshSeconds > 0) {
        setSecondsUntilRefresh(autoRefreshSeconds);
      }
    }
  };

  const viewerKey = `${canView}|${reportId}`;
  const [prevViewerKey, setPrevViewerKey] = useState(viewerKey);
  if (viewerKey !== prevViewerKey) {
    setPrevViewerKey(viewerKey);
    setLoading(!!(canView && reportId));
    setError(null);
    setArranging(false);
    setLiveBoxes(null);
  }

  const [prevAutoRefresh, setPrevAutoRefresh] = useState(autoRefreshSeconds);
  if (autoRefreshSeconds !== prevAutoRefresh) {
    setPrevAutoRefresh(autoRefreshSeconds);
    setSecondsUntilRefresh(autoRefreshSeconds > 0 ? autoRefreshSeconds : 0);
  }

  useEffect(() => {
    if (!canView || !reportId) return;
    let cancelled = false;
    (async () => {
      try {
        const detail = await reports.getDefinition(reportId);
        if (cancelled) return;
        setTitle(detail.report.name);
        setDescription(detail.report.description);
        setRunning(true);
        try {
          const run = await reports.runDefinition(reportId);
          if (cancelled) return;
          setResults(run.results);
        } catch (err) {
          if (!cancelled) setError(err instanceof Error ? err.message : t('runFailed'));
        } finally {
          if (!cancelled) {
            setRunning(false);
            if (autoRefreshSeconds > 0) setSecondsUntilRefresh(autoRefreshSeconds);
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t('loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, reportId]);

  useEffect(() => {
    if (!canView || !reportId || autoRefreshSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setSecondsUntilRefresh((prev) => {
        if (prev <= 1) {
          if (!running && !loading) {
            void runNow();
          }
          return autoRefreshSeconds;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefreshSeconds, canView, reportId, running, loading]);

  if (!canView) {
    return (
      <>
        <PageHeader title={t('viewer')} description={t('viewerDescription')} />
        <Card>
          <p className="text-sm text-gray-600">{t('noPermissionView')}</p>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={title || t('viewer')}
        description={description || t('customView')}
        action={(
          <div className="flex items-center gap-2">
            <Button type="button" variant={arranging ? 'default' : 'outline'} onClick={toggleArranging}>
              {arranging ? t('doneArranging') : t('arrange')}
            </Button>
            <Button type="button" variant="outline" onClick={() => void runNow()} disabled={running || loading}>
              {running ? t('running') : t('runNow')}
            </Button>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">{t('autoUpdate')}</label>
              <select
                value={String(autoRefreshSeconds)}
                onChange={(event) => setAutoRefreshSeconds(Number.parseInt(event.target.value, 10) || 0)}
                className="px-2 py-1.5 rounded-md border border-gray-200 text-xs"
              >
                <option value="0">{t('autoUpdateOff')}</option>
                <option value="30">{t('autoUpdate30s')}</option>
                <option value="60">{t('autoUpdate1m')}</option>
                <option value="300">{t('autoUpdate5m')}</option>
              </select>
            </div>
            {autoRefreshSeconds > 0 && (
              <span className="text-xs text-gray-500">
                {t('refreshIn', { seconds: secondsUntilRefresh })}
              </span>
            )}
            <Button asChild>
              <Link to={`/reports/${reportId}/builder`}>{t('openBuilder')}</Link>
            </Button>
          </div>
        )}
      />

      {arranging && (
        <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50/80 px-4 py-3 text-sm text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-200">
          {t('arrangeHint')}
        </div>
      )}

      {loading ? <Spinner /> : null}
      {error && (
        <Card className="mb-4">
          <p className="text-sm text-red-600">{error}</p>
        </Card>
      )}

      {!loading && !error && widgets.length > 0 && (
        <ReportViewerGrid
          items={widgets}
          boxes={displayBoxes}
          arranging={arranging}
          onBoxesChange={previewWidgetBoxes}
          onBoxesCommit={commitWidgetBoxes}
          renderItem={({ component, result }) => (
            <ReportResultCard
              component={component}
              result={result}
              arranging={arranging}
              onOpenPath={(path) => navigate(path)}
            />
          )}
        />
      )}
      {!loading && !error && widgets.length === 0 && (
        <Card>
          <p className="text-sm text-gray-500">{t('noComponents')}</p>
        </Card>
      )}
    </>
  );
}
