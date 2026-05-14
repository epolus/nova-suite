/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { majorIncidents as majorIncidentsApi } from '../api/client';

export default function MajorIncidentBanner() {
  const [items, setItems] = useState<Array<{ id: string; title: string; status: string; priority: number }>>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { items: rows } = await majorIncidentsApi.activeBanner();
        if (!cancelled) {
          setItems(
            (rows as Array<{ id: string; title: string; status: string; priority: number }>).filter(Boolean),
          );
        }
      } catch {
        if (!cancelled) setItems([]);
      }
    };
    void load();
    const t = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold uppercase tracking-wide text-red-800">Major incident</span>
        {items.map((it) => (
          <Link
            key={it.id}
            to={`/major-incidents/${it.id}`}
            className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700"
          >
            P{it.priority} · {it.title}
          </Link>
        ))}
      </div>
    </div>
  );
}
