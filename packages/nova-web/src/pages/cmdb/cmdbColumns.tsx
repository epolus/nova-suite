/* SPDX-License-Identifier: AGPL-3.0-only */
import { Link } from 'react-router-dom';
import type { CI } from '../../api/client';
import Badge from '../../components/Badge';
import type { DataColumnDef } from '../../components/DataTable';
import { formatDate } from '../../utils/dateTime';
import { useFieldLabel } from '@/i18n/hooks';

export type CmdbListLabels = {
  field: ReturnType<typeof useFieldLabel>;
  emDash: string;
};

export function buildColumns(labels: CmdbListLabels): DataColumnDef<CI>[] {
  return [
    {
      key: 'name',
      label: labels.field('name'),
      sortable: true,
      defaultVisible: true,
      render: (ci) => (
        <div>
          <Link
            to={`/cmdb/${ci.id}`}
            className="text-indigo-600 font-medium hover:text-indigo-800"
            onClick={(e) => e.stopPropagation()}
          >
            {ci.display_name || ci.name}
          </Link>
          <p className="text-xs text-gray-400">{ci.name}</p>
        </div>
      ),
    },
    {
      key: 'class_display_name',
      label: labels.field('class'),
      sortable: true,
      defaultVisible: true,
      render: (ci) => <span className="text-gray-700">{ci.class_display_name}</span>,
    },
    {
      key: 'status',
      label: labels.field('status'),
      sortable: true,
      defaultVisible: true,
      render: (ci) => <Badge value={ci.status} />,
    },
    {
      key: 'environment',
      label: labels.field('environment'),
      sortable: true,
      defaultVisible: true,
      render: (ci) => <Badge value={ci.environment} />,
    },
    {
      key: 'managed_by_name',
      label: labels.field('managedBy'),
      sortable: true,
      defaultVisible: true,
      render: (ci) => <span className="text-gray-500">{ci.managed_by_name || labels.emDash}</span>,
    },
    {
      key: 'assigned_to_name',
      label: labels.field('assignedTo'),
      sortable: true,
      defaultVisible: true,
      render: (ci) => <span className="text-gray-500">{ci.assigned_to_name || labels.emDash}</span>,
    },
    {
      key: 'supported_by_name',
      label: labels.field('supportedBy'),
      sortable: true,
      defaultVisible: true,
      render: (ci) => <span className="text-gray-500">{ci.supported_by_name || labels.emDash}</span>,
    },
    {
      key: 'location',
      label: labels.field('location'),
      sortable: true,
      defaultVisible: false,
      render: (ci) => <span className="text-gray-500">{ci.location || labels.emDash}</span>,
    },
    {
      key: 'created_at',
      label: labels.field('created'),
      sortable: true,
      defaultVisible: false,
      render: (ci) => (
        <span className="text-gray-500 text-xs">{formatDate(ci.created_at)}</span>
      ),
    },
    {
      key: 'updated_at',
      label: labels.field('updated'),
      sortable: true,
      defaultVisible: true,
      render: (ci) => (
        <span className="text-gray-500 text-xs">{formatDate(ci.updated_at)}</span>
      ),
    },
  ];
}
