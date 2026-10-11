import { useMemo, useState } from 'react';
import {
  alpha,
  Alert,
  Box,
  Button,
  Chip,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import type { MetricsSummary } from '@/api/metrics.api';
import { useI18nContext } from '@/i18n/i18n-react';
import { MetricsChartCard } from './MetricsOverview';
import { downloadCsv, eventLabel } from './metricsUtils';
import { useMetricsChartStyle } from './MetricsCharts';

export function MetricsAdoption({
  data,
  accountNames,
  isAdmin,
  onAccount,
  onEvent,
}: {
  data: MetricsSummary;
  accountNames: Record<number, string>;
  isAdmin: boolean;
  onAccount: (id: number) => void;
  onEvent: (event: string) => void;
}) {
  const { LL, locale } = useI18nContext();
  const theme = useTheme();
  const [mode, setMode] = useState<'reach' | 'events'>('reach');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [allFeatures, setAllFeatures] = useState(false);
  const name = (id: number) => accountNames[id] || `#${id}`;
  const features = allFeatures ? data.features : data.features.slice(0, 12);
  const known = new Map(data.accounts.map((account) => [account.account, account]));
  const accounts = [...new Set([...Object.keys(accountNames).map(Number), ...known.keys()])]
    .filter((id) => name(id).toLocaleLowerCase(locale).includes(search.toLocaleLowerCase(locale)))
    .sort((a, b) => (known.get(b)?.events ?? 0) - (known.get(a)?.events ?? 0) || name(a).localeCompare(name(b)));
  const cells = new Map(data.accountFeatures.map((row) => [`${row.account}:${row.event}`, row]));
  const peak = data.accountFeatures.reduce((peak, row) => Math.max(peak, row.events), 1);
  const visiblePage = Math.min(page, Math.max(0, Math.ceil(accounts.length / 15) - 1));
  return (
    <Stack spacing={3}>
      {isAdmin && (
        <MetricsChartCard title={LL.METRICS.ADOPTION_MATRIX()} hint={LL.METRICS.ADOPTION_HINT()}>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mb: 2 }}>
            <TextField
              size="small"
              label={LL.METRICS.FIND_ACCOUNT()}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
            <Select
              size="small"
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
              inputProps={{ 'aria-label': LL.METRICS.MATRIX_MODE() }}
            >
              <MenuItem value="reach">{LL.METRICS.REACH_PERCENT()}</MenuItem>
              <MenuItem value="events">{LL.METRICS.EVENTS()}</MenuItem>
            </Select>
            <Button onClick={() => setAllFeatures(!allFeatures)}>
              {allFeatures ? LL.METRICS.TOP_FEATURES() : LL.METRICS.ALL_FEATURES()}
            </Button>
            <Button
              sx={{ ml: 'auto' }}
              onClick={() =>
                downloadCsv(
                  data.accountFeatures.map((row) => ({
                    ...row,
                    account_name: name(row.account),
                    reach_pct: known.get(row.account)?.devices ? (row.devices / known.get(row.account)!.devices) * 100 : null,
                  })),
                  'feature-adoption.csv',
                )
              }
            >
              {LL.METRICS.EXPORT_CSV()}
            </Button>
          </Stack>
          <TableContainer sx={{ maxHeight: 600 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ minWidth: 180 }}>{LL.COMMON.ACCOUNT()}</TableCell>
                  {features.map((feature) => (
                    <TableCell key={feature.event} align="center" sx={{ minWidth: 115 }}>
                      <Tooltip title={feature.event}>
                        <Button size="small" onClick={() => onEvent(feature.event)} sx={{ fontSize: 11, textTransform: 'none' }}>
                          {eventLabel(feature.event)}
                        </Button>
                      </Tooltip>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {accounts.slice(visiblePage * 15, visiblePage * 15 + 15).map((id) => (
                  <TableRow key={id}>
                    <TableCell>
                      <Button size="small" onClick={() => onAccount(id)} sx={{ textAlign: 'left', textTransform: 'none' }}>
                        {name(id)}
                      </Button>
                    </TableCell>
                    {features.map((feature) => {
                      const cell = cells.get(`${id}:${feature.event}`);
                      const events = cell?.events ?? 0;
                      const devices = cell?.devices ?? 0;
                      const denominator = known.get(id)?.devices ?? 0;
                      const reach = denominator ? (devices / denominator) * 100 : null;
                      const intensity = mode === 'events' ? events / peak : (reach ?? 0) / 100;
                      return (
                        <TableCell key={feature.event} align="center" sx={{ p: 0.5 }}>
                          <Tooltip
                            title={`${events.toLocaleString(locale)} ${LL.METRICS.EVENTS()} · ${devices}/${denominator} ${LL.METRICS.DEVICES()}`}
                          >
                            <Box
                              component="button"
                              onClick={() => {
                                onAccount(id);
                                onEvent(feature.event);
                              }}
                              aria-label={`${name(id)}: ${feature.event}`}
                              sx={{
                                border: 0,
                                width: '100%',
                                py: 1.25,
                                cursor: 'pointer',
                                color: 'text.primary',
                                borderRadius: 1,
                                bgcolor: alpha(theme.palette.secondary.main, intensity ? 0.12 + intensity * 0.35 : 0.03),
                                font: 'inherit',
                              }}
                            >
                              {mode === 'events' ? events.toLocaleString(locale) : reach === null ? '—' : `${Math.round(reach)}%`}
                            </Box>
                          </Tooltip>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={accounts.length}
            page={Math.min(page, Math.max(0, Math.ceil(accounts.length / 15) - 1))}
            rowsPerPage={15}
            rowsPerPageOptions={[15]}
            onPageChange={(_, p) => setPage(p)}
          />
        </MetricsChartCard>
      )}
      <MetricsRetention data={data} />
    </Stack>
  );
}

function MetricsRetention({ data }: { data: MetricsSummary }) {
  const { LL, locale } = useI18nContext();
  const { theme, tick, tooltip } = useMetricsChartStyle();
  const [page, setPage] = useState(0);
  const columns = Math.max(0, ...data.retention.map((cohort) => cohort.weeks.length));
  const visiblePage = Math.min(page, Math.max(0, Math.ceil(data.retention.length / 15) - 1));
  const curve = useMemo(() => {
    const totals = new Map<number, { offset: number; devices: number; base: number }>();
    for (const cohort of data.retention)
      for (const week of cohort.weeks) {
        if (!week.complete) continue;
        if (!totals.has(week.offset)) totals.set(week.offset, { offset: week.offset, devices: 0, base: 0 });
        totals.get(week.offset)!.devices += week.devices;
        totals.get(week.offset)!.base += cohort.size;
      }
    return [...totals.values()]
      .sort((a, b) => a.offset - b.offset)
      .map((row) => ({ ...row, percent: row.base ? (row.devices / row.base) * 100 : 0 }));
  }, [data.retention]);
  return (
    <MetricsChartCard title={LL.METRICS.DEVICE_RETENTION()} hint={LL.METRICS.RETENTION_HINT()}>
      {!data.retention.length ? (
        <Alert severity="info">{LL.METRICS.NO_KNOWN_DEVICES()}</Alert>
      ) : (
        <>
          <Stack direction="row" sx={{ justifyContent: 'flex-end', mb: 1 }}>
            <Button
              onClick={() =>
                downloadCsv(
                  data.retention.flatMap((cohort) =>
                    cohort.weeks.map((week) => ({
                      cohort: cohort.week,
                      cohort_size: cohort.size,
                      ...week,
                      retention_pct: (week.devices / cohort.size) * 100,
                    })),
                  ),
                  'device-retention.csv',
                )
              }
            >
              {LL.METRICS.EXPORT_CSV()}
            </Button>
          </Stack>
          <TableContainer sx={{ maxHeight: 550 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ minWidth: 140 }}>{LL.METRICS.COHORT_WEEK()}</TableCell>
                  <TableCell>{LL.METRICS.DEVICES()}</TableCell>
                  {Array.from({ length: columns }, (_, i) => (
                    <TableCell key={i} align="center" sx={{ minWidth: 72 }}>
                      {LL.METRICS.WEEK_OFFSET({ week: i })}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {data.retention.slice(visiblePage * 15, visiblePage * 15 + 15).map((cohort) => (
                  <TableRow key={cohort.week}>
                    <TableCell>{new Date(`${cohort.week}T12:00:00`).toLocaleDateString(locale)}</TableCell>
                    <TableCell>{cohort.size.toLocaleString(locale)}</TableCell>
                    {Array.from({ length: columns }, (_, i) => {
                      const week = cohort.weeks.find((row) => row.offset === i);
                      const pct = week ? (week.devices / cohort.size) * 100 : null;
                      return (
                        <TableCell key={i} align="center" sx={{ p: 0.5 }}>
                          <Tooltip
                            title={
                              week
                                ? `${week.devices}/${cohort.size} ${LL.METRICS.DEVICES()}${week.complete ? '' : ` · ${LL.METRICS.PARTIAL_WEEK()}`}`
                                : LL.METRICS.NOT_OBSERVED()
                            }
                          >
                            <Box
                              tabIndex={0}
                              sx={{
                                py: 1.25,
                                borderRadius: 1,
                                border: week && !week.complete ? '1px dashed' : '1px solid transparent',
                                borderColor: week && !week.complete ? 'divider' : 'transparent',
                                bgcolor: pct === null ? 'transparent' : alpha(theme.palette.primary.main, 0.06 + (pct / 100) * 0.7),
                              }}
                            >
                              {pct === null ? '—' : `${week?.complete ? '' : '~'}${Math.round(pct)}%`}
                            </Box>
                          </Tooltip>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={data.retention.length}
            page={Math.min(page, Math.max(0, Math.ceil(data.retention.length / 15) - 1))}
            rowsPerPage={15}
            rowsPerPageOptions={[15]}
            onPageChange={(_, p) => setPage(p)}
          />
          <Typography variant="caption" color="text.secondary">
            {LL.METRICS.RETENTION_CURVE_HINT()}
          </Typography>
          {curve.length > 0 && (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={curve} margin={{ left: 0, right: 24, top: 24 }}>
                <CartesianGrid vertical={false} stroke={theme.palette.divider} strokeDasharray="3 3" />
                <XAxis dataKey="offset" tick={tick} tickFormatter={(week) => LL.METRICS.WEEK_OFFSET({ week: Number(week) })} />
                <YAxis tick={tick} domain={[0, 100]} unit="%" />
                <ChartTooltip
                  contentStyle={tooltip}
                  formatter={(value) => [`${Number(value).toFixed(1)}%`, LL.METRICS.DEVICE_RETENTION()]}
                />
                <Line dataKey="percent" stroke={theme.palette.primary.main} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </>
      )}
    </MetricsChartCard>
  );
}
