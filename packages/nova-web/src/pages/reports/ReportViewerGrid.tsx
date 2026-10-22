/* SPDX-License-Identifier: AGPL-3.0-only */
import { useMemo, type ReactNode, type RefObject } from 'react';
import { GridLayout, useContainerWidth, verticalCompactor } from 'react-grid-layout';
import type { ReportComponentConfig, ReportComponentResult } from '@/api/types/reports';
import {
  REPORT_GRID_COLS,
  REPORT_GRID_MARGIN,
  REPORT_GRID_ROW_HEIGHT,
  boxesFromGridLayout,
  toReportGridLayout,
  type ReportWidgetBox,
} from './reportViewerLayout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import './report-viewer-grid.css';

interface Props {
  items: Array<{ component: ReportComponentConfig; result: ReportComponentResult }>;
  boxes: ReportWidgetBox[];
  arranging: boolean;
  onBoxesChange: (boxes: ReportWidgetBox[]) => void;
  onBoxesCommit: (boxes: ReportWidgetBox[]) => void;
  renderItem: (item: { component: ReportComponentConfig; result: ReportComponentResult }) => ReactNode;
}

export default function ReportViewerGrid({
  items,
  boxes,
  arranging,
  onBoxesChange,
  onBoxesCommit,
  renderItem,
}: Props) {
  const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true });
  const components = useMemo(
    () => items.map((item) => ({ id: item.component.id, type: item.component.type })),
    [items],
  );
  const layout = useMemo(() => toReportGridLayout(components, boxes), [components, boxes]);

  return (
    <div
      ref={containerRef as RefObject<HTMLDivElement>}
      className={`report-viewer-grid${arranging ? ' report-viewer-grid--arranging' : ''}`}
    >
      {mounted && width > 0 && (
        <GridLayout
          width={width}
          layout={layout}
          gridConfig={{
            cols: REPORT_GRID_COLS,
            rowHeight: REPORT_GRID_ROW_HEIGHT,
            margin: REPORT_GRID_MARGIN,
            containerPadding: [0, 0],
          }}
          compactor={verticalCompactor}
          dragConfig={{
            enabled: arranging,
            handle: '.report-widget-handle',
            cancel: 'button, select, a, input, textarea',
          }}
          resizeConfig={{ enabled: arranging }}
          onLayoutChange={arranging ? (next) => onBoxesChange(boxesFromGridLayout(next)) : undefined}
          onDragStop={arranging ? (next) => onBoxesCommit(boxesFromGridLayout(next)) : undefined}
          onResizeStop={arranging ? (next) => onBoxesCommit(boxesFromGridLayout(next)) : undefined}
        >
          {items.map((item) => (
            <div key={item.component.id} className="h-full">
              {renderItem(item)}
            </div>
          ))}
        </GridLayout>
      )}
    </div>
  );
}
