/* SPDX-License-Identifier: AGPL-3.0-only */
import { useMemo, useState } from 'react';
import { useTranslations } from 'use-intl';
import MajorIncidentBanner from '@/components/MajorIncidentBanner';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/context/AuthContext';
import AddWidgetPanel from '@/dashboard/AddWidgetPanel';
import DashboardGrid from '@/dashboard/DashboardGrid';
import DashboardSettingsPanel from '@/dashboard/DashboardSettingsPanel';
import DashboardToolbar from '@/dashboard/DashboardToolbar';
import { useDashboardLayout } from '@/dashboard/useDashboardLayout';
import { useDashboardAutoRefresh } from '@/dashboard/useDashboardAutoRefresh';
import type { DashboardWidgetType } from '@/dashboard/types';

export default function Dashboard() {
  const tDashboard = useTranslations('pages.dashboard');
  const tCustomize = useTranslations('pages.dashboard.customize');
  const { user } = useAuth();
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

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
  } = useDashboardLayout(user?.roles);
  const { autoRefreshSeconds, setAutoRefreshSeconds } = useDashboardAutoRefresh();

  const existingTypes = useMemo(
    () => new Set(layout.widgets.map((w) => w.type)),
    [layout.widgets],
  );

  return (
    <>
      <MajorIncidentBanner />
      <PageHeader
        title={tDashboard('welcomeBack', { name: user?.display_name || '' })}
        description={editMode ? tCustomize('editHint') : tDashboard('description')}
        action={(
          <DashboardToolbar
            editMode={editMode}
            onOpenSettings={() => setSettingsOpen(true)}
            onEditModeChange={setEditMode}
            onAddWidget={() => setAddPanelOpen(true)}
            onResetLayout={resetLayout}
          />
        )}
      />

      {editMode && (
        <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50/80 dark:border-indigo-800 dark:bg-indigo-950/30 px-4 py-3 text-sm text-indigo-800 dark:text-indigo-200">
          {tCustomize('editHint')}
        </div>
      )}

      <DashboardGrid
        layout={layout}
        editMode={editMode}
        onLayoutChange={handleGridLayoutChange}
        onDragStop={handleDragStop}
        onRemoveWidget={removeWidgetById}
        onConfigChange={setWidgetConfig}
        onAddWidget={() => setAddPanelOpen(true)}
      />

      <DashboardSettingsPanel
        open={settingsOpen}
        autoRefreshSeconds={autoRefreshSeconds}
        onAutoRefreshChange={setAutoRefreshSeconds}
        onCustomizeLayout={() => setEditMode(true)}
        onResetLayout={() => setConfirmReset(true)}
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
          resetLayout();
          setConfirmReset(false);
          setSettingsOpen(false);
        }}
        onCancel={() => setConfirmReset(false)}
      />
    </>
  );
}
