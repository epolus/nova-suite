/* SPDX-License-Identifier: AGPL-3.0-only */
import {
  hasChangeRole,
  hasConfigurationRole,
  hasKnowledgeRole,
  hasRole,
  isAdminRole,
  isCatalogDesignerRole,
} from './roles';

/**
 * Whether the current user may open this pathname under /admin.
 * Keep in sync with nova-engine route guards (import, admin, catalog, cmdb, changes, knowledge).
 */
export function canAccessAdminRoute(pathname: string, roles: string[] | undefined): boolean {
  const r = roles ?? [];
  if (!pathname.startsWith('/admin')) return true;

  if (pathname.startsWith('/admin/service-items') || pathname.startsWith('/admin/catalog-tasks')) {
    return isAdminRole(r) || isCatalogDesignerRole(r);
  }
  if (pathname.startsWith('/admin/ci-classes')) {
    return hasConfigurationRole(r);
  }
  if (pathname.startsWith('/admin/change-management')) {
    return hasChangeRole(r);
  }
  if (pathname.startsWith('/admin/knowledge-workflows')) {
    return hasKnowledgeRole(r);
  }
  if (pathname.startsWith('/admin/credentials')) {
    return isAdminRole(r) || hasRole(r, 'credential_manager') || isCatalogDesignerRole(r);
  }
  return isAdminRole(r);
}
