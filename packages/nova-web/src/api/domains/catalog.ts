/* SPDX-License-Identifier: AGPL-3.0-only */
import { request, uploadFile, BASE } from '../http';
import type { AllCatalogTask, CatalogTask, Category, ServiceItem } from '../types';

export const catalog = {
  categories: () => request<{ categories: Category[] }>('/catalog/categories'),
  items: (categoryId?: string) =>
    request<{ items: ServiceItem[] }>(
      `/catalog/items${categoryId ? `?category_id=${categoryId}` : ''}`,
    ),
  item: (id: string) => request<ServiceItem>(`/catalog/items/${id}`),
  createItem: (data: Partial<ServiceItem>) =>
    request<ServiceItem>('/catalog/items', { method: 'POST', body: JSON.stringify(data) }),
  updateItem: (id: string, data: Partial<ServiceItem>) =>
    request<ServiceItem>(`/catalog/items/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteItem: (id: string) =>
    request<{ success: boolean }>(`/catalog/items/${id}`, { method: 'DELETE' }),
  uploadPicture: (itemId: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return uploadFile<ServiceItem>(`/catalog/items/${itemId}/picture`, fd);
  },
  deletePicture: (itemId: string) =>
    request<{ success: boolean }>(`/catalog/items/${itemId}/picture`, { method: 'DELETE' }),
  pictureUrl: (itemId: string) => `${BASE}/catalog/items/${itemId}/picture`,
  allItems: () =>
    request<{ items: ServiceItem[] }>('/catalog/items?include_inactive=true'),
  allTasks: () => request<{ tasks: AllCatalogTask[] }>('/catalog/tasks'),
  itemTasks: (itemId: string) => request<{ tasks: CatalogTask[] }>(`/catalog/items/${itemId}/tasks`),
  createItemTask: (itemId: string, data: Partial<CatalogTask>) =>
    request<CatalogTask>(`/catalog/items/${itemId}/tasks`, { method: 'POST', body: JSON.stringify(data) }),
  updateItemTask: (itemId: string, taskId: string, data: Partial<CatalogTask>) =>
    request<CatalogTask>(`/catalog/items/${itemId}/tasks/${taskId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteItemTask: (itemId: string, taskId: string) =>
    request<{ success: boolean }>(`/catalog/items/${itemId}/tasks/${taskId}`, { method: 'DELETE' }),
};
