import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from '@mui/material';
import { Devices, ErrorOutlined, Percent } from '@mui/icons-material';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MetricsSummary } from '@/api/metrics.api';
import { useI18nContext } from '@/i18n/i18n-react';
import { MetricsChartCard, MetricsStatCard } from './MetricsOverview';
import { MetricBarChart, useMetricsChartStyle } from './MetricsCharts';
import { calendarBuckets, downloadCsv } from './metricsUtils';

export function MetricsReliability({ data, from, to, onErrors }: { data: MetricsSummary; from: string; to: string; onErrors: () => void }) {
  const { LL, locale } = useI18nContext();
  const { theme, tick, tooltip } = useMetricsChartStyle();
  const [page, setPage] = useState(0);
  const daily = useMemo(() => {
    const activity = new Map(data.daily.map((row) => [row.day, row]));
    const errors = new Map(data.reliability.daily.map((row) => [row.day, row]));
    return calendarBuckets(from || data.daily[0]?.day || '', to || data.observationTo).map((day) => ({
      day,
      errors: errors.get(day)?.errors ?? 0,
      devices: errors.get(day)?.devices ?? 0,
      rate: activity.get(day)?.events ? ((errors.get(day)?.errors ?? 0) / activity.get(day)!.events) * 100 : 0,
    }));
  }, [data.daily, data.reliability.daily, data.observationTo, from, to]);
  const issues = data.reliability.issues;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(issues.length / 15) - 1));
  const rate = data.totals.events ? (data.totals.errors / data.totals.events) * 100 : 0;
  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
        <MetricsStatCard icon={<ErrorOutlined />} label={LL.METRICS.ERRORS()} value={data.totals.errors} color={theme.palette.error.main} />
        <MetricsStatCard
          icon={<Devices />}
          label={LL.METRICS.AFFECTED_DEVICES()}
          value={data.reliability.affected_devices}
          color={theme.palette.warning.main}
        />
        <MetricsStatCard
          icon={<Percent />}
          label={LL.METRICS.ERROR_RATE()}
          value={`${rate.toLocaleString(locale, { maximumFractionDigits: 2 })}%`}
          color={theme.palette.info.main}
        />
      </Box>
      <MetricsChartCard title={LL.METRICS.ERROR_TREND()} hint={LL.METRICS.RELIABILITY_HINT()}>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={daily}>
            <CartesianGrid vertical={false} stroke={theme.palette.divider} strokeDasharray="3 3" />
            <XAxis
              dataKey="day"
              tick={tick}
              minTickGap={35}
              tickFormatter={(day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(locale, { month: 'short', day: 'numeric' })}
            />
            <YAxis yAxisId="count" tick={tick} allowDecimals={false} />
            <YAxis yAxisId="rate" orientation="right" tick={tick} unit="%" domain={[0, 'auto']} />
            <Tooltip
              contentStyle={tooltip}
              formatter={(value, name) => [name === LL.METRICS.ERROR_RATE() ? `${Number(value).toFixed(2)}%` : value, name]}
            />
            <Legend />
            <Bar yAxisId="count" dataKey="errors" name={LL.METRICS.ERRORS()} fill={theme.palette.error.main} radius={[3, 3, 0, 0]} />
            <Line
              yAxisId="count"
              dataKey="devices"
              name={LL.METRICS.AFFECTED_DEVICES()}
              stroke={theme.palette.warning.main}
              strokeWidth={2}
              dot={false}
            />
            <Line
              yAxisId="rate"
              dataKey="rate"
              name={LL.METRICS.ERROR_RATE()}
              stroke={theme.palette.info.main}
              strokeDasharray="4 4"
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </MetricsChartCard>
      <MetricBarChart
        title={LL.METRICS.ERROR_SOURCES()}
        color={theme.palette.error.main}
        rows={data.dimensions.filter((row) => row.event === 'uncaught_error' && row.field === 'source')}
      />
      <MetricsChartCard title={LL.METRICS.RECURRING_ISSUES()} hint={LL.METRICS.ISSUES_HINT()}>
        {!issues.length ? (
          <Alert severity="success">{LL.METRICS.NO_ERRORS()}</Alert>
        ) : (
          <>
            <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', mb: 2 }}>
              <Button onClick={onErrors}>{LL.METRICS.VIEW_ERROR_EVENTS()}</Button>
              <Button onClick={() => downloadCsv(issues, 'recurring-errors.csv')}>{LL.METRICS.EXPORT_CSV()}</Button>
            </Stack>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{LL.METRICS.ERROR_SOURCE()}</TableCell>
                    <TableCell>{LL.METRICS.MESSAGE()}</TableCell>
                    <TableCell align="right">{LL.METRICS.EVENTS()}</TableCell>
                    <TableCell align="right">{LL.METRICS.AFFECTED_DEVICES()}</TableCell>
                    <TableCell>{LL.METRICS.LAST_ACTIVE()}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {issues.slice(currentPage * 15, currentPage * 15 + 15).map((row) => (
                    <TableRow key={`${row.source}:${row.message}`} hover>
                      <TableCell>{row.source}</TableCell>
                      <TableCell sx={{ minWidth: 220, maxWidth: 460, overflowWrap: 'anywhere' }}>{row.message}</TableCell>
                      <TableCell align="right">{row.events.toLocaleString(locale)}</TableCell>
                      <TableCell align="right">{row.devices.toLocaleString(locale)}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {new Date(row.last_seen.replace(' ', 'T')).toLocaleString(locale)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={issues.length}
              page={currentPage}
              rowsPerPage={15}
              rowsPerPageOptions={[15]}
              onPageChange={(_, p) => setPage(p)}
            />
          </>
        )}
      </MetricsChartCard>
    </Stack>
  );
}
