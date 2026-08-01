/* SPDX-License-Identifier: AGPL-3.0-only */
import { createContext, useContext } from 'react';
import type { ServiceItem, CartItem } from '../api/client';

export type { CartItem };

export interface CartContextValue {
  items: CartItem[];
  cartCount: number;
  cartTotal: number;
  addItem: (serviceItem: ServiceItem, formData?: Record<string, unknown>, priority?: CartItem['priority'], notes?: string) => void;
  removeItem: (id: string) => void;
  updateItem: (id: string, updates: Partial<Pick<CartItem, 'formData' | 'priority' | 'notes'>>) => void;
  clearCart: () => void;
}

export const CartContext = createContext<CartContextValue | undefined>(undefined);

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
