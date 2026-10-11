import { useMemo, useRef, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { Download, ExpandMore, Refresh } from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useGetMetricsQuery, useLazyGetMetricsQuery, type MetricEvent, type MetricsQuery } from '@/api/metrics.api';
import { useGetAdminAccountsQuery } from '@/api/admin.api';
import { useGetSessionQuery } from '@/api/session.api';
import { localDay, MetricsOverview } from './metrics/MetricsOverview';
import { MetricsAccounts } from './metrics/MetricsAccounts';
import { MetricsAccountActivity } from './metrics/MetricsAccountActivity';
import { MetricsAdoption } from './metrics/MetricsAdoption';
import { MetricsContent } from './metrics/MetricsContent';
import { MetricsReliability } from './metrics/MetricsReliability';
import { MetricsRecentEvents } from './metrics/MetricsRecentEvents';
import { downloadCsv, type Granularity } from './metrics/metricsUtils';

const defaultRange = () => {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  return { from: localDay(from), to: localDay(to) };
};
type MetricsTab = 'overview' | 'adoption' | 'content' | 'reliability';

export const Metrics = () => {
  const { LL } = useI18nContext();
  const [range, setRange] = useState(defaultRange);
  const [tab, setTab] = useState<MetricsTab>('overview');
  const [event, setEvent] = useState('');
  const [account, setAccount] = useState<number | ''>('');
  const [device, setDevice] = useState('');
  const [deviceDraft, setDeviceDraft] = useState('');
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [recentExpanded, setRecentExpanded] = useState(false);
  const [exporting, setExporting] = useState<number | null>(null);
  const [exportError, setExportError] = useState(false);
  const exportCancelled = useRef(false);
  const exportRequest = useRef<{ abort: () => void } | null>(null);
  const { data: session } = useGetSessionQuery();
  const isAdmin = session?.authType === 'oidc_admin';
  const { data: accounts = [] } = useGetAdminAccountsQuery(undefined, { skip: !isAdmin });
  const invalidRange = Boolean(range.from && range.to && range.from > range.to);
  const scope: MetricsQuery = {
    from: range.from ? `${range.from} 00:00:00` : undefined,
    to: range.to ? `${range.to} 23:59:59` : undefined,
    event: event || undefined,
    device_id: device || undefined,
    account: isAdmin && account !== '' ? account : undefined,
  };
  const {
    currentData: data,
    isFetching,
    isError,
    refetch,
  } = useGetMetricsQuery({ ...scope, include_summary: 1, granularity, limit: 1 }, { skip: invalidRange });
  const [getExportPage] = useLazyGetMetricsQuery();
  const names = useMemo(
    () =>
      Object.fromEntries(accounts.map((entry) => [entry.license, entry.name ? `${entry.name} (#${entry.license})` : `#${entry.license}`])),
    [accounts],
  );
  const summary = data?.summary;
  const eventOptions = [...new Set([...(summary?.features.map((feature) => feature.event) ?? []), ...(event ? [event] : [])])].sort();
  const reset = () => {
    setEvent('');
    setAccount('');
    setDevice('');
    setDeviceDraft('');
  };
  const selectDevice = (id: string) => {
    setDevice(id);
    setDeviceDraft(id);
  };

  const exportAll = async () => {
    if (exporting !== null || exportRequest.current) return;
    exportCancelled.current = false;
    setExportError(false);
    setExporting(0);
    const exportScope = { ...scope };
    const result: MetricEvent[] = [];
    try {
      let snapshot: number | undefined;
      let expected = Infinity;
      while (result.length < expected && !exportCancelled.current) {
        const request = getExportPage(
          { ...exportScope, include_summary: 0, limit: 10000, offset: result.length, snapshot_id: snapshot },
          false,
        );
        exportRequest.current = request;
        const page = await request.unwrap();
        if (Number.isFinite(expected) && expected !== page.total) throw new Error('Metrics changed during export');
        snapshot = page.snapshot_id;
        expected = page.total;
        if (!page.metrics.length && result.length < expected) throw new Error('Incomplete metrics export');
        result.push(...page.metrics);
        setExporting(result.length);
      }
      if (!exportCancelled.current)
        downloadCsv(
          result.map((row) => ({ ...row, metadata: row.metadata ?? {} })),
          `metrics_${range.from}_${range.to}.csv`,
        );
    } catch {
      if (!exportCancelled.current) setExportError(true);
    } finally {
      exportRequest.current = null;
      setExporting(null);
    }
  };

  const tabs: [MetricsTab, string][] = [
    ['overview', LL.METRICS.SECTION_OVERVIEW()],
    ['adoption', LL.METRICS.TAB_ADOPTION()],
    ['content', LL.METRICS.SECTION_CONTENT()],
    ['reliability', LL.METRICS.TAB_RELIABILITY()],
  ];
  return (
    <Stack spacing={3} sx={{ minWidth: 0, pb: 4, '& .MuiCard-root': { borderRadius: 3, backgroundImage: 'none', minWidth: 0 } }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 750 }}>
            {LL.METRICS.METRICS()}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            {LL.METRICS.SUBTITLE()}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
          <Button startIcon={<Refresh />} onClick={() => refetch()} disabled={isFetching || invalidRange}>
            {LL.METRICS.REFRESH()}
          </Button>
          <Button startIcon={<Download />} onClick={() => void exportAll()} disabled={!data?.total || invalidRange || exporting !== null}>
            {LL.METRICS.EXPORT_ALL()}
          </Button>
        </Stack>
      </Stack>
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mb: 2 }}>
          {[7, 30, 90, 180].map((days) => {
            const to = new Date();
            const from = new Date();
            from.setDate(from.getDate() - days + 1);
            const start = localDay(from);
            const end = localDay(to);
            const active = range.from === start && range.to === end;
            return (
              <Chip
                key={days}
                label={LL.METRICS.LAST_DAYS({ days })}
                color={active ? 'primary' : 'default'}
                variant={active ? 'filled' : 'outlined'}
                onClick={() => setRange({ from: start, to: end })}
              />
            );
          })}
          <Button size="small" onClick={reset}>
            {LL.METRICS.RESET_FILTERS()}
          </Button>
          {isFetching && <CircularProgress size={20} sx={{ ml: 'auto' }} />}
        </Stack>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(6, minmax(0, 1fr))' },
            gap: 2,
          }}
        >
          <TextField
            type="date"
            label={LL.METRICS.DATE_FROM()}
            value={range.from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            error={invalidRange}
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            type="date"
            label={LL.METRICS.DATE_TO()}
            value={range.to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            error={invalidRange}
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <FormControl size="small">
            <InputLabel>{LL.METRICS.EVENT_TYPE()}</InputLabel>
            <Select value={event} label={LL.METRICS.EVENT_TYPE()} onChange={(e) => setEvent(e.target.value)}>
              <MenuItem value="">{LL.UNIFIED_SEARCH.ALL()}</MenuItem>
              {eventOptions.map((value) => (
                <MenuItem key={value} value={value}>
                  {value}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {isAdmin && (
            <FormControl size="small">
              <InputLabel>{LL.COMMON.ACCOUNT()}</InputLabel>
              <Select value={account} label={LL.COMMON.ACCOUNT()} onChange={(e) => setAccount(e.target.value as number | '')}>
                <MenuItem value="">{LL.UNIFIED_SEARCH.ALL()}</MenuItem>
                {[
                  ...new Set([
                    ...accounts.map((a) => a.license),
                    ...(summary?.accounts.map((a) => a.account) ?? []),
                    ...(account !== '' ? [account] : []),
                  ]),
                ]
                  .sort((a, b) => a - b)
                  .map((id) => (
                    <MenuItem key={id} value={id}>
                      {names[id] || `#${id}`}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
          )}
          <TextField
            size="small"
            label={LL.METRICS.DEVICE_ID()}
            value={deviceDraft}
            onChange={(e) => setDeviceDraft(e.target.value)}
            onBlur={() => setDevice(deviceDraft.trim())}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setDevice(deviceDraft.trim());
            }}
          />
          <FormControl size="small">
            <InputLabel>{LL.METRICS.GRANULARITY()}</InputLabel>
            <Select value={granularity} label={LL.METRICS.GRANULARITY()} onChange={(e) => setGranularity(e.target.value as Granularity)}>
              <MenuItem value="day">{LL.METRICS.DAILY()}</MenuItem>
              <MenuItem value="week">{LL.METRICS.WEEKLY()}</MenuItem>
              <MenuItem value="month">{LL.METRICS.MONTHLY()}</MenuItem>
            </Select>
          </FormControl>
        </Box>
        {(event || account !== '' || device) && (
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 2 }}>
            {event && <Chip label={event} onDelete={() => setEvent('')} />}
            {account !== '' && <Chip label={names[account] || `#${account}`} onDelete={() => setAccount('')} />}
            {device && <Chip label={device} onDelete={() => selectDevice('')} />}
          </Stack>
        )}
      </Paper>
      {exporting !== null && (
        <Alert
          severity="info"
          action={
            <Button
              onClick={() => {
                exportCancelled.current = true;
                exportRequest.current?.abort();
              }}
            >
              {LL.COMMON.CANCEL()}
            </Button>
          }
        >
          {LL.METRICS.EXPORT_PROGRESS({ count: exporting })}
        </Alert>
      )}
      {exportError && <Alert severity="error">{LL.METRICS.EXPORT_ERROR()}</Alert>}
      <Tabs
        value={tab}
        onChange={(_, value: MetricsTab) => setTab(value)}
        variant="scrollable"
        scrollButtons="auto"
        aria-label={LL.METRICS.DASHBOARD()}
      >
        {tabs.map(([value, label]) => (
          <Tab key={value} id={`metrics-tab-${value}`} aria-controls={`metrics-panel-${value}`} value={value} label={label} />
        ))}
      </Tabs>
      {invalidRange ? (
        <Alert severity="warning">{LL.METRICS.INVALID_RANGE()}</Alert>
      ) : isError ? (
        <Alert severity="error">{LL.METRICS.LOAD_ERROR()}</Alert>
      ) : !summary ? (
        <Box sx={{ p: 5, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Chip variant="outlined" size="small" color="primary" label={LL.METRICS.FULL_RANGE()} />
            <Typography variant="caption" color="text.secondary">
              {LL.METRICS.TOTAL_EVENTS({ count: summary.totals.events })}
            </Typography>
          </Stack>
          {!data?.total && <Alert severity="info">{LL.METRICS.NO_DATA()}</Alert>}
          <Box role="tabpanel" id={`metrics-panel-${tab}`} aria-labelledby={`metrics-tab-${tab}`} sx={{ minWidth: 0 }}>
            {tab === 'overview' && (
              <Stack spacing={3}>
                <MetricsOverview
                  summary={summary}
                  from={range.from}
                  to={range.to}
                  isAdmin={isAdmin}
                  onEvent={setEvent}
                  granularity={granularity}
                />
                {isAdmin && (
                  <>
                    <MetricsAccountActivity data={summary} names={names} from={range.from} to={range.to} granularity={granularity} />
                    <MetricsAccounts data={summary} names={names} from={range.from} to={range.to} onAccount={setAccount} />
                  </>
                )}
              </Stack>
            )}
            {tab === 'adoption' && (
              <MetricsAdoption data={summary} accountNames={names} isAdmin={isAdmin} onAccount={setAccount} onEvent={setEvent} />
            )}
            {tab === 'content' && (
              <MetricsContent
                data={summary}
                from={range.from}
                to={range.to}
                granularity={granularity}
                accountNames={names}
                eventFiltered={!!event}
                query={scope}
              />
            )}
            {tab === 'reliability' && (
              <MetricsReliability
                data={summary}
                from={range.from}
                to={range.to}
                onErrors={() => {
                  setEvent('uncaught_error');
                  setRecentExpanded(true);
                }}
              />
            )}
          </Box>
          <Accordion
            expanded={recentExpanded}
            onChange={(_, expanded) => setRecentExpanded(expanded)}
            disableGutters
            sx={{ borderRadius: '12px !important' }}
          >
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography sx={{ fontWeight: 650 }}>{LL.METRICS.RECENT_EVENTS()}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <MetricsRecentEvents
                key={JSON.stringify(scope)}
                query={{ ...scope, snapshot_id: data?.snapshot_id }}
                expanded={recentExpanded}
                onDevice={selectDevice}
              />
            </AccordionDetails>
          </Accordion>
        </>
      )}
    </Stack>
  );
};
