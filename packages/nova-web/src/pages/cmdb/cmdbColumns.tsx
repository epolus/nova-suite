/* SPDX-License-Identifier: AGPL-3.0-only */
import { Link } from 'react-router';
import type { CI } from '../../api/client';
import Badge from '../../components/Badge';
import { CiClassIcon } from '../../components/CiClassIcon';
import type { DataColumnDef } from '../../components/DataTable';
import { formatDate } from '../../utils/dateTime';
import { useFieldLabel } from '@/i18n/hooks';

export type CmdbListLabels = {
  field: ReturnType<typeof useFieldLabel>;
  emDash: string;
  inactive: string;
};

export function buildColumns(labels: CmdbListLabels): DataColumnDef<CI>[] {
  return [
    {
      key: 'name',
      label: labels.field('name'),
      sortable: true,
      defaultVisible: true,
      render: (ci) => (
        <div className="flex items-start gap-2">
          <span className="mt-0.5 text-gray-500 shrink-0">
            <CiClassIcon name={ci.class_icon} className="w-4 h-4" />
          </span>
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
      render: (ci) => (
        <span className="inline-flex items-center gap-1.5">
          <Badge value={ci.status} />
          {ci.is_active === false && (
            <span className="text-[10px] uppercase tracking-wide text-gray-400">{labels.inactive}</span>
          )}
        </span>
      ),
    },
    {
      key: 'environment',
      label: labels.field('environment'),
      sortable: true,
      defaultVisible: true,
      render: (ci) => <Badge value={ci.environment} />,
    },
    {
      key: 'external_id_1',
      label: labels.field('externalId1'),
      sortable: true,
      defaultVisible: false,
      render: (ci) => <span className="text-gray-500 font-mono text-xs">{ci.external_id_1 || labels.emDash}</span>,
    },
    {
      key: 'external_id_2',
      label: labels.field('externalId2'),
      sortable: true,
      defaultVisible: false,
      render: (ci) => <span className="text-gray-500 font-mono text-xs">{ci.external_id_2 || labels.emDash}</span>,
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
