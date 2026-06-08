/* SPDX-License-Identifier: AGPL-3.0-only */
import { createContext, useContext } from 'react';
import type { User } from '../api/client';

export interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  setTimeFormat: (timeFormat: '12h' | '24h') => Promise<void>;
  setDateFormat: (dateFormat: 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD') => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
