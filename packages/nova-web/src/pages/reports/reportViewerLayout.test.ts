/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { componentWidgetId, resolveReportLayout, savedBoxesForReport } from './reportViewerLayout';

describe('resolveReportLayout', () => {
  const components = [
    { id: 'kpi', type: 'kpi' as const },
    { id: 'chart', type: 'bar_chart' as const },
  ];

  it('places widgets side by side at the default size', () => {
    expect(resolveReportLayout(components, undefined)).toEqual([
      { id: 'kpi', x: 0, y: 0, w: 6, h: 4 },
      { id: 'chart', x: 6, y: 0, w: 6, h: 8 },
    ]);
  });

  it('keeps a saved size and drops widgets that are no longer on the report', () => {
    const resolved = resolveReportLayout(components, [
      { id: 'kpi', x: 0, y: 0, w: 12, h: 6 },
      { id: 'removed', x: 0, y: 8, w: 6, h: 8 },
    ]);
    expect(resolved).toEqual([
      { id: 'kpi', x: 0, y: 0, w: 12, h: 6 },
      { id: 'chart', x: 6, y: 6, w: 6, h: 8 },
    ]);
  });

  it('uses the component id, or a stable index when the report has none', () => {
    expect(componentWidgetId({ id: 'abc' }, 2)).toBe('abc');
    expect(componentWidgetId({ id: '  ' }, 2)).toBe('widget-2');
    expect(componentWidgetId({}, 1)).toBe('widget-1');
  });

  it('reads boxes for one report from the preference store', () => {
    const boxes = [{ id: 'kpi', x: 1, y: 2, w: 4, h: 5 }];
    expect(savedBoxesForReport({ byId: { 'report-1': boxes } }, 'report-1')).toEqual(boxes);
    expect(savedBoxesForReport({ byId: {} }, 'report-1')).toBeUndefined();
    expect(savedBoxesForReport(null, 'report-1')).toBeUndefined();
  });
});
