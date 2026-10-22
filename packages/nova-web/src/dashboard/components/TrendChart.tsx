/* SPDX-License-Identifier: AGPL-3.0-only */
import { useId } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { formatDate } from '../../utils/dateTime';

interface TrendChartProps {
  points: { date: string; value: number }[];
  loading?: boolean;
  error?: string;
  emptyLabel?: string;
  summaryMode?: 'sum' | 'latest';
  summaryLabel?: string;
  seriesLabel?: string;
}

function formatTrendDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return formatDate(value);
  return formatDate(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

export default function TrendChart({
  points,
  loading,
  error,
  emptyLabel = 'No data',
  summaryMode = 'sum',
  summaryLabel,
  seriesLabel,
}: TrendChartProps) {
  const gradientId = useId().replace(/:/g, '');
  const chartConfig = {
    value: {
      label: seriesLabel || summaryLabel || (summaryMode === 'latest' ? 'current' : 'total'),
      color: 'var(--chart-1)',
    },
  } satisfies ChartConfig;

  if (loading) {
    return <div className="h-full min-h-[120px] animate-pulse rounded-lg bg-muted" />;
  }

  if (error) {
    return (
      <div className="flex h-full min-h-[120px] items-center justify-center px-2 text-center text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (points.length === 0) {
    return (
      <div className="flex h-full min-h-[120px] items-center justify-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  const summaryValue = summaryMode === 'latest'
    ? (points[points.length - 1]?.value ?? 0)
    : points.reduce((sum, point) => sum + point.value, 0);
  const defaultSummaryLabel = summaryMode === 'latest' ? 'current' : 'total';

  return (
    <div className="flex h-full min-h-[120px] flex-col">
      <p className="mb-1 shrink-0 text-xs tabular-nums text-muted-foreground">
        {summaryValue.toLocaleString()} {summaryLabel ?? defaultSummaryLabel}
      </p>
      <ChartContainer config={chartConfig} className="aspect-auto min-h-0 w-full flex-1">
        <AreaChart data={points} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.8} />
              <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={28}
            tickFormatter={formatTrendDate}
          />
          <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} />
          <ChartTooltip
            content={(
              <ChartTooltipContent
                labelFormatter={(_label, payload) => {
                  const date = payload?.[0]?.payload?.date;
                  return typeof date === 'string' ? formatTrendDate(date) : '';
                }}
              />
            )}
          />
          <Area
            dataKey="value"
            type="natural"
            fill={`url(#${gradientId})`}
            stroke="var(--color-value)"
            strokeWidth={2}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}
