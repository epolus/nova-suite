/* SPDX-License-Identifier: AGPL-3.0-only */
import { Link } from 'react-router-dom';
import { useTranslations } from 'use-intl';
import type { ImpactedCI } from '../../api/client';
import Card from '../../components/Card';
import Badge from '../../components/Badge';

export default function CiImpactTab({ impact, ciName }: {
  impact: ImpactedCI[];
  ciName: string;
}) {
  const tCmdb = useTranslations('pages.cmdb');
  return (
    <Card>
      <h3 className="font-semibold text-gray-900 mb-2">{tCmdb('impactAnalysis')}</h3>
      <p className="text-sm text-gray-500 mb-4">{tCmdb('impactDescription', { name: ciName })}</p>
      {impact.length === 0 ? (
        <p className="text-sm text-gray-400">{tCmdb('noDependentItems')}</p>
      ) : (
        <div className="space-y-2">
          {impact.map((item, i) => (
            <div key={i} className="flex items-center gap-3 py-2 px-3 bg-gray-50 rounded-lg">
              <span className="text-xs font-mono text-gray-400 w-8">L{item.depth}</span>
              <Link to={`/cmdb/${item.ci_id}`} className="text-sm text-indigo-600 font-medium hover:text-indigo-800">
                {item.ci_name}
              </Link>
              <Badge value={item.relationship_type} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
