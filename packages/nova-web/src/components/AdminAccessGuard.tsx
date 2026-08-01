/* SPDX-License-Identifier: AGPL-3.0-only */
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Spinner from './Spinner';
import { canAccessAdminRoute } from '../utils/adminRouteAccess';

/** Blocks /admin/* when the user lacks the roles required for that area (matches API behavior). */
export default function AdminAccessGuard() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();

  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (!canAccessAdminRoute(pathname, user.roles)) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
