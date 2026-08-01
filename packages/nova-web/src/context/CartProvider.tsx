/* SPDX-License-Identifier: AGPL-3.0-only */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { ServiceItem, CartItem } from '../api/client';
import { cart as cartApi } from '../api/client';
import { useAuth } from './AuthContext';
import { CartContext } from './CartContext';

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [cartCount, setCartCount] = useState(0);
  const [cartTotal, setCartTotal] = useState(0);

  const refreshCart = useCallback(() => {
    if (!user) {
      setItems([]);
      setCartCount(0);
      setCartTotal(0);
      return;
    }

    cartApi
      .get()
      .then((res) => {
        setItems(res.items);
        setCartCount(res.cartCount);
        setCartTotal(res.cartTotal);
      })
      .catch(() => {
        // If cart fetch fails for any reason, keep UI consistent.
        setItems([]);
        setCartCount(0);
        setCartTotal(0);
      });
  }, [user]);

  useEffect(() => {
    refreshCart();
  }, [refreshCart]);

  const addItem = useCallback(
    (
      serviceItem: ServiceItem,
      formData: Record<string, unknown> = {},
      priority: CartItem['priority'] = 'medium',
      notes = '',
    ) => {
      if (!user) return;
      cartApi
        .addItem({
          service_item_id: serviceItem.id,
          form_data: formData,
          priority,
          notes,
        })
        .then((res) => {
          setItems(res.items);
          setCartCount(res.cartCount);
          setCartTotal(res.cartTotal);
        })
        .catch(() => undefined);
    },
    [user],
  );

  const removeItem = useCallback(
    (id: string) => {
      if (!user) return;
      cartApi
        .removeItem(id)
        .then((res) => {
          setItems(res.items);
          setCartCount(res.cartCount);
          setCartTotal(res.cartTotal);
        })
        .catch(() => undefined);
    },
    [user],
  );

  const updateItem = useCallback(
    (id: string, updates: Partial<Pick<CartItem, 'formData' | 'priority' | 'notes'>>) => {
      if (!user) return;
      cartApi
        .updateItem(id, updates)
        .then((res) => {
          setItems(res.items);
          setCartCount(res.cartCount);
          setCartTotal(res.cartTotal);
        })
        .catch(() => undefined);
    },
    [user],
  );

  const clearCart = useCallback(() => {
    if (!user) return;
    cartApi
      .clear()
      .then((res) => {
        setItems(res.items);
        setCartCount(res.cartCount);
        setCartTotal(res.cartTotal);
      })
      .catch(() => {
        setItems([]);
        setCartCount(0);
        setCartTotal(0);
      });
  }, [user]);

  const value = useMemo(
    () => ({ items, cartCount, cartTotal, addItem, removeItem, updateItem, clearCart }),
    [items, cartCount, cartTotal, addItem, removeItem, updateItem, clearCart],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
