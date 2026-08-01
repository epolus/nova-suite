/* SPDX-License-Identifier: AGPL-3.0-only */
import { request } from '../http';
import type { CartPriority, CartState } from '../types';

export const cart = {
  get: () => request<CartState>('/cart'),
  addItem: (payload: { service_item_id: string; form_data?: Record<string, unknown>; priority?: CartPriority; notes?: string }) =>
    request<CartState>('/cart/items', { method: 'POST', body: JSON.stringify(payload) }),
  updateItem: (id: string, payload: { form_data?: Record<string, unknown>; priority?: CartPriority; notes?: string }) =>
    request<CartState>(`/cart/items/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  removeItem: (id: string) => request<CartState>(`/cart/items/${id}`, { method: 'DELETE' }),
  clear: () => request<CartState>('/cart', { method: 'DELETE' }),
};
