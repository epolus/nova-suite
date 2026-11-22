/* SPDX-License-Identifier: AGPL-3.0-only */
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequireAuth, RoleGate } from './RouteGuards';

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

describe('RequireAuth', () => {
  beforeEach(() => {
    authState.user = null;
    authState.loading = false;
  });

  it('shows a spinner while auth is loading', () => {
    authState.loading = true;
    const { container } = render(
      <MemoryRouter>
        <RequireAuth>
          <div>secret</div>
        </RequireAuth>
      </MemoryRouter>,
    );
    expect(screen.queryByText('secret')).toBeNull();
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('redirects anonymous users to login', () => {
    render(
      <MemoryRouter initialEntries={['/private']}>
        <Routes>
          <Route path="/login" element={<div>login</div>} />
          <Route
            path="/private"
            element={(
              <RequireAuth>
                <div>secret</div>
              </RequireAuth>
            )}
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('login')).toBeInTheDocument();
  });

  it('renders children for signed-in users', () => {
    authState.user = { id: 'u1', roles: ['user'] };
    render(
      <MemoryRouter>
        <RequireAuth>
          <div>secret</div>
        </RequireAuth>
      </MemoryRouter>,
    );
    expect(screen.getByText('secret')).toBeInTheDocument();
  });
});

describe('RoleGate', () => {
  beforeEach(() => {
    authState.user = null;
    authState.loading = false;
  });

  function renderGate(allow: (roles: string[] | undefined) => boolean) {
    return render(
      <MemoryRouter initialEntries={['/gated']}>
        <Routes>
          <Route path="/" element={<div>home</div>} />
          <Route element={<RoleGate allow={allow} />}>
            <Route path="/gated" element={<div>gated-ok</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
  }

  it('redirects when the allow predicate fails', () => {
    authState.user = { id: 'u1', roles: ['user'] };
    renderGate((roles) => (roles ?? []).includes('fulfiller'));
    expect(screen.getByText('home')).toBeInTheDocument();
  });

  it('renders the outlet when the allow predicate passes', () => {
    authState.user = { id: 'u1', roles: ['fulfiller'] };
    renderGate((roles) => (roles ?? []).includes('fulfiller'));
    expect(screen.getByText('gated-ok')).toBeInTheDocument();
  });
});
