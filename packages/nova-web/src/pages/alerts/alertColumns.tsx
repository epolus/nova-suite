/* SPDX-License-Identifier: AGPL-3.0-only */
import { Link } from 'react-router';
import type { AlertListItem } from '@/api/client';
import Badge from '@/components/Badge';
import type { DataColumnDef } from '@/components/DataTable';
import { formatDateTime } from '@/utils/dateTime';

export interface AlertListLabels {
  number: string;
  title: string;
  severity: string;
  status: string;
  source: string;
  ci: string;
  incident: string;
  events: string;
  firstSeen: string;
  lastSeen: string;
  emDash: string;
  suppressed: (change: string) => string;
}

export const ALERT_STATUS_OPTIONS = ['firing', 'resolved', 'all'] as const;
export const DEFAULT_ALERT_COLS = ['number', 'title', 'severity', 'status', 'source', 'ci_name', 'incident_number', 'last_seen_at'];

export function buildAlertColumns(labels: AlertListLabels): DataColumnDef<AlertListItem>[] {
  return [
    {
      key: 'number',
      label: labels.number,
      sortable: true,
      defaultVisible: true,
      render: (item) => (
        <Link to={`/alerts/${item.id}`} className="text-indigo-600 font-medium hover:text-indigo-800" onClick={(e) => e.stopPropagation()}>
          {item.number}
        </Link>
      ),
    },
    {
      key: 'title',
      label: labels.title,
      sortable: true,
      defaultVisible: true,
      className: 'max-w-xs',
      render: (item) => (
        <div className="min-w-0">
          <div className="truncate text-gray-900">{item.title}</div>
          {item.suppressed_reason && <div className="text-xs text-amber-700">{labels.suppressed(item.suppressed_reason)}</div>}
        </div>
      ),
    },
    {
      key: 'severity',
      label: labels.severity,
      sortable: true,
      defaultVisible: true,
      render: (item) => <Badge value={item.severity} />,
    },
    {
      key: 'status',
      label: labels.status,
      sortable: true,
      defaultVisible: true,
      render: (item) => <Badge value={item.status} />,
    },
    {
      key: 'source',
      label: labels.source,
      sortable: true,
      defaultVisible: true,
      render: (item) => <span className="text-gray-500">{item.source}</span>,
    },
    {
      key: 'ci_name',
      label: labels.ci,
      sortable: true,
      defaultVisible: true,
      render: (item) => <span className="text-gray-500">{item.ci_name || labels.emDash}</span>,
    },
    {
      key: 'incident_number',
      label: labels.incident,
      sortable: true,
      defaultVisible: true,
      render: (item) => item.incident_id
        ? <Link to={`/incidents/${item.incident_id}`} className="text-indigo-600 hover:text-indigo-800" onClick={(e) => e.stopPropagation()}>{item.incident_number}</Link>
        : <span className="text-gray-400">{labels.emDash}</span>,
    },
    {
      key: 'event_count',
      label: labels.events,
      sortable: true,
      defaultVisible: false,
      render: (item) => <span className="text-gray-500">{item.event_count}</span>,
    },
    {
      key: 'first_seen_at',
      label: labels.firstSeen,
      sortable: true,
      defaultVisible: false,
      render: (item) => <span className="text-gray-500 text-xs">{formatDateTime(item.first_seen_at)}</span>,
    },
    {
      key: 'last_seen_at',
      label: labels.lastSeen,
      sortable: true,
      defaultVisible: true,
      render: (item) => <span className="text-gray-500 text-xs">{formatDateTime(item.last_seen_at)}</span>,
    },
  ];
}
