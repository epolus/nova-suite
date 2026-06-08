/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import type { CIHistoryEntry } from '../../api/client';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import { formatDateTime } from '../../utils/dateTime';

export default function CiHistoryTab({ history }: { history: CIHistoryEntry[] }) {
  const tCmdb = useTranslations('pages.cmdb');
  return (
    <Card>
      <h3 className="font-semibold text-gray-900 mb-4">{tCmdb('auditTrail')}</h3>
      {history.length === 0 ? (
        <p className="text-sm text-gray-400">{tCmdb('noHistory')}</p>
      ) : (
        <div className="space-y-3">
          {history.map((entry) => (
            <div key={entry.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
              <div className={`w-2 h-2 mt-1.5 rounded-full flex-shrink-0 ${
                entry.change_type === 'create' ? 'bg-green-500' :
                entry.change_type === 'update' ? 'bg-blue-500' : 'bg-red-500'
              }`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">{entry.changed_by_name}</span>
                  <Badge value={entry.change_type} />
                  {entry.field_name && (
                    <span className="text-xs text-gray-500">{tCmdb('fieldLabel', { name: entry.field_name })}</span>
                  )}
                </div>
                {entry.old_value && entry.new_value && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {entry.old_value.slice(0, 50)} &rarr; {entry.new_value.slice(0, 50)}
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(entry.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
