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
  TableSortLabel,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  TrendingFlat as TrendingFlatIcon,
  BarChart as BarChartIcon,
  PieChart as PieChartIcon,
  TableChart as TableChartIcon,
  Devices as DevicesIcon,
  MusicNote as SongIcon,
  Search as SearchIcon,
  ErrorOutlined as ErrorIcon,
  OpenInNew as WindowIcon,
  LibraryBooks as ShowIcon,
  People as AccountsIcon,
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

/** How many accounts get their own series in the per-account stacked chart / leaderboard charts. */
const TOP_ACCOUNT_COUNT = 8;

type AccountAgg = {
  account: number;
  label: string;
  events: number;
  devices: number;
  topEvent: string;
  errors: number;
  firstSeen: string;
  lastActive: string;
  /** % change of events in the second half of the range vs the first half (null when no first-half baseline). */
  trendPct: number | null;
  spark: { i: number; count: number }[];
};

type AccountSortKey = 'label' | 'events' | 'devices' | 'errors' | 'lastActive' | 'trendPct';

const getDefaultDateRange = () => {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
};

/** Bucket a date into a day/week/month key for time-series grouping. */
const bucketKey = (date: Date, granularity: Granularity): string => {
  if (granularity === 'day') return date.toISOString().slice(0, 10);
  if (granularity === 'week') {
    const d = new Date(date);
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 7);
};

const groupByDate = (metrics: MetricEvent[], granularity: Granularity): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const m of metrics) {
    const key = bucketKey(new Date(m.created_at), granularity);
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

const countByEvent = (metrics: MetricEvent[], eventType: string) => metrics.filter((m) => m.event === eventType).length;

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

/** Group a specific event type by its entity_id, sorted desc and capped. */
const groupByEntityId = (metrics: MetricEvent[], eventType: string, limit = 20) => {
  const counts: Record<string, number> = {};
  for (const m of metrics.filter((m) => m.event === eventType)) {
    const val = m.entity_id ?? 'unknown';
    counts[val] = (counts[val] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, value]) => ({ name, value }));
};

/** Top songs by usage (song_selected), labelled with the song title when available. */
const topSongsByUsage = (metrics: MetricEvent[], limit = 10) => {
  const counts: Record<string, number> = {};
  const titles: Record<string, string> = {};
  for (const m of metrics.filter((m) => m.event === 'song_selected')) {
    const id = m.entity_id ?? 'unknown';
    counts[id] = (counts[id] || 0) + 1;
    const t = (m.metadata as Record<string, string> | undefined)?.title;
    if (t) titles[id] = t;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, value]) => ({ name: titles[id] ? `${titles[id]} (#${id})` : `#${id}`, value }));
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
  const [accountSort, setAccountSort] = useState<{ key: AccountSortKey; dir: 'asc' | 'desc' }>({ key: 'events', dir: 'desc' });
  const [selectedSetting, setSelectedSetting] = useState('');

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

  // ── Accounts (admin, aggregated across all accounts) ─────────────────────────
  const accountNameMap = useMemo(() => {
    const map: Record<number, string> = {};
    for (const a of adminAccounts) map[a.license] = a.name ? `${a.name} (#${a.license})` : `#${a.license}`;
    return map;
  }, [adminAccounts]);

  const accountAggregates = useMemo<AccountAgg[]>(() => {
    const groups = new Map<number, MetricEvent[]>();
    for (const m of metrics) {
      const acc = Number(m.account);
      if (!Number.isFinite(acc)) continue;
      const arr = groups.get(acc);
      if (arr) arr.push(m);
      else groups.set(acc, [m]);
    }

    // Split the selected range at its midpoint to derive a simple engagement trend.
    // Fall back to the data's own time span (kept pure — no Date.now()) when a bound is unset.
    let maxTime = 0;
    for (const m of metrics) {
      const t = new Date(m.created_at).getTime();
      if (t > maxTime) maxTime = t;
    }
    const fromMs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : 0;
    const toMs = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : maxTime;
    const midMs = fromMs + (toMs - fromMs) / 2;

    const result: AccountAgg[] = [];
    for (const [account, list] of groups) {
      const devices = new Set<string>();
      const eventCounts: Record<string, number> = {};
      const sparkMap: Record<string, number> = {};
      let errors = 0;
      let firstSeen = list[0].created_at;
      let lastActive = list[0].created_at;
      let firstHalf = 0;
      let secondHalf = 0;
      for (const m of list) {
        const dev = (m.metadata as Record<string, string> | undefined)?.device_id;
        if (dev) devices.add(dev);
        eventCounts[m.event] = (eventCounts[m.event] || 0) + 1;
        if (m.event === 'uncaught_error') errors++;
        if (m.created_at < firstSeen) firstSeen = m.created_at;
        if (m.created_at > lastActive) lastActive = m.created_at;
        if (new Date(m.created_at).getTime() < midMs) firstHalf++;
        else secondHalf++;
        const key = bucketKey(new Date(m.created_at), granularity);
        sparkMap[key] = (sparkMap[key] || 0) + 1;
      }
      const topEvent = Object.entries(eventCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
      const trendPct = firstHalf === 0 ? (secondHalf > 0 ? 100 : null) : Math.round(((secondHalf - firstHalf) / firstHalf) * 100);
      const spark = Object.keys(sparkMap)
        .sort()
        .map((k, i) => ({ i, count: sparkMap[k] }));
      result.push({
        account,
        label: accountNameMap[account] ?? `#${account}`,
        events: list.length,
        devices: devices.size,
        topEvent,
        errors,
        firstSeen,
        lastActive,
        trendPct,
        spark,
      });
    }
    return result.sort((a, b) => b.events - a.events);
  }, [metrics, accountNameMap, dateFrom, dateTo, granularity]);

  const sortedAccounts = useMemo(() => {
    const { key, dir } = accountSort;
    const factor = dir === 'asc' ? 1 : -1;
    return [...accountAggregates].sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      if (key === 'label') {
        av = a.label.toLowerCase();
        bv = b.label.toLowerCase();
      } else if (key === 'lastActive') {
        av = a.lastActive;
        bv = b.lastActive;
      } else if (key === 'trendPct') {
        av = a.trendPct ?? -Infinity;
        bv = b.trendPct ?? -Infinity;
      } else {
        av = a[key];
        bv = b[key];
      }
      if (av < bv) return -1 * factor;
      if (av > bv) return 1 * factor;
      return 0;
    });
  }, [accountAggregates, accountSort]);

  const activeAccountsOverTime = useMemo(() => {
    const map: Record<string, Set<number>> = {};
    for (const m of metrics) {
      const acc = Number(m.account);
      if (!Number.isFinite(acc)) continue;
      const key = bucketKey(new Date(m.created_at), granularity);
      (map[key] ||= new Set()).add(acc);
    }
    return Object.keys(map)
      .sort()
      .map((date) => ({ date, count: map[date].size }));
  }, [metrics, granularity]);

  /** Stable colour per account, keyed by event-volume rank, so table dots and charts agree. */
  const accountColorMap = useMemo(() => {
    const map: Record<number, string> = {};
    accountAggregates.forEach((a, i) => {
      map[a.account] = i < TOP_ACCOUNT_COUNT ? CHART_COLORS[i % CHART_COLORS.length] : '#9e9e9e';
    });
    return map;
  }, [accountAggregates]);

  const topAccountsByEvents = useMemo(
    () => accountAggregates.slice(0, TOP_ACCOUNT_COUNT).map((a) => ({ name: a.label, value: a.events, account: a.account })),
    [accountAggregates],
  );

  const eventsByAccountOverTime = useMemo(() => {
    const top = accountAggregates.slice(0, TOP_ACCOUNT_COUNT);
    const topIds = new Set(top.map((a) => a.account));
    const buckets: Record<string, Record<string, number>> = {};
    for (const m of metrics) {
      const acc = Number(m.account);
      if (!Number.isFinite(acc)) continue;
      const key = bucketKey(new Date(m.created_at), granularity);
      const b = (buckets[key] ||= {});
      const seriesKey = topIds.has(acc) ? `a${acc}` : 'other';
      b[seriesKey] = (b[seriesKey] || 0) + 1;
    }
    const rows = Object.keys(buckets)
      .sort()
      .map((date) => ({ date, ...buckets[date] }));
    const series = top.map((a, i) => ({ key: `a${a.account}`, label: a.label, color: CHART_COLORS[i % CHART_COLORS.length] }));
    const hasOther = rows.some((r) => 'other' in r);
    return { rows, series, hasOther };
  }, [metrics, accountAggregates, granularity]);

  const showAccountSection = isAdmin && accountFilter === '' && accountAggregates.length > 0;

  // ── Overview ────────────────────────────────────────────────────────────────
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

  // ── Devices ─────────────────────────────────────────────────────────────────
  const uniqueDevicesOverTime = useMemo(() => {
    const devicesByDate: Record<string, Set<string>> = {};
    for (const m of metrics) {
      const deviceId = (m.metadata as Record<string, string> | undefined)?.device_id;
      if (!deviceId) continue;
      const key = bucketKey(new Date(m.created_at), granularity);
      if (!devicesByDate[key]) devicesByDate[key] = new Set();
      devicesByDate[key].add(deviceId);
    }
    return Object.entries(devicesByDate)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, devices]) => ({ date, count: devices.size }));
  }, [metrics, granularity]);

  const totalUniqueDevices = useMemo(() => {
    const ids = new Set(metrics.map((m) => (m.metadata as Record<string, string> | undefined)?.device_id).filter(Boolean));
    return ids.size;
  }, [metrics]);

  const uniqueDeviceIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of metrics) {
      const id = (m.metadata as Record<string, string> | undefined)?.device_id;
      if (id) ids.add(id);
    }
    return Array.from(ids).sort();
  }, [metrics]);

  // ── Songs ────────────────────────────────────────────────────────────────────
  const songImportedCount = useMemo(() => countByEvent(metrics, 'song_imported'), [metrics]);
  const songCreatedCount = useMemo(() => countByEvent(metrics, 'song_created'), [metrics]);
  const songUpdatedCount = useMemo(() => countByEvent(metrics, 'song_updated'), [metrics]);
  const songDeletedCount = useMemo(() => countByEvent(metrics, 'song_deleted'), [metrics]);

  /** Created / imported / updated / deleted songs bucketed per date for a multi-series chart. */
  const songLifecycleOverTime = useMemo(() => {
    const buckets: Record<string, { created: number; imported: number; updated: number; deleted: number }> = {};
    for (const m of metrics) {
      let field: 'created' | 'imported' | 'updated' | 'deleted' | null = null;
      if (m.event === 'song_created') field = 'created';
      else if (m.event === 'song_imported') field = 'imported';
      else if (m.event === 'song_updated') field = 'updated';
      else if (m.event === 'song_deleted') field = 'deleted';
      if (!field) continue;
      const key = bucketKey(new Date(m.created_at), granularity);
      const b = (buckets[key] ||= { created: 0, imported: 0, updated: 0, deleted: 0 });
      b[field]++;
    }
    return Object.keys(buckets)
      .sort()
      .map((date) => ({ date, ...buckets[date] }));
  }, [metrics, granularity]);

  const songImportSources = useMemo(() => groupMetadataField(metrics, 'song_imported', 'source'), [metrics]);
  const songChangeVia = useMemo(() => groupMetadataField(metrics, 'song_updated', 'via'), [metrics]);
  const topSongs = useMemo(() => topSongsByUsage(metrics, 10), [metrics]);
  const songRenumberResults = useMemo(() => groupMetadataField(metrics, 'song_renumbered', 'ok'), [metrics]);
  const songActivityData = useMemo(
    () =>
      [
        { name: 'song_created', value: songCreatedCount },
        { name: 'song_imported', value: songImportedCount },
        { name: 'ccli_lyrics_imported', value: countByEvent(metrics, 'ccli_lyrics_imported') },
        { name: 'song_updated', value: songUpdatedCount },
        { name: 'song_renumbered', value: countByEvent(metrics, 'song_renumbered') },
        { name: 'song_deleted', value: songDeletedCount },
        { name: 'song_selected', value: countByEvent(metrics, 'song_selected') },
      ].filter((d) => d.value > 0),
    [metrics, songCreatedCount, songImportedCount, songUpdatedCount, songDeletedCount],
  );

  // ── Shows ────────────────────────────────────────────────────────────────────
  const showCreatedOverTime = useMemo(() => groupEventByDate(metrics, 'show_created', granularity), [metrics, granularity]);
  const showActivityData = useMemo(
    () =>
      [
        { name: 'show_created', value: countByEvent(metrics, 'show_created') },
        { name: 'show_loaded', value: countByEvent(metrics, 'show_loaded') },
        { name: 'show_saved', value: countByEvent(metrics, 'show_saved') },
        { name: 'show_deleted', value: countByEvent(metrics, 'show_deleted') },
      ].filter((d) => d.value > 0),
    [metrics],
  );

  // ── Content – PDF / Media / Bible ─────────────────────────────────────────
  const contentActivityData = useMemo(
    () =>
      [
        { name: 'pdf_uploaded', value: countByEvent(metrics, 'pdf_uploaded') },
        { name: 'ccli_chords_imported', value: countByEvent(metrics, 'ccli_chords_imported') },
        { name: 'pdf_viewed', value: countByEvent(metrics, 'pdf_viewed') },
        { name: 'pdf_deleted', value: countByEvent(metrics, 'pdf_deleted') },
        { name: 'media_added', value: countByEvent(metrics, 'media_added') },
        { name: 'bible_verse_added', value: countByEvent(metrics, 'bible_verse_added') },
      ].filter((d) => d.value > 0),
    [metrics],
  );

  // ── Search ───────────────────────────────────────────────────────────────────
  const searchOverTime = useMemo(() => groupEventByDate(metrics, 'search_performed', granularity), [metrics, granularity]);

  // ── Windows ──────────────────────────────────────────────────────────────────
  const windowOpenedData = useMemo(() => groupMetadataField(metrics, 'window_opened', 'name'), [metrics]);
  const windowModeData = useMemo(() => groupMetadataField(metrics, 'window_opened', 'displayMode'), [metrics]);
  const windowResolutionData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of metrics.filter((m) => m.event === 'window_opened')) {
      const meta = m.metadata as Record<string, unknown> | undefined;
      const w = meta?.width;
      const h = meta?.height;
      const key = w && h ? `${w}×${h}` : 'unknown';
      counts[key] = (counts[key] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([name, value]) => ({ name, value }));
  }, [metrics]);
  const windowFullscreenData = useMemo(() => {
    let fullscreen = 0;
    let windowed = 0;
    for (const m of metrics.filter((m) => m.event === 'window_opened')) {
      if ((m.metadata as Record<string, unknown> | undefined)?.fullscreen) fullscreen++;
      else windowed++;
    }
    return [
      { name: 'Fullscreen', value: fullscreen },
      { name: 'Windowed', value: windowed },
    ].filter((d) => d.value > 0);
  }, [metrics]);
  const windowConfigsTable = useMemo(() => {
    const rows = metrics
      .filter((m) => m.event === 'window_opened')
      .map((m) => {
        const meta = (m.metadata ?? {}) as Record<string, unknown>;
        return {
          id: m.id,
          name: String(meta.name ?? '—'),
          mode: String(meta.displayMode ?? '—'),
          resolution: meta.width && meta.height ? `${meta.width}×${meta.height}` : '—',
          position: meta.left != null && meta.top != null ? `${meta.left}, ${meta.top}` : '—',
          fullscreen: meta.fullscreen ? '✓' : '',
          frameless: meta.frameless ? '✓' : '',
          alwaysOnTop: meta.alwaysOnTop ? '✓' : '',
          created_at: m.created_at,
        };
      });
    return rows.slice(0, 100);
  }, [metrics]);

  // ── Presentation ─────────────────────────────────────────────────────────────
  const presentationData = useMemo(
    () =>
      [
        { name: 'presentation_opened', value: countByEvent(metrics, 'presentation_opened') },
        { name: 'style_changed', value: countByEvent(metrics, 'style_changed') },
        { name: 'block_navigated', value: countByEvent(metrics, 'block_navigated') },
      ].filter((d) => d.value > 0),
    [metrics],
  );

  // ── Musician ─────────────────────────────────────────────────────────────────
  const musicianButtonData = useMemo(() => groupMetadataField(metrics, 'musician_button_clicked', 'button'), [metrics]);
  const musicianLayerData = useMemo(() => groupMetadataField(metrics, 'musician_layer_action', 'action'), [metrics]);
  const modalOpenedData = useMemo(() => groupMetadataField(metrics, 'modal_opened', 'modal'), [metrics]);
  const syncModeData = useMemo(
    () => groupMetadataField(metrics, 'musician_button_clicked', 'value').filter((d) => d.name !== 'unknown'),
    [metrics],
  );

  // ── Settings ─────────────────────────────────────────────────────────────────
  /** How often each setting (entity_id = setting key) was changed. */
  const settingChangeFrequency = useMemo(() => groupByEntityId(metrics, 'setting_changed'), [metrics]);
  const settingKeys = useMemo(() => settingChangeFrequency.map((s) => s.name), [settingChangeFrequency]);

  /**
   * Distribution of the *currently configured* value for the selected setting, counted per device:
   * we take each device's most recent value for that setting and tally how many devices use each value.
   */
  const settingValueDistribution = useMemo(() => {
    const key = selectedSetting || settingKeys[0];
    if (!key) return [];
    const latestPerDevice: Record<string, { value: string; time: string }> = {};
    for (const m of metrics) {
      if (m.event !== 'setting_changed' || m.entity_id !== key) continue;
      const meta = m.metadata as Record<string, unknown> | undefined;
      const device = String(meta?.device_id ?? 'unknown');
      const value = String(meta?.value ?? 'unknown');
      if (!latestPerDevice[device] || m.created_at > latestPerDevice[device].time) {
        latestPerDevice[device] = { value, time: m.created_at };
      }
    }
    const counts: Record<string, number> = {};
    for (const { value } of Object.values(latestPerDevice)) counts[value] = (counts[value] || 0) + 1;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));
  }, [metrics, selectedSetting, settingKeys]);

  // ── Auth / System ─────────────────────────────────────────────────────────────
  const authSystemData = useMemo(
    () =>
      [
        { name: 'login', value: countByEvent(metrics, 'login') },
        { name: 'fresh_start', value: countByEvent(metrics, 'fresh_start') },
        { name: 'uncaught_error', value: countByEvent(metrics, 'uncaught_error') },
        { name: 'metrics_disabled', value: countByEvent(metrics, 'metrics_disabled') },
      ].filter((d) => d.value > 0),
    [metrics],
  );

  const uncaughtErrorData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of metrics.filter((m) => m.event === 'uncaught_error')) {
      const src = (m.metadata as Record<string, string> | undefined)?.source ?? 'unknown';
      counts[src] = (counts[src] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));
  }, [metrics]);

  // ── Misc ────────────────────────────────────────────────────────────────────
  const uniqueEvents = useMemo(() => {
    const events = new Set<string>();
    for (const m of metrics) events.add(m.event);
    return Array.from(events).sort();
  }, [metrics]);
  const recentEvents = useMemo(() => metrics.slice(0, 50), [metrics]);

  const handleSortAccounts = (key: AccountSortKey) =>
    setAccountSort((prev) => ({ key, dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc' }));

  const handleExportAccounts = () =>
    exportToCsv(
      accountAggregates.map((a) => ({
        account: a.label,
        events: a.events,
        devices: a.devices,
        top_feature: a.topEvent,
        errors: a.errors,
        trend_pct: a.trendPct ?? '',
        first_seen: a.firstSeen,
        last_active: a.lastActive,
      })),
      `metrics_accounts_${dateFrom}_${dateTo}.csv`,
    );

  const handleExportAll = () => {
    exportToCsv(
      metrics.map((m) => ({
        id: m.id,
        event: m.event,
        entity_type: m.entity_type ?? '',
        entity_id: m.entity_id ?? '',
        metadata: m.metadata ? JSON.stringify(m.metadata) : '',
        created_at: m.created_at,
      })),
      `metrics_${dateFrom}_${dateTo}.csv`,
    );
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Stack spacing={3}>
      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" spacing={2} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
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
              <Select value={accountFilter} label={LL.COMMON.ACCOUNT()} onChange={(e) => setAccountFilter(e.target.value as number | '')}>
                <MenuItem value="">{LL.UNIFIED_SEARCH.ALL()}</MenuItem>
                {adminAccounts.map((a) => (
                  <MenuItem key={a.license} value={a.license}>
                    {a.name ? `${a.name} (#${a.license})` : `#${a.license}`}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>{LL.METRICS.DEVICE_ID()}</InputLabel>
            <Select value={deviceIdFilter} label={LL.METRICS.DEVICE_ID()} onChange={(e) => setDeviceIdFilter(e.target.value)}>
              <MenuItem value="">{LL.UNIFIED_SEARCH.ALL()}</MenuItem>
              {uniqueDeviceIds.map((id) => (
                <MenuItem key={id} value={id} sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                  {id.slice(0, 13)}…
                </MenuItem>
              ))}
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
          <Button startIcon={<RefreshIcon />} onClick={() => refetch()} disabled={isFetching}>
            {LL.METRICS.REFRESH()}
          </Button>
          <Box sx={{ flexGrow: 1 }} />
          <Tooltip title={LL.METRICS.EXPORT_CSV()}>
            <IconButton onClick={handleExportAll} disabled={metrics.length === 0}>
              <DownloadIcon />
            </IconButton>
          </Tooltip>
          <Typography variant="body2" color="text.secondary">
            {LL.METRICS.TOTAL_EVENTS({ count: data?.total ?? 0 })}
          </Typography>
        </Stack>
      </Paper>

      {metrics.length === 0 ? (
        <Alert severity="info">{LL.METRICS.NO_DATA()}</Alert>
      ) : (
        <>
          {/* ── Summary Cards ──────────────────────────────────────────────── */}
          <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
            <SummaryCard
              icon={<BarChartIcon />}
              label={LL.METRICS.TOTAL_EVENTS({ count: metrics.length })}
              value={metrics.length}
              color="#1976d2"
            />
            {showAccountSection && (
              <SummaryCard icon={<AccountsIcon />} label={LL.METRICS.ACTIVE_ACCOUNTS()} value={accountAggregates.length} color="#1565c0" />
            )}
            <SummaryCard icon={<TrendingUpIcon />} label={LL.METRICS.EVENT_TYPES()} value={eventTypeDistribution.length} color="#388e3c" />
            <SummaryCard icon={<DevicesIcon />} label={LL.METRICS.UNIQUE_DEVICES()} value={totalUniqueDevices} color="#9c27b0" />
            <SummaryCard icon={<SongIcon />} label={LL.METRICS.SONGS_IMPORTED()} value={songImportedCount} color="#e65100" />
            <SummaryCard
              icon={<ShowIcon />}
              label={LL.METRICS.SHOWS_CREATED()}
              value={countByEvent(metrics, 'show_created')}
              color="#00838f"
            />
            <SummaryCard icon={<ErrorIcon />} label={LL.METRICS.ERRORS()} value={countByEvent(metrics, 'uncaught_error')} color="#c62828" />
          </Stack>

          {/* ── Accounts (admin only, all-accounts view) ────────────────────── */}
          {showAccountSection && (
            <>
              <SectionTitle>{LL.METRICS.SECTION_ACCOUNTS()}</SectionTitle>

              {/* Active accounts over time + Top accounts by events */}
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <Card sx={{ flex: 2 }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      <TrendingUpIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                      {LL.METRICS.ACTIVE_ACCOUNTS_OVER_TIME()}
                    </Typography>
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={activeAccountsOverTime}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                        <YAxis allowDecimals={false} />
                        <RechartsTooltip />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="count"
                          stroke="#1565c0"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          name={LL.METRICS.ACTIVE_ACCOUNTS()}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card sx={{ flex: 1 }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      <AccountsIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                      {LL.METRICS.TOP_ACCOUNTS()}
                    </Typography>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={topAccountsByEvents} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" allowDecimals={false} />
                        <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                        <RechartsTooltip />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} name={LL.METRICS.EVENTS()}>
                          {topAccountsByEvents.map((a) => (
                            <Cell key={a.account} fill={accountColorMap[a.account]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </Stack>

              {/* Events by account over time (stacked) */}
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    <BarChartIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                    {LL.METRICS.EVENTS_BY_ACCOUNT()}
                  </Typography>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={eventsByAccountOverTime.rows}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} />
                      <RechartsTooltip />
                      <Legend />
                      {eventsByAccountOverTime.series.map((s) => (
                        <Bar key={s.key} dataKey={s.key} stackId="acc" fill={s.color} name={s.label} />
                      ))}
                      {eventsByAccountOverTime.hasOther && <Bar dataKey="other" stackId="acc" fill="#9e9e9e" name={LL.METRICS.OTHER()} />}
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Account leaderboard table */}
              <Card>
                <CardContent>
                  <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="h6">
                      <AccountsIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                      {LL.METRICS.ACCOUNT_ACTIVITY()}
                    </Typography>
                    <Tooltip title={LL.METRICS.EXPORT_CSV()}>
                      <IconButton size="small" onClick={handleExportAccounts}>
                        <DownloadIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                  <TableContainer sx={{ maxHeight: 460, overflow: 'auto' }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <AccountSortCell label={LL.COMMON.ACCOUNT()} sortKey="label" sort={accountSort} onSort={handleSortAccounts} />
                          <AccountSortCell
                            label={LL.METRICS.EVENTS()}
                            sortKey="events"
                            align="right"
                            sort={accountSort}
                            onSort={handleSortAccounts}
                          />
                          <AccountSortCell
                            label={LL.METRICS.DEVICES()}
                            sortKey="devices"
                            align="right"
                            sort={accountSort}
                            onSort={handleSortAccounts}
                          />
                          <TableCell>{LL.METRICS.TOP_FEATURE()}</TableCell>
                          <AccountSortCell
                            label={LL.METRICS.ERRORS()}
                            sortKey="errors"
                            align="right"
                            sort={accountSort}
                            onSort={handleSortAccounts}
                          />
                          <AccountSortCell
                            label={LL.METRICS.TREND()}
                            sortKey="trendPct"
                            align="right"
                            sort={accountSort}
                            onSort={handleSortAccounts}
                          />
                          <AccountSortCell
                            label={LL.METRICS.LAST_ACTIVE()}
                            sortKey="lastActive"
                            sort={accountSort}
                            onSort={handleSortAccounts}
                          />
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {sortedAccounts.map((a) => (
                          <TableRow key={a.account} hover sx={{ cursor: 'pointer' }} onClick={() => setAccountFilter(a.account)}>
                            <TableCell>
                              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: accountColorMap[a.account] }} />
                                <span>{a.label}</span>
                              </Stack>
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 600 }}>
                              {a.events.toLocaleString()}
                            </TableCell>
                            <TableCell align="right">{a.devices}</TableCell>
                            <TableCell>
                              <Chip label={a.topEvent} size="small" variant="outlined" />
                            </TableCell>
                            <TableCell align="right">
                              {a.errors > 0 ? (
                                <Typography component="span" variant="body2" sx={{ color: 'error.main', fontWeight: 600 }}>
                                  {a.errors}
                                </Typography>
                              ) : (
                                '—'
                              )}
                            </TableCell>
                            <TableCell align="right">
                              <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', justifyContent: 'flex-end' }}>
                                <Sparkline data={a.spark} color={accountColorMap[a.account]} />
                                <TrendBadge pct={a.trendPct} />
                              </Stack>
                            </TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                              {new Date(a.lastActive).toLocaleDateString()}
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

          {/* ── Overview: Events over time + Event type distribution ──────── */}
          <SectionTitle>{LL.METRICS.SECTION_OVERVIEW()}</SectionTitle>
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

          {/* Usage trend + Entity type pie */}
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <Card sx={{ flex: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  <TrendingUpIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                  {LL.METRICS.USAGE_TREND()}
                </Typography>
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
                <Typography variant="h6" gutterBottom>
                  <PieChartIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                  {LL.METRICS.ENTITY_DISTRIBUTION()}
                </Typography>
                <ResponsiveContainer width="100%" height={260}>
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

          {/* ── Devices ──────────────────────────────────────────────────────── */}
          <SectionTitle>{LL.METRICS.SECTION_DEVICES()}</SectionTitle>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <Card sx={{ flex: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  <TrendingUpIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                  {LL.METRICS.UNIQUE_DEVICES_OVER_TIME()}
                </Typography>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={uniqueDevicesOverTime}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} />
                    <RechartsTooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="#9c27b0"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      name={LL.METRICS.UNIQUE_DEVICES()}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Stack>

          {/* ── Songs ────────────────────────────────────────────────────────── */}
          <SectionTitle>{LL.METRICS.SECTION_SONGS()}</SectionTitle>
          <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
            <SummaryCard icon={<SongIcon />} label={LL.METRICS.SONGS_CREATED()} value={songCreatedCount} color="#2e7d32" />
            <SummaryCard icon={<SongIcon />} label={LL.METRICS.SONGS_IMPORTED()} value={songImportedCount} color="#e65100" />
            <SummaryCard icon={<SongIcon />} label={LL.METRICS.SONGS_CHANGED()} value={songUpdatedCount} color="#1976d2" />
            <SummaryCard icon={<SongIcon />} label={LL.METRICS.SONGS_DELETED()} value={songDeletedCount} color="#c62828" />
          </Stack>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <SongIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                {LL.METRICS.SONG_LIFECYCLE()}
              </Typography>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={songLifecycleOverTime}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} />
                  <RechartsTooltip />
                  <Legend />
                  <Line type="monotone" dataKey="created" stroke="#2e7d32" strokeWidth={2} dot={false} name={LL.METRICS.SONGS_CREATED()} />
                  <Line
                    type="monotone"
                    dataKey="imported"
                    stroke="#e65100"
                    strokeWidth={2}
                    dot={false}
                    name={LL.METRICS.SONGS_IMPORTED()}
                  />
                  <Line type="monotone" dataKey="updated" stroke="#1976d2" strokeWidth={2} dot={false} name={LL.METRICS.SONGS_CHANGED()} />
                  <Line type="monotone" dataKey="deleted" stroke="#c62828" strokeWidth={2} dot={false} name={LL.METRICS.SONGS_DELETED()} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            {songActivityData.length > 0 && (
              <Card sx={{ flex: 1 }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    <SongIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                    {LL.METRICS.SONG_ACTIVITY()}
                  </Typography>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={songActivityData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" allowDecimals={false} />
                      <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                      <RechartsTooltip />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} name={LL.METRICS.EVENTS()}>
                        {songActivityData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
            {songImportSources.length > 0 && (
              <Card sx={{ flex: 1 }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    <PieChartIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                    {LL.METRICS.SONG_IMPORT_SOURCES()}
                  </Typography>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={songImportSources}
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        dataKey="value"
                        nameKey="name"
                        label
                        labelLine={false}
                      >
                        {songImportSources.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[(i + 3) % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
            {songChangeVia.length > 0 && (
              <Card sx={{ flex: 1 }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    <BarChartIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                    {LL.METRICS.SONG_CHANGES_BY()}
                  </Typography>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={songChangeVia} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" allowDecimals={false} />
                      <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
                      <RechartsTooltip />
                      <Bar dataKey="value" fill="#1976d2" radius={[0, 4, 4, 0]} name={LL.METRICS.EVENTS()} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </Stack>

          {/* Top songs + CCLI renumber outcomes */}
          {(topSongs.length > 0 || songRenumberResults.length > 0) && (
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              {topSongs.length > 0 && (
                <Card sx={{ flex: 2 }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      <SongIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                      {LL.METRICS.TOP_SONGS()}
                    </Typography>
                    <ResponsiveContainer width="100%" height={Math.max(240, topSongs.length * 30)}>
                      <BarChart data={topSongs} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" allowDecimals={false} />
                        <YAxis type="category" dataKey="name" width={200} tick={{ fontSize: 11 }} />
                        <RechartsTooltip />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} name={LL.METRICS.USAGE_COUNT()}>
                          {topSongs.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
              {songRenumberResults.length > 0 && (
                <Card sx={{ flex: 1 }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      <BarChartIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                      {LL.METRICS.SONG_RENUMBERS()}
                    </Typography>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={songRenumberResults} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" allowDecimals={false} />
                        <YAxis type="category" dataKey="name" width={60} tick={{ fontSize: 11 }} />
                        <RechartsTooltip />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} name={LL.METRICS.EVENTS()}>
                          {songRenumberResults.map((d, i) => (
                            <Cell key={i} fill={d.name === 'true' ? '#2e7d32' : '#d32f2f'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </Stack>
          )}

          {/* ── Windows ──────────────────────────────────────────────────────── */}
          {windowOpenedData.length > 0 && (
            <>
              <SectionTitle>{LL.METRICS.SECTION_WINDOWS()}</SectionTitle>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <Card sx={{ flex: 1 }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      <WindowIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                      {LL.METRICS.WINDOWS_OPENED()}
                    </Typography>
                    <ResponsiveContainer width="100%" height={240}>
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
                {windowModeData.length > 0 && (
                  <Card sx={{ flex: 1 }}>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        <PieChartIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                        {LL.METRICS.WINDOW_MODES()}
                      </Typography>
                      <ResponsiveContainer width="100%" height={240}>
                        <PieChart>
                          <Pie
                            data={windowModeData}
                            cx="50%"
                            cy="50%"
                            outerRadius={90}
                            dataKey="value"
                            nameKey="name"
                            label
                            labelLine={false}
                          >
                            {windowModeData.map((_, i) => (
                              <Cell key={i} fill={CHART_COLORS[(i + 2) % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <RechartsTooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}
              </Stack>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                {windowResolutionData.length > 0 && (
                  <Card sx={{ flex: 2 }}>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        <BarChartIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                        {LL.METRICS.WINDOW_RESOLUTIONS()}
                      </Typography>
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={windowResolutionData} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" allowDecimals={false} />
                          <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                          <RechartsTooltip />
                          <Bar dataKey="value" fill="#00838f" radius={[0, 4, 4, 0]} name={LL.METRICS.EVENTS()} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}
                {windowFullscreenData.length > 0 && (
                  <Card sx={{ flex: 1 }}>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        <PieChartIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                        {LL.METRICS.WINDOW_FULLSCREEN()}
                      </Typography>
                      <ResponsiveContainer width="100%" height={240}>
                        <PieChart>
                          <Pie
                            data={windowFullscreenData}
                            cx="50%"
                            cy="50%"
                            outerRadius={90}
                            dataKey="value"
                            nameKey="name"
                            label
                            labelLine={false}
                          >
                            {windowFullscreenData.map((_, i) => (
                              <Cell key={i} fill={['#1565c0', '#9e9e9e'][i % 2]} />
                            ))}
                          </Pie>
                          <RechartsTooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}
              </Stack>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    <WindowIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                    {LL.METRICS.WINDOW_CONFIGS()}
                  </Typography>
                  <TableContainer sx={{ maxHeight: 360, overflow: 'auto' }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell>{LL.METRICS.COL_NAME()}</TableCell>
                          <TableCell>{LL.METRICS.COL_MODE()}</TableCell>
                          <TableCell>{LL.METRICS.COL_RESOLUTION()}</TableCell>
                          <TableCell>{LL.METRICS.COL_POSITION()}</TableCell>
                          <TableCell align="center">{LL.METRICS.COL_FULLSCREEN()}</TableCell>
                          <TableCell align="center">{LL.METRICS.COL_FRAMELESS()}</TableCell>
                          <TableCell align="center">{LL.METRICS.COL_ALWAYS_ON_TOP()}</TableCell>
                          <TableCell>{LL.METRICS.TIMESTAMP()}</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {windowConfigsTable.map((w) => (
                          <TableRow key={w.id} hover>
                            <TableCell>{w.name}</TableCell>
                            <TableCell>
                              <Chip label={w.mode} size="small" variant="outlined" />
                            </TableCell>
                            <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{w.resolution}</TableCell>
                            <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{w.position}</TableCell>
                            <TableCell align="center">{w.fullscreen}</TableCell>
                            <TableCell align="center">{w.frameless}</TableCell>
                            <TableCell align="center">{w.alwaysOnTop}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                              {new Date(w.created_at).toLocaleString()}
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

          {/* ── Shows ────────────────────────────────────────────────────────── */}
          <SectionTitle>{LL.METRICS.SECTION_SHOWS()}</SectionTitle>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <Card sx={{ flex: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  <ShowIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                  {LL.METRICS.SHOWS_CREATED_OVER_TIME()}
                </Typography>
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
                  <Typography variant="h6" gutterBottom>
                    <ShowIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                    {LL.METRICS.SHOW_ACTIVITY()}
                  </Typography>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={showActivityData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} />
                      <RechartsTooltip />
                      <Bar dataKey="value" fill="#00838f" radius={[4, 4, 0, 0]} name={LL.METRICS.EVENTS()}>
                        {showActivityData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[(i + 4) % CHART_COLORS.length]} />
                        ))}
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
                  <Typography variant="h6" gutterBottom>
                    <TableChartIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                    {LL.METRICS.CONTENT_ACTIVITY()}
                  </Typography>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={contentActivityData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} />
                      <RechartsTooltip />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]} name={LL.METRICS.EVENTS()}>
                        {contentActivityData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[(i + 7) % CHART_COLORS.length]} />
                        ))}
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
                  <Typography variant="h6" gutterBottom>
                    <SearchIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                    {LL.METRICS.SEARCHES_OVER_TIME()}
                  </Typography>
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
                  <Typography variant="h6" gutterBottom>
                    <BarChartIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                    {LL.METRICS.PRESENTATION_ACTIVITY()}
                  </Typography>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={presentationData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} />
                      <RechartsTooltip />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]} name={LL.METRICS.EVENTS()}>
                        {presentationData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[(i + 1) % CHART_COLORS.length]} />
                        ))}
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
                      <Typography variant="h6" gutterBottom>
                        <BarChartIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                        {LL.METRICS.MUSICIAN_BUTTON_USAGE()}
                      </Typography>
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
                      <Typography variant="h6" gutterBottom>
                        <BarChartIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                        {LL.METRICS.LAYER_ACTIONS()}
                      </Typography>
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
                      <Typography variant="h6" gutterBottom>
                        <BarChartIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                        {LL.METRICS.MODAL_OPENED()}
                      </Typography>
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
                      <Typography variant="h6" gutterBottom>
                        <BarChartIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                        {LL.METRICS.SYNC_MODE_USAGE()}
                      </Typography>
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
          {settingChangeFrequency.length > 0 && (
            <>
              <SectionTitle>{LL.METRICS.SECTION_SETTINGS()}</SectionTitle>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                {/* How often each setting is changed */}
                <Card sx={{ flex: 1 }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      <BarChartIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                      {LL.METRICS.SETTING_CHANGE_FREQUENCY()}
                    </Typography>
                    <ResponsiveContainer width="100%" height={Math.max(240, settingChangeFrequency.length * 26)}>
                      <BarChart data={settingChangeFrequency} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" allowDecimals={false} />
                        <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 11 }} />
                        <RechartsTooltip />
                        <Bar dataKey="value" fill="#558b2f" radius={[0, 4, 4, 0]} name={LL.METRICS.EVENTS()} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Configured values per device for a chosen setting */}
                <Card sx={{ flex: 1 }}>
                  <CardContent>
                    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1, flexWrap: 'wrap', gap: 1 }}>
                      <Typography variant="h6">
                        <PieChartIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                        {LL.METRICS.SETTING_VALUES()}
                      </Typography>
                      <FormControl size="small" sx={{ minWidth: 180 }}>
                        <InputLabel>{LL.METRICS.SETTING_LABEL()}</InputLabel>
                        <Select
                          value={selectedSetting || settingKeys[0] || ''}
                          label={LL.METRICS.SETTING_LABEL()}
                          onChange={(e) => setSelectedSetting(e.target.value)}
                        >
                          {settingKeys.map((k) => (
                            <MenuItem key={k} value={k}>
                              {k}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Stack>
                    {settingValueDistribution.length > 0 ? (
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={settingValueDistribution} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" allowDecimals={false} />
                          <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                          <RechartsTooltip />
                          <Bar dataKey="value" radius={[0, 4, 4, 0]} name={LL.METRICS.DEVICES()}>
                            {settingValueDistribution.map((_, i) => (
                              <Cell key={i} fill={CHART_COLORS[(i + 1) % CHART_COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <Alert severity="info" sx={{ mt: 1 }}>
                        {LL.METRICS.NO_DATA()}
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              </Stack>
            </>
          )}

          {/* ── Auth / System ─────────────────────────────────────────────────── */}
          {authSystemData.length > 0 && (
            <>
              <SectionTitle>{LL.METRICS.SECTION_SYSTEM()}</SectionTitle>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <Card sx={{ flex: 1 }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      <BarChartIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                      {LL.METRICS.SYSTEM_EVENTS()}
                    </Typography>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={authSystemData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} />
                        <RechartsTooltip />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]} name={LL.METRICS.EVENTS()}>
                          {authSystemData.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[(i + 6) % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                {uncaughtErrorData.length > 0 && (
                  <Card sx={{ flex: 1 }}>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        <ErrorIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                        {LL.METRICS.ERROR_SOURCES()}
                      </Typography>
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
                  <IconButton
                    size="small"
                    onClick={() =>
                      exportToCsv(
                        recentEvents.map((m) => ({
                          event: m.event,
                          entity_type: m.entity_type ?? '',
                          entity_id: m.entity_id ?? '',
                          device_id: (m.metadata as Record<string, string> | undefined)?.device_id ?? '',
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
                      <TableCell>{LL.METRICS.DEVICE_ID()}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {recentEvents.map((m) => {
                      const devId = (m.metadata as Record<string, string> | undefined)?.device_id;
                      return (
                        <TableRow key={m.id} hover>
                          <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{new Date(m.created_at).toLocaleString()}</TableCell>
                          <TableCell>
                            <Chip label={m.event} size="small" variant="outlined" />
                          </TableCell>
                          <TableCell>{m.entity_type ?? '—'}</TableCell>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{m.entity_id ?? '—'}</TableCell>
                          <TableCell>
                            {devId ? (
                              <Tooltip title={devId}>
                                <Chip
                                  label={devId.slice(0, 8) + '…'}
                                  size="small"
                                  variant="outlined"
                                  clickable
                                  onClick={() => setDeviceIdFilter(devId === deviceIdFilter ? '' : devId)}
                                  color={devId === deviceIdFilter ? 'primary' : 'default'}
                                  sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}
                                />
                              </Tooltip>
                            ) : (
                              '—'
                            )}
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
  <Typography
    variant="overline"
    sx={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: 1.5, color: 'text.secondary', display: 'block', pt: 1 }}
  >
    {children}
  </Typography>
);

/** Sortable header cell for the account leaderboard. */
const AccountSortCell = ({
  label,
  sortKey,
  sort,
  onSort,
  align = 'left',
}: {
  label: string;
  sortKey: AccountSortKey;
  sort: { key: AccountSortKey; dir: 'asc' | 'desc' };
  onSort: (key: AccountSortKey) => void;
  align?: 'left' | 'right';
}) => (
  <TableCell align={align} sortDirection={sort.key === sortKey ? sort.dir : false}>
    <TableSortLabel active={sort.key === sortKey} direction={sort.key === sortKey ? sort.dir : 'desc'} onClick={() => onSort(sortKey)}>
      {label}
    </TableSortLabel>
  </TableCell>
);

/** Tiny inline trend sparkline. */
const Sparkline = ({ data, color }: { data: { i: number; count: number }[]; color: string }) =>
  data.length < 2 ? (
    <Box sx={{ width: 70, height: 24 }} />
  ) : (
    <ResponsiveContainer width={70} height={24}>
      <LineChart data={data} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
        <Line type="monotone" dataKey="count" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );

/** Up/down/flat trend badge with a percentage. */
const TrendBadge = ({ pct }: { pct: number | null }) => {
  if (pct === null)
    return (
      <Typography component="span" variant="caption" color="text.disabled">
        —
      </Typography>
    );
  const color = pct > 0 ? 'success.main' : pct < 0 ? 'error.main' : 'text.secondary';
  const Icon = pct > 0 ? TrendingUpIcon : pct < 0 ? TrendingDownIcon : TrendingFlatIcon;
  return (
    <Stack direction="row" spacing={0.25} sx={{ alignItems: 'center', color, minWidth: 52, justifyContent: 'flex-end' }}>
      <Icon sx={{ fontSize: 16 }} />
      <Typography component="span" variant="caption" sx={{ fontWeight: 600 }}>
        {pct > 0 ? '+' : ''}
        {pct}%
      </Typography>
    </Stack>
  );
};

/** Small summary card */
const SummaryCard = ({ icon, label, value, color }: { icon: ReactNode; label: string; value: string | number; color: string }) => (
  <Card sx={{ minWidth: 160, flex: 1 }}>
    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <Box sx={{ color, display: 'flex' }}>{icon}</Box>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {value}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {label}
          </Typography>
        </Box>
      </Stack>
    </CardContent>
  </Card>
);
