import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Line, LineChart, ResponsiveContainer } from 'recharts';
import type { MetricsSummary } from '@/api/metrics.api';
import { useI18nContext } from '@/i18n/i18n-react';
import { MetricsChartCard } from './MetricsOverview';
import { calendarBuckets, downloadCsv, percentChange } from './metricsUtils';
import { MetricBarChart, useMetricsChartStyle } from './MetricsCharts';

export function MetricsAccounts({
  data,
  names,
  from,
  to,
  onAccount,
}: {
  data: MetricsSummary;
  names: Record<number, string>;
  from: string;
  to: string;
  onAccount: (id: number) => void;
}) {
  const { LL, locale } = useI18nContext();
  const { theme } = useMetricsChartStyle();
  const [sort, setSort] = useState<'events' | 'devices' | 'errors' | 'previous_events'>('events');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const name = (id: number) => names[id] || `#${id}`;
  const daily = useMemo(() => new Map(data.accountDaily.map((row) => [`${row.account}:${row.day}`, row.events])), [data.accountDaily]);
  const days = calendarBuckets(from || data.daily[0]?.day || '', to || data.observationTo);
  const rows = data.accounts
    .filter((row) => name(row.account).toLocaleLowerCase(locale).includes(search.toLocaleLowerCase(locale)))
    .sort((a, b) => ((a[sort] ?? 0) - (b[sort] ?? 0)) * (direction === 'desc' ? -1 : 1) || a.account - b.account);
  const change = (events: number, previous: number | null) => {
    const pct = percentChange(events, previous);
    if (pct === null) return previous === 0 && events > 0 ? LL.METRICS.NEW_ACTIVITY() : LL.METRICS.NO_BASELINE();
    return `${pct > 0 ? '+' : ''}${pct.toLocaleString(locale, { maximumFractionDigits: 1 })}%`;
  };
  const visiblePage = Math.min(page, Math.max(0, Math.ceil(rows.length / 15) - 1));
  return (
    <Stack spacing={3}>
      {data.comparison && (
        <MetricBarChart
          title={LL.METRICS.PERIOD_COMPARISON()}
          hint={`${data.comparison.from.slice(0, 10)} — ${data.comparison.to.slice(0, 10)}`}
          rows={[
            { name: LL.METRICS.CURRENT_PERIOD(), events: data.totals.events },
            { name: LL.METRICS.PREVIOUS_PERIOD(), events: data.comparison.totals.events },
          ]}
        />
      )}
      <MetricsChartCard title={LL.METRICS.ACCOUNT_TRENDS()} hint={LL.METRICS.ACCOUNT_TRENDS_HINT()}>
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', mb: 2 }}>
          <TextField
            size="small"
            label={LL.METRICS.FIND_ACCOUNT()}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
          <Button
            onClick={() =>
              downloadCsv(
                data.accounts.map((row) => ({
                  ...row,
                  account_name: name(row.account),
                  change_pct: percentChange(row.events, row.previous_events),
                })),
                'account-trends.csv',
              )
            }
          >
            {LL.METRICS.EXPORT_CSV()}
          </Button>
        </Stack>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{LL.COMMON.ACCOUNT()}</TableCell>
                {(
                  [
                    ['events', LL.METRICS.EVENTS()],
                    ['previous_events', LL.METRICS.PREVIOUS_PERIOD()],
                    ['devices', LL.METRICS.DEVICES()],
                    ['errors', LL.METRICS.ERRORS()],
                  ] as const
                ).map(([key, label]) => (
                  <TableCell key={key} align="right">
                    <TableSortLabel
                      active={sort === key}
                      direction={sort === key ? direction : 'desc'}
                      onClick={() => {
                        setSort(key);
                        setDirection(sort === key && direction === 'desc' ? 'asc' : 'desc');
                        setPage(0);
                      }}
                    >
                      {label}
                    </TableSortLabel>
                  </TableCell>
                ))}
                <TableCell align="right">{LL.METRICS.TREND()}</TableCell>
                <TableCell>{LL.METRICS.USAGE_TREND()}</TableCell>
                <TableCell>{LL.METRICS.LAST_ACTIVE()}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.slice(visiblePage * 15, visiblePage * 15 + 15).map((row) => (
                <TableRow key={row.account} hover>
                  <TableCell>
                    <Button size="small" onClick={() => onAccount(row.account)} sx={{ textAlign: 'left', textTransform: 'none' }}>
                      {name(row.account)}
                    </Button>
                  </TableCell>
                  <TableCell align="right">{row.events.toLocaleString(locale)}</TableCell>
                  <TableCell align="right">{row.previous_events?.toLocaleString(locale) ?? '—'}</TableCell>
                  <TableCell align="right">{row.devices.toLocaleString(locale)}</TableCell>
                  <TableCell align="right">{row.errors.toLocaleString(locale)}</TableCell>
                  <TableCell align="right">
                    <Chip
                      size="small"
                      variant="outlined"
                      label={change(row.events, row.previous_events)}
                      color={row.previous_events !== null && row.events > row.previous_events ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ width: 100, height: 32 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={days.map((day) => ({ day, events: daily.get(`${row.account}:${day}`) ?? 0 }))}>
                          <Line
                            type="monotone"
                            dataKey="events"
                            stroke={theme.palette.secondary.main}
                            strokeWidth={2}
                            dot={false}
                            isAnimationActive={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                    {row.last_seen ? new Date(row.last_seen.replace(' ', 'T')).toLocaleDateString(locale) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={rows.length}
          page={Math.min(page, Math.max(0, Math.ceil(rows.length / 15) - 1))}
          rowsPerPage={15}
          rowsPerPageOptions={[15]}
          onPageChange={(_, p) => setPage(p)}
        />
      </MetricsChartCard>
    </Stack>
  );
}
