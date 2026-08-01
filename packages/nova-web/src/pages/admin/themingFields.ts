/* SPDX-License-Identifier: AGPL-3.0-only */

export const COLOR_FIELDS: { key: string; labelKey: string; default: string }[] = [
  { key: 'primary_color', labelKey: 'primaryColor', default: '#4f46e5' },
  { key: 'sidebar_bg', labelKey: 'sidebarBg', default: '#0f172a' },
  { key: 'sidebar_active_bg', labelKey: 'sidebarActiveBg', default: '#4f46e5' },
  { key: 'content_bg', labelKey: 'contentBg', default: '#f1f5f9' },
  { key: 'login_bg_from', labelKey: 'loginBgFrom', default: '#0f172a' },
  { key: 'login_bg_to', labelKey: 'loginBgTo', default: '#1e1b4b' },
];

export const DARK_COLOR_FIELDS: { key: string; labelKey: string; default: string }[] = [
  { key: 'dark_content_bg', labelKey: 'darkContentBg', default: '#0b1220' },
  { key: 'dark_surface_bg', labelKey: 'darkSurfaceBg', default: '#1e293b' },
  { key: 'dark_muted_bg', labelKey: 'darkMutedBg', default: '#111827' },
  { key: 'dark_border_color', labelKey: 'darkBorderColor', default: '#475569' },
  { key: 'dark_text_primary', labelKey: 'darkTextPrimary', default: '#f1f5f9' },
  { key: 'dark_text_muted', labelKey: 'darkTextMuted', default: '#94a3b8' },
];
