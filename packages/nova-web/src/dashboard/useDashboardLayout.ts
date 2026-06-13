/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUserPreferenceState } from '@/hooks/useUserPreferenceState';
import { buildDefaultDashboardLayout } from './defaults';
import {
  DASHBOARD_LEGACY_STORAGE_KEY,
  DASHBOARD_LAYOUT_SAVE_DEBOUNCE_MS,
  DASHBOARD_PREFERENCE_SCOPE,
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

export function useDashboardLayout(roles: string[] | undefined) {
  const defaultLayout = useMemo(() => buildDefaultDashboardLayout(roles), [roles]);
  const [savedLayout, setSavedLayout] = useUserPreferenceState<DashboardLayout>(
    DASHBOARD_PREFERENCE_SCOPE,
    defaultLayout,
    DASHBOARD_LEGACY_STORAGE_KEY,
  );

  const sanitizedSaved = useMemo(
    () => sanitizeDashboardLayout(savedLayout, roles),
    [savedLayout, roles],
  );

  const [layout, setLayout] = useState<DashboardLayout>(sanitizedSaved);
  const [editMode, setEditMode] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    if (!isDraggingRef.current) {
      setLayout(sanitizedSaved);
    }
  }, [sanitizedSaved]);

  const persistLayout = useCallback((next: DashboardLayout) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSavedLayout(next);
    }, DASHBOARD_LAYOUT_SAVE_DEBOUNCE_MS);
  }, [setSavedLayout]);

  const updateLayout = useCallback((next: DashboardLayout) => {
    const sanitized = sanitizeDashboardLayout(next, roles);
    setLayout(sanitized);
    persistLayout(sanitized);
  }, [persistLayout, roles]);

  const handleGridLayoutChange = useCallback((grid: Layout) => {
    isDraggingRef.current = true;
    setLayout((prev) => {
      const next = applyGridLayout(prev, grid);
      persistLayout(next);
      return next;
    });
  }, [persistLayout]);

  const handleDragStop = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  const addWidget = useCallback((type: DashboardWidgetType) => {
    setLayout((prev) => {
      if (prev.widgets.length >= MAX_DASHBOARD_WIDGETS) return prev;
      const instance = createWidgetInstance(type, prev.widgets);
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
    setSavedLayout(next);
  }, [defaultLayout, roles, setSavedLayout]);

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
