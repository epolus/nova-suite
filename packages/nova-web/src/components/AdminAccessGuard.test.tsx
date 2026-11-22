/* SPDX-License-Identifier: AGPL-3.0-only */
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminAccessGuard from './AdminAccessGuard';

const authState = vi.hoisted(() => ({
  user: null as null | { id: string; roles: string[] },
  loading: false,
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: authState.user,
    loading: authState.loading,
  }),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<div>home</div>} />
        <Route path="/login" element={<div>login</div>} />
        <Route path="/admin" element={<AdminAccessGuard />}>
          <Route path="users" element={<div>admin-users</div>} />
          <Route path="categories" element={<div>admin-categories</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AdminAccessGuard', () => {
  beforeEach(() => {
    authState.user = null;
    authState.loading = false;
  });

  it('redirects anonymous users to login', () => {
    renderAt('/admin/users');
    expect(screen.getByText('login')).toBeInTheDocument();
  });

  it('redirects users without admin access to home', () => {
    authState.user = { id: 'u1', roles: ['user'] };
    renderAt('/admin/users');
    expect(screen.getByText('home')).toBeInTheDocument();
  });

  it('renders the outlet for admins', () => {
    authState.user = { id: 'u1', roles: ['admin'] };
    renderAt('/admin/users');
    expect(screen.getByText('admin-users')).toBeInTheDocument();
  });

  it('allows catalog designers into catalog admin routes', () => {
    authState.user = { id: 'u1', roles: ['catalog_designer'] };
    renderAt('/admin/categories');
    expect(screen.getByText('admin-categories')).toBeInTheDocument();
  });
});
