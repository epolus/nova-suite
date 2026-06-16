/* SPDX-License-Identifier: AGPL-3.0-only */

import { formatDate } from '../../utils/dateTime';

interface TrendChartProps {
  points: { date: string; value: number }[];
  loading?: boolean;
  error?: string;
  accent?: string;
  emptyLabel?: string;
  summaryMode?: 'sum' | 'latest';
  summaryLabel?: string;
}

const CHART_HEIGHT = 120;
const CHART_PADDING = { top: 8, right: 8, bottom: 20, left: 36 };

function buildYTicks(maxValue: number): number[] {
  if (maxValue <= 0) return [0];
  const tickCount = 4;
  const ticks = Array.from({ length: tickCount }, (_, index) =>
    Math.round((maxValue * index) / (tickCount - 1)),
  );
  return [...new Set(ticks)].sort((a, b) => a - b);
}

function formatTickValue(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export default function TrendChart({
  points,
  loading,
  error,
  accent = '#4f46e5',
  emptyLabel = 'No data',
  summaryMode = 'sum',
  summaryLabel,
}: TrendChartProps) {
  if (loading) {
    return <div className="h-full min-h-[120px] animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />;
  }

  if (error) {
    return (
      <div className="flex h-full min-h-[120px] items-center justify-center text-sm text-red-600 dark:text-red-400 px-2 text-center">
        {error}
      </div>
    );
  }

  if (points.length === 0) {
    return (
      <div className="flex h-full min-h-[120px] items-center justify-center text-sm text-gray-400">
        {emptyLabel}
      </div>
    );
  }

  const width = 320;
  const plotLeft = CHART_PADDING.left;
  const plotRight = width - CHART_PADDING.right;
  const plotTop = CHART_PADDING.top;
  const plotBottom = CHART_HEIGHT - CHART_PADDING.bottom;
  const innerW = plotRight - plotLeft;
  const innerH = plotBottom - plotTop;
  const maxValue = Math.max(...points.map((point) => point.value), 1);
  const yTicks = buildYTicks(maxValue);

  const valueToY = (value: number) => plotTop + innerH - (value / maxValue) * innerH;

  const coords = points.map((point, index) => {
    const x = plotLeft + (index / Math.max(points.length - 1, 1)) * innerW;
    const y = valueToY(point.value);
    return { x, y, ...point };
  });

  const linePath = coords.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const areaPath = `${linePath} L ${coords[coords.length - 1]!.x} ${plotBottom} L ${coords[0]!.x} ${plotBottom} Z`;
  const firstLabel = points[0]?.date ? formatDate(points[0].date) : '';
  const lastLabel = points[points.length - 1]?.date ? formatDate(points[points.length - 1]!.date) : '';
  const summaryValue = summaryMode === 'latest'
    ? (points[points.length - 1]?.value ?? 0)
    : points.reduce((sum, point) => sum + point.value, 0);
  const defaultSummaryLabel = summaryMode === 'latest' ? 'current' : 'total';

  return (
    <div className="flex h-full min-h-[120px] flex-col">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 tabular-nums">
        {summaryValue.toLocaleString()} {summaryLabel ?? defaultSummaryLabel}
      </p>
      <svg
        viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
        className="w-full flex-1"
        preserveAspectRatio="none"
        role="img"
        aria-hidden
      >
        {yTicks.map((tick) => {
          const y = valueToY(tick);
          return (
            <g key={tick}>
              <line
                x1={plotLeft}
                y1={y}
                x2={plotRight}
                y2={y}
                className="stroke-gray-200 dark:stroke-gray-700"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={plotLeft - 4}
                y={y + 3}
                textAnchor="end"
                className="fill-gray-400"
                fontSize={8}
              >
                {formatTickValue(tick)}
              </text>
            </g>
          );
        })}
        <path d={areaPath} fill={accent} fillOpacity={0.12} />
        <path d={linePath} fill="none" stroke={accent} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {coords.map((point) => (
          <circle key={point.date} cx={point.x} cy={point.y} r={2.5} fill={accent} />
        ))}
        <text x={plotLeft} y={CHART_HEIGHT - 4} className="fill-gray-400" fontSize={9}>
          {firstLabel}
        </text>
        <text x={plotRight} y={CHART_HEIGHT - 4} textAnchor="end" className="fill-gray-400" fontSize={9}>
          {lastLabel}
        </text>
      </svg>
    </div>
  );
}
