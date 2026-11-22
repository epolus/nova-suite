/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { canAccessAdminRoute } from './adminRouteAccess';

describe('canAccessAdminRoute', () => {
  it('allows non-admin paths for any role', () => {
    expect(canAccessAdminRoute('/incidents', ['user'])).toBe(true);
    expect(canAccessAdminRoute('/catalog', undefined)).toBe(true);
  });

  it('requires admin for generic admin pages', () => {
    expect(canAccessAdminRoute('/admin/users', ['admin'])).toBe(true);
    expect(canAccessAdminRoute('/admin/users', ['fulfiller'])).toBe(false);
    expect(canAccessAdminRoute('/admin/theming', ['user'])).toBe(false);
  });

  it('allows catalog designers on catalog admin areas', () => {
    expect(canAccessAdminRoute('/admin/categories', ['catalog_designer'])).toBe(true);
    expect(canAccessAdminRoute('/admin/service-items', ['catalog_designer'])).toBe(true);
    expect(canAccessAdminRoute('/admin/fulfillment-models', ['catalog_designer'])).toBe(true);
    expect(canAccessAdminRoute('/admin/users', ['catalog_designer'])).toBe(false);
  });

  it('allows configuration managers on CI classes', () => {
    expect(canAccessAdminRoute('/admin/ci-classes', ['configuration_manager'])).toBe(true);
    expect(canAccessAdminRoute('/admin/ci-classes', ['fulfiller'])).toBe(true);
    expect(canAccessAdminRoute('/admin/ci-classes', ['user'])).toBe(false);
  });

  it('allows change managers on change-management admin', () => {
    expect(canAccessAdminRoute('/admin/change-management', ['change_manager'])).toBe(true);
    expect(canAccessAdminRoute('/admin/change-management', ['user'])).toBe(false);
  });

  it('allows knowledge editors on knowledge workflows', () => {
    expect(canAccessAdminRoute('/admin/knowledge-workflows', ['knowledge'])).toBe(true);
    expect(canAccessAdminRoute('/admin/knowledge-workflows', ['fulfiller'])).toBe(false);
  });

  it('gates alert definitions, credentials, data management, and checklists', () => {
    expect(canAccessAdminRoute('/admin/alert-definitions', ['event_manager'])).toBe(true);
    expect(canAccessAdminRoute('/admin/alert-definitions', ['event_operator'])).toBe(false);

    expect(canAccessAdminRoute('/admin/credentials', ['credential_manager'])).toBe(true);
    expect(canAccessAdminRoute('/admin/credentials', ['fulfiller'])).toBe(false);

    expect(canAccessAdminRoute('/admin/data-management', ['data_manager'])).toBe(true);
    expect(canAccessAdminRoute('/admin/data-management', ['fulfiller'])).toBe(false);

    expect(canAccessAdminRoute('/admin/checklists', ['checklist_admin'])).toBe(true);
    expect(canAccessAdminRoute('/admin/checklists', ['fulfiller'])).toBe(false);
  });
});
