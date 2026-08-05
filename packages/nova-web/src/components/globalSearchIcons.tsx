/* SPDX-License-Identifier: AGPL-3.0-only */
import type { ReactNode } from 'react';
import type { IconName } from './globalSearchConfig';

function Icon({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg
      className={className || 'w-4 h-4'}
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

export function AppIcon({ name, className }: { name: IconName; className?: string }) {
  switch (name) {
    case 'home':
      return (
        <Icon className={className}>
          <path {...path} d="M3 10.5L12 3l9 7.5V21a1 1 0 01-1 1h-5v-7h-6v7H4a1 1 0 01-1-1v-10.5z" />
        </Icon>
      );
    case 'check':
      return (
        <Icon className={className}>
          <path {...path} d="M5 13l4 4L19 7" />
        </Icon>
      );
    case 'users':
      return (
        <Icon className={className}>
          <path {...path} d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path {...path} d="M23 21v-2a4 4 0 00-3-3.87" />
          <path {...path} d="M16 3.13a4 4 0 010 7.75" />
        </Icon>
      );
    case 'incident':
      return (
        <Icon className={className}>
          <path {...path} d="M12 9v4m0 4h.01" />
          <path {...path} d="M10.29 3.86l-8.18 14.16A2 2 0 003.83 21h16.34a2 2 0 001.72-2.98L13.71 3.86a2 2 0 00-3.42 0z" />
        </Icon>
      );
    case 'major_incident':
      return (
        <Icon className={className}>
          <path {...path} d="M12 3v4m0 10v4M3 12h4m10 0h4" />
          <path {...path} d="M6.3 6.3l2.8 2.8m5.8 5.8l2.8 2.8M17.7 6.3l-2.8 2.8M9.1 14.9l-2.8 2.8" />
        </Icon>
      );
    case 'change':
      return (
        <Icon className={className}>
          <path {...path} d="M10.325 4.317a9 9 0 109.358 12.297" />
          <path {...path} d="M16 3h5v5" />
        </Icon>
      );
    case 'problem':
      return (
        <Icon className={className}>
          <circle cx="12" cy="12" r="9" />
          <path {...path} d="M9.09 9a3 3 0 015.82 1c0 2-3 2-3 4" />
          <path {...path} d="M12 17h.01" />
        </Icon>
      );
    case 'knowledge':
      return (
        <Icon className={className}>
          <path {...path} d="M4 5a2 2 0 012-2h10a2 2 0 012 2v14a1 1 0 01-1.447.894L12 17.618l-4.553 2.276A1 1 0 016 19V5z" />
        </Icon>
      );
    case 'ci':
      return (
        <Icon className={className}>
          <rect x="3" y="4" width="18" height="12" rx="2" />
          <path {...path} d="M8 20h8m-6-4h4" />
        </Icon>
      );
    case 'catalog':
      return (
        <Icon className={className}>
          <circle cx="9" cy="20" r="1" />
          <circle cx="17" cy="20" r="1" />
          <path {...path} d="M3 4h2l2.4 12.5a1 1 0 001 .8h8.7a1 1 0 001-.76L21 8H7" />
        </Icon>
      );
    case 'request':
      return (
        <Icon className={className}>
          <rect x="6" y="3" width="12" height="18" rx="2" />
          <path {...path} d="M9 7h6M9 11h6M9 15h4" />
        </Icon>
      );
    case 'request_tasks':
      return (
        <Icon className={className}>
          <path {...path} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1" />
          <path {...path} d="M9 12h6M9 16h4" />
        </Icon>
      );
    case 'assets':
      return (
        <Icon className={className}>
          <rect x="3" y="5" width="18" height="12" rx="2" />
          <path {...path} d="M8 21h8M12 17v4" />
        </Icon>
      );
    case 'releases':
      return (
        <Icon className={className}>
          <path {...path} d="M5 19L19 5M14 5h5v5" />
          <path {...path} d="M9 15l-4 4" />
        </Icon>
      );
    case 'reports':
      return (
        <Icon className={className}>
          <path {...path} d="M4 19V5M4 19h16" />
          <path {...path} d="M8 15v-4M12 15V9M16 15v-7" />
        </Icon>
      );
    case 'user':
      return (
        <Icon className={className}>
          <circle cx="12" cy="8" r="4" />
          <path {...path} d="M4 21a8 8 0 0116 0" />
        </Icon>
      );
    case 'department':
      return (
        <Icon className={className}>
          <path {...path} d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M15 9h.01M15 13h.01" />
        </Icon>
      );
    case 'cost_center':
      return (
        <Icon className={className}>
          <circle cx="12" cy="12" r="9" />
          <path {...path} d="M12 7v10M9.5 9.5c.5-1 1.5-1.5 2.5-1.5s2 .7 2 2-1 1.5-2.5 2-2.5 1-2.5 2.5 1.2 2 2.5 2 2-.5 2.5-1.5" />
        </Icon>
      );
    case 'company':
      return (
        <Icon className={className}>
          <path {...path} d="M3 21h18M6 21V9l6-4 6 4v12M10 13h4M10 17h4" />
        </Icon>
      );
    case 'location':
      return (
        <Icon className={className}>
          <path {...path} d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z" />
          <circle cx="12" cy="10" r="2.5" />
        </Icon>
      );
    case 'roles':
      return (
        <Icon className={className}>
          <path {...path} d="M15 7h2a2 2 0 012 2v2" />
          <circle cx="9" cy="9" r="3" />
          <path {...path} d="M4 20a5 5 0 0110 0" />
          <path {...path} d="M17 14v4M15 16h4" />
        </Icon>
      );
    case 'classes':
      return (
        <Icon className={className}>
          <rect x="3" y="4" width="7" height="7" rx="1" />
          <rect x="14" y="4" width="7" height="7" rx="1" />
          <rect x="3" y="15" width="7" height="7" rx="1" />
          <rect x="14" y="15" width="7" height="7" rx="1" />
        </Icon>
      );
    case 'sla':
      return (
        <Icon className={className}>
          <circle cx="12" cy="12" r="9" />
          <path {...path} d="M12 7v5l3 3" />
        </Icon>
      );
    case 'workflow':
      return (
        <Icon className={className}>
          <circle cx="5" cy="7" r="2" />
          <circle cx="19" cy="7" r="2" />
          <circle cx="12" cy="17" r="2" />
          <path {...path} d="M7 7h10M6.7 8.4l4.3 7.2M17.3 8.4L13 15.6" />
        </Icon>
      );
    case 'settings':
      return (
        <Icon className={className}>
          <circle cx="12" cy="12" r="3" />
          <path
            {...path}
            d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5h.1a1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9c.2.6.8 1 1.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"
          />
        </Icon>
      );
    case 'theme':
      return (
        <Icon className={className}>
          <path {...path} d="M12 3a9 9 0 100 18 7 7 0 000-14 5 5 0 010-4z" />
        </Icon>
      );
    case 'import':
      return (
        <Icon className={className}>
          <path {...path} d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" />
        </Icon>
      );
    case 'service_item':
      return (
        <Icon className={className}>
          <path {...path} d="M3 7l9-4 9 4-9 4-9-4z" />
          <path {...path} d="M3 7v10l9 4 9-4V7" />
        </Icon>
      );
    case 'services':
      return (
        <Icon className={className}>
          <path {...path} d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
        </Icon>
      );
    case 'processes':
      return (
        <Icon className={className}>
          <path {...path} d="M4 7h12M16 7l-3-3M16 7l-3 3" />
          <path {...path} d="M20 17H8M8 17l3-3M8 17l3 3" />
        </Icon>
      );
    case 'notifications':
      return (
        <Icon className={className}>
          <path {...path} d="M18 8A6 6 0 106 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path {...path} d="M13.73 21a2 2 0 01-3.46 0" />
        </Icon>
      );
    case 'notification_deliveries':
      return (
        <Icon className={className}>
          <path {...path} d="M4 6h16v12H4z" />
          <path {...path} d="M4 7l8 6 8-6" />
        </Icon>
      );
    case 'data_sources':
      return (
        <Icon className={className}>
          <path {...path} d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
          <path {...path} d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
        </Icon>
      );
    case 'credentials':
      return (
        <Icon className={className}>
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path {...path} d="M8 11V8a4 4 0 018 0v3" />
        </Icon>
      );
    case 'config_packages':
      return (
        <Icon className={className}>
          <path {...path} d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
          <path {...path} d="M3.3 7L12 12l8.7-5M12 22V12" />
        </Icon>
      );
    case 'status':
      return (
        <Icon className={className}>
          <path {...path} d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </Icon>
      );
    case 'help':
      return (
        <Icon className={className}>
          <circle cx="12" cy="12" r="9" />
          <path {...path} d="M9.09 9a3 3 0 015.82 1c0 2-3 2-3 4" />
          <path {...path} d="M12 17h.01" />
        </Icon>
      );
    default:
      return (
        <Icon className={className}>
          <rect x="5" y="4" width="14" height="16" rx="2" />
        </Icon>
      );
  }
}
