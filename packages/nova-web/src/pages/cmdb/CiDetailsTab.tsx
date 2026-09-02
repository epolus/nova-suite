/* SPDX-License-Identifier: AGPL-3.0-only */
import { Link } from 'react-router';
import { useTranslations } from 'use-intl';
import type { Asset } from '../../api/client';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import { formatDateTime } from '../../utils/dateTime';
import { useFieldLabel } from '@/i18n/hooks';
import type { CIData } from './useCIDetail';

export default function CiDetailsTab({
  ci,
  refNames,
  linkedAssets,
}: {
  ci: CIData;
  refNames: Record<string, string>;
  linkedAssets: Asset[];
}) {
  const tCmdb = useTranslations('pages.cmdb');
  const tTable = useTranslations('common.table');
  const tStates = useTranslations('common.states');
  const fieldLabel = useFieldLabel();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <h3 className="font-semibold text-gray-900 mb-4">{tCmdb('general')}</h3>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">{fieldLabel('status')}</dt>
            <dd><Badge value={ci.status} /></dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">{tStates('active')}</dt>
            <dd className="text-gray-900">{ci.is_active === false ? tStates('inactive') : tStates('active')}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">{fieldLabel('environment')}</dt>
            <dd><Badge value={ci.environment} /></dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">{fieldLabel('class')}</dt>
            <dd className="text-gray-900 font-medium">{ci.class_display_name}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">{tCmdb('managedBy')}</dt>
            <dd className="text-gray-900">{ci.managed_by_name || tTable('emDash')}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">{fieldLabel('assignedTo')}</dt>
            <dd className="text-gray-900">{ci.assigned_to_name || tTable('emDash')}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">{tCmdb('supportedBy')}</dt>
            <dd className="text-gray-900">{ci.supported_by_name || tTable('emDash')}</dd>
          </div>
          {(ci.external_id_1 || ci.external_id_2) && (
            <>
              <div className="flex justify-between">
                <dt className="text-gray-500">{fieldLabel('externalId1')}</dt>
                <dd className="text-gray-900 font-mono text-xs">{ci.external_id_1 || tTable('emDash')}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">{fieldLabel('externalId2')}</dt>
                <dd className="text-gray-900 font-mono text-xs">{ci.external_id_2 || tTable('emDash')}</dd>
              </div>
            </>
          )}
          {ci.location && (
            <div className="flex justify-between">
              <dt className="text-gray-500">{fieldLabel('location')}</dt>
              <dd className="text-gray-900">{ci.location}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-gray-500">{fieldLabel('created')}</dt>
            <dd className="text-gray-900">{formatDateTime(ci.created_at)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">{fieldLabel('updated')}</dt>
            <dd className="text-gray-900">{formatDateTime(ci.updated_at)}</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <h3 className="font-semibold text-gray-900 mb-4">{tCmdb('attributes')}</h3>
        <dl className="space-y-3 text-sm">
          {Object.entries(ci.attributes).map(([key, value]) => {
            const displayValue = refNames[key] || String(value);
            const isRef = !!refNames[key];
            return (
              <div key={key} className="flex justify-between">
                <dt className="text-gray-500 capitalize">{key.replace(/_/g, ' ')}</dt>
                <dd className={`font-medium ${isRef ? 'text-indigo-600' : 'text-gray-900'}`}>
                  {displayValue || tTable('emDash')}
                </dd>
              </div>
            );
          })}
          {Object.keys(ci.attributes).length === 0 && (
            <p className="text-gray-400">{tCmdb('noAttributes')}</p>
          )}
        </dl>
      </Card>

      {ci.notes && (
        <Card className="lg:col-span-2">
          <h3 className="font-semibold text-gray-900 mb-2">{fieldLabel('notes')}</h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{ci.notes}</p>
        </Card>
      )}

      <Card className="lg:col-span-2">
        <h3 className="font-semibold text-gray-900 mb-2">{tCmdb('linkedAssets')}</h3>
        {linkedAssets.length === 0 ? (
          <p className="text-sm text-gray-400">{tCmdb('noLinkedAssets')}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {linkedAssets.map((asset) => (
              <Link
                key={asset.id}
                to={`/assets/${asset.id}`}
                className="block p-3 rounded-lg border border-gray-200 hover:bg-gray-50"
              >
                <p className="text-xs text-indigo-600 font-medium">{asset.asset_tag}</p>
                <p className="text-sm text-gray-900">{asset.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{asset.status} • {asset.category}</p>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
