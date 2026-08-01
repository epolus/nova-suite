/* SPDX-License-Identifier: AGPL-3.0-only */
import type { Request } from 'express';

function normalizeRole(role: string): string {
  return role.trim().toLowerCase();
}

function readRoles(req: Request): string[] {
  return Array.isArray(req.user?.roles)
    ? (req.user!.roles as string[]).map(normalizeRole)
    : [];
}

export function hasAnyRole(req: Request, roles: string[]): boolean {
  const userRoles = readRoles(req);
  return roles.map(normalizeRole).some((role) => userRoles.includes(role));
}

export function isAdminRole(req: Request): boolean {
  return hasAnyRole(req, ['admin']);
}

export function isFulfillerRole(req: Request): boolean {
  return hasAnyRole(req, ['admin', 'fulfiller']);
}

export function hasConfigurationRole(req: Request): boolean {
  return hasAnyRole(req, ['admin', 'fulfiller', 'configuration_manager']);
}

export function hasChangeRole(req: Request): boolean {
  return hasAnyRole(req, ['admin', 'fulfiller', 'change_manager']);
}

export function hasProblemRole(req: Request): boolean {
  return hasAnyRole(req, ['admin', 'fulfiller', 'problem']);
}

export function hasKnowledgeRole(req: Request): boolean {
  return hasAnyRole(req, ['admin', 'knowledge']);
}

export function hasReportingViewRole(req: Request): boolean {
  return hasAnyRole(req, ['admin', 'report_viewer', 'report_creator', 'report_admin']);
}

export function hasReportingCreateRole(req: Request): boolean {
  return hasAnyRole(req, ['admin', 'report_creator', 'report_admin']);
}

export function hasReportingAdminRole(req: Request): boolean {
  return hasAnyRole(req, ['admin', 'report_admin']);
}

/** List/detail/banner for major incidents (read-only for fulfillers). */
export function canViewMajorIncidents(req: Request): boolean {
  return hasAnyRole(req, ['admin', 'fulfiller', 'major_incident_manager']);
}

/** Accept, war room actions, postmortem edits, standalone major incident create. */
export function canManageMajorIncidents(req: Request): boolean {
  return hasAnyRole(req, ['admin', 'major_incident_manager']);
}

/** Promote from incident (fulfiller path) or full create. */
export function canCreateMajorIncidentRecord(req: Request): boolean {
  return hasAnyRole(req, ['admin', 'fulfiller', 'major_incident_manager']);
}
