/* SPDX-License-Identifier: AGPL-3.0-only */
import { useMemo } from 'react';
import { ResponsiveGridLayout, useContainerWidth, verticalCompactor } from 'react-grid-layout';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';
import {
  DASHBOARD_BREAKPOINTS,
  DASHBOARD_COLS_BY_BREAKPOINT,
  DASHBOARD_CONTAINER_PADDING,
  DASHBOARD_MARGIN,
  DASHBOARD_ROW_HEIGHT,
} from './constants';
import DashboardWidgetShell from './DashboardWidgetShell';
import { getWidgetDefinition } from './registry';
import { toGridLayout, buildResponsiveDisplayLayouts } from './layoutUtils';
import type { DashboardLayout } from './types';
import type { DashboardWidgetProps } from './types';
import './dashboard-grid.css';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

interface Props {
  layout: DashboardLayout;
  editMode: boolean;
  onLayoutChange: (layout: import('react-grid-layout').Layout) => void;
  onDragStop: () => void;
  onRemoveWidget: (id: string) => void;
  onConfigChange: (id: string, config: Record<string, unknown>) => void;
  onAddWidget: () => void;
}

export default function DashboardGrid({
  layout,
  editMode,
  onLayoutChange,
  onDragStop,
  onRemoveWidget,
  onConfigChange,
  onAddWidget,
}: Props) {
  const t = useTranslations('pages.dashboard.customize');
  const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true });

  const layouts = useMemo(() => {
    if (editMode) {
      const gridLayout = toGridLayout(layout.widgets);
      return { lg: gridLayout, md: gridLayout, sm: gridLayout, xs: gridLayout, xxs: gridLayout };
    }
    return buildResponsiveDisplayLayouts(layout.widgets);
  }, [editMode, layout.widgets]);

  if (layout.widgets.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50 px-6 py-16 text-center">
        <p className="text-gray-500 dark:text-gray-400 mb-4">{t('emptyDashboard')}</p>
        <Button type="button" onClick={onAddWidget}>
          {t('addFirstWidget')}
        </Button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef as React.RefObject<HTMLDivElement>}
      className={`dashboard-grid-container${editMode ? ' dashboard-grid-container--editing' : ''}`}
    >
      {mounted && width > 0 && (
        <ResponsiveGridLayout
          width={width}
          layouts={layouts}
          breakpoints={DASHBOARD_BREAKPOINTS}
          cols={DASHBOARD_COLS_BY_BREAKPOINT}
          rowHeight={DASHBOARD_ROW_HEIGHT}
          margin={DASHBOARD_MARGIN}
          containerPadding={DASHBOARD_CONTAINER_PADDING}
          compactor={verticalCompactor}
          dragConfig={{
            enabled: editMode,
            handle: '.dashboard-widget-handle',
            cancel: 'button, select, a, input, textarea',
          }}
          resizeConfig={{ enabled: editMode }}
          onLayoutChange={editMode ? onLayoutChange : undefined}
          onDragStop={editMode ? onDragStop : undefined}
          onResizeStop={editMode ? onDragStop : undefined}
        >
          {layout.widgets.map((widget) => {
            const def = getWidgetDefinition(widget.type);
            if (!def) return null;
            const WidgetComponent = def.component;
            const widgetProps: DashboardWidgetProps = {
              instance: widget,
              editMode,
              onConfigChange: (config) => onConfigChange(widget.id, config),
            };

            return (
              <div key={widget.id} className="h-full">
                <DashboardWidgetShell
                  instance={widget}
                  editMode={editMode}
                  onRemove={onRemoveWidget}
                  onConfigChange={onConfigChange}
                >
                  <WidgetComponent {...widgetProps} />
                </DashboardWidgetShell>
              </div>
            );
          })}
        </ResponsiveGridLayout>
      )}
    </div>
  );
}
