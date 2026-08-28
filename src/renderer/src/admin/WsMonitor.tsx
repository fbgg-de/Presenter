/**
 * Admin → WebSocket: live message tracing for the relay.
 *
 * The relay is the only component that sees an account's whole conversation, so it is the
 * only place a support case can be traced from. This tab attaches to it as a `monitor` —
 * a connection that never participates in relaying and only observes.
 *
 * Traffic is separated by account: pick one to watch, or watch every account at once.
 * The connection is visible to the account being watched (it shows up in the operator's
 * connected-clients list as a `monitor`), so nobody is observed silently.
 *
 * Nothing is persisted. The relay buffers in memory, this view holds state, and both are
 * gone on restart or reload — see useWsMonitor and ws-server/src/server.ts.
 */
import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  FormControl,
  IconButton,
  InputAdornment,
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
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ContentCopy as CopyIcon,
  Delete as ClearIcon,
  ExpandLess as CollapseIcon,
  ExpandMore as ExpandIcon,
  Pause as PauseIcon,
  PlayArrow as ResumeIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useGetAdminAccountsQuery, useCreateWsMonitorTicketMutation } from '@/api/admin.api';
import { useWsMonitor, type WsTraceEntry } from '@/hooks/useWsMonitor';

/** Watch every account at once. Kept as a sentinel so the Select can hold it as a value. */
const ALL_ACCOUNTS = 'all';

const DIRECTION_COLORS: Record<WsTraceEntry['dir'], 'primary' | 'secondary' | 'default'> = {
  in: 'primary',
  out: 'secondary',
  sys: 'default',
};

/** hh:mm:ss.mmm — a trace is read at message granularity, so milliseconds matter. */
const formatTime = (ts: number) => {
  const d = new Date(ts);
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
};

/** Pretty-print a JSON payload, falling back to the raw string when it is not JSON. */
const prettyPayload = (payload?: string) => {
  if (!payload) return '';
  try {
    return JSON.stringify(JSON.parse(payload), null, 2);
  } catch {
    return payload;
  }
};

/** Single-line preview for the collapsed row. */
const previewPayload = (payload?: string) => (payload ? payload.replace(/\s+/g, ' ').slice(0, 160) : '');

export const WsMonitor = () => {
  const { LL } = useI18nContext();
  const { data: adminAccounts = [] } = useGetAdminAccountsQuery();
  const [createTicket] = useCreateWsMonitorTicketMutation();

  const [selected, setSelected] = useState<number | typeof ALL_ACCOUNTS>(ALL_ACCOUNTS);
  const [search, setSearch] = useState('');
  const [directions, setDirections] = useState<Array<WsTraceEntry['dir']>>(['in', 'out', 'sys']);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [bufferDraft, setBufferDraft] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const account = selected === ALL_ACCOUNTS ? null : selected;

  // The trigger from RTK Query is stable, so this callback is too — the hook keeps it in a
  // ref anyway, but a stable identity keeps it out of any dependency surprises.
  const getTicket = useCallback(async () => {
    const ticket = await createTicket().unwrap();
    return { url: ticket.url, token: ticket.token };
  }, [createTicket]);

  const { status, error, entries, accounts, bufferSize, limits, relayVersion, paused, setPaused, pendingCount, applyBufferSize, clear } =
    useWsMonitor({ enabled: true, account, getTicket });

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = entries.filter((entry) => {
      if (!directions.includes(entry.dir)) return false;
      if (!needle) return true;
      return (
        entry.event.toLowerCase().includes(needle) ||
        entry.role.toLowerCase().includes(needle) ||
        entry.clientId.toLowerCase().includes(needle) ||
        String(entry.account).includes(needle) ||
        (entry.name?.toLowerCase().includes(needle) ?? false) ||
        (entry.payload?.toLowerCase().includes(needle) ?? false)
      );
    });
    // Newest first: a live tail is read from the top, and it means no scroll juggling
    // when new rows arrive while you are looking at something.
    return filtered.slice().reverse();
  }, [entries, search, directions]);

  /** Connection census for the watched scope — includes other admins watching. */
  const census = useMemo(() => (account === null ? accounts : accounts.filter((row) => row.account === account)), [accounts, account]);

  const handleCopy = useCallback(() => {
    // Copies what is on screen, filters included: a support ticket wants the relevant
    // slice, not the whole buffer.
    const text = JSON.stringify(visible.slice().reverse(), null, 2);
    // writeText rejects when the page lacks clipboard permission; an unhandled rejection
    // there would surface as a global error toast for something the user can simply retry.
    void navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        if (copiedTimer.current) clearTimeout(copiedTimer.current);
        copiedTimer.current = setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => setCopied(false));
  }, [visible]);

  const handleBufferCommit = () => {
    // An untouched field is an empty draft, and Number('') is 0 — committing that would
    // silently shrink the buffer to the relay's minimum on a stray blur.
    if (bufferDraft === '') return;
    const next = Number(bufferDraft);
    if (!Number.isFinite(next)) {
      setBufferDraft('');
      return;
    }
    applyBufferSize(next);
    setBufferDraft('');
  };

  const statusLabel = {
    idle: LL.ADMIN_WS.STATUS_IDLE(),
    connecting: LL.ADMIN_WS.STATUS_CONNECTING(),
    connected: LL.ADMIN_WS.STATUS_CONNECTED(),
    error: LL.ADMIN_WS.STATUS_ERROR(),
  }[status];

  const statusColor = ({ idle: 'default', connecting: 'warning', connected: 'success', error: 'error' } as const)[status];

  /** Every account known from either side: configured accounts and ones seen live. */
  const accountOptions = useMemo(() => {
    const seen = new Set<number>(adminAccounts.map((a) => a.license));
    accounts.forEach((row) => row.account >= 0 && seen.add(row.account));
    return [...seen].sort((a, b) => a - b);
  }, [adminAccounts, accounts]);

  const accountName = (license: number) => adminAccounts.find((a) => a.license === license)?.name || '';

  return (
    <Stack sx={{ gap: 2 }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        <Typography variant="h6">{LL.ADMIN_WS.TITLE()}</Typography>
        <Chip size="small" label={statusLabel} color={statusColor} />
        {relayVersion && <Chip size="small" variant="outlined" label={LL.ADMIN_WS.RELAY_VERSION({ version: relayVersion })} />}
      </Stack>

      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {LL.ADMIN_WS.DESCRIPTION()}
      </Typography>

      {error && <Alert severity="warning">{error}</Alert>}

      {/* ── Controls ──────────────────────────────────────────────────────── */}
      <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>{LL.ADMIN_WS.ACCOUNT()}</InputLabel>
          <Select
            value={selected}
            label={LL.ADMIN_WS.ACCOUNT()}
            onChange={(e) => setSelected(e.target.value === ALL_ACCOUNTS ? ALL_ACCOUNTS : Number(e.target.value))}
          >
            <MenuItem value={ALL_ACCOUNTS}>{LL.ADMIN_WS.ALL_ACCOUNTS()}</MenuItem>
            {accountOptions.map((license) => (
              <MenuItem key={license} value={license}>
                {license}
                {accountName(license) ? ` — ${accountName(license)}` : ''}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={LL.ADMIN_WS.SEARCH()}
          sx={{ minWidth: 260, flexGrow: 1 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />

        <ToggleButtonGroup
          size="small"
          value={directions}
          onChange={(_, value: Array<WsTraceEntry['dir']>) => value.length > 0 && setDirections(value)}
        >
          <ToggleButton value="in">{LL.ADMIN_WS.DIR_IN()}</ToggleButton>
          <ToggleButton value="out">{LL.ADMIN_WS.DIR_OUT()}</ToggleButton>
          <ToggleButton value="sys">{LL.ADMIN_WS.DIR_SYS()}</ToggleButton>
        </ToggleButtonGroup>

        <Button
          size="small"
          variant={paused ? 'contained' : 'outlined'}
          color={paused ? 'warning' : 'primary'}
          startIcon={paused ? <ResumeIcon /> : <PauseIcon />}
          onClick={() => setPaused(!paused)}
        >
          {paused ? LL.ADMIN_WS.RESUME({ pending: pendingCount }) : LL.ADMIN_WS.PAUSE()}
        </Button>

        <Button size="small" startIcon={<CopyIcon />} onClick={handleCopy} disabled={visible.length === 0}>
          {copied ? LL.ADMIN_WS.COPIED() : LL.ADMIN_WS.COPY()}
        </Button>

        <Button size="small" color="error" startIcon={<ClearIcon />} onClick={clear} disabled={entries.length === 0}>
          {LL.ADMIN_WS.CLEAR()}
        </Button>

        <Tooltip title={LL.ADMIN_WS.BUFFER_HINT({ min: limits.min, max: limits.max })}>
          <TextField
            size="small"
            type="number"
            label={LL.ADMIN_WS.BUFFER_SIZE()}
            value={bufferDraft === '' ? bufferSize : bufferDraft}
            onChange={(e) => setBufferDraft(e.target.value)}
            onBlur={handleBufferCommit}
            disabled={status !== 'connected'}
            sx={{ width: 140 }}
            // Enter is bound on the input itself: on the TextField root it depends on the
            // event reaching the wrapper, which the Tooltip around it does not guarantee.
            slotProps={{
              htmlInput: {
                min: limits.min,
                max: limits.max,
                step: 50,
                onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === 'Enter') handleBufferCommit();
                },
              },
            }}
          />
        </Tooltip>

        <Box sx={{ flexGrow: 1 }} />

        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {LL.ADMIN_WS.SHOWING({ shown: visible.length, total: entries.length })}
        </Typography>
      </Stack>

      {/* ── Live connection census ────────────────────────────────────────── */}
      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          {LL.ADMIN_WS.CONNECTED_CLIENTS()}
        </Typography>
        {census.length === 0 ? (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {LL.ADMIN_WS.NO_CLIENTS()}
          </Typography>
        ) : (
          <Stack sx={{ gap: 1 }}>
            {census.map((row) => (
              <Stack key={row.account} direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                <Chip size="small" label={row.account} />
                {row.clients.map((client, index) => (
                  <Chip
                    key={`${row.account}-${index}`}
                    size="small"
                    variant="outlined"
                    label={[client.role, client.mode, client.name].filter(Boolean).join(' · ')}
                  />
                ))}
                {row.monitors > 0 && <Chip size="small" color="info" label={LL.ADMIN_WS.WATCHERS({ count: row.monitors })} />}
              </Stack>
            ))}
          </Stack>
        )}
      </Paper>

      {/* ── Trace table ───────────────────────────────────────────────────── */}
      {visible.length === 0 ? (
        <Alert severity="info">{LL.ADMIN_WS.NO_MESSAGES()}</Alert>
      ) : (
        <TableContainer component={Paper} sx={{ maxHeight: 'calc(100vh - 420px)', overflow: 'auto' }}>
          <Table stickyHeader size="small" sx={{ tableLayout: 'fixed', minWidth: 1100 }}>
            <TableHead>
              <TableRow>
                <TableCell width="40" />
                <TableCell width="110">{LL.ADMIN_WS.TIME()}</TableCell>
                <TableCell width="70">{LL.ADMIN_WS.DIRECTION()}</TableCell>
                {account === null && <TableCell width="90">{LL.ADMIN_WS.ACCOUNT()}</TableCell>}
                <TableCell width="170">{LL.ADMIN_WS.CLIENT()}</TableCell>
                <TableCell width="180">{LL.ADMIN_WS.EVENT()}</TableCell>
                <TableCell width="70">{LL.ADMIN_WS.PEERS()}</TableCell>
                <TableCell width="80">{LL.ADMIN_WS.SIZE()}</TableCell>
                <TableCell>{LL.ADMIN_WS.PAYLOAD()}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visible.map((entry) => {
                const isOpen = expanded === entry.seq;
                return (
                  <TableRow key={entry.seq} hover sx={{ verticalAlign: 'top' }}>
                    <TableCell padding="none">
                      <IconButton size="small" onClick={() => setExpanded(isOpen ? null : entry.seq)} disabled={!entry.payload}>
                        {isOpen ? <CollapseIcon fontSize="small" /> : <ExpandIcon fontSize="small" />}
                      </IconButton>
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{formatTime(entry.ts)}</TableCell>
                    <TableCell>
                      <Chip size="small" label={entry.dir} color={DIRECTION_COLORS[entry.dir]} />
                    </TableCell>
                    {account === null && <TableCell sx={{ fontFamily: 'monospace' }}>{entry.account < 0 ? '—' : entry.account}</TableCell>}
                    <TableCell sx={{ fontSize: '0.8rem' }}>
                      {entry.role}
                      {entry.name ? ` · ${entry.name}` : ''}
                      <Typography component="span" variant="caption" sx={{ color: 'text.secondary', ml: 0.5 }}>
                        {entry.clientId}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-word' }}>{entry.event}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{entry.peers ?? ''}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{entry.bytes || ''}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                      {isOpen ? (
                        <Collapse in>
                          <Box component="pre" sx={{ m: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {prettyPayload(entry.payload)}
                          </Box>
                        </Collapse>
                      ) : (
                        // Collapsed rows stay one line high, so a long trace scans like a log.
                        <Box sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {previewPayload(entry.payload)}
                        </Box>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  );
};
