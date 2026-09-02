/* SPDX-License-Identifier: AGPL-3.0-only */
import { Link } from 'react-router';
import { useTranslations } from 'use-intl';
import type { Incident, Problem } from '../../api/client';
import Card from '../../components/Card';

export default function CiRelatedWorkTab({
  relatedProblems,
  relatedIncidents,
}: {
  relatedProblems: Problem[];
  relatedIncidents: Incident[];
}) {
  const tCmdb = useTranslations('pages.cmdb');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <h3 className="font-semibold text-gray-900 mb-2">{tCmdb('relatedProblems')}</h3>
        {relatedProblems.length === 0 ? (
          <p className="text-sm text-gray-400">{tCmdb('noRelatedProblems')}</p>
        ) : (
          <div className="space-y-2">
            {relatedProblems.map((p) => (
              <Link
                key={p.id}
                to={`/problems/${p.id}`}
                className="block p-3 rounded-lg border border-gray-200 hover:bg-gray-50"
              >
                <p className="text-xs text-indigo-600 font-medium">{p.number}</p>
                <p className="text-sm text-gray-900">{p.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{p.status} • {p.priority}</p>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h3 className="font-semibold text-gray-900 mb-2">{tCmdb('relatedIncidents')}</h3>
        {relatedIncidents.length === 0 ? (
          <p className="text-sm text-gray-400">{tCmdb('noRelatedIncidents')}</p>
        ) : (
          <div className="space-y-2">
            {relatedIncidents.map((inc) => (
              <Link
                key={inc.id}
                to={`/incidents/${inc.id}`}
                className="block p-3 rounded-lg border border-gray-200 hover:bg-gray-50"
              >
                <p className="text-xs text-indigo-600 font-medium">{inc.number}</p>
                <p className="text-sm text-gray-900">{inc.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{inc.status} • P{inc.priority}</p>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
