/* SPDX-License-Identifier: AGPL-3.0-only */
const AGENT_ROLES = new Set([
  'admin',
  'fulfiller',
  'configuration_manager',
  'catalog_designer',
  'credential_manager',
  'change_manager',
  'problem_manager',
]);

type RoleList = string[] | undefined;

function normalizeRole(role: string): string {
  return role.trim().toLowerCase();
}

function safeRoles(roles: RoleList): string[] {
  return Array.isArray(roles) ? roles.map(normalizeRole) : [];
}

export function hasRole(roles: RoleList, role: string): boolean {
  return safeRoles(roles).includes(normalizeRole(role));
}

export function isAgentRole(roles: string[] = []): boolean {
  return roles.some((role) => AGENT_ROLES.has(role));
}

export function isAdminRole(roles: RoleList): boolean {
  return hasRole(roles, 'admin');
}

export function isCatalogDesignerRole(roles: RoleList): boolean {
  return hasRole(roles, 'catalog_designer');
}

export function isFulfillerRole(roles: RoleList): boolean {
  return hasAnyRole(roles, ['admin', 'fulfiller']);
}

export function hasConfigurationRole(roles: RoleList): boolean {
  return hasAnyRole(roles, ['admin', 'fulfiller', 'configuration_manager']);
}

export function hasChangeRole(roles: RoleList): boolean {
  return hasAnyRole(roles, ['admin', 'fulfiller', 'change_manager']);
}

export function hasKnowledgeRole(roles: RoleList): boolean {
  return hasAnyRole(roles, ['admin', 'knowledge']);
}

export function hasAnyRole(roles: RoleList, required: string[]): boolean {
  return required.some((role) => hasRole(roles, role));
}
