/* SPDX-License-Identifier: AGPL-3.0-only */
import type { CustomFieldDefinition, CustomFieldEntityType } from '../api/client';

/** Form section keys where custom fields can be placed, per entity type. */
export const CUSTOM_FIELD_SECTIONS = {
  incident: ['caller', 'summary', 'service', 'details'] as const,
  change: ['summary', 'scheduling', 'service', 'relationships', 'details', 'plans'] as const,
  asset: ['general', 'purchase', 'notes'] as const,
} as const;

export type IncidentCustomFieldSection = (typeof CUSTOM_FIELD_SECTIONS.incident)[number];
export type ChangeCustomFieldSection = (typeof CUSTOM_FIELD_SECTIONS.change)[number];
export type AssetCustomFieldSection = (typeof CUSTOM_FIELD_SECTIONS.asset)[number];
export type CustomFieldSection =
  | IncidentCustomFieldSection
  | ChangeCustomFieldSection
  | AssetCustomFieldSection;

export const DEFAULT_CUSTOM_FIELD_SECTION: Record<CustomFieldEntityType, CustomFieldSection> = {
  incident: 'details',
  change: 'details',
  asset: 'general',
};

export function sectionsForEntity(entityType: CustomFieldEntityType): readonly CustomFieldSection[] {
  return CUSTOM_FIELD_SECTIONS[entityType];
}

export function resolveCustomFieldSection(
  def: Pick<CustomFieldDefinition, 'entity_type' | 'config'>,
): CustomFieldSection {
  const fallback = DEFAULT_CUSTOM_FIELD_SECTION[def.entity_type];
  const raw = def.config?.section;
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  const section = raw.trim();
  const known = CUSTOM_FIELD_SECTIONS[def.entity_type] as readonly string[];
  return known.includes(section) ? (section as CustomFieldSection) : fallback;
}
