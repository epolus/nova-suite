/* SPDX-License-Identifier: AGPL-3.0-only */
import { Link } from 'react-router';
import { useTranslations } from 'use-intl';
import type { ServiceRequest } from '../../api/client';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import { formatDateTime } from '../../utils/dateTime';
import { useFieldLabel } from '@/i18n/hooks';

export function RequestDetailsCard({ req }: { req: ServiceRequest }) {
  const tRequests = useTranslations('pages.requests');
  const fieldLabel = useFieldLabel();

  return (
    <Card>
      <h3 className="font-semibold text-gray-900 mb-4">{tRequests('requestDetails')}</h3>
      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-gray-500">{tRequests('serviceItem')}</dt>
          <dd className="font-medium text-gray-900 mt-0.5">{req.service_item_name}</dd>
        </div>
        <div>
          <dt className="text-gray-500">{tRequests('requester')}</dt>
          <dd className="font-medium text-gray-900 mt-0.5">{req.requester_name}</dd>
        </div>
        <div>
          <dt className="text-gray-500">{fieldLabel('priority')}</dt>
          <dd className="mt-0.5"><Badge value={req.priority} /></dd>
        </div>
        <div>
          <dt className="text-gray-500">{fieldLabel('status')}</dt>
          <dd className="mt-0.5"><Badge value={req.status} /></dd>
        </div>
        <div>
          <dt className="text-gray-500">{fieldLabel('created')}</dt>
          <dd className="font-medium text-gray-900 mt-0.5">{formatDateTime(req.created_at)}</dd>
        </div>
        {req.approved_by_name && (
          <div>
            <dt className="text-gray-500">{tRequests('approvedBy')}</dt>
            <dd className="font-medium text-gray-900 mt-0.5">{req.approved_by_name} &middot; {formatDateTime(req.approved_at)}</dd>
          </div>
        )}
        {req.provisioned_ci_id && (
          <div>
            <dt className="text-gray-500">{tRequests('provisionedCi')}</dt>
            <dd className="font-medium text-gray-900 mt-0.5">
              <Link to={`/cmdb/${req.provisioned_ci_id}`} className="text-indigo-700 hover:underline">
                {req.provisioned_ci_name || req.provisioned_ci_id}
              </Link>
            </dd>
          </div>
        )}
        {req.provisioned_asset_id && (
          <div>
            <dt className="text-gray-500">{tRequests('provisionedAsset')}</dt>
            <dd className="font-medium text-gray-900 mt-0.5">
              <Link to={`/assets/${req.provisioned_asset_id}`} className="text-indigo-700 hover:underline">
                {req.provisioned_asset_name || req.provisioned_asset_tag || req.provisioned_asset_id}
              </Link>
            </dd>
          </div>
        )}
        {req.requested_for_name && req.requested_for !== req.requester_id && (
          <div>
            <dt className="text-gray-500">{tRequests('requestedFor')}</dt>
            <dd className="font-medium text-gray-900 mt-0.5">{req.requested_for_name}</dd>
          </div>
        )}
        {req.batch_id && (
          <div>
            <dt className="text-gray-500">{tRequests('order')}</dt>
            <dd className="font-medium text-indigo-600 mt-0.5">
              {tRequests('partOfOrder', { count: req.batch_count || '?' })}
            </dd>
          </div>
        )}
      </dl>
    </Card>
  );
}
