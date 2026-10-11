import { Box } from '@mui/material';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MetricsSummary } from '@/api/metrics.api';
import { useI18nContext } from '@/i18n/i18n-react';
import { calendarBuckets, type Granularity } from './metricsUtils';
import { MetricsChartCard } from './MetricsOverview';
import { useMetricsChartStyle } from './MetricsCharts';

export function MetricsAccountActivity({
  data,
  names,
  from,
  to,
  granularity,
}: {
  data: MetricsSummary;
  names: Record<number, string>;
  from: string;
  to: string;
  granularity: Granularity;
}) {
  const { LL, locale } = useI18nContext();
  const { theme, colors, tick, tooltip } = useMetricsChartStyle();
  const top = [...data.accounts]
    .filter((row) => row.events > 0)
    .sort((a, b) => b.events - a.events || a.account - b.account)
    .slice(0, 8);
  const topIds = new Set(top.map((row) => row.account));
  const grouped = new Map<string, { accounts: Set<number>; values: Record<string, number | string> }>();
  const empty = (day: string) => ({
    accounts: new Set<number>(),
    values: { day, other: 0, ...Object.fromEntries(top.map((row) => [`a${row.account}`, 0])) },
  });
  for (const day of calendarBuckets(from || data.daily[0]?.day || '', to || data.observationTo, granularity)) grouped.set(day, empty(day));
  let hasOther = false;
  for (const row of data.accountDaily) {
    const day = calendarBuckets(row.day, row.day, granularity)[0];
    if (!day) continue;
    if (!grouped.has(day)) grouped.set(day, empty(day));
    const group = grouped.get(day)!;
    group.accounts.add(row.account);
    const field = topIds.has(row.account) ? `a${row.account}` : 'other';
    group.values[field] = Number(group.values[field] ?? 0) + row.events;
    if (field === 'other') hasOther = true;
  }
  const rows = [...grouped.values()]
    .map((row) => ({ ...row.values, day: String(row.values.day), active: row.accounts.size }))
    .sort((a, b) => a.day.localeCompare(b.day));
  const axes = (
    <>
      <CartesianGrid vertical={false} stroke={theme.palette.divider} strokeDasharray="3 3" />
      <XAxis
        dataKey="day"
        tick={tick}
        minTickGap={35}
        tickFormatter={(day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(locale, { month: 'short', day: 'numeric' })}
      />
      <YAxis tick={tick} allowDecimals={false} />
      <Tooltip contentStyle={tooltip} />
    </>
  );
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) minmax(0, 2fr)' }, gap: 3 }}>
      <MetricsChartCard title={LL.METRICS.ACTIVE_ACCOUNTS_OVER_TIME()}>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={rows}>
            {axes}
            <Line dataKey="active" name={LL.METRICS.ACTIVE_ACCOUNTS()} stroke={theme.palette.secondary.main} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </MetricsChartCard>
      <MetricsChartCard title={LL.METRICS.EVENTS_BY_ACCOUNT()}>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={rows}>
            {axes}
            <Legend />
            {top.map((row, index) => (
              <Bar
                key={row.account}
                dataKey={`a${row.account}`}
                name={names[row.account] || `#${row.account}`}
                fill={colors[index % colors.length]}
                stackId="accounts"
              />
            ))}
            {hasOther && <Bar dataKey="other" name={LL.METRICS.OTHER()} fill={theme.palette.text.secondary} stackId="accounts" />}
          </BarChart>
        </ResponsiveContainer>
      </MetricsChartCard>
    </Box>
  );
}
