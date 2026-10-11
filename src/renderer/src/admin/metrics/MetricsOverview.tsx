import { useMemo } from 'react';
import {
  alpha,
  Box,
  Card,
  CardContent,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import { BarChart as ActivityIcon, Devices, People, Today, ErrorOutlined } from '@mui/icons-material';
import { Area, CartesianGrid, Legend, Line, ComposedChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import type { ReactNode } from 'react';
import type { MetricsSummary } from '@/api/metrics.api';
import { useI18nContext } from '@/i18n/i18n-react';

export const localDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function MetricsStatCard({ icon, label, value, color }: { icon: ReactNode; label: string; value: string | number; color: string }) {
  const { locale } = useI18nContext();
  return (
    <Card
      sx={{
        minWidth: 160,
        flex: 1,
        border: `1px solid ${alpha(color, 0.25)}`,
        background: (theme) => `linear-gradient(135deg, ${alpha(color, 0.12)}, ${theme.palette.background.paper})`,
      }}
    >
      <CardContent>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          <Box sx={{ color, bgcolor: alpha(color, 0.12), borderRadius: 2, p: 1.25, display: 'flex' }}>{icon}</Box>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 750, fontVariantNumeric: 'tabular-nums' }}>
              {typeof value === 'number' ? value.toLocaleString(locale) : value}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {label}
            </Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

export function MetricsChartCard({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Card sx={{ flex: 1, minWidth: 0 }}>
      <CardContent>
        <Typography variant="h6" sx={{ fontWeight: 650 }}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 3 }}>
          {hint}
        </Typography>
        {children}
      </CardContent>
    </Card>
  );
}

export function MetricsOverview({
  summary,
  from,
  to,
  isAdmin,
  onEvent,
  granularity = 'day',
}: {
  summary: MetricsSummary;
  from: string;
  to: string;
  isAdmin: boolean;
  onEvent: (event: string) => void;
  granularity?: 'day' | 'week' | 'month';
}) {
  const { LL, locale } = useI18nContext();
  const theme = useTheme();
  const { totals } = summary;
  const daily = useMemo(() => {
    const lookup = new Map(summary.daily.map((row) => [row.day, row]));
    if (granularity !== 'day') return summary.activity;
    const start = from || summary.daily[0]?.day;
    const end = to || summary.daily[summary.daily.length - 1]?.day;
    if (!start || !end) return [];
    const rows: MetricsSummary['daily'] = [];
    // UTC here is calendar arithmetic only; the keys themselves are server dates.
    const date = new Date(`${start}T00:00:00Z`);
    const endMs = new Date(`${end}T00:00:00Z`).getTime();
    // Keep unusually large custom ranges bounded in the browser.
    if ((endMs - date.getTime()) / 86400000 > 3660) return summary.daily;
    while (date.getTime() <= endMs) {
      const day = date.toISOString().slice(0, 10);
      rows.push(lookup.get(day) ?? { day, events: 0, devices: 0, errors: 0 });
      date.setUTCDate(date.getUTCDate() + 1);
    }
    return rows;
  }, [summary.daily, summary.activity, from, to, granularity]);
  const patterns = new Map(summary.patterns.map((row) => [`${row.weekday}-${row.hour}`, row.events]));
  const peak = Math.max(1, ...summary.patterns.map((row) => row.events));
  const tooltipStyle = {
    backgroundColor: theme.palette.background.paper,
    borderColor: theme.palette.divider,
    color: theme.palette.text.primary,
    borderRadius: 8,
  };
  const tick = { fill: theme.palette.text.secondary, fontSize: 11 };
  const dayLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' }),
  );
  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {LL.METRICS.SECTION_OVERVIEW()}
        </Typography>
        <Chip size="small" label={LL.METRICS.FULL_RANGE()} color="primary" variant="outlined" />
      </Stack>
      <Box
        sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: `repeat(${isAdmin ? 5 : 4}, 1fr)` }, gap: 2 }}
      >
        <MetricsStatCard icon={<ActivityIcon />} label={LL.METRICS.EVENTS()} value={totals.events} color={theme.palette.primary.main} />
        <MetricsStatCard
          icon={<Devices />}
          label={LL.METRICS.UNIQUE_DEVICES()}
          value={totals.devices}
          color={theme.palette.secondary.main}
        />
        {isAdmin && (
          <MetricsStatCard icon={<People />} label={LL.METRICS.ACTIVE_ACCOUNTS()} value={totals.accounts} color={theme.palette.info.main} />
        )}
        <MetricsStatCard icon={<Today />} label={LL.METRICS.ACTIVE_DAYS()} value={totals.active_days} color={theme.palette.success.main} />
        <MetricsStatCard
          icon={<ErrorOutlined />}
          label={LL.METRICS.ERROR_RATE()}
          value={`${(totals.events ? (totals.errors / totals.events) * 100 : 0).toLocaleString(locale, { maximumFractionDigits: 2 })}%`}
          color={theme.palette.error.main}
        />
      </Box>
      <MetricsChartCard title={LL.METRICS.EVENTS_OVER_TIME()} hint={LL.METRICS.ACTIVITY_HINT()}>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={daily} margin={{ top: 8, right: 8, left: -15, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={theme.palette.divider} strokeDasharray="3 3" />
            <XAxis dataKey="day" tick={tick} tickFormatter={dayLabel} minTickGap={32} />
            <YAxis yAxisId="events" tick={tick} allowDecimals={false} />
            <YAxis yAxisId="devices" orientation="right" tick={tick} allowDecimals={false} />
            <ChartTooltip contentStyle={tooltipStyle} labelFormatter={(value) => dayLabel(String(value))} />
            <Legend />
            <Area
              yAxisId="events"
              type="monotone"
              dataKey="events"
              name={LL.METRICS.EVENTS()}
              stroke={theme.palette.primary.main}
              fill={alpha(theme.palette.primary.main, 0.15)}
              strokeWidth={2}
            />
            <Line
              yAxisId="devices"
              type="monotone"
              dataKey="devices"
              name={LL.METRICS.DEVICES()}
              stroke={theme.palette.secondary.main}
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </MetricsChartCard>
      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={3}>
        <MetricsChartCard title={LL.METRICS.USAGE_PATTERNS()} hint={LL.METRICS.PATTERNS_HINT()}>
          <Box sx={{ overflowX: 'auto', pb: 1 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '44px repeat(24, minmax(16px, 1fr))', gap: 0.5, minWidth: 520 }}>
              <Box />
              {Array.from({ length: 24 }, (_, hour) => (
                <Typography key={hour} variant="caption" color="text.secondary" sx={{ textAlign: 'center', fontSize: 10 }}>
                  {hour % 3 === 0 ? hour : ''}
                </Typography>
              ))}
              {weekdays.map((label, weekday) => (
                <Box key={weekday} sx={{ display: 'contents' }}>
                  <Typography variant="caption" sx={{ alignSelf: 'center' }}>
                    {label}
                  </Typography>
                  {Array.from({ length: 24 }, (_, hour) => {
                    const events = patterns.get(`${weekday}-${hour}`) ?? 0;
                    return (
                      <Tooltip key={hour} title={`${label} ${hour}:00 · ${events.toLocaleString(locale)} ${LL.METRICS.EVENTS()}`}>
                        <Box
                          tabIndex={0}
                          aria-label={`${label} ${hour}:00: ${events}`}
                          sx={{
                            height: 28,
                            borderRadius: 0.75,
                            bgcolor: alpha(theme.palette.primary.main, events ? 0.15 + (0.85 * events) / peak : 0.04),
                            border: `1px solid ${alpha(theme.palette.primary.main, 0.08)}`,
                          }}
                        />
                      </Tooltip>
                    );
                  })}
                </Box>
              ))}
            </Box>
          </Box>
        </MetricsChartCard>
        <MetricsChartCard title={LL.METRICS.FEATURE_REACH()} hint={LL.METRICS.FEATURE_HINT()}>
          <TableContainer sx={{ maxHeight: 310 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>{LL.METRICS.EVENT()}</TableCell>
                  <TableCell align="right">{LL.METRICS.EVENTS()}</TableCell>
                  <TableCell align="right">{LL.METRICS.DEVICES()}</TableCell>
                  {isAdmin && <TableCell align="right">{LL.METRICS.ACTIVE_ACCOUNTS()}</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {summary.features.map((row) => (
                  <TableRow key={row.event} hover>
                    <TableCell>
                      <Chip label={row.event} size="small" variant="outlined" onClick={() => onEvent(row.event)} />
                    </TableCell>
                    <TableCell align="right">{row.events.toLocaleString(locale)}</TableCell>
                    <TableCell align="right">{row.devices.toLocaleString(locale)}</TableCell>
                    {isAdmin && <TableCell align="right">{row.accounts.toLocaleString(locale)}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </MetricsChartCard>
      </Stack>
    </Stack>
  );
}
