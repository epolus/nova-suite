/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslations } from 'use-intl';
import { incidents as incidentsApi, requests as requestsApi } from '@/api/client';
import PageHeader from '@/components/PageHeader';
import RequestTasksTab from '@/components/RequestTasksTab';
import type { TodoScopeConfig } from './todoConfig';
import { IncidentsTab } from './IncidentsTab';

const TAB_KEYS = ['incidents', 'tasks'] as const;

export default function TodoListPage({ config }: { config: TodoScopeConfig }) {
  const tTodo = useTranslations('pages.todo');
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'incidents';

  const [taskCount, setTaskCount] = useState<number | null>(null);
  const [incidentCount, setIncidentCount] = useState<number | null>(null);

  const pageTitle = config.scope === 'me' ? tTodo('title') : tTodo('groupsTitle');
  const pageDescription = config.scope === 'me' ? tTodo('description') : tTodo('groupsDescription');

  useEffect(() => {
    requestsApi.taskQueue(config.incidentFilter, 1, 1).then((res) =>
      setTaskCount(res.pagination.total),
    ).catch(() => {});
    incidentsApi.list(config.incidentFilter, 1, 1).then((res) =>
      setIncidentCount(res.pagination.total),
    ).catch(() => {});
  }, [config.incidentFilter]);

  const setTab = (tab: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab === 'incidents') next.delete('tab');
      else next.set('tab', tab);
      return next;
    }, { replace: true });
  };

  const tabLabels: Record<(typeof TAB_KEYS)[number], string> = {
    incidents: tTodo('tabs.incidents'),
    tasks: tTodo('tabs.requestTasks'),
  };

  return (
    <>
      <PageHeader title={pageTitle} description={pageDescription} />

      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {TAB_KEYS.map((tab) => {
          const count = tab === 'incidents' ? incidentCount : taskCount;
          return (
            <button
              key={tab}
              onClick={() => setTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tabLabels[tab]}
              {count != null && count > 0 && (
                <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                  activeTab === tab ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeTab === 'incidents' && <IncidentsTab config={config} />}
      {activeTab === 'tasks' && <RequestTasksTab filterKey={config.taskFilterKey} />}
    </>
  );
}
