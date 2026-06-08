/* SPDX-License-Identifier: AGPL-3.0-only */
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { queryClient } from '@/lib/queryClient';
import { AuthProvider } from '@/context/AuthProvider';
import { CartProvider } from '@/context/CartProvider';
import { ThemeProvider } from '@/context/ThemeProvider';
import { LocaleProvider } from '@/context/LocaleProvider';
import DarkModePreferenceSync from '@/components/DarkModePreferenceSync';
import LocalePreferenceSync from '@/components/LocalePreferenceSync';
import AppRoutes from '@/routes/AppRoutes';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider>
          <LocaleProvider>
            <AuthProvider>
              <LocalePreferenceSync />
              <DarkModePreferenceSync />
              <CartProvider>
                <AppRoutes />
              </CartProvider>
            </AuthProvider>
          </LocaleProvider>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
