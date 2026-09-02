/* SPDX-License-Identifier: AGPL-3.0-only */
import type { CI, CIClass } from '@/api/client';
import { resolveClassAttrs } from './cmdbHelpers';

export type CIFormSnapshot = {
  classId: string;
  name: string;
  displayName: string;
  status: string;
  environment: string;
  managedBy: string;
  assignedTo: string;
  supportedBy: string;
  locationId: string;
  notes: string;
  externalId1: string;
  externalId2: string;
  isActive: boolean;
  attributes: Record<string, string>;
};

export const EMPTY_CI_FORM: CIFormSnapshot = {
  classId: '',
  name: '',
  displayName: '',
  status: 'installed',
  environment: 'production',
  managedBy: '',
  assignedTo: '',
  supportedBy: '',
  locationId: '',
  notes: '',
  externalId1: '',
  externalId2: '',
  isActive: true,
  attributes: {},
};

export function buildFormFromCI(ci: CI): CIFormSnapshot {
  const attrMap: Record<string, string> = {};
  for (const [key, value] of Object.entries(ci.attributes || {})) {
    attrMap[key] = String(value);
  }
  return {
    classId: ci.class_id,
    name: ci.name,
    displayName: ci.display_name || '',
    status: ci.status,
    environment: ci.environment,
    managedBy: ci.managed_by || '',
    assignedTo: ci.assigned_to || '',
    supportedBy: ci.supported_by || '',
    locationId: ci.location_id || '',
    notes: ci.notes || '',
    externalId1: ci.external_id_1 || '',
    externalId2: ci.external_id_2 || '',
    isActive: ci.is_active !== false,
    attributes: attrMap,
  };
}

export function buildBaselineForCreate(classId: string, classes: CIClass[]): CIFormSnapshot {
  const allAttrs = resolveClassAttrs(classId, classes);
  const defaults: Record<string, string> = {};
  for (const key of Object.keys(allAttrs)) {
    defaults[key] = '';
  }
  return { ...EMPTY_CI_FORM, classId, attributes: defaults };
}

function normalizeSnapshot(snapshot: CIFormSnapshot): CIFormSnapshot {
  const attributes = Object.fromEntries(
    Object.entries(snapshot.attributes).sort(([a], [b]) => a.localeCompare(b)),
  );
  return {
    ...snapshot,
    name: snapshot.name.trim(),
    displayName: snapshot.displayName.trim(),
    notes: snapshot.notes.trim(),
    externalId1: snapshot.externalId1.trim(),
    externalId2: snapshot.externalId2.trim(),
    attributes,
  };
}

export function hasCIFormChanges(current: CIFormSnapshot, baseline: CIFormSnapshot): boolean {
  return JSON.stringify(normalizeSnapshot(current)) !== JSON.stringify(normalizeSnapshot(baseline));
}
