/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { incidents as incidentsApi, changes as changesApi, requests as requestsApi, majorIncidents as majorIncidentsApi } from '../api/client';
import type { Incident, Change, ServiceRequest, IncidentStats, ChangeStats } from '../api/client';
import { useAuth } from '../context/AuthContext';
import MajorIncidentBanner from '../components/MajorIncidentBanner';
import PageHeader from '../components/PageHeader';
import Card from '../components/Card';
import Badge from '../components/Badge';
import Spinner from '../components/Spinner';
import { formatDate } from '../utils/dateTime';
import { hasChangeRole, isFulfillerRole } from '../utils/roles';
import { useTranslations } from 'use-intl';

const PRIORITY_CONFIG: Record<number, { label: string; color: string; bg: string; dot: string }> = {
  1: { label: 'P1 Critical', color: 'text-red-700', bg: 'bg-red-50 border-red-200', dot: 'bg-red-500' },
  2: { label: 'P2 High', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', dot: 'bg-orange-500' },
  3: { label: 'P3 Moderate', color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200', dot: 'bg-yellow-500' },
  4: { label: 'P4 Low', color: 'text-gray-600', bg: 'bg-gray-50 border-gray-200', dot: 'bg-gray-400' },
  5: { label: 'P5 Planning', color: 'text-gray-500', bg: 'bg-gray-50 border-gray-100', dot: 'bg-gray-300' },
};

function StatCard({
  label, value, color, bg, icon, link, alert, hint,
}: {
  label: string;
  value: number;
  color: string;
  bg: string;
  icon: React.ReactNode;
  link: string;
  alert?: boolean;
  hint?: string;
}) {
  return (
    <Link to={link}>
      <Card className={`hover:shadow-md transition-shadow ${alert && value > 0 ? 'ring-1 ring-red-300' : ''}`}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
            <p className={`text-3xl font-bold mt-1.5 ${color}`}>{value}</p>
            {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
          </div>
          <div className={`p-2.5 rounded-lg ${bg}`}>{icon}</div>
        </div>
      </Card>
    </Link>
  );
}

// Simple SVG icons
const Icons = {
  incident: (cls = 'w-5 h-5') => (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.008v.008H12v-.008Z" />
    </svg>
  ),
  sla: (cls = 'w-5 h-5') => (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  ),
  change: (cls = 'w-5 h-5') => (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  ),
  request: (cls = 'w-5 h-5') => (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
    </svg>
  ),
  queue: (cls = 'w-5 h-5') => (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
    </svg>
  ),
};

export default function Dashboard() {
  const tDashboard = useTranslations('pages.dashboard');
  const { user } = useAuth();
  const [incStats, setIncStats] = useState<IncidentStats | null>(null);
  const [chStats, setChStats] = useState<ChangeStats | null>(null);
  const [myQueue, setMyQueue] = useState<Incident[]>([]);
  const [assignedToMeTotal, setAssignedToMeTotal] = useState(0);
  const [pendingChanges, setPendingChanges] = useState<Change[]>([]);
  const [recentRequests, setRecentRequests] = useState<ServiceRequest[]>([]);
  const [requestTotal, setRequestTotal] = useState(0);
  const [majorRows, setMajorRows] = useState<Array<{ id: string; number: string; title: string; status: string; priority: number }>>([]);
  const [loading, setLoading] = useState(true);

  const isFulfiller = isFulfillerRole(user?.roles);
  const canManageChanges = hasChangeRole(user?.roles);

  useEffect(() => {
    async function load() {
      try {
        const promises: Promise<unknown>[] = [requestsApi.list({ active: 'true' }, 1, 5)];

        if (isFulfiller) {
          promises.push(
            incidentsApi.stats(),
            incidentsApi.list({ assigned_to_me: 'true' }, 1, 5),
            majorIncidentsApi.list({ status_not_in: 'resolved,cancelled' }, 1, 8),
          );
        }
        if (canManageChanges) {
          promises.push(
            changesApi.stats(),
            changesApi.list({ status: 'pending_approval' }, 1, 5),
          );
        }

        const results = await Promise.all(promises);
        let idx = 0;

        const reqRes = results[idx++] as { requests: ServiceRequest[]; pagination: { total: number } };
        setRecentRequests(reqRes.requests);
        setRequestTotal(reqRes.pagination.total);

        if (isFulfiller) {
          setIncStats(results[idx++] as IncidentStats);
          const queueRes = results[idx++] as { incidents: Incident[]; pagination: { total: number } };
          setMyQueue(queueRes.incidents);
          setAssignedToMeTotal(queueRes.pagination.total);
          const majorRes = results[idx++] as { major_incidents: Record<string, unknown>[] };
          setMajorRows(
            (majorRes.major_incidents as Array<{ id: string; number: string; title: string; status: string; priority: number }>) ?? [],
          );
        }
        if (canManageChanges) {
          setChStats(results[idx++] as ChangeStats);
          const chRes = results[idx++] as { changes: Change[] };
          setPendingChanges(chRes.changes);
        }
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isFulfiller, canManageChanges]);

  if (loading) return <Spinner />;

  return (
    <>
      <MajorIncidentBanner />
      <PageHeader
        title={tDashboard('welcomeBack', { name: user?.display_name || '' })}
        description={tDashboard('description')}
      />

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {isFulfiller && incStats && (
          <>
            <StatCard
              label="Open Incidents"
              value={incStats.open_total}
              color="text-indigo-600"
              bg="bg-indigo-50"
              icon={Icons.incident('w-5 h-5 text-indigo-500')}
              link="/incidents"
            />
            <StatCard
              label="SLA Breached"
              value={incStats.sla_breached}
              color={incStats.sla_breached > 0 ? 'text-red-600' : 'text-gray-400'}
              bg="bg-red-50"
              icon={Icons.sla('w-5 h-5 text-red-500')}
              link="/incidents?sla_breached=true"
              alert
            />
          </>
        )}
        {canManageChanges && chStats && (
          <StatCard
            label="Open Changes"
            value={chStats.open_total}
            color="text-violet-600"
            bg="bg-violet-50"
            icon={Icons.change('w-5 h-5 text-violet-500')}
            link="/changes"
          />
        )}
        <StatCard
          label="My Requests"
          value={requestTotal}
          color="text-blue-600"
          bg="bg-blue-50"
          icon={Icons.request('w-5 h-5 text-blue-500')}
          link="/requests?active=true"
        />
        {isFulfiller && incStats && (
          <StatCard
            label="Assigned to Me"
              value={assignedToMeTotal || incStats.assigned_to_me}
            color="text-emerald-600"
            bg="bg-emerald-50"
            icon={Icons.queue('w-5 h-5 text-emerald-500')}
              link="/incidents?assigned_to_me=true"
              hint="Excludes resolved, closed, cancelled"
          />
        )}
      </div>

      {isFulfiller && majorRows.length > 0 && (
        <Card className="mb-6 border-orange-200 bg-orange-50/60">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-gray-900">Active major incidents</h2>
            <Link to="/major-incidents" className="text-sm text-indigo-600 hover:text-indigo-800">View all</Link>
          </div>
          <ul className="space-y-2 text-sm">
            {majorRows.map((m) => (
              <li key={m.id}>
                <Link to={`/major-incidents/${m.id}`} className="text-indigo-700 hover:underline font-medium">
                  {m.number} · P{m.priority} · {m.title}
                </Link>
                <span className="text-gray-500 ml-2 capitalize">({m.status})</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Priority breakdown */}
      {isFulfiller && incStats && incStats.by_priority.some((p) => p.count > 0) && (
        <Card className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold text-gray-700">Open Incidents by Priority</span>
            <span className="text-xs text-gray-400">— click to filter</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {incStats.by_priority.map((p) => {
              const cfg = PRIORITY_CONFIG[p.priority] ?? { label: `P${p.priority}`, color: 'text-gray-600', bg: 'bg-gray-50 border-gray-200', dot: 'bg-gray-400' };
              return (
                <Link
                  key={p.priority}
                  to={`/incidents?cf.priority=${p.priority}`}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-opacity ${cfg.bg} ${cfg.color} ${p.count === 0 ? 'opacity-40 pointer-events-none' : 'hover:opacity-80'}`}
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                  {cfg.label}
                  <span className="font-bold">{p.count}</span>
                </Link>
              );
            })}
          </div>
        </Card>
      )}

      {/* Bottom section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column */}
        <div className="space-y-6">
          {/* My Queue */}
          {isFulfiller && (
            <Card padding={false}>
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">My Queue</h2>
                <Link to="/incidents?assigned_to_me=true" className="text-sm text-indigo-600 hover:text-indigo-800">
                  View all
                </Link>
              </div>
              <div className="divide-y divide-gray-50">
                {myQueue.length === 0 ? (
                  <p className="px-6 py-8 text-sm text-gray-400 text-center">No incidents assigned to you</p>
                ) : (
                  myQueue.map((inc) => {
                    const cfg = PRIORITY_CONFIG[inc.priority];
                    return (
                      <Link key={inc.id} to={`/incidents/${inc.id}`} className="block px-6 py-3 hover:bg-gray-50 transition-colors">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex items-start gap-2.5">
                            <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${cfg?.dot ?? 'bg-gray-300'}`} />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{inc.title}</p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {inc.number}
                                {inc.sla_due_at && (
                                  <span className={`ml-2 ${inc.sla_breached ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                                    {inc.sla_breached ? 'SLA BREACHED' : `due ${formatDate(inc.sla_due_at)}`}
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                          <Badge value={inc.status} />
                        </div>
                      </Link>
                    );
                  })
                )}
              </div>
            </Card>
          )}

          {/* Changes pending approval */}
          {canManageChanges && (
            <Card padding={false}>
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">Changes Pending Approval</h2>
                <Link to="/changes?status=pending_approval" className="text-sm text-indigo-600 hover:text-indigo-800">
                  View all
                  {chStats && chStats.pending_approval > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-violet-100 text-violet-700 rounded-full font-semibold">
                      {chStats.pending_approval}
                    </span>
                  )}
                </Link>
              </div>
              <div className="divide-y divide-gray-50">
                {pendingChanges.length === 0 ? (
                  <p className="px-6 py-8 text-sm text-gray-400 text-center">No changes pending approval</p>
                ) : (
                  pendingChanges.map((ch) => (
                    <Link key={ch.id} to={`/changes/${ch.id}`} className="block px-6 py-3 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{ch.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{ch.number} &middot; {ch.risk_level} risk</p>
                        </div>
                        <Badge value={ch.status} className="ml-4 flex-shrink-0" />
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </Card>
          )}

          {/* If not fulfiller/change role, show nothing in left column */}
          {!isFulfiller && !canManageChanges && null}
        </div>

        {/* Right column: Recent Requests */}
        <Card padding={false}>
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Recent Requests</h2>
            <Link to="/requests?active=true" className="text-sm text-indigo-600 hover:text-indigo-800">View all</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {recentRequests.length === 0 ? (
              <div className="px-6 py-8 text-center">
                <p className="text-sm text-gray-400 mb-3">No requests yet</p>
                <Link to="/catalog" className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
                  Browse the service catalog →
                </Link>
              </div>
            ) : (
              recentRequests.map((req) => (
                <Link key={req.id} to={`/requests/${req.id}`} className="block px-6 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{req.service_item_name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{req.number} &middot; {req.requester_name}</p>
                    </div>
                    <Badge value={req.status} className="ml-4 flex-shrink-0" />
                  </div>
                </Link>
              ))
            )}
          </div>
          {recentRequests.length > 0 && (
            <div className="px-6 py-3 border-t border-gray-50">
              <Link to="/catalog" className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
                + New request from catalog
              </Link>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
