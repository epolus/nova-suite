/* SPDX-License-Identifier: AGPL-3.0-only */
import {
  Box,
  Cloud,
  Cpu,
  Database,
  Folder,
  Globe,
  HardDrive,
  Headphones,
  Headset,
  Keyboard,
  KeyRound,
  Laptop,
  Mail,
  Monitor,
  Mouse,
  Package,
  Phone,
  Printer,
  Server,
  Shield,
  Smartphone,
  User,
  Wifi,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

export const CATALOG_ITEM_ICONS = [
  { value: 'box', Icon: Box },
  { value: 'laptop', Icon: Laptop },
  { value: 'monitor', Icon: Monitor },
  { value: 'smartphone', Icon: Smartphone },
  { value: 'printer', Icon: Printer },
  { value: 'headphones', Icon: Headphones },
  { value: 'keyboard', Icon: Keyboard },
  { value: 'mouse', Icon: Mouse },
  { value: 'wifi', Icon: Wifi },
  { value: 'server', Icon: Server },
  { value: 'database', Icon: Database },
  { value: 'cloud', Icon: Cloud },
  { value: 'hard_drive', Icon: HardDrive },
  { value: 'user', Icon: User },
  { value: 'mail', Icon: Mail },
  { value: 'phone', Icon: Phone },
  { value: 'headset', Icon: Headset },
  { value: 'wrench', Icon: Wrench },
  { value: 'package', Icon: Package },
  { value: 'shield', Icon: Shield },
  { value: 'folder', Icon: Folder },
  { value: 'globe', Icon: Globe },
  { value: 'key', Icon: KeyRound },
  { value: 'cpu', Icon: Cpu },
] as const;

export type CatalogItemIconName = (typeof CATALOG_ITEM_ICONS)[number]['value'];

const ICONS: Record<string, LucideIcon> = Object.fromEntries(
  CATALOG_ITEM_ICONS.map(({ value, Icon }) => [value, Icon]),
);

export function isCatalogItemIcon(value: string): value is CatalogItemIconName {
  return value in ICONS;
}

export function CatalogItemIcon({
  name,
  className = 'size-5',
}: {
  name?: string | null;
  className?: string;
}) {
  const Icon = ICONS[name || 'box'] ?? Box;
  return <Icon className={className} aria-hidden="true" />;
}
