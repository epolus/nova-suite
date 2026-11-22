/* SPDX-License-Identifier: AGPL-3.0-only */
import { Navigate, Outlet } from 'react-router';
import { useAuth } from '../context/AuthContext';
import Spinner from './Spinner';

/** Blocks unauthenticated access; used around the signed-in app shell. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** Client-side mirror of the API role checks, so users are not dropped onto pages that only return 403s. */
export function RoleGate({ allow }: { allow: (roles: string[] | undefined) => boolean }) {
  const { user } = useAuth();
  if (!allow(user?.roles)) return <Navigate to="/" replace />;
  return <Outlet />;
}
