/* SPDX-License-Identifier: AGPL-3.0-only */
import { incidents as incidentsApi } from '../../api/client';
import type { Incident } from '../../api/client';
import { createIncidentListParams } from './incidentListParams';

export interface ExportIncidentsArgs {
  selectedIds: string[];
  data: Incident[];
  statusFilter: string;
  assignedToMe: boolean;
  slaBreached: boolean;
  search: string;
  sort: string;
  dir: string;
  columnFilters: Record<string, string>;
  exportFailedMessage: string;
}

export async function exportIncidentsCsv(args: ExportIncidentsArgs): Promise<void> {
  const { selectedIds, data } = args;
  try {
    const allIncidents = selectedIds.length > 0
      ? data.filter((incident) => selectedIds.includes(incident.id))
      : await (async () => {
          const paramsForExport = createIncidentListParams({
            statusFilter: args.statusFilter,
            assignedToMe: args.assignedToMe,
            slaBreached: args.slaBreached,
            search: args.search,
            sort: args.sort,
            dir: args.dir,
            columnFilters: args.columnFilters,
          });
          const limit = 100;
          const firstPage = await incidentsApi.list(paramsForExport, 1, limit);
          const rows = [...firstPage.incidents];
          const totalPages = firstPage.pagination.pages;
          for (let page = 2; page <= totalPages; page += 1) {
            const nextPage = await incidentsApi.list(paramsForExport, page, limit);
            rows.push(...nextPage.incidents);
          }
          return rows;
        })();

    const headers = [
      'number',
      'title',
      'status',
      'priority',
      'impact',
      'urgency',
      'assigned_to_name',
      'assignment_group_name',
      'caller_name',
      'service_name',
      'sla_due_at',
      'sla_breached',
      'created_at',
      'updated_at',
    ];
    const getExportField = (incident: Incident, header: string): unknown => {
      switch (header) {
        case 'number': return incident.number;
        case 'title': return incident.title;
        case 'status': return incident.status;
        case 'priority': return incident.priority;
        case 'impact': return incident.impact;
        case 'urgency': return incident.urgency;
        case 'assigned_to_name': return incident.assigned_to_name;
        case 'assignment_group_name': return incident.assignment_group_name;
        case 'caller_name': return incident.caller_name;
        case 'service_name': return incident.service_name;
        case 'sla_due_at': return incident.sla_due_at;
        case 'sla_breached': return incident.sla_breached;
        case 'created_at': return incident.created_at;
        case 'updated_at': return incident.updated_at;
        default: return '';
      }
    };
    const csvEscape = (value: unknown) => {
      const str = String(value ?? '');
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const lines = [
      headers.join(','),
      ...allIncidents.map((incident) => headers.map((header) => csvEscape(getExportField(incident, header))).join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedIds.length > 0 ? `incidents-selected-${ts}.csv` : `incidents-${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    // Keep UX simple and avoid uncaught promise errors on export failures.
    alert(err instanceof Error ? err.message : args.exportFailedMessage);
  }
}
