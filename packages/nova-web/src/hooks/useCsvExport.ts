/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState } from 'react';
import { downloadBlob } from '@/utils/download';

type Page<T> = { rows: T[]; pages: number };

function csvCell(value: unknown): string {
  const str = String(value ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/** Exports the selected rows, or every page of the current query when nothing is selected. */
export function useCsvExport(name: string) {
  const [exporting, setExporting] = useState(false);

  const exportCsv = async <T extends { id: string }>(
    headers: readonly NoInfer<keyof T & string>[],
    selectedIds: string[],
    pageRows: T[],
    fetchPage: (page: number) => Promise<Page<T>>,
  ) => {
    setExporting(true);
    try {
      let rows = pageRows.filter((row) => selectedIds.includes(row.id));
      if (selectedIds.length === 0) {
        const first = await fetchPage(1);
        rows = [...first.rows];
        for (let page = 2; page <= first.pages; page += 1) {
          rows.push(...(await fetchPage(page)).rows);
        }
      }
      const lines = [headers.join(','), ...rows.map((row) => headers.map((h) => csvCell(row[h])).join(','))];
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      downloadBlob(
        new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' }),
        `${name}${selectedIds.length > 0 ? '-selected' : ''}-${ts}.csv`,
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  };

  return { exporting, exportCsv };
}
