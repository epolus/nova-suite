/* SPDX-License-Identifier: AGPL-3.0-only */

export const DASHBOARD_PREFERENCE_SCOPE = 'ui:dashboard';
export const DASHBOARD_ACTIVE_ID_SCOPE = 'ui:dashboard_active_id';
export const DASHBOARD_LEGACY_STORAGE_KEY = 'nova_dashboard_layout';
export const MAX_USER_DASHBOARDS = 10;
export const MAX_DASHBOARD_WIDGETS = 30;
export const DASHBOARD_ROW_HEIGHT = 48;
export const DASHBOARD_COLS = 12;
export const DASHBOARD_MARGIN: [number, number] = [16, 16];
export const DASHBOARD_CONTAINER_PADDING: [number, number] = [0, 0];
export const DASHBOARD_LAYOUT_SAVE_DEBOUNCE_MS = 400;

export const DASHBOARD_AUTO_REFRESH_SCOPE = 'ui:dashboard_auto_refresh_seconds';
export const DASHBOARD_AUTO_REFRESH_LEGACY_KEY = 'nova_dashboard_auto_refresh_seconds';
export const DASHBOARD_AUTO_REFRESH_OPTIONS = [0, 60, 300, 900] as const;

export const DASHBOARD_BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480 } as const;
export const DASHBOARD_COLS_BY_BREAKPOINT = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 } as const;
