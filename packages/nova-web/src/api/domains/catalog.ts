/* SPDX-License-Identifier: AGPL-3.0-only */
import type {
  CreateCategoryInput,
  CreateServiceItemInput,
  FulfillmentModelUpdateInput,
  FulfillmentModelWriteInput,
  UpdateCategoryInput,
  UpdateServiceItemInput,
} from '@nova-suite/shared/schemas';
import { request, uploadFile, BASE } from '../http';
import type { AllCatalogTask, CatalogTask, Category, FulfillmentModel, ServiceItem } from '../types';

export const catalog = {
  categories: (options?: { includeInactive?: boolean }) =>
    request<{ categories: Category[] }>(
      `/catalog/categories${options?.includeInactive ? '?include_inactive=true' : ''}`,
    ),
  createCategory: (data: CreateCategoryInput) =>
    request<Category>('/catalog/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateCategory: (id: string, data: UpdateCategoryInput) =>
    request<Category>(`/catalog/categories/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  items: (categoryId?: string) =>
    request<{ items: ServiceItem[] }>(
      `/catalog/items${categoryId ? `?category_id=${categoryId}` : ''}`,
    ),
  item: (id: string) => request<ServiceItem>(`/catalog/items/${id}`),
  createItem: (data: CreateServiceItemInput) =>
    request<ServiceItem>('/catalog/items', { method: 'POST', body: JSON.stringify(data) }),
  updateItem: (id: string, data: UpdateServiceItemInput) =>
    request<ServiceItem>(`/catalog/items/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteItem: (id: string, options?: { permanent?: boolean }) =>
    request<{ success: boolean; deleted_tasks?: number; error?: string }>(
      `/catalog/items/${id}${options?.permanent ? '?permanent=true' : ''}`,
      { method: 'DELETE' },
    ),
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
  locations: () => request<{ locations: { id: string; name: string; city: string | null; is_active: boolean }[] }>('/catalog/locations'),
  itemTasks: (itemId: string) => request<{ tasks: CatalogTask[] }>(`/catalog/items/${itemId}/tasks`),
  createItemTask: (itemId: string, data: Partial<CatalogTask>) =>
    request<CatalogTask>(`/catalog/items/${itemId}/tasks`, { method: 'POST', body: JSON.stringify(data) }),
  updateItemTask: (itemId: string, taskId: string, data: Partial<CatalogTask>) =>
    request<CatalogTask>(`/catalog/items/${itemId}/tasks/${taskId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteItemTask: (itemId: string, taskId: string) =>
    request<{ success: boolean }>(`/catalog/items/${itemId}/tasks/${taskId}`, { method: 'DELETE' }),
  fulfillmentModels: () => request<{ fulfillment_models: FulfillmentModel[] }>('/catalog/fulfillment-models'),
  fulfillmentModel: (id: string) => request<FulfillmentModel>(`/catalog/fulfillment-models/${id}`),
  createFulfillmentModel: (data: FulfillmentModelWriteInput) =>
    request<FulfillmentModel>('/catalog/fulfillment-models', { method: 'POST', body: JSON.stringify(data) }),
  updateFulfillmentModel: (id: string, data: FulfillmentModelUpdateInput) =>
    request<FulfillmentModel>(`/catalog/fulfillment-models/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteFulfillmentModel: (id: string) =>
    request<{ success: boolean }>(`/catalog/fulfillment-models/${id}`, { method: 'DELETE' }),
};
