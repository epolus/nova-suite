/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildDefaultDashboardLayout } from './defaults';
import {
  DASHBOARD_LAYOUT_SAVE_DEBOUNCE_MS,
  MAX_DASHBOARD_WIDGETS,
} from './constants';
import {
  applyGridLayout,
  createWidgetInstance,
  removeWidget,
  sanitizeDashboardLayout,
  updateWidgetConfig,
} from './layoutUtils';
import type { Layout } from 'react-grid-layout';
import type { DashboardLayout, DashboardWidgetType } from './types';

interface Options {
  dashboardId: string | null;
  roles: string[] | undefined;
  serverLayout: DashboardLayout | undefined;
  isLayoutLoading: boolean;
  onSaveLayout: (layout: DashboardLayout) => void;
}

export function useDashboardLayout({
  dashboardId,
  roles,
  serverLayout,
  isLayoutLoading,
  onSaveLayout,
}: Options) {
  const defaultLayout = useMemo(() => buildDefaultDashboardLayout(roles), [roles]);

  const sanitizedServerLayout = useMemo(
    () => (serverLayout ? sanitizeDashboardLayout(serverLayout, roles) : undefined),
    [serverLayout, roles],
  );

  const [layout, setLayout] = useState<DashboardLayout>(defaultLayout);
  const [editMode, setEditMode] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDraggingRef = useRef(false);
  const loadedDashboardIdRef = useRef<string | null>(null);
  const layoutRef = useRef(layout);
  const editModeRef = useRef(editMode);
  const onSaveLayoutRef = useRef(onSaveLayout);
  const dashboardIdRef = useRef(dashboardId);
  layoutRef.current = layout;
  editModeRef.current = editMode;
  onSaveLayoutRef.current = onSaveLayout;
  dashboardIdRef.current = dashboardId;

  useEffect(() => {
    if (isLayoutLoading || !dashboardId || !sanitizedServerLayout) return;
    if (loadedDashboardIdRef.current === dashboardId) return;

    loadedDashboardIdRef.current = dashboardId;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    isDraggingRef.current = false;
    setEditMode(false);
    setLayout(sanitizedServerLayout);
  }, [dashboardId, isLayoutLoading, sanitizedServerLayout]);

  useEffect(() => {
    if (isLayoutLoading || !dashboardId || !sanitizedServerLayout) return;
    if (editMode || isDraggingRef.current) return;
    setLayout(sanitizedServerLayout);
  }, [dashboardId, editMode, isLayoutLoading, sanitizedServerLayout]);

  const persistLayout = useCallback((next: DashboardLayout) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const saveForDashboardId = dashboardIdRef.current;
    debounceRef.current = setTimeout(() => {
      if (saveForDashboardId === dashboardIdRef.current) {
        onSaveLayoutRef.current(next);
      }
    }, DASHBOARD_LAYOUT_SAVE_DEBOUNCE_MS);
  }, []);

  const updateLayout = useCallback((next: DashboardLayout) => {
    const sanitized = sanitizeDashboardLayout(next, roles);
    setLayout(sanitized);
    persistLayout(sanitized);
  }, [persistLayout, roles]);

  const handleGridLayoutChange = useCallback((grid: Layout) => {
    if (!editModeRef.current) return;

    isDraggingRef.current = true;
    setLayout((prev) => applyGridLayout(prev, grid));
  }, []);

  const handleDragStop = useCallback(() => {
    isDraggingRef.current = false;
    if (!editModeRef.current) return;
    persistLayout(layoutRef.current);
  }, [persistLayout]);

  const addWidget = useCallback((type: DashboardWidgetType, initialConfig?: Record<string, unknown>) => {
    setLayout((prev) => {
      if (prev.widgets.length >= MAX_DASHBOARD_WIDGETS) return prev;
      const instance = createWidgetInstance(type, prev.widgets, initialConfig);
      if (!instance) return prev;
      const next = sanitizeDashboardLayout(
        { version: 1, widgets: [...prev.widgets, instance] },
        roles,
      );
      persistLayout(next);
      return next;
    });
  }, [persistLayout, roles]);

  const removeWidgetById = useCallback((widgetId: string) => {
    setLayout((prev) => {
      const next = sanitizeDashboardLayout(removeWidget(prev, widgetId), roles);
      persistLayout(next);
      return next;
    });
  }, [persistLayout, roles]);

  const setWidgetConfig = useCallback((widgetId: string, config: Record<string, unknown>) => {
    setLayout((prev) => {
      const next = sanitizeDashboardLayout(updateWidgetConfig(prev, widgetId, config), roles);
      persistLayout(next);
      return next;
    });
  }, [persistLayout, roles]);

  const resetLayout = useCallback(() => {
    const next = sanitizeDashboardLayout(defaultLayout, roles);
    setLayout(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onSaveLayoutRef.current(next);
  }, [defaultLayout, roles]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  return {
    layout,
    editMode,
    setEditMode,
    handleGridLayoutChange,
    handleDragStop,
    addWidget,
    removeWidgetById,
    setWidgetConfig,
    resetLayout,
    updateLayout,
  };
}
