/* SPDX-License-Identifier: AGPL-3.0-only */
import { verticalCompactor, type Layout, type LayoutItem } from 'react-grid-layout';
import type { ReportComponentType } from '@/api/types/reports';

export const REPORT_GRID_COLS = 12;
export const REPORT_GRID_ROW_HEIGHT = 36;
export const REPORT_GRID_MARGIN: [number, number] = [16, 16];

export interface ReportWidgetBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface SizeLimits {
  w: number;
  h: number;
  minW: number;
  minH: number;
  maxH: number;
}

const SIZE_BY_TYPE: Record<ReportComponentType, SizeLimits> = {
  kpi: { w: 6, h: 4, minW: 3, minH: 3, maxH: 10 },
  bar_chart: { w: 6, h: 8, minW: 4, minH: 5, maxH: 20 },
  pie_chart: { w: 6, h: 8, minW: 4, minH: 5, maxH: 20 },
  table: { w: 6, h: 10, minW: 4, minH: 5, maxH: 28 },
};

export interface ReportViewerLayoutStore {
  byId: Record<string, ReportWidgetBox[]>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function isBox(value: unknown): value is ReportWidgetBox {
  if (!value || typeof value !== 'object') return false;
  const box = value as Partial<ReportWidgetBox>;
  return typeof box.id === 'string'
    && Number.isFinite(box.x)
    && Number.isFinite(box.y)
    && Number.isFinite(box.w)
    && Number.isFinite(box.h);
}

export function componentWidgetId(component: { id?: string | null }, index: number): string {
  if (typeof component.id === 'string' && component.id.trim()) return component.id.trim();
  return `widget-${index}`;
}

export function savedBoxesForReport(stored: unknown, reportId: string): ReportWidgetBox[] | undefined {
  if (!stored || typeof stored !== 'object') return undefined;
  const byId = (stored as { byId?: unknown }).byId;
  if (!byId || typeof byId !== 'object') return undefined;
  const items = (byId as Record<string, unknown>)[reportId];
  if (!Array.isArray(items)) return undefined;
  const boxes = items.filter(isBox);
  return boxes.length > 0 ? boxes : undefined;
}

function defaultBoxes(components: Array<{ id: string; type: ReportComponentType }>): ReportWidgetBox[] {
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  return components.map((component) => {
    const size = SIZE_BY_TYPE[component.type];
    if (x + size.w > REPORT_GRID_COLS) {
      y += rowHeight;
      x = 0;
      rowHeight = 0;
    }
    const box: ReportWidgetBox = { id: component.id, x, y, w: size.w, h: size.h };
    x += size.w;
    rowHeight = Math.max(rowHeight, size.h);
    return box;
  });
}

export function resolveReportLayout(
  components: Array<{ id: string; type: ReportComponentType }>,
  saved: ReportWidgetBox[] | undefined,
): ReportWidgetBox[] {
  const defaults = defaultBoxes(components);
  const byId = new Map((saved ?? []).map((box) => [box.id, box]));
  const merged = defaults.map((fallback) => {
    const stored = byId.get(fallback.id);
    const component = components.find((entry) => entry.id === fallback.id);
    if (!stored || !component) return fallback;
    const limits = SIZE_BY_TYPE[component.type];
    const w = clamp(stored.w, limits.minW, REPORT_GRID_COLS);
    const h = clamp(stored.h, limits.minH, limits.maxH);
    return {
      id: fallback.id,
      x: clamp(stored.x, 0, REPORT_GRID_COLS - w),
      y: clamp(stored.y, 0, 400),
      w,
      h,
    };
  });
  const compacted = verticalCompactor.compact(
    merged.map((box) => ({ i: box.id, x: box.x, y: box.y, w: box.w, h: box.h })),
    REPORT_GRID_COLS,
  );
  const compactedById = new Map(compacted.map((item) => [item.i, item]));
  return merged.map((box) => {
    const item = compactedById.get(box.id);
    return item ? { id: box.id, x: item.x, y: item.y, w: item.w, h: item.h } : box;
  });
}

export function toReportGridLayout(
  components: Array<{ id: string; type: ReportComponentType }>,
  boxes: ReportWidgetBox[],
): Layout {
  const typeById = new Map(components.map((component) => [component.id, component.type]));
  return boxes.map((box) => {
    const limits = SIZE_BY_TYPE[typeById.get(box.id) ?? 'kpi'];
    return {
      i: box.id,
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      minW: limits.minW,
      minH: limits.minH,
      maxW: REPORT_GRID_COLS,
      maxH: limits.maxH,
    } satisfies LayoutItem;
  });
}

export function boxesFromGridLayout(layout: Layout): ReportWidgetBox[] {
  return layout.map((item) => ({
    id: item.i,
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h,
  }));
}

export function sameBoxes(left: ReportWidgetBox[], right: ReportWidgetBox[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((box, index) => {
    const other = right[index];
    return !!other
      && box.id === other.id
      && box.x === other.x
      && box.y === other.y
      && box.w === other.w
      && box.h === other.h;
  });
}
