/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { search, type SearchResult } from '../api/client';
import PageHeader from '../components/PageHeader';
import Spinner from '../components/Spinner';

const TYPE_ORDER: SearchResult['type'][] = ['incident', 'change', 'problem', 'knowledge', 'ci'];

const TYPE_LABEL: Record<SearchResult['type'], string> = {
  incident: 'Incidents',
  change: 'Changes',
  problem: 'Problems',
  knowledge: 'Knowledge',
  ci: 'CMDB',
};

function groupByType(items: SearchResult[]): Record<SearchResult['type'], SearchResult[]> {
  return items.reduce((acc, item) => {
    const key = item.type;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {} as Record<SearchResult['type'], SearchResult[]>);
}

export default function SearchResultsPage() {
  const [searchParams] = useSearchParams();
  const q = (searchParams.get('q') || '').trim();
  const requestedType = (searchParams.get('type') || '').trim() as SearchResult['type'] | '';
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    let alive = true;
    if (!q) {
      setResults([]);
      return () => { alive = false; };
    }
    setLoading(true);

    const types = requestedType ? [requestedType] : TYPE_ORDER;
    Promise.all(types.map((t) => search.query(q, 50, t)))
      .then((responses) => {
        if (!alive) return;
        const merged = responses.flatMap((r) => r.results);
        setResults(merged);
      })
      .catch(() => {
        if (!alive) return;
        setResults([]);
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => { alive = false; };
  }, [q, requestedType]);

  const grouped = useMemo(() => groupByType(results), [results]);
  const total = results.length;

  return (
    <>
      <PageHeader
        title="Search Results"
        description={q ? `Results for "${q}"${requestedType ? ` in ${TYPE_LABEL[requestedType]}` : ''}` : 'Type a query in Global Search'}
      />

      {loading ? (
        <Spinner />
      ) : !q ? (
        <div className="text-sm text-gray-500">Open global search with Ctrl+K and press Enter to view grouped results.</div>
      ) : total === 0 ? (
        <div className="text-sm text-gray-500">No records found.</div>
      ) : (
        <div className="space-y-6">
          {TYPE_ORDER.map((type) => {
            const list = grouped[type] || [];
            if (list.length === 0) return null;
            return (
              <section key={type} className="bg-white border border-gray-200 rounded-xl">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">{TYPE_LABEL[type]}</h3>
                  <span className="text-xs text-gray-500">{list.length}</span>
                </div>
                <div>
                  {list.map((item) => (
                    <Link
                      key={`${type}-${item.id}`}
                      to={item.path}
                      className="block px-4 py-3 border-b last:border-b-0 border-gray-100 hover:bg-gray-50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{item.identifier} · {item.title}</p>
                          {item.subtitle && <p className="text-xs text-gray-500 truncate mt-0.5">{item.subtitle}</p>}
                        </div>
                        <span className="text-[11px] text-gray-400">{TYPE_LABEL[type]}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

