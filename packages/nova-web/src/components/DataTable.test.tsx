/* SPDX-License-Identifier: AGPL-3.0-only */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlProvider } from 'use-intl';
import { describe, expect, it, vi } from 'vitest';
import enMessages from '../i18n/messages/en.json';
import DataTable, { type DataColumnDef } from './DataTable';

type Row = { id: string; name: string };

const columns: DataColumnDef<Row>[] = [
  { key: 'name', label: 'Name', sortable: true, defaultVisible: true, render: (row) => row.name },
];

function renderDataTable(props: Parameters<typeof DataTable<Row>>[0]) {
  return render(
    <IntlProvider locale="en" messages={enMessages}>
      <DataTable {...props} />
    </IntlProvider>,
  );
}

describe('DataTable', () => {
  it('supports row selection and bulk select', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    const rows = [
      { id: '1', name: 'Alpha' },
      { id: '2', name: 'Beta' },
    ];

    renderDataTable({
      columns,
      data: rows,
      visibleColumns: ['name'],
      onColumnsChange: () => {},
      sortKey: '',
      sortDir: 'asc',
      onSort: () => {},
      columnFilters: {},
      onColumnFilter: () => {},
      selectable: true,
      selectedIds: [],
      onSelectionChange,
    });

    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[1]!);
    expect(onSelectionChange).toHaveBeenCalledWith(['1']);
  });
});
