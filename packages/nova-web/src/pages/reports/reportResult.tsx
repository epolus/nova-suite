/* SPDX-License-Identifier: AGPL-3.0-only */
import type { ReactNode } from 'react';
import { GripVertical } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from 'recharts';
import { cn } from '@/components/ui/utils';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ReportComponentConfig, ReportComponentResult, ReportDatasetKey } from '../../api/client';
import { DATASET_LABELS } from './reportBuilderConfig';
import { ReportTypeIcon } from './reportIcons';

const CHART_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

type ChartPoint = Extract<ReportComponentResult, { type: 'bar_chart' | 'pie_chart' }>['points'][number];

type ChartRow = ChartPoint & { key: string; fill: string };

function datasetBasePath(dataset: ReportDatasetKey): string {
  if (dataset === 'incidents') return '/incidents';
  if (dataset === 'changes') return '/changes';
  return '/requests';
}

function rowDetailPath(dataset: ReportDatasetKey, row: Record<string, unknown>): string | null {
  const idValue = row._row_id;
  if (typeof idValue === 'string' && idValue.length > 0) {
    return `${datasetBasePath(dataset)}/${idValue}`;
  }
  return null;
}

function chartFilterPath(dataset: ReportDatasetKey, groupBy: string, value: string | number | boolean | null): string {
  const qs = new URLSearchParams();
  if (value !== null && value !== undefined) {
    qs.set(`cf.${groupBy}`, String(value));
  }
  return `${datasetBasePath(dataset)}?${qs.toString()}`;
}

function chartRows(points: ChartPoint[]): ChartRow[] {
  return points.map((point, index) => ({
    ...point,
    key: `slice${index}`,
    fill: `var(--color-slice${index})`,
  }));
}

function chartConfig(points: ChartPoint[], seriesLabel: string): ChartConfig {
  const config: ChartConfig = {
    value: { label: seriesLabel },
  };
  points.forEach((point, index) => {
    config[`slice${index}`] = {
      label: point.label,
      color: CHART_COLORS[index % CHART_COLORS.length],
    };
  });
  return config;
}

function barPayload(entry: unknown): ChartRow | null {
  if (!entry || typeof entry !== 'object' || !('payload' in entry)) return null;
  const payload = (entry as { payload?: ChartRow }).payload;
  return payload ?? null;
}

function ReportWidgetFrame({
  dataset,
  type,
  title,
  arranging,
  bordered,
  contentClassName,
  children,
}: {
  dataset: ReportDatasetKey;
  type: ReportComponentConfig['type'];
  title: string;
  arranging: boolean;
  bordered?: boolean;
  contentClassName: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn('flex h-full flex-col overflow-hidden', arranging && 'ring-2 ring-indigo-400/50 shadow-md')}>
      <CardHeader
        className={cn(
          'shrink-0 space-y-1 p-4',
          bordered && 'border-b',
          arranging && 'report-widget-handle cursor-grab bg-muted/60 active:cursor-grabbing',
        )}
      >
        <CardDescription className="text-xs uppercase tracking-wide">{DATASET_LABELS[dataset]}</CardDescription>
        <CardTitle className="flex items-center gap-2 text-sm">
          {arranging && <GripVertical className="size-4 shrink-0 text-muted-foreground" />}
          <ReportTypeIcon type={type} className="size-4 shrink-0 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className={contentClassName}>
        {children}
      </CardContent>
    </Card>
  );
}

function ReportBarChart({
  points,
  seriesLabel,
  onOpen,
}: {
  points: ChartPoint[];
  seriesLabel: string;
  onOpen?: (point: ChartPoint) => void;
}) {
  const rows = chartRows(points);
  return (
    <ChartContainer
      config={chartConfig(points, seriesLabel)}
      className="aspect-auto w-full min-h-[160px]"
      style={{ height: Math.max(160, rows.length * 32) }}
    >
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 12, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="label"
          tickLine={false}
          axisLine={false}
          width={108}
          tickFormatter={(value: string) => (value.length > 16 ? `${value.slice(0, 16)}…` : value)}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar
          dataKey="value"
          radius={4}
          cursor={onOpen ? 'pointer' : undefined}
          onClick={(entry) => {
            const point = barPayload(entry);
            if (point && onOpen) onOpen(point);
          }}
        >
          {rows.map((row) => (
            <Cell key={row.key} fill={row.fill} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

function ReportPieChart({
  points,
  seriesLabel,
  onOpen,
}: {
  points: ChartPoint[];
  seriesLabel: string;
  onOpen?: (point: ChartPoint) => void;
}) {
  const rows = chartRows(points);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <ChartContainer config={chartConfig(points, seriesLabel)} className="aspect-auto min-h-[180px] w-full flex-1">
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent nameKey="key" />} />
          <Pie
            data={rows}
            dataKey="value"
            nameKey="key"
            innerRadius="45%"
            strokeWidth={2}
            cursor={onOpen ? 'pointer' : undefined}
            onClick={(_entry, index) => {
              const point = rows[index];
              if (point && onOpen) onOpen(point);
            }}
          >
            {rows.map((row) => (
              <Cell key={row.key} fill={row.fill} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      <div className="flex flex-wrap gap-1">
        {rows.map((row, index) => (
          <Button
            key={row.key}
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => onOpen?.(row)}
          >
            <span
              className="size-2 rounded-[2px]"
              style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
            />
            <span className="max-w-32 truncate">{row.label}</span>
            <span className="tabular-nums text-muted-foreground">{row.value}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}

export function ReportResultCard({
  component,
  result,
  arranging = false,
  onOpenPath,
}: {
  component: ReportComponentConfig;
  result: ReportComponentResult;
  arranging?: boolean;
  onOpenPath: (path: string) => void;
}) {
  const t = useTranslations('pages.reports');
  const tTable = useTranslations('common.table');
  const title = component.title || (
    result.type === 'kpi' ? t('kpiFallback') : result.type === 'table' ? t('tableFallback') : t('chartFallback')
  );

  const openPoint = (point: ChartPoint) => {
    if (arranging || (result.type !== 'bar_chart' && result.type !== 'pie_chart')) return;
    onOpenPath(chartFilterPath(result.dataset, result.group_by, point.raw_label));
  };

  if (result.type === 'kpi') {
    return (
      <ReportWidgetFrame dataset={result.dataset} type="kpi" title={title} arranging={arranging} contentClassName="flex min-h-0 flex-1 flex-col p-4 pt-0">
        <p className="text-3xl font-bold tabular-nums text-primary">{result.value ?? tTable('emDash')}</p>
      </ReportWidgetFrame>
    );
  }

  if (result.type === 'bar_chart') {
    return (
      <ReportWidgetFrame dataset={result.dataset} type="bar_chart" title={title} arranging={arranging} contentClassName="flex min-h-0 flex-1 flex-col p-4 pt-0">
        {result.points.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noChartData')}</p>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <ReportBarChart points={result.points} seriesLabel={title} onOpen={arranging ? undefined : openPoint} />
          </div>
        )}
      </ReportWidgetFrame>
    );
  }

  if (result.type === 'pie_chart') {
    return (
      <ReportWidgetFrame dataset={result.dataset} type="pie_chart" title={title} arranging={arranging} contentClassName="flex min-h-0 flex-1 flex-col p-4 pt-0">
        {result.points.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noChartData')}</p>
        ) : (
          <ReportPieChart points={result.points} seriesLabel={title} onOpen={arranging ? undefined : openPoint} />
        )}
      </ReportWidgetFrame>
    );
  }

  if (result.type !== 'table') return null;
  const columns = result.rows.length > 0
    ? Object.keys(result.rows[0] || {}).filter((column) => column !== '_row_id')
    : component.type === 'table' ? component.columns : [];

  return (
    <ReportWidgetFrame
      dataset={result.dataset}
      type="table"
      title={title}
      arranging={arranging}
      bordered
      contentClassName="min-h-0 flex-1 overflow-auto p-0"
    >
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column}>{column}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows.map((row, index) => {
              const path = rowDetailPath(result.dataset, row);
              return (
                <TableRow
                  key={index}
                  className={path && !arranging ? 'cursor-pointer' : undefined}
                  onClick={() => {
                    if (path && !arranging) onOpenPath(path);
                  }}
                >
                  {columns.map((column) => (
                    <TableCell key={column}>{String(row[column] ?? tTable('emDash'))}</TableCell>
                  ))}
                </TableRow>
              );
            })}
            {result.rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={Math.max(columns.length, 1)} className="text-muted-foreground">
                  {t('noDataReturned')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
    </ReportWidgetFrame>
  );
}

export function ReportResultPreview({ result }: { result: ReportComponentResult }) {
  const t = useTranslations('pages.reports');
  const tTable = useTranslations('common.table');
  if (result.type === 'kpi') {
    return <p className="text-3xl font-bold tabular-nums text-primary">{result.value ?? tTable('emDash')}</p>;
  }
  if (result.type === 'bar_chart') {
    if (result.points.length === 0) return <p className="text-xs text-muted-foreground">{t('noChartData')}</p>;
    return <ReportBarChart points={result.points} seriesLabel={t('chartFallback')} />;
  }
  if (result.type === 'pie_chart') {
    if (result.points.length === 0) return <p className="text-xs text-muted-foreground">{t('noChartData')}</p>;
    return <ReportPieChart points={result.points} seriesLabel={t('chartFallback')} />;
  }
  if (result.type !== 'table') return null;
  return <p className="text-xs text-muted-foreground">{t('rowCount', { count: result.row_count })}</p>;
}
