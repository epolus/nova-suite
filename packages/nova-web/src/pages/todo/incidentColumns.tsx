/* SPDX-License-Identifier: AGPL-3.0-only */
import { Link } from 'react-router-dom';
import type { Incident } from '@/api/client';
import Badge from '@/components/Badge';
import type { DataColumnDef } from '@/components/DataTable';
import { formatDate } from '@/utils/dateTime';
import type { useFieldLabel, usePriorityLabel } from '@/i18n/hooks';

export type TodoListLabels = {
  field: ReturnType<typeof useFieldLabel>;
  priority: ReturnType<typeof usePriorityLabel>;
  emDash: string;
  slaBreached: string;
  unassigned: string;
};

export function buildColumns(listParams: Record<string, string>, labels: TodoListLabels): DataColumnDef<Incident>[] {
  return [
    {
      key: 'number',
      label: labels.field('number'),
      sortable: true,
      defaultVisible: true,
      render: (inc) => (
        <Link
          to={`/incidents/${inc.id}`}
          state={{ listParams }}
          className="text-indigo-600 font-medium hover:text-indigo-800"
          onClick={(e) => e.stopPropagation()}
        >
          {inc.number}
        </Link>
      ),
    },
    {
      key: 'title',
      label: labels.field('title'),
      sortable: true,
      defaultVisible: true,
      className: 'max-w-xs truncate',
      render: (inc) => <span className="text-gray-900">{inc.title}</span>,
    },
    {
      key: 'priority',
      label: labels.field('priority'),
      sortable: true,
      defaultVisible: true,
      render: (inc) => (
        <span
          className={`text-xs font-bold ${
            inc.priority <= 2 ? 'text-red-600' : inc.priority === 3 ? 'text-yellow-600' : 'text-gray-500'
          }`}
        >
          {labels.priority(inc.priority)}
        </span>
      ),
    },
    {
      key: 'status',
      label: labels.field('status'),
      sortable: true,
      defaultVisible: true,
      render: (inc) => <Badge value={inc.status} />,
    },
    {
      key: 'assigned_to_name',
      label: labels.field('assignedTo'),
      sortable: true,
      defaultVisible: true,
      render: (inc) => <span className="text-gray-500">{inc.assigned_to_name || labels.unassigned}</span>,
    },
    {
      key: 'assignment_group_name',
      label: labels.field('assignmentGroup'),
      sortable: true,
      defaultVisible: true,
      render: (inc) => <span className="text-gray-500">{inc.assignment_group_name || labels.emDash}</span>,
    },
    {
      key: 'category',
      label: labels.field('category'),
      sortable: true,
      defaultVisible: false,
      render: (inc) => <span className="text-gray-500">{inc.category || labels.emDash}</span>,
    },
    {
      key: 'impact',
      label: labels.field('impact'),
      sortable: true,
      defaultVisible: false,
      render: (inc) => <span className="capitalize text-gray-600">{inc.impact}</span>,
    },
    {
      key: 'urgency',
      label: labels.field('urgency'),
      sortable: true,
      defaultVisible: false,
      render: (inc) => <span className="capitalize text-gray-600">{inc.urgency}</span>,
    },
    {
      key: 'sla',
      label: labels.field('sla'),
      sortable: true,
      defaultVisible: true,
      render: (inc) =>
        inc.sla_breached ? (
          <span className="text-xs font-bold text-red-600">{labels.slaBreached}</span>
        ) : inc.sla_due_at ? (
          <span className="text-xs text-gray-500">{formatDate(inc.sla_due_at)}</span>
        ) : (
          <span className="text-gray-400">{labels.emDash}</span>
        ),
    },
    {
      key: 'updated_at',
      label: labels.field('updated'),
      sortable: true,
      defaultVisible: true,
      render: (inc) => (
        <span className="text-gray-500 text-xs">{formatDate(inc.updated_at)}</span>
      ),
    },
    {
      key: 'created_at',
      label: labels.field('created'),
      sortable: true,
      defaultVisible: false,
      render: (inc) => (
        <span className="text-gray-500 text-xs">{formatDate(inc.created_at)}</span>
      ),
    },
  ];
}
