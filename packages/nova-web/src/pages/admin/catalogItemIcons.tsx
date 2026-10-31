/* SPDX-License-Identifier: AGPL-3.0-only */
import { Box } from 'lucide-react';
import { CATALOG_ITEM_ICONS } from './catalogItemIconSet';

export function CatalogItemIcon({
  name,
  className = 'size-5',
}: {
  name?: string | null;
  className?: string;
}) {
  const match = CATALOG_ITEM_ICONS.find((icon) => icon.value === (name || 'box'));
  const Icon = match?.Icon ?? Box;
  return <Icon className={className} aria-hidden="true" />;
}
