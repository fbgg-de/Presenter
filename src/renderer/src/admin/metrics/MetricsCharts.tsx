import { alpha, Box, Typography, useTheme } from '@mui/material';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useI18nContext } from '@/i18n/i18n-react';
import type { MetricCount, MetricsSummary } from '@/api/metrics.api';
import { MetricsChartCard } from './MetricsOverview';
import { eventLabel, eventSeries, type Granularity } from './metricsUtils';

export function useMetricsChartStyle() {
  const theme = useTheme();
  return {
    theme,
    colors: [
      theme.palette.primary.main,
      theme.palette.secondary.main,
      theme.palette.info.main,
      theme.palette.warning.main,
      theme.palette.success.main,
      '#a78bfa',
    ],
    tick: { fill: theme.palette.text.secondary, fontSize: 11 },
    tooltip: {
      backgroundColor: theme.palette.background.paper,
      color: theme.palette.text.primary,
      borderColor: theme.palette.divider,
      borderRadius: 8,
    },
  };
}

export function MetricBarChart({
  title,
  hint,
  rows,
  color,
  valueLabel,
}: {
  title: string;
  hint?: string;
  rows: MetricCount[];
  color?: string;
  valueLabel?: string;
}) {
  const { LL } = useI18nContext();
  const { theme, tick, tooltip } = useMetricsChartStyle();
  const sorted = [...rows].sort((a, b) => b.events - a.events || a.name.localeCompare(b.name));
  const display = sorted.slice(0, 12);
  if (sorted.length > 12) display.push({ name: LL.METRICS.OTHER(), events: sorted.slice(12).reduce((sum, row) => sum + row.events, 0) });
  return (
    <MetricsChartCard title={title} hint={hint}>
      {display.length ? (
        <ResponsiveContainer width="100%" height={Math.max(220, display.length * 30)}>
          <BarChart data={display} layout="vertical" margin={{ left: 0, right: 20 }}>
            <CartesianGrid horizontal={false} stroke={theme.palette.divider} strokeDasharray="3 3" />
            <XAxis type="number" allowDecimals={false} tick={tick} />
            <YAxis
              type="category"
              dataKey="name"
              width={150}
              tick={tick}
              tickFormatter={(value: string) => (value.length > 23 ? `${value.slice(0, 22)}…` : value)}
            />
            <Tooltip contentStyle={tooltip} />
            <Bar
              dataKey="events"
              name={valueLabel || LL.METRICS.EVENTS()}
              fill={color || theme.palette.primary.main}
              radius={[0, 5, 5, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <Typography color="text.secondary" sx={{ py: 5 }}>
          {LL.METRICS.NO_DATA()}
        </Typography>
      )}
    </MetricsChartCard>
  );
}

export function MetricTimeline({
  data,
  events,
  title,
  from,
  to,
  granularity,
  stacked = false,
}: {
  data: MetricsSummary;
  events: string[];
  title: string;
  from: string;
  to: string;
  granularity: Granularity;
  stacked?: boolean;
}) {
  const { locale } = useI18nContext();
  const { theme, tick, tooltip, colors } = useMetricsChartStyle();
  const series = eventSeries(data, events, from, to, granularity);
  const axes = (
    <>
      <CartesianGrid vertical={false} stroke={theme.palette.divider} strokeDasharray="3 3" />
      <XAxis
        dataKey="day"
        tick={tick}
        minTickGap={35}
        tickFormatter={(day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(locale, { month: 'short', day: 'numeric' })}
      />
      <YAxis allowDecimals={false} tick={tick} />
      <Tooltip contentStyle={tooltip} />
      <Legend formatter={(value) => eventLabel(String(value))} />
    </>
  );
  return (
    <MetricsChartCard title={title}>
      <Box sx={{ mt: 2 }}>
        <ResponsiveContainer width="100%" height={280}>
          {stacked ? (
            <BarChart data={series}>
              {axes}
              {events.map((event, index) => (
                <Bar key={event} dataKey={event} stackId="events" fill={colors[index % colors.length]} />
              ))}
            </BarChart>
          ) : (
            <LineChart data={series}>
              {axes}
              {events.map((event, index) => (
                <Line key={event} dataKey={event} stroke={colors[index % colors.length]} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </Box>
    </MetricsChartCard>
  );
}
