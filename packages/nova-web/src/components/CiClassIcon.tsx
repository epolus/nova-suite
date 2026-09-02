/* SPDX-License-Identifier: AGPL-3.0-only */
import type { ReactNode } from 'react';

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

function Icon({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg
      className={className || 'w-5 h-5'}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const path = {
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function CiClassIcon({
  name,
  className,
}: {
  name?: string | null;
  className?: string;
}) {
  switch (name) {
    case 'server':
      return (
        <Icon className={className}>
          <rect x="2" y="3" width="20" height="6" rx="1" />
          <rect x="2" y="11" width="20" height="6" rx="1" />
          <path {...path} d="M6 6h.01M6 14h.01M10 6h4M10 14h4" />
          <path {...path} d="M6 21h12" />
        </Icon>
      );
    case 'globe':
      return (
        <Icon className={className}>
          <circle cx="12" cy="12" r="9" />
          <path {...path} d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
        </Icon>
      );
    case 'database':
      return (
        <Icon className={className}>
          <ellipse cx="12" cy="5" rx="8" ry="3" />
          <path {...path} d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
          <path {...path} d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
        </Icon>
      );
    case 'wifi':
      return (
        <Icon className={className}>
          <path {...path} d="M5 12.5a9 9 0 0114 0" />
          <path {...path} d="M8.5 15.5a4.5 4.5 0 017 0" />
          <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
        </Icon>
      );
    case 'storage':
      return (
        <Icon className={className}>
          <path {...path} d="M4 7h16v10H4z" />
          <path {...path} d="M4 11h16M8 15h.01M12 15h4" />
        </Icon>
      );
    case 'cloud':
      return (
        <Icon className={className}>
          <path {...path} d="M7 18a4 4 0 01.5-8 5.5 5.5 0 0110.7 1.5A3.5 3.5 0 0118 18H7z" />
        </Icon>
      );
    case 'printer':
      return (
        <Icon className={className}>
          <path {...path} d="M6 9V3h12v6" />
          <path {...path} d="M6 17H4a2 2 0 01-2-2v-4a2 2 0 012-2h16a2 2 0 012 2v4a2 2 0 01-2 2h-2" />
          <rect x="6" y="13" width="12" height="8" rx="1" />
        </Icon>
      );
    case 'phone':
      return (
        <Icon className={className}>
          <rect x="7" y="2" width="10" height="20" rx="2" />
          <path {...path} d="M11 18h2" />
        </Icon>
      );
    case 'monitor':
      return (
        <Icon className={className}>
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path {...path} d="M8 21h8M12 17v4" />
        </Icon>
      );
    case 'laptop':
      return (
        <Icon className={className}>
          <rect x="3" y="4" width="18" height="12" rx="2" />
          <path {...path} d="M2 20h20" />
        </Icon>
      );
    case 'other':
    default:
      return (
        <Icon className={className}>
          <path {...path} d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
          <path {...path} d="M3.3 7L12 12l8.7-5M12 22V12" />
        </Icon>
      );
  }
}
