/* SPDX-License-Identifier: AGPL-3.0-only */
import { request, uploadFile, BASE, getToken } from '../http';
import type { Attachment } from '../types';

export const attachments = {
  list: (entityType: string, entityId: string) =>
    request<{ attachments: Attachment[] }>(`/attachments?entity_type=${entityType}&entity_id=${entityId}`),
  upload: (entityType: string, entityId: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('entity_type', entityType);
    fd.append('entity_id', entityId);
    return uploadFile<Attachment>('/attachments/upload', fd);
  },
  uploadBlob: (entityType: string, entityId: string, blob: Blob, fileName: string) => {
    const fd = new FormData();
    fd.append('file', blob, fileName);
    fd.append('entity_type', entityType);
    fd.append('entity_id', entityId);
    return uploadFile<Attachment>('/attachments/upload', fd);
  },
  download: async (id: string, fileName: string) => {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${BASE}/attachments/${id}/download`, { headers });
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  },
  previewUrl: async (id: string): Promise<string> => {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${BASE}/attachments/${id}/download`, { headers });
    if (!res.ok) throw new Error('Preview failed');
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },
  delete: (id: string) => request<{ success: boolean }>(`/attachments/${id}`, { method: 'DELETE' }),
};
