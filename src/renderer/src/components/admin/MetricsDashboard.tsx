import { useState, useMemo, ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  TrendingUp as TrendingUpIcon,
  BarChart as BarChartIcon,
  PieChart as PieChartIcon,
  TableChart as TableChartIcon,
} from '@mui/icons-material';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  type PieLabelRenderProps,
} from 'recharts';
import { useI18nContext } from '@/i18n/i18n-react';
import { useGetMetricsQuery, type MetricEvent } from '@/api/metrics.api';
import { useGetAdminAccountsQuery } from '@/api/admin.api';
import { useGetSessionQuery } from '@/api/session.api';

const CHART_COLORS = [
  '#1976d2',
  '#388e3c',
  '#f9a825',
  '#e65100',
  '#9c27b0',
  '#00838f',
  '#c62828',
  '#283593',
  '#558b2f',
  '#6a1b9a',
  '#ef6c00',
  '#0277bd',
  '#ad1457',
  '#4e342e',
  '#37474f',
];

type Granularity = 'day' | 'week' | 'month';

const getDefaultDateRange = (): { from: string; to: string } => {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
};

const groupByDate = (metrics: MetricEvent[], granularity: Granularity): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const m of metrics) {
    const date = new Date(m.created_at);
    let key: string;
    if (granularity === 'day') {
      key = date.toISOString().slice(0, 10);
    } else if (granularity === 'week') {
      const d = new Date(date);
      d.setDate(d.getDate() - d.getDay());
      key = d.toISOString().slice(0, 10);
    } else {
      key = date.toISOString().slice(0, 7);
    }
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
};

const groupByField = (metrics: MetricEvent[], field: 'event' | 'entity_type'): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const m of metrics) {
    const val = m[field] || 'unknown';
    counts[val] = (counts[val] || 0) + 1;
  }
  return counts;
};

const topEntities = (metrics: MetricEvent[], entityType: string, limit = 10): { name: string; count: number }[] => {
  const filtered = metrics.filter((m) => m.entity_type === entityType && m.entity_id);
  const counts: Record<string, number> = {};
  for (const m of filtered) {
    counts[m.entity_id!] = (counts[m.entity_id!] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
};

const exportToCsv = (data: Record<string, unknown>[], filename: string) => {
  if (data.length === 0) return;
  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(','),
    ...data.map((row) =>
      headers
        .map((h) => {
          const val = row[h];
          const str = typeof val === 'object' ? JSON.stringify(val) : String(val ?? '');
          return `"${str.replace(/"/g, '""')}"`;
        })
        .join(','),
    ),
  ];
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export const MetricsDashboard = () => {
  const { LL } = useI18nContext();
  const defaultRange = getDefaultDateRange();
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);
  const [eventFilter, setEventFilter] = useState('');
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [accountFilter, setAccountFilter] = useState<number | ''>('');

  const { data: session } = useGetSessionQuery();
  const isAdmin = session?.authType === 'oidc_admin';
  const { data: adminAccounts = [] } = useGetAdminAccountsQuery(undefined, { skip: !isAdmin });

  const { data, isLoading, isFetching, refetch } = useGetMetricsQuery({
    from: dateFrom ? `${dateFrom} 00:00:00` : undefined,
    to: dateTo ? `${dateTo} 23:59:59` : undefined,
    event: eventFilter || undefined,
    limit: 10000,
    offset: 0,
    account: isAdmin && accountFilter !== '' ? (accountFilter as number) : undefined,
  });

  const metrics = data?.metrics ?? [];

  // Derived chart data
  const eventsOverTime = useMemo(() => {
    const grouped = groupByDate(metrics, granularity);
    return Object.entries(grouped)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count }));
  }, [metrics, granularity]);

  const eventTypeDistribution = useMemo(() => {
    const grouped = groupByField(metrics, 'event');
    return Object.entries(grouped)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));
  }, [metrics]);

  const entityTypeDistribution = useMemo(() => {
    const grouped = groupByField(metrics, 'entity_type');
    return Object.entries(grouped)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));
  }, [metrics]);

  const topSongs = useMemo(() => topEntities(metrics, 'song', 10), [metrics]);
  const topShows = useMemo(() => topEntities(metrics, 'show', 10), [metrics]);

  const uniqueEvents = useMemo(() => {
    const events = new Set<string>();
    for (const m of metrics) events.add(m.event);
    return Array.from(events).sort();
  }, [metrics]);

  const recentEvents = useMemo(() => metrics.slice(0, 50), [metrics]);

  const handleExportAll = () => {
    exportToCsv(
      metrics.map((m) => ({
        id: m.id,
        event: m.event,
        entity_type: m.entity_type ?? '',
        entity_id: m.entity_id ?? '',
        user_sub: m.user_sub ?? '',
        metadata: m.metadata ? JSON.stringify(m.metadata) : '',
        created_at: m.created_at,
      })),
      `metrics_${dateFrom}_${dateTo}.csv`,
    );
  };

  if (isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          p: 4,
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Stack spacing={3}>
      {/* Filters */}
      <Paper sx={{ p: 2 }}>
        <Stack
          direction="row"
          spacing={2}
          useFlexGap
          sx={{
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <TextField
            type="date"
            label={LL.METRICS.DATE_FROM()}
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            type="date"
            label={LL.METRICS.DATE_TO()}
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>{LL.METRICS.EVENT_TYPE()}</InputLabel>
            <Select value={eventFilter} label={LL.METRICS.EVENT_TYPE()} onChange={(e) => setEventFilter(e.target.value)}>
              <MenuItem value="">{LL.UNIFIED_SEARCH.ALL()}</MenuItem>
              {uniqueEvents.map((ev) => (
                <MenuItem key={ev} value={ev}>
                  {ev}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {isAdmin && adminAccounts.length > 0 && (
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>{LL.COMMON.ACCOUNT()}</InputLabel>
              <Select
                value={accountFilter}
                label={LL.COMMON.ACCOUNT()}
                onChange={(e) => setAccountFilter(e.target.value as number | '')}
              >
                <MenuItem value="">{LL.UNIFIED_SEARCH.ALL()}</MenuItem>
                {adminAccounts.map((a) => (
                  <MenuItem key={a.license} value={a.license}>
                    {a.name ? `${a.name} (#${a.license})` : `#${a.license}`}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>{LL.METRICS.GRANULARITY()}</InputLabel>
            <Select value={granularity} label={LL.METRICS.GRANULARITY()} onChange={(e) => setGranularity(e.target.value as Granularity)}>
              <MenuItem value="day">{LL.METRICS.DAILY()}</MenuItem>
              <MenuItem value="week">{LL.METRICS.WEEKLY()}</MenuItem>
              <MenuItem value="month">{LL.METRICS.MONTHLY()}</MenuItem>
            </Select>
          </FormControl>
          <Button startIcon={<RefreshIcon />} onClick={() => refetch()} disabled={isFetching}>
            {LL.METRICS.REFRESH()}
          </Button>
          <Box
            sx={{
              flexGrow: 1,
            }}
          />
          <Tooltip title={LL.METRICS.EXPORT_CSV()}>
            <IconButton onClick={handleExportAll} disabled={metrics.length === 0}>
              <DownloadIcon />
            </IconButton>
          </Tooltip>
          <Typography
            variant="body2"
            sx={{
              color: 'text.secondary',
            }}
          >
            {LL.METRICS.TOTAL_EVENTS({ count: data?.total ?? 0 })}
          </Typography>
        </Stack>
      </Paper>
      {metrics.length === 0 ? (
        <Alert severity="info">{LL.METRICS.NO_DATA()}</Alert>
      ) : (
        <>
          {/* Summary Cards */}
          <Stack
            direction="row"
            spacing={2}
            useFlexGap
            sx={{
              flexWrap: 'wrap',
            }}
          >
            <SummaryCard
              icon={<BarChartIcon />}
              label={LL.METRICS.TOTAL_EVENTS({ count: metrics.length })}
              value={metrics.length}
              color="#1976d2"
            />
            <SummaryCard icon={<TrendingUpIcon />} label={LL.METRICS.EVENT_TYPES()} value={eventTypeDistribution.length} color="#388e3c" />
            <SummaryCard icon={<PieChartIcon />} label={LL.METRICS.ENTITY_TYPES()} value={entityTypeDistribution.length} color="#f9a825" />
            <SummaryCard
              icon={<TableChartIcon />}
              label={LL.METRICS.TOP_SONGS()}
              value={topSongs.length > 0 ? topSongs[0].name : '—'}
              color="#e65100"
            />
          </Stack>

          {/* Charts Row 1: Events over time + Event type distribution */}
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <Card sx={{ flex: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  <BarChartIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                  {LL.METRICS.EVENTS_OVER_TIME()}
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={eventsOverTime}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} />
                    <RechartsTooltip />
                    <Bar dataKey="count" fill="#1976d2" name={LL.METRICS.EVENTS()} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  <PieChartIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                  {LL.METRICS.EVENT_DISTRIBUTION()}
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={eventTypeDistribution}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      dataKey="value"
                      nameKey="name"
                      label={({ name, percent }: PieLabelRenderProps) =>
                        `${name ?? ''} (${(((percent as number) ?? 0) * 100).toFixed(0)}%)`
                      }
                      labelLine={false}
                    >
                      {eventTypeDistribution.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Stack>

          {/* Charts Row 2: Usage trend + Entity type distribution */}
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <Card sx={{ flex: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  <TrendingUpIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                  {LL.METRICS.USAGE_TREND()}
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={eventsOverTime}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} />
                    <RechartsTooltip />
                    <Legend />
                    <Line type="monotone" dataKey="count" stroke="#1976d2" strokeWidth={2} dot={{ r: 3 }} name={LL.METRICS.EVENTS()} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  <PieChartIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                  {LL.METRICS.ENTITY_DISTRIBUTION()}
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={entityTypeDistribution}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      dataKey="value"
                      nameKey="name"
                      label={({ name, percent }: PieLabelRenderProps) =>
                        `${name ?? ''} (${(((percent as number) ?? 0) * 100).toFixed(0)}%)`
                      }
                      labelLine={false}
                    >
                      {entityTypeDistribution.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[(i + 5) % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Stack>

          {/* Tables Row: Top Songs + Top Shows */}
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <Card sx={{ flex: 1 }}>
              <CardContent>
                <Stack
                  direction="row"
                  sx={{
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    mb: 1,
                  }}
                >
                  <Typography variant="h6">{LL.METRICS.TOP_SONGS()}</Typography>
                  <Tooltip title={LL.METRICS.EXPORT_CSV()}>
                    <IconButton size="small" onClick={() => exportToCsv(topSongs, 'top_songs.csv')} disabled={topSongs.length === 0}>
                      <DownloadIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
                {topSongs.length === 0 ? (
                  <Typography
                    variant="body2"
                    sx={{
                      color: 'text.secondary',
                    }}
                  >
                    {LL.METRICS.NO_DATA()}
                  </Typography>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={topSongs} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" allowDecimals={false} />
                        <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                        <RechartsTooltip />
                        <Bar dataKey="count" fill="#e65100" name={LL.METRICS.PLAY_COUNT()} radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                    <TableContainer sx={{ mt: 1, maxHeight: 200, overflow: 'auto' }}>
                      <Table size="small" stickyHeader>
                        <TableHead>
                          <TableRow>
                            <TableCell>#</TableCell>
                            <TableCell>{LL.METRICS.SONG_NAME()}</TableCell>
                            <TableCell align="right">{LL.METRICS.PLAY_COUNT()}</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {topSongs.map((song, i) => (
                            <TableRow key={song.name} hover>
                              <TableCell>{i + 1}</TableCell>
                              <TableCell>{song.name}</TableCell>
                              <TableCell align="right">{song.count}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </>
                )}
              </CardContent>
            </Card>

            <Card sx={{ flex: 1 }}>
              <CardContent>
                <Stack
                  direction="row"
                  sx={{
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    mb: 1,
                  }}
                >
                  <Typography variant="h6">{LL.METRICS.TOP_SHOWS()}</Typography>
                  <Tooltip title={LL.METRICS.EXPORT_CSV()}>
                    <IconButton size="small" onClick={() => exportToCsv(topShows, 'top_shows.csv')} disabled={topShows.length === 0}>
                      <DownloadIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
                {topShows.length === 0 ? (
                  <Typography
                    variant="body2"
                    sx={{
                      color: 'text.secondary',
                    }}
                  >
                    {LL.METRICS.NO_DATA()}
                  </Typography>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={topShows} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" allowDecimals={false} />
                        <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                        <RechartsTooltip />
                        <Bar dataKey="count" fill="#9c27b0" name={LL.METRICS.USAGE_COUNT()} radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                    <TableContainer sx={{ mt: 1, maxHeight: 200, overflow: 'auto' }}>
                      <Table size="small" stickyHeader>
                        <TableHead>
                          <TableRow>
                            <TableCell>#</TableCell>
                            <TableCell>{LL.METRICS.SHOW_NAME()}</TableCell>
                            <TableCell align="right">{LL.METRICS.USAGE_COUNT()}</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {topShows.map((show, i) => (
                            <TableRow key={show.name} hover>
                              <TableCell>{i + 1}</TableCell>
                              <TableCell>{show.name}</TableCell>
                              <TableCell align="right">{show.count}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </>
                )}
              </CardContent>
            </Card>
          </Stack>

          {/* Recent Events Table */}
          <Card>
            <CardContent>
              <Stack
                direction="row"
                sx={{
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mb: 1,
                }}
              >
                <Typography variant="h6">{LL.METRICS.RECENT_EVENTS()}</Typography>
                <Tooltip title={LL.METRICS.EXPORT_CSV()}>
                  <IconButton
                    size="small"
                    onClick={() =>
                      exportToCsv(
                        recentEvents.map((m) => ({
                          event: m.event,
                          entity_type: m.entity_type ?? '',
                          entity_id: m.entity_id ?? '',
                          user: m.user_sub ?? '',
                          created_at: m.created_at,
                        })),
                        'recent_events.csv',
                      )
                    }
                  >
                    <DownloadIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
              <TableContainer sx={{ maxHeight: 400, overflow: 'auto' }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>{LL.METRICS.TIMESTAMP()}</TableCell>
                      <TableCell>{LL.METRICS.EVENT()}</TableCell>
                      <TableCell>{LL.METRICS.ENTITY_TYPE_LABEL()}</TableCell>
                      <TableCell>{LL.METRICS.ENTITY_ID()}</TableCell>
                      <TableCell>{LL.METRICS.USER()}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {recentEvents.map((m) => (
                      <TableRow key={m.id} hover>
                        <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{new Date(m.created_at).toLocaleString()}</TableCell>
                        <TableCell>
                          <Chip label={m.event} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell>{m.entity_type ?? '—'}</TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{m.entity_id ?? '—'}</TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {m.user_sub ?? '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </>
      )}
    </Stack>
  );
};

/** Small summary card */
const SummaryCard = ({ icon, label, value, color }: { icon: ReactNode; label: string; value: string | number; color: string }) => {
  return (
    <Card sx={{ minWidth: 180, flex: 1 }}>
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Stack
          direction="row"
          spacing={1.5}
          sx={{
            alignItems: 'center',
          }}
        >
          <Box sx={{ color, display: 'flex' }}>{icon}</Box>
          <Box>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 700,
              }}
            >
              {value}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: 'text.secondary',
              }}
            >
              {label}
            </Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
};
