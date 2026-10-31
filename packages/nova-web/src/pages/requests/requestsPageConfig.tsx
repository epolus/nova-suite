/* SPDX-License-Identifier: AGPL-3.0-only */
import { Link } from 'react-router';
import type { ServiceRequest } from '../../api/client';
import Badge from '../../components/Badge';
import { type DataColumnDef } from '../../components/DataTable';
import { formatDate, formatDateTime } from '../../utils/dateTime';
import { useFieldLabel } from '@/i18n/hooks';

export const DEFAULT_COLS = ['number', 'service_item_name', 'requester_name', 'priority', 'status', 'created_at'];
export const PRESETS_KEY = 'nova_filter_presets_requests';

export type RequestListLabels = {
  field: ReturnType<typeof useFieldLabel>;
  emDash: string;
};

export function buildColumns(listParams: Record<string, string>, labels: RequestListLabels): DataColumnDef<ServiceRequest>[] {
  return [
    {
      key: 'number',
      label: labels.field('number'),
      sortable: true,
      defaultVisible: true,
      render: (req) => (
        <Link
          to={`/requests/${req.id}`}
          state={{ listParams }}
          className="text-indigo-600 font-medium hover:text-indigo-800"
          onClick={(e) => e.stopPropagation()}
        >
          {req.number}
        </Link>
      ),
    },
    {
      key: 'service_item_name',
      label: labels.field('serviceItem'),
      sortable: true,
      defaultVisible: true,
      render: (req) => <span className="text-gray-900">{req.service_item_name || labels.emDash}</span>,
    },
    {
      key: 'requester_name',
      label: labels.field('requester'),
      sortable: true,
      defaultVisible: true,
      render: (req) => <span className="text-gray-500">{req.requester_name || labels.emDash}</span>,
    },
    {
      key: 'priority',
      label: labels.field('priority'),
      sortable: true,
      defaultVisible: true,
      render: (req) => <Badge value={req.priority} />,
    },
    {
      key: 'status',
      label: labels.field('status'),
      sortable: true,
      defaultVisible: true,
      render: (req) => <Badge value={req.status} />,
    },
    {
      key: 'approved_by_name',
      label: labels.field('approvedBy'),
      sortable: false,
      defaultVisible: false,
      render: (req) => <span className="text-gray-500">{req.approved_by_name || labels.emDash}</span>,
    },
    {
      key: 'approved_at',
      label: labels.field('approvedAt'),
      sortable: true,
      defaultVisible: false,
      render: (req) => (
        <span className="text-gray-500 text-xs">
          {formatDateTime(req.approved_at)}
        </span>
      ),
    },
    {
      key: 'notes',
      label: labels.field('notes'),
      sortable: false,
      defaultVisible: false,
      className: 'max-w-xs truncate',
      render: (req) => <span className="text-gray-500">{req.notes || labels.emDash}</span>,
    },
    {
      key: 'created_at',
      label: labels.field('created'),
      sortable: true,
      defaultVisible: true,
      render: (req) => (
        <span className="text-gray-500 text-xs">{formatDate(req.created_at)}</span>
      ),
    },
    {
      key: 'updated_at',
      label: labels.field('updated'),
      sortable: true,
      defaultVisible: false,
      render: (req) => (
        <span className="text-gray-500 text-xs">{formatDate(req.updated_at)}</span>
      ),
    },
  ];
}

export const REQUEST_CSV_HEADERS: (keyof ServiceRequest & string)[] = [
  'number', 'service_item_name', 'requester_name', 'priority', 'status',
  'approved_by_name', 'approved_at', 'created_at', 'updated_at',
];
