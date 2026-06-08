/* SPDX-License-Identifier: AGPL-3.0-only */
import { request, uploadFile } from '../http';
import type { EntityFieldDef, ImportJob, ImportRow, ImportUploadResult, ImportValidationResult, Pagination } from '../types';

export const importer = {
  entities: () => request<{ entities: EntityFieldDef[] }>('/import/entities'),
  upload: (file: File, entityType: string) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('entity_type', entityType);
    return uploadFile<ImportUploadResult>('/import/upload', fd);
  },
  validate: (
    jobId: string,
    columnMapping: Record<string, string>,
    fixedValues: Record<string, string> = {},
  ) =>
    request<ImportValidationResult>(`/import/${jobId}/validate`, {
      method: 'POST',
      body: JSON.stringify({ column_mapping: columnMapping, fixed_values: fixedValues }),
    }),
  getJob: (jobId: string) => request<ImportJob>(`/import/${jobId}`),
  getRows: (jobId: string, params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params);
    return request<{ rows: ImportRow[]; pagination: Pagination }>(`/import/${jobId}/rows?${qs}`);
  },
  commit: (jobId: string) => request<{ committed: number; failed: number }>(`/import/${jobId}/commit`, { method: 'POST' }),
  jobs: () => request<{ jobs: ImportJob[] }>('/import'),
  deleteJob: (jobId: string) => request<{ success: boolean }>(`/import/${jobId}`, { method: 'DELETE' }),
};
