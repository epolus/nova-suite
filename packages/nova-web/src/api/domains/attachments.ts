/* SPDX-License-Identifier: AGPL-3.0-only */
import { request, uploadFile, requestBlob } from '../http';
import type { Attachment } from '../types';
import { downloadBlob } from '../../utils/download';

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
    downloadBlob(await requestBlob(`/attachments/${id}/download`), fileName);
  },
  previewUrl: async (id: string): Promise<string> =>
    URL.createObjectURL(await requestBlob(`/attachments/${id}/download`)),
  delete: (id: string) => request<{ success: boolean }>(`/attachments/${id}`, { method: 'DELETE' }),
};
