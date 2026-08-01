/* SPDX-License-Identifier: AGPL-3.0-only */
import { Link } from 'react-router-dom';
import type { RequestTaskListItem } from '../../api/client';
import Badge from '../../components/Badge';
import { type DataColumnDef } from '../../components/DataTable';
import { formatDate, formatDateTime } from '../../utils/dateTime';
import { useFieldLabel } from '@/i18n/hooks';

export const STATUS_OPTIONS = ['', 'pending', 'in_progress', 'completed', 'rejected'];
export const TYPE_COLORS: Record<string, string> = {
  approval: 'bg-amber-100 text-amber-700',
  manual: 'bg-blue-100 text-blue-700',
  automated: 'bg-purple-100 text-purple-700',
};
export const DEFAULT_COLS = [
  'number', 'name', 'task_type', 'status', 'request_number',
  'service_item_name', 'assigned_group_name', 'assigned_to_name', 'created_at',
];
export const PRESETS_KEY = 'nova_filter_presets_request_tasks';

export interface FilterPreset {
  id: string;
  name: string;
  search: string;
  status: string;
  columnFilters: Record<string, string>;
}

export type RequestTaskListLabels = {
  field: ReturnType<typeof useFieldLabel>;
  emDash: string;
  unassigned: string;
};

export function createRequestTaskListParams(args: {
  statusFilter: string;
  search: string;
  sort: string;
  dir: string;
  columnFilters: Record<string, string>;
}): Record<string, string> {
  const apiParams: Record<string, string> = { assigned_to_me: 'true' };
  if (args.statusFilter) apiParams.status = args.statusFilter;
  if (args.search) apiParams.search = args.search;
  if (args.sort) {
    apiParams.sort_by = args.sort;
    apiParams.sort_dir = args.dir;
  }
  for (const [col, val] of Object.entries(args.columnFilters)) {
    if (val) apiParams[`cf.${col}`] = val;
  }
  return apiParams;
}

export function buildRequestTaskColumns(listLabels: RequestTaskListLabels): DataColumnDef<RequestTaskListItem>[] {
  return [
    {
      key: 'number',
      label: listLabels.field('number'),
      sortable: true,
      defaultVisible: true,
      render: (t) => <span className="font-mono text-sm text-indigo-600 font-medium">{t.number}</span>,
    },
    {
      key: 'name',
      label: listLabels.field('task'),
      sortable: true,
      defaultVisible: true,
      render: (t) => (
        <div>
          <span className="font-medium text-gray-900">{t.name}</span>
          {t.description && <p className="text-xs text-gray-400 truncate max-w-xs">{t.description}</p>}
        </div>
      ),
    },
    {
      key: 'task_type',
      label: listLabels.field('type'),
      sortable: true,
      defaultVisible: true,
      render: (t) => (
        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[t.task_type]}`}>
          {t.task_type}
        </span>
      ),
    },
    {
      key: 'status',
      label: listLabels.field('status'),
      sortable: true,
      defaultVisible: true,
      render: (t) => <Badge value={t.status} />,
    },
    {
      key: 'request_number',
      label: listLabels.field('request'),
      sortable: true,
      defaultVisible: true,
      render: (t) => (
        <Link
          to={`/requests/${t.request_id}`}
          className="text-indigo-600 font-medium hover:text-indigo-800 text-sm"
          onClick={(e) => e.stopPropagation()}
        >
          {t.request_number}
        </Link>
      ),
    },
    {
      key: 'service_item_name',
      label: listLabels.field('serviceItem'),
      sortable: true,
      defaultVisible: true,
      render: (t) => <span className="text-gray-700 text-sm">{t.service_item_name}</span>,
    },
    {
      key: 'requester_name',
      label: listLabels.field('requester'),
      sortable: false,
      defaultVisible: false,
      render: (t) => <span className="text-gray-500 text-sm">{t.requester_name}</span>,
    },
    {
      key: 'assigned_group_name',
      label: listLabels.field('group'),
      sortable: true,
      defaultVisible: true,
      render: (t) => <span className="text-gray-500 text-sm">{t.assigned_group_name || listLabels.emDash}</span>,
    },
    {
      key: 'assigned_to_name',
      label: listLabels.field('assignedTo'),
      sortable: true,
      defaultVisible: true,
      render: (t) => <span className="text-gray-500 text-sm">{t.assigned_to_name || listLabels.unassigned}</span>,
    },
    {
      key: 'created_at',
      label: listLabels.field('created'),
      sortable: true,
      defaultVisible: true,
      render: (t) => <span className="text-gray-500 text-xs">{formatDate(t.created_at)}</span>,
    },
    {
      key: 'completed_at',
      label: listLabels.field('completed'),
      sortable: true,
      defaultVisible: false,
      render: (t) => t.completed_at
        ? <span className="text-gray-500 text-xs">{formatDateTime(t.completed_at)}</span>
        : <span className="text-gray-400">{listLabels.emDash}</span>,
    },
  ];
}

export const REQUEST_TASK_CSV_HEADERS = [
  'number', 'name', 'task_type', 'status', 'request_number', 'service_item_name',
  'assigned_group_name', 'assigned_to_name', 'created_at', 'completed_at',
];

export function getRequestTaskCsvField(row: RequestTaskListItem, header: string): unknown {
  switch (header) {
    case 'number': return row.number;
    case 'name': return row.name;
    case 'task_type': return row.task_type;
    case 'status': return row.status;
    case 'request_number': return row.request_number;
    case 'service_item_name': return row.service_item_name;
    case 'assigned_group_name': return row.assigned_group_name;
    case 'assigned_to_name': return row.assigned_to_name;
    case 'created_at': return row.created_at;
    case 'completed_at': return row.completed_at;
    default: return '';
  }
}
