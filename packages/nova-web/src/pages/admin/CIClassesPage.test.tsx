/* SPDX-License-Identifier: AGPL-3.0-only */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlProvider } from 'use-intl';
import enMessages from '../../i18n/messages/en.json';
import type { CIClass } from '../../api/client';
import CIClassesPage from './CIClassesPage';

const mockClasses = vi.fn();
const mockUpdateClass = vi.fn();

vi.mock('../../api/client', () => ({
  cmdb: {
    classes: (...args: unknown[]) => mockClasses(...args),
    updateClass: (...args: unknown[]) => mockUpdateClass(...args),
    createClass: vi.fn(),
    deleteClass: vi.fn(),
  },
}));

const hardware: CIClass = {
  id: 'hw',
  name: 'hardware',
  display_name: 'Hardware',
  description: 'Physical equipment',
  parent_class: null,
  attributes: { serial_number: { type: 'string' } },
  icon: 'server',
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const server: CIClass = {
  id: 'srv',
  name: 'server',
  display_name: 'Server',
  description: 'A server',
  parent_class: 'hw',
  attributes: { ip_address: { type: 'string' } },
  icon: 'server',
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const legacy: CIClass = {
  ...hardware,
  id: 'old',
  name: 'legacy',
  display_name: 'Legacy',
  description: 'Retired type',
  parent_class: null,
  attributes: {},
  is_active: false,
};

function renderPage() {
  return render(
    <IntlProvider locale="en" messages={enMessages}>
      <CIClassesPage />
    </IntlProvider>,
  );
}

describe('CIClassesPage hierarchy', () => {
  beforeEach(() => {
    mockClasses.mockReset();
    mockUpdateClass.mockReset();
    mockClasses.mockResolvedValue({ classes: [server, hardware, legacy] });
    mockUpdateClass.mockResolvedValue({});
  });

  it('shows which class is a child and which classes are inactive', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Child of Hardware')).toBeInTheDocument();
    expect(screen.getByText('1 child')).toBeInTheDocument();
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Inactive').length).toBeGreaterThan(1);

    await user.click(screen.getByRole('button', { name: 'Collapse all' }));
    expect(screen.getByText('Children')).toBeInTheDocument();
    expect(screen.getAllByText('Server').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Inactive' }));
    expect(screen.getByText('Legacy')).toBeInTheDocument();
    expect(screen.queryByText('Child of Hardware')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'All' }));
    await user.click(screen.getAllByRole('button', { name: 'Deactivate' })[0]!);
    expect(mockUpdateClass).toHaveBeenCalledWith('hw', { is_active: false });
  });
});
