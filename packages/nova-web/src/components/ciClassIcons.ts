/* SPDX-License-Identifier: AGPL-3.0-only */
export const CI_CLASS_ICON_VALUES = [
  'server',
  'globe',
  'database',
  'wifi',
  'storage',
  'cloud',
  'printer',
  'phone',
  'monitor',
  'laptop',
  'other',
] as const;

export type CiClassIconName = (typeof CI_CLASS_ICON_VALUES)[number];
