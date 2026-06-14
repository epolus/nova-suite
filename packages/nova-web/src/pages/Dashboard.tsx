/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import MajorIncidentBanner from '@/components/MajorIncidentBanner';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/context/AuthContext';
import AddWidgetPanel from '@/dashboard/AddWidgetPanel';
import DashboardGrid from '@/dashboard/DashboardGrid';
import DashboardSettingsPanel from '@/dashboard/DashboardSettingsPanel';
import DashboardSwitcher from '@/dashboard/DashboardSwitcher';
import DashboardToolbar from '@/dashboard/DashboardToolbar';
import { useDashboardLayout } from '@/dashboard/useDashboardLayout';
import { useDashboardAutoRefresh } from '@/dashboard/useDashboardAutoRefresh';
import { useUserDashboards } from '@/dashboard/useUserDashboards';
import type { DashboardWidgetType } from '@/dashboard/types';

export default function Dashboard() {
  const tDashboard = useTranslations('pages.dashboard');
  const tCustomize = useTranslations('pages.dashboard.customize');
  const { user } = useAuth();
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetTargetId, setResetTargetId] = useState<string | null>(null);
  const pendingCustomizeRef = useRef(false);
  const pendingResetRef = useRef(false);

  const {
    dashboards,
    isLoading: dashboardsLoading,
    activeId,
    activeDashboard,
    selectDashboard,
    saveLayout,
    createDashboard,
    setDefaultDashboard,
    deleteDashboard,
    canCreateMore,
    isCreating,
  } = useUserDashboards(user?.roles);

  const {
    layout,
    editMode,
    setEditMode,
    handleGridLayoutChange,
    handleDragStop,
    addWidget,
    removeWidgetById,
    setWidgetConfig,
    resetLayout,
  } = useDashboardLayout({
    dashboardId: activeId,
    roles: user?.roles,
    serverLayout: activeDashboard?.layout,
    isLayoutLoading: dashboardsLoading,
    onSaveLayout: saveLayout,
  });
  const { autoRefreshSeconds, setAutoRefreshSeconds } = useDashboardAutoRefresh();

  const existingTypes = useMemo(
    () => new Set(layout.widgets.map((w) => w.type)),
    [layout.widgets],
  );

  const handleCustomizeDashboard = (dashboardId: string) => {
    if (dashboardId === activeId) {
      setEditMode(true);
      return;
    }
    pendingCustomizeRef.current = true;
    selectDashboard(dashboardId);
  };

  const handleResetDashboard = (dashboardId: string) => {
    setResetTargetId(dashboardId);
    if (dashboardId !== activeId) {
      selectDashboard(dashboardId);
    }
    setConfirmReset(true);
  };

  useEffect(() => {
    if (!pendingCustomizeRef.current || !activeId) return;
    pendingCustomizeRef.current = false;
    setEditMode(true);
  }, [activeId, setEditMode]);

  useEffect(() => {
    if (!pendingResetRef.current || !resetTargetId || activeId !== resetTargetId) return;
    pendingResetRef.current = false;
    resetLayout();
    setResetTargetId(null);
    setSettingsOpen(false);
  }, [activeId, resetLayout, resetTargetId]);

  return (
    <>
      <MajorIncidentBanner />
      <PageHeader
        title={tDashboard('welcomeBack', { name: user?.display_name || '' })}
        description={editMode ? tCustomize('editHint') : tDashboard('description')}
        action={(
          <div className="flex items-center gap-2">
            <DashboardSwitcher
              dashboards={dashboards}
              activeId={activeId}
              disabled={editMode || dashboardsLoading}
              onSelect={selectDashboard}
            />
            <DashboardToolbar
              editMode={editMode}
              onOpenSettings={() => setSettingsOpen(true)}
              onEditModeChange={setEditMode}
              onAddWidget={() => setAddPanelOpen(true)}
              onResetLayout={resetLayout}
            />
          </div>
        )}
      />

      {editMode && (
        <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50/80 dark:border-indigo-800 dark:bg-indigo-950/30 px-4 py-3 text-sm text-indigo-800 dark:text-indigo-200">
          {tCustomize('editHint')}
        </div>
      )}

      {!dashboardsLoading && activeId && (
        <DashboardGrid
          key={activeId}
          layout={layout}
          editMode={editMode}
          onLayoutChange={handleGridLayoutChange}
          onDragStop={handleDragStop}
          onRemoveWidget={removeWidgetById}
          onConfigChange={setWidgetConfig}
          onAddWidget={() => setAddPanelOpen(true)}
        />
      )}

      <DashboardSettingsPanel
        open={settingsOpen}
        dashboards={dashboards}
        activeId={activeId}
        canCreateMore={canCreateMore}
        isCreating={isCreating}
        autoRefreshSeconds={autoRefreshSeconds}
        onAutoRefreshChange={setAutoRefreshSeconds}
        onCustomizeLayout={handleCustomizeDashboard}
        onResetLayout={handleResetDashboard}
        onSelectDashboard={selectDashboard}
        onCreateDashboard={createDashboard}
        onSetDefaultDashboard={setDefaultDashboard}
        onDeleteDashboard={deleteDashboard}
        onClose={() => setSettingsOpen(false)}
      />

      <AddWidgetPanel
        open={addPanelOpen}
        roles={user?.roles}
        existingTypes={existingTypes}
        onClose={() => setAddPanelOpen(false)}
        onAdd={(type: DashboardWidgetType) => addWidget(type)}
      />

      <ConfirmDialog
        open={confirmReset}
        title={tCustomize('resetLayout')}
        message={tCustomize('resetLayoutConfirm')}
        confirmLabel={tCustomize('resetLayout')}
        variant="danger"
        onConfirm={() => {
          if (resetTargetId && resetTargetId !== activeId) {
            pendingResetRef.current = true;
            setConfirmReset(false);
            return;
          }
          resetLayout();
          setConfirmReset(false);
          setResetTargetId(null);
          setSettingsOpen(false);
        }}
        onCancel={() => {
          setConfirmReset(false);
          setResetTargetId(null);
          pendingResetRef.current = false;
        }}
      />
    </>
  );
}
