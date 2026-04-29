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
  Devices as DevicesIcon,
  MusicNote as SongIcon,
  Search as SearchIcon,
  ErrorOutlined as ErrorIcon,
  OpenInNew as WindowIcon,
  LibraryBooks as ShowIcon,
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

const getDefaultDateRange = () => {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
};

const groupByDate = (metrics: MetricEvent[], granularity: Granularity): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const m of metrics) {
    const date = new Date(m.created_at);
    let key: string;
    if (granularity === 'day') key = date.toISOString().slice(0, 10);
    else if (granularity === 'week') {
      const d = new Date(date);
      d.setDate(d.getDate() - d.getDay());
      key = d.toISOString().slice(0, 10);
    } else key = date.toISOString().slice(0, 7);
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

const countByEvent = (metrics: MetricEvent[], eventType: string) =>
  metrics.filter((m) => m.event === eventType).length;

const groupMetadataField = (metrics: MetricEvent[], eventType: string, field: string, limit = 15) => {
  const counts: Record<string, number> = {};
  for (const m of metrics.filter((m) => m.event === eventType)) {
    const val = (m.metadata as Record<string, string> | undefined)?.[field] ?? 'unknown';
    counts[val] = (counts[val] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, value]) => ({ name, value }));
};

/** Group events by date for a specific event type */
const groupEventByDate = (metrics: MetricEvent[], eventType: string, granularity: Granularity) => {
  const filtered = metrics.filter((m) => m.event === eventType);
  const grouped = groupByDate(filtered, granularity);
  return Object.entries(grouped)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));
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

export const Metrics = () => {
  const { LL } = useI18nContext();
  const defaultRange = getDefaultDateRange();
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);
  const [eventFilter, setEventFilter] = useState('');
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [accountFilter, setAccountFilter] = useState<number | ''>('');
  const [deviceIdFilter, setDeviceIdFilter] = useState('');

  const { data: session } = useGetSessionQuery();
  const isAdmin = session?.authType === 'oidc_admin';
  const { data: adminAccounts = [] } = useGetAdminAccountsQuery(undefined, { skip: !isAdmin });

  const { data, isLoading, isFetching, refetch } = useGetMetricsQuery({
    from: dateFrom ? `${dateFrom} 00:00:00` : undefined,
    to: dateTo ? `${dateTo} 23:59:59` : undefined,
    event: eventFilter || undefined,
    device_id: deviceIdFilter || undefined,
    limit: 10000,
    offset: 0,
    account: isAdmin && accountFilter !== '' ? (accountFilter as number) : undefined,
  });

  const metrics = data?.metrics ?? [];

  // ── Overview ────────────────────────────────────────────────────────────────
  const eventsOverTime = useMemo(() => {
    const grouped = groupByDate(metrics, granularity);
    return Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0])).map(([date, count]) => ({ date, count }));
  }, [metrics, granularity]);

  const eventTypeDistribution = useMemo(() => {
    const grouped = groupByField(metrics, 'event');
    return Object.entries(grouped).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
  }, [metrics]);

  const entityTypeDistribution = useMemo(() => {
    const grouped = groupByField(metrics, 'entity_type');
    return Object.entries(grouped).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
  }, [metrics]);

  // ── Devices ─────────────────────────────────────────────────────────────────
  const uniqueDevicesOverTime = useMemo(() => {
    const devicesByDate: Record<string, Set<string>> = {};
    for (const m of metrics) {
      const deviceId = (m.metadata as Record<string, string> | undefined)?.device_id;
      if (!deviceId) continue;
      const date = new Date(m.created_at);
      let key: string;
      if (granularity === 'day') key = date.toISOString().slice(0, 10);
      else if (granularity === 'week') { const d = new Date(date); d.setDate(d.getDate() - d.getDay()); key = d.toISOString().slice(0, 10); }
      else key = date.toISOString().slice(0, 7);
      if (!devicesByDate[key]) devicesByDate[key] = new Set();
      devicesByDate[key].add(deviceId);
    }
    return Object.entries(devicesByDate).sort((a, b) => a[0].localeCompare(b[0])).map(([date, devices]) => ({ date, count: devices.size }));
  }, [metrics, granularity]);

  const totalUniqueDevices = useMemo(() => {
    const ids = new Set(metrics.map((m) => (m.metadata as Record<string, string> | undefined)?.device_id).filter(Boolean));
    return ids.size;
  }, [metrics]);

  const uniqueDeviceIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of metrics) { const id = (m.metadata as Record<string, string> | undefined)?.device_id; if (id) ids.add(id); }
    return Array.from(ids).sort();
  }, [metrics]);

  // ── Songs ────────────────────────────────────────────────────────────────────
  const songImportedOverTime = useMemo(() => groupEventByDate(metrics, 'song_imported', granularity), [metrics, granularity]);
  const songImportedCount = useMemo(() => countByEvent(metrics, 'song_imported'), [metrics]);
  const songDeletedCount = useMemo(() => countByEvent(metrics, 'song_deleted'), [metrics]);
  const songSelectedOverTime = useMemo(() => groupEventByDate(metrics, 'song_selected', granularity), [metrics, granularity]);

  // ── Shows ────────────────────────────────────────────────────────────────────
  const showCreatedOverTime = useMemo(() => groupEventByDate(metrics, 'show_created', granularity), [metrics, granularity]);
  const showActivityData = useMemo(() => [
    { name: 'show_created', value: countByEvent(metrics, 'show_created') },
    { name: 'show_loaded', value: countByEvent(metrics, 'show_loaded') },
    { name: 'show_saved', value: countByEvent(metrics, 'show_saved') },
    { name: 'show_deleted', value: countByEvent(metrics, 'show_deleted') },
  ].filter((d) => d.value > 0), [metrics]);

  // ── Content – PDF / Media / Bible ─────────────────────────────────────────
  const contentActivityData = useMemo(() => [
    { name: 'pdf_uploaded', value: countByEvent(metrics, 'pdf_uploaded') },
    { name: 'pdf_viewed', value: countByEvent(metrics, 'pdf_viewed') },
    { name: 'pdf_deleted', value: countByEvent(metrics, 'pdf_deleted') },
    { name: 'media_added', value: countByEvent(metrics, 'media_added') },
    { name: 'bible_verse_added', value: countByEvent(metrics, 'bible_verse_added') },
  ].filter((d) => d.value > 0), [metrics]);

  // ── Search ───────────────────────────────────────────────────────────────────
  const searchOverTime = useMemo(() => groupEventByDate(metrics, 'search_performed', granularity), [metrics, granularity]);

  // ── Windows ──────────────────────────────────────────────────────────────────
  const windowOpenedData = useMemo(() => groupMetadataField(metrics, 'window_opened', 'window'), [metrics]);

  // ── Presentation ─────────────────────────────────────────────────────────────
  const presentationData = useMemo(() => [
    { name: 'presentation_opened', value: countByEvent(metrics, 'presentation_opened') },
    { name: 'style_changed', value: countByEvent(metrics, 'style_changed') },
    { name: 'block_navigated', value: countByEvent(metrics, 'block_navigated') },
  ].filter((d) => d.value > 0), [metrics]);

  // ── Musician ─────────────────────────────────────────────────────────────────
  const musicianButtonData = useMemo(() => groupMetadataField(metrics, 'musician_button_clicked', 'button'), [metrics]);
  const musicianLayerData = useMemo(() => groupMetadataField(metrics, 'musician_layer_action', 'action'), [metrics]);
  const modalOpenedData = useMemo(() => groupMetadataField(metrics, 'modal_opened', 'modal'), [metrics]);
  const syncModeData = useMemo(
    () => groupMetadataField(metrics, 'musician_button_clicked', 'value').filter((d) => d.name !== 'unknown'),
    [metrics],
  );

  // ── Settings ─────────────────────────────────────────────────────────────────
  const settingChangedData = useMemo(() => groupMetadataField(metrics, 'setting_changed', 'key' in (metrics.find((m) => m.event === 'setting_changed')?.metadata ?? {}) ? 'key' : 'value', 12), [metrics]);

  // ── Auth / System ─────────────────────────────────────────────────────────────
  const authSystemData = useMemo(() => [
    { name: 'login', value: countByEvent(metrics, 'login') },
    { name: 'fresh_start', value: countByEvent(metrics, 'fresh_start') },
    { name: 'uncaught_error', value: countByEvent(metrics, 'uncaught_error') },
    { name: 'metrics_disabled', value: countByEvent(metrics, 'metrics_disabled') },
  ].filter((d) => d.value > 0), [metrics]);

  const uncaughtErrorData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of metrics.filter((m) => m.event === 'uncaught_error')) {
      const src = (m.metadata as Record<string, string> | undefined)?.source ?? 'unknown';
      counts[src] = (counts[src] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
  }, [metrics]);

  // ── Misc ────────────────────────────────────────────────────────────────────
  const uniqueEvents = useMemo(() => { const events = new Set<string>(); for (const m of metrics) events.add(m.event); return Array.from(events).sort(); }, [metrics]);
  const recentEvents = useMemo(() => metrics.slice(0, 50), [metrics]);

  const handleExportAll = () => {
    exportToCsv(
      metrics.map((m) => ({ id: m.id, event: m.event, entity_type: m.entity_type ?? '', entity_id: m.entity_id ?? '', metadata: m.metadata ? JSON.stringify(m.metadata) : '', created_at: m.created_at })),
      `metrics_${dateFrom}_${dateTo}.csv`,
    );
  };

  if (isLoading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
  }

  return (
    <Stack spacing={3}>
      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" spacing={2} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField type="date" label={LL.METRICS.DATE_FROM()} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} size="small" slotProps={{ inputLabel: { shrink: true } }} />
          <TextField type="date" label={LL.METRICS.DATE_TO()} value={dateTo} onChange={(e) => setDateTo(e.target.value)} size="small" slotProps={{ inputLabel: { shrink: true } }} />
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>{LL.METRICS.EVENT_TYPE()}</InputLabel>
            <Select value={eventFilter} label={LL.METRICS.EVENT_TYPE()} onChange={(e) => setEventFilter(e.target.value)}>
              <MenuItem value="">{LL.UNIFIED_SEARCH.ALL()}</MenuItem>
              {uniqueEvents.map((ev) => <MenuItem key={ev} value={ev}>{ev}</MenuItem>)}
            </Select>
          </FormControl>
          {isAdmin && adminAccounts.length > 0 && (
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>{LL.COMMON.ACCOUNT()}</InputLabel>
              <Select value={accountFilter} label={LL.COMMON.ACCOUNT()} onChange={(e) => setAccountFilter(e.target.value as number | '')}>
                <MenuItem value="">{LL.UNIFIED_SEARCH.ALL()}</MenuItem>
                {adminAccounts.map((a) => <MenuItem key={a.license} value={a.license}>{a.name ? `${a.name} (#${a.license})` : `#${a.license}`}</MenuItem>)}
              </Select>
            </FormControl>
          )}
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>{LL.METRICS.DEVICE_ID()}</InputLabel>
            <Select value={deviceIdFilter} label={LL.METRICS.DEVICE_ID()} onChange={(e) => setDeviceIdFilter(e.target.value)}>
              <MenuItem value="">{LL.UNIFIED_SEARCH.ALL()}</MenuItem>
              {uniqueDeviceIds.map((id) => <MenuItem key={id} value={id} sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{id.slice(0, 13)}…</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>{LL.METRICS.GRANULARITY()}</InputLabel>
            <Select value={granularity} label={LL.METRICS.GRANULARITY()} onChange={(e) => setGranularity(e.target.value as Granularity)}>
              <MenuItem value="day">{LL.METRICS.DAILY()}</MenuItem>
              <MenuItem value="week">{LL.METRICS.WEEKLY()}</MenuItem>
              <MenuItem value="month">{LL.METRICS.MONTHLY()}</MenuItem>
            </Select>
          </FormControl>
          <Button startIcon={<RefreshIcon />} onClick={() => refetch()} disabled={isFetching}>{LL.METRICS.REFRESH()}</Button>
          <Box sx={{ flexGrow: 1 }} />
          <Tooltip title={LL.METRICS.EXPORT_CSV()}>
            <IconButton onClick={handleExportAll} disabled={metrics.length === 0}><DownloadIcon /></IconButton>
          </Tooltip>
          <Typography variant="body2" color="text.secondary">{LL.METRICS.TOTAL_EVENTS({ count: data?.total ?? 0 })}</Typography>
        </Stack>
      </Paper>

      {metrics.length === 0 ? (
        <Alert severity="info">{LL.METRICS.NO_DATA()}</Alert>
      ) : (
        <>
          {/* ── Summary Cards ──────────────────────────────────────────────── */}
          <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
            <SummaryCard icon={<BarChartIcon />} label={LL.METRICS.TOTAL_EVENTS({ count: metrics.length })} value={metrics.length} color="#1976d2" />
            <SummaryCard icon={<TrendingUpIcon />} label={LL.METRICS.EVENT_TYPES()} value={eventTypeDistribution.length} color="#388e3c" />
            <SummaryCard icon={<DevicesIcon />} label={LL.METRICS.UNIQUE_DEVICES()} value={totalUniqueDevices} color="#9c27b0" />
            <SummaryCard icon={<SongIcon />} label={LL.METRICS.SONGS_IMPORTED()} value={songImportedCount} color="#e65100" />
            <SummaryCard icon={<ShowIcon />} label={LL.METRICS.SHOWS_CREATED()} value={countByEvent(metrics, 'show_created')} color="#00838f" />
            <SummaryCard icon={<ErrorIcon />} label={LL.METRICS.ERRORS()} value={countByEvent(metrics, 'uncaught_error')} color="#c62828" />
          </Stack>

          {/* ── Overview: Events over time + Event type distribution ──────── */}
          <SectionTitle>{LL.METRICS.SECTION_OVERVIEW()}</SectionTitle>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <Card sx={{ flex: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom><BarChartIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />{LL.METRICS.EVENTS_OVER_TIME()}</Typography>
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
                <Typography variant="h6" gutterBottom><PieChartIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />{LL.METRICS.EVENT_DISTRIBUTION()}</Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={eventTypeDistribution} cx="50%" cy="50%" outerRadius={100} dataKey="value" nameKey="name"
                      label={({ name, percent }: PieLabelRenderProps) => `${name ?? ''} (${(((percent as number) ?? 0) * 100).toFixed(0)}%)`} labelLine={false}>
                      {eventTypeDistribution.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <RechartsTooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Stack>

          {/* Usage trend + Entity type pie */}
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <Card sx={{ flex: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom><TrendingUpIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />{LL.METRICS.USAGE_TREND()}</Typography>
                <ResponsiveContainer width="100%" height={260}>
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
                <Typography variant="h6" gutterBottom><PieChartIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />{LL.METRICS.ENTITY_DISTRIBUTION()}</Typography>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={entityTypeDistribution} cx="50%" cy="50%" outerRadius={100} dataKey="value" nameKey="name"
                      label={({ name, percent }: PieLabelRenderProps) => `${name ?? ''} (${(((percent as number) ?? 0) * 100).toFixed(0)}%)`} labelLine={false}>
                      {entityTypeDistribution.map((_, i) => <Cell key={i} fill={CHART_COLORS[(i + 5) % CHART_COLORS.length]} />)}
                    </Pie>
                    <RechartsTooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Stack>

          {/* ── Devices ──────────────────────────────────────────────────────── */}
          <SectionTitle>{LL.METRICS.SECTION_DEVICES()}</SectionTitle>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <Card sx={{ flex: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom><TrendingUpIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />{LL.METRICS.UNIQUE_DEVICES_OVER_TIME()}</Typography>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={uniqueDevicesOverTime}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} />
                    <RechartsTooltip />
                    <Legend />
                    <Line type="monotone" dataKey="count" stroke="#9c27b0" strokeWidth={2} dot={{ r: 3 }} name={LL.METRICS.UNIQUE_DEVICES()} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            {windowOpenedData.length > 0 && (
              <Card sx={{ flex: 1 }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom><WindowIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />{LL.METRICS.WINDOWS_OPENED()}</Typography>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={windowOpenedData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" allowDecimals={false} />
                      <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                      <RechartsTooltip />
                      <Bar dataKey="value" fill="#283593" radius={[0, 4, 4, 0]} name={LL.METRICS.EVENTS()} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </Stack>

          {/* ── Songs ────────────────────────────────────────────────────────── */}
          <SectionTitle>{LL.METRICS.SECTION_SONGS()}</SectionTitle>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <Card sx={{ flex: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom><SongIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />{LL.METRICS.SONGS_IMPORTED_OVER_TIME()}</Typography>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={songImportedOverTime}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} />
                    <RechartsTooltip />
                    <Bar dataKey="count" fill="#e65100" name={LL.METRICS.SONGS_IMPORTED()} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom><SongIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />{LL.METRICS.SONG_ACTIVITY()}</Typography>
                <Stack spacing={2} sx={{ mt: 1 }}>
                  <SummaryCard icon={<SongIcon />} label={LL.METRICS.SONGS_IMPORTED()} value={songImportedCount} color="#e65100" />
                  <SummaryCard icon={<SongIcon />} label={LL.METRICS.SONGS_DELETED()} value={songDeletedCount} color="#c62828" />
                </Stack>
                {songSelectedOverTime.length > 0 && (
                  <ResponsiveContainer width="100%" height={150} style={{ marginTop: 16 }}>
                    <LineChart data={songSelectedOverTime}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis allowDecimals={false} />
                      <RechartsTooltip />
                      <Line type="monotone" dataKey="count" stroke="#f9a825" strokeWidth={2} dot={false} name={LL.METRICS.SONG_SELECTED()} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </Stack>

          {/* ── Shows ────────────────────────────────────────────────────────── */}
          <SectionTitle>{LL.METRICS.SECTION_SHOWS()}</SectionTitle>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <Card sx={{ flex: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom><ShowIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />{LL.METRICS.SHOWS_CREATED_OVER_TIME()}</Typography>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={showCreatedOverTime}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} />
                    <RechartsTooltip />
                    <Bar dataKey="count" fill="#00838f" name={LL.METRICS.SHOWS_CREATED()} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            {showActivityData.length > 0 && (
              <Card sx={{ flex: 1 }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom><ShowIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />{LL.METRICS.SHOW_ACTIVITY()}</Typography>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={showActivityData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} />
                      <RechartsTooltip />
                      <Bar dataKey="value" fill="#00838f" radius={[4, 4, 0, 0]} name={LL.METRICS.EVENTS()}>
                        {showActivityData.map((_, i) => <Cell key={i} fill={CHART_COLORS[(i + 4) % CHART_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </Stack>

          {/* ── Content: PDF / Media / Bible ─────────────────────────────────── */}
          {contentActivityData.length > 0 && (
            <>
              <SectionTitle>{LL.METRICS.SECTION_CONTENT()}</SectionTitle>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom><TableChartIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />{LL.METRICS.CONTENT_ACTIVITY()}</Typography>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={contentActivityData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} />
                      <RechartsTooltip />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]} name={LL.METRICS.EVENTS()}>
                        {contentActivityData.map((_, i) => <Cell key={i} fill={CHART_COLORS[(i + 7) % CHART_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          )}

          {/* ── Search ───────────────────────────────────────────────────────── */}
          {searchOverTime.length > 0 && (
            <>
              <SectionTitle>{LL.METRICS.SECTION_SEARCH()}</SectionTitle>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom><SearchIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />{LL.METRICS.SEARCHES_OVER_TIME()}</Typography>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={searchOverTime}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} />
                      <RechartsTooltip />
                      <Bar dataKey="count" fill="#6a1b9a" name={LL.METRICS.SEARCH_COUNT()} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          )}

          {/* ── Presentation ─────────────────────────────────────────────────── */}
          {presentationData.length > 0 && (
            <>
              <SectionTitle>{LL.METRICS.SECTION_PRESENTATION()}</SectionTitle>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom><BarChartIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />{LL.METRICS.PRESENTATION_ACTIVITY()}</Typography>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={presentationData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} />
                      <RechartsTooltip />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]} name={LL.METRICS.EVENTS()}>
                        {presentationData.map((_, i) => <Cell key={i} fill={CHART_COLORS[(i + 1) % CHART_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          )}

          {/* ── Musician page ─────────────────────────────────────────────────── */}
          {(musicianButtonData.length > 0 || musicianLayerData.length > 0 || modalOpenedData.length > 0 || syncModeData.length > 0) && (
            <>
              <SectionTitle>{LL.METRICS.SECTION_MUSICIAN()}</SectionTitle>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                {musicianButtonData.length > 0 && (
                  <Card sx={{ flex: 1 }}>
                    <CardContent>
                      <Typography variant="h6" gutterBottom><BarChartIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />{LL.METRICS.MUSICIAN_BUTTON_USAGE()}</Typography>
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={musicianButtonData} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" allowDecimals={false} />
                          <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                          <RechartsTooltip />
                          <Bar dataKey="value" fill="#0277bd" radius={[0, 4, 4, 0]} name={LL.METRICS.EVENTS()} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}
                {musicianLayerData.length > 0 && (
                  <Card sx={{ flex: 1 }}>
                    <CardContent>
                      <Typography variant="h6" gutterBottom><BarChartIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />{LL.METRICS.LAYER_ACTIONS()}</Typography>
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={musicianLayerData} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" allowDecimals={false} />
                          <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                          <RechartsTooltip />
                          <Bar dataKey="value" fill="#e65100" radius={[0, 4, 4, 0]} name={LL.METRICS.EVENTS()} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}
              </Stack>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                {modalOpenedData.length > 0 && (
                  <Card sx={{ flex: 1 }}>
                    <CardContent>
                      <Typography variant="h6" gutterBottom><BarChartIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />{LL.METRICS.MODAL_OPENED()}</Typography>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={modalOpenedData} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" allowDecimals={false} />
                          <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                          <RechartsTooltip />
                          <Bar dataKey="value" fill="#388e3c" radius={[0, 4, 4, 0]} name={LL.METRICS.EVENTS()} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}
                {syncModeData.length > 0 && (
                  <Card sx={{ flex: 1 }}>
                    <CardContent>
                      <Typography variant="h6" gutterBottom><BarChartIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />{LL.METRICS.SYNC_MODE_USAGE()}</Typography>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={syncModeData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                          <YAxis allowDecimals={false} />
                          <RechartsTooltip />
                          <Bar dataKey="value" fill="#00838f" radius={[4, 4, 0, 0]} name={LL.METRICS.EVENTS()} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}
              </Stack>
            </>
          )}

          {/* ── Settings ─────────────────────────────────────────────────────── */}
          {settingChangedData.length > 0 && (
            <>
              <SectionTitle>{LL.METRICS.SECTION_SETTINGS()}</SectionTitle>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom><BarChartIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />{LL.METRICS.SETTINGS_CHANGED()}</Typography>
                  <ResponsiveContainer width="100%" height={Math.max(220, settingChangedData.length * 28)}>
                    <BarChart data={settingChangedData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" allowDecimals={false} />
                      <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 11 }} />
                      <RechartsTooltip />
                      <Bar dataKey="value" fill="#558b2f" radius={[0, 4, 4, 0]} name={LL.METRICS.EVENTS()} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          )}

          {/* ── Auth / System ─────────────────────────────────────────────────── */}
          {authSystemData.length > 0 && (
            <>
              <SectionTitle>{LL.METRICS.SECTION_SYSTEM()}</SectionTitle>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <Card sx={{ flex: 1 }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom><BarChartIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />{LL.METRICS.SYSTEM_EVENTS()}</Typography>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={authSystemData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} />
                        <RechartsTooltip />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]} name={LL.METRICS.EVENTS()}>
                          {authSystemData.map((_, i) => <Cell key={i} fill={CHART_COLORS[(i + 6) % CHART_COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                {uncaughtErrorData.length > 0 && (
                  <Card sx={{ flex: 1 }}>
                    <CardContent>
                      <Typography variant="h6" gutterBottom><ErrorIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />{LL.METRICS.ERROR_SOURCES()}</Typography>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={uncaughtErrorData} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" allowDecimals={false} />
                          <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                          <RechartsTooltip />
                          <Bar dataKey="value" fill="#c62828" radius={[0, 4, 4, 0]} name={LL.METRICS.EVENTS()} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}
              </Stack>
            </>
          )}

          {/* ── Recent Events Table ────────────────────────────────────────── */}
          <SectionTitle>{LL.METRICS.RECENT_EVENTS()}</SectionTitle>
          <Card>
            <CardContent>
              <Stack direction="row" sx={{ justifyContent: 'flex-end', mb: 1 }}>
                <Tooltip title={LL.METRICS.EXPORT_CSV()}>
                  <IconButton size="small" onClick={() => exportToCsv(recentEvents.map((m) => ({ event: m.event, entity_type: m.entity_type ?? '', entity_id: m.entity_id ?? '', device_id: (m.metadata as Record<string, string> | undefined)?.device_id ?? '', created_at: m.created_at })), 'recent_events.csv')}>
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
                      <TableCell>{LL.METRICS.DEVICE_ID()}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {recentEvents.map((m) => {
                      const devId = (m.metadata as Record<string, string> | undefined)?.device_id;
                      return (
                        <TableRow key={m.id} hover>
                          <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{new Date(m.created_at).toLocaleString()}</TableCell>
                          <TableCell><Chip label={m.event} size="small" variant="outlined" /></TableCell>
                          <TableCell>{m.entity_type ?? '—'}</TableCell>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{m.entity_id ?? '—'}</TableCell>
                          <TableCell>
                            {devId ? (
                              <Tooltip title={devId}>
                                <Chip label={devId.slice(0, 8) + '…'} size="small" variant="outlined" clickable
                                  onClick={() => setDeviceIdFilter(devId === deviceIdFilter ? '' : devId)}
                                  color={devId === deviceIdFilter ? 'primary' : 'default'}
                                  sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }} />
                              </Tooltip>
                            ) : '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
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

// ── Shared sub-components ──────────────────────────────────────────────────────

const SectionTitle = ({ children }: { children: ReactNode }) => (
  <Typography variant="overline" sx={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: 1.5, color: 'text.secondary', display: 'block', pt: 1 }}>
    {children}
  </Typography>
);

/** Small summary card */
const SummaryCard = ({ icon, label, value, color }: { icon: ReactNode; label: string; value: string | number; color: string }) => (
  <Card sx={{ minWidth: 160, flex: 1 }}>
    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <Box sx={{ color, display: 'flex' }}>{icon}</Box>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>{value}</Typography>
          <Typography variant="caption" color="text.secondary">{label}</Typography>
        </Box>
      </Stack>
    </CardContent>
  </Card>
);
