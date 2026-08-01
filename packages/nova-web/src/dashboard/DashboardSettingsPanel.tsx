/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import type { UserDashboard } from '@/api/domains/dashboards';
import { Button } from '@/components/ui/button';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { autoRefreshOptionLabel } from './autoRefreshLabels';
import { DASHBOARD_AUTO_REFRESH_OPTIONS } from './constants';

interface Props {
  open: boolean;
  dashboards: UserDashboard[];
  activeId: string | null;
  canCreateMore: boolean;
  isCreating: boolean;
  autoRefreshSeconds: number;
  onAutoRefreshChange: (seconds: number) => void;
  onCustomizeLayout: (dashboardId: string) => void;
  onResetLayout: (dashboardId: string) => void;
  onSelectDashboard: (id: string) => void;
  onCreateDashboard: (name: string) => Promise<void>;
  onSetDefaultDashboard: (id: string) => Promise<void>;
  onDeleteDashboard: (id: string) => Promise<void>;
  onClose: () => void;
}

export default function DashboardSettingsPanel({
  open,
  dashboards,
  activeId,
  canCreateMore,
  isCreating,
  autoRefreshSeconds,
  onAutoRefreshChange,
  onCustomizeLayout,
  onResetLayout,
  onSelectDashboard,
  onCreateDashboard,
  onSetDefaultDashboard,
  onDeleteDashboard,
  onClose,
}: Props) {
  const t = useTranslations('pages.dashboard.customize');
  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [layoutDashboardId, setLayoutDashboardId] = useState(activeId ?? '');

  useEffect(() => {
    if (open && activeId) {
      setLayoutDashboardId(activeId);
    }
  }, [open, activeId]);

  if (!open) return null;

  const handleSelectForLayout = (dashboardId: string) => {
    setLayoutDashboardId(dashboardId);
    onSelectDashboard(dashboardId);
  };

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      setCreateError(t('dashboardNameRequired'));
      return;
    }
    setCreateError(null);
    try {
      await onCreateDashboard(trimmed);
      setNewName('');
    } catch {
      setCreateError(t('createDashboardFailed'));
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 flex justify-end">
        <button
          type="button"
          className="absolute inset-0 bg-black/30"
          aria-label={t('closePanel')}
          onClick={onClose}
        />
        <aside className="relative z-10 w-full max-w-sm h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-xl flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('settingsTitle')}</h2>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              {t('closePanel')}
            </Button>
          </div>

          <div className="flex-1 overflow-auto p-5 space-y-6">
            <section>
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">{t('dashboardsSection')}</h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('dashboardsSectionHint')}</p>

              <ul className="mt-3 space-y-2">
                {dashboards.map((dashboard) => {
                  const isSelected = dashboard.id === layoutDashboardId;
                  const isViewing = dashboard.id === activeId;
                  const canDelete = dashboards.length > 1;

                  return (
                    <li
                      key={dashboard.id}
                      className={`rounded-lg border px-3 py-2 ${
                        isSelected
                          ? 'border-indigo-300 bg-indigo-50/70 dark:border-indigo-700 dark:bg-indigo-950/30'
                          : 'border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => handleSelectForLayout(dashboard.id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {dashboard.name}
                          </span>
                          <div className="flex shrink-0 flex-wrap justify-end gap-1">
                            {isViewing && (
                              <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                                {t('viewingBadge')}
                              </span>
                            )}
                            {dashboard.is_default && (
                              <span className="rounded-full bg-indigo-100 dark:bg-indigo-900/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-200">
                                {t('defaultBadge')}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            onCustomizeLayout(dashboard.id);
                            onClose();
                          }}
                        >
                          {t('editLayout')}
                        </Button>
                        {!dashboard.is_default && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void onSetDefaultDashboard(dashboard.id)}
                          >
                            {t('setDefault')}
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setPendingDeleteId(dashboard.id)}
                          >
                            {t('deleteDashboard')}
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>

              {canCreateMore ? (
                <div className="mt-4 space-y-2">
                  <label htmlFor="new-dashboard-name" className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                    {t('newDashboardName')}
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="new-dashboard-name"
                      type="text"
                      value={newName}
                      maxLength={80}
                      placeholder={t('newDashboardPlaceholder')}
                      onChange={(event) => {
                        setNewName(event.target.value);
                        if (createError) setCreateError(null);
                      }}
                      className="flex-1 h-9 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 text-sm text-gray-700 dark:text-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <Button type="button" size="sm" disabled={isCreating} onClick={() => void handleCreate()}>
                      {t('createDashboard')}
                    </Button>
                  </div>
                  {createError && (
                    <p className="text-xs text-red-600 dark:text-red-400">{createError}</p>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{t('maxDashboardsReached')}</p>
              )}
            </section>

            <section className="pt-2 border-t border-gray-100 dark:border-gray-800">
              <label htmlFor="dashboard-auto-refresh" className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                {t('autoRefresh')}
              </label>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('autoRefreshHint')}</p>
              <select
                id="dashboard-auto-refresh"
                value={String(autoRefreshSeconds)}
                onChange={(event) => onAutoRefreshChange(Number.parseInt(event.target.value, 10) || 0)}
                className="mt-3 w-full h-10 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 text-sm text-gray-700 dark:text-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {DASHBOARD_AUTO_REFRESH_OPTIONS.map((seconds) => (
                  <option key={seconds} value={seconds}>
                    {autoRefreshOptionLabel(seconds, (key) => t(key))}
                  </option>
                ))}
              </select>
            </section>

            <section className="pt-2 border-t border-gray-100 dark:border-gray-800">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">{t('layoutSection')}</h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('layoutSectionHint')}</p>
              <label htmlFor="layout-dashboard-select" className="mt-3 block text-xs font-medium text-gray-700 dark:text-gray-300">
                {t('layoutDashboard')}
              </label>
              <select
                id="layout-dashboard-select"
                value={layoutDashboardId}
                onChange={(event) => handleSelectForLayout(event.target.value)}
                className="mt-2 w-full h-10 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 text-sm text-gray-700 dark:text-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {dashboards.map((dashboard) => (
                  <option key={dashboard.id} value={dashboard.id}>
                    {dashboard.name}
                    {dashboard.is_default ? ` (${t('defaultBadge')})` : ''}
                  </option>
                ))}
              </select>
              <div className="mt-3 flex flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="justify-center"
                  disabled={!layoutDashboardId}
                  onClick={() => {
                    if (!layoutDashboardId) return;
                    onCustomizeLayout(layoutDashboardId);
                    onClose();
                  }}
                >
                  {t('editLayout')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="justify-center"
                  disabled={!layoutDashboardId}
                  onClick={() => layoutDashboardId && onResetLayout(layoutDashboardId)}
                >
                  {t('resetLayout')}
                </Button>
              </div>
            </section>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title={t('deleteDashboard')}
        message={t('deleteDashboardConfirm')}
        confirmLabel={t('deleteDashboard')}
        variant="danger"
        onConfirm={() => {
          if (pendingDeleteId) void onDeleteDashboard(pendingDeleteId);
          setPendingDeleteId(null);
        }}
        onCancel={() => setPendingDeleteId(null)}
      />
    </>
  );
}
