import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
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
import { ContentCopy as CopyIcon, Close as CloseIcon, Cable as CableIcon, WifiTethering as WifiTetheringIcon } from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useGetSettings, useUpdateSetting } from '@/store/settingsSlice';
import { useGetWindows } from '@/store/windowSlice';

type WSAction = {
  action: string;
  hasTarget: boolean;
  payload?: Record<string, string>;
};

const WS_ACTIONS: WSAction[] = [
  { action: 'prev_item', hasTarget: false },
  { action: 'next_item', hasTarget: false },
  { action: 'prev_block', hasTarget: false },
  { action: 'next_block', hasTarget: false },
  { action: 'prev_line', hasTarget: false },
  { action: 'next_line', hasTarget: false },
  { action: 'set_item', hasTarget: false, payload: { index: '0' } },
  { action: 'set_block', hasTarget: false, payload: { index: '0' } },
  { action: 'set_line', hasTarget: false, payload: { index: '0' } },
  { action: 'fade_to_black', hasTarget: true },
  { action: 'fade_from_black', hasTarget: true },
  { action: 'toggle_black', hasTarget: true },
  { action: 'freeze_window', hasTarget: true },
  { action: 'unfreeze_window', hasTarget: true },
  { action: 'identify_windows', hasTarget: false },
  { action: 'set_display_mode', hasTarget: true, payload: { mode: 'normal' } },
  { action: 'video_play', hasTarget: true },
  { action: 'video_pause', hasTarget: true },
  { action: 'video_stop', hasTarget: true },
  { action: 'video_seek', hasTarget: true, payload: { position: '0' } },
  { action: 'get_state', hasTarget: false },
  { action: 'get_windows', hasTarget: false },
];

export const CompanionHelper = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { LL } = useI18nContext();
  const { companionCommandsEnabled } = useGetSettings();
  const updateSetting = useUpdateSetting();
  const { windowConfigs } = useGetWindows();

  const [targetWindow, setTargetWindow] = useState('');
  const [selectedWsUrl, setSelectedWsUrl] = useState('');
  const [copiedAction, setCopiedAction] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [wsHosts, setWsHosts] = useState<string[]>([]);
  const [wsPort, setWsPort] = useState<number | null>(null);
  const [clientCount, setClientCount] = useState(0);
  const [latestCommandJson, setLatestCommandJson] = useState('');
  const [highlightedAction, setHighlightedAction] = useState<string | null>(null);
  const [serverInfoAvailable, setServerInfoAvailable] = useState(false);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wsUrls = useMemo(() => {
    if (!wsHosts.length || wsPort == null) return [];
    return wsHosts.map((host) => `ws://${host}:${wsPort}`);
  }, [wsHosts, wsPort]);

  const namedWindows = useMemo(() => {
    const unique = new Set<string>();
    (windowConfigs || []).forEach((config) => {
      if (config.name) unique.add(config.name);
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [windowConfigs]);

  const getActionDescription = (action: string): string => {
    switch (action) {
      case 'next_item':
        return LL.COMPANION.ACTION_DESC_NEXT_ITEM();
      case 'prev_item':
        return LL.COMPANION.ACTION_DESC_PREV_ITEM();
      case 'next_block':
        return LL.COMPANION.ACTION_DESC_NEXT_BLOCK();
      case 'prev_block':
        return LL.COMPANION.ACTION_DESC_PREV_BLOCK();
      case 'next_line':
        return LL.COMPANION.ACTION_DESC_NEXT_LINE();
      case 'prev_line':
        return LL.COMPANION.ACTION_DESC_PREV_LINE();
      case 'set_item':
        return LL.COMPANION.ACTION_DESC_SET_ITEM();
      case 'set_block':
        return LL.COMPANION.ACTION_DESC_SET_BLOCK();
      case 'set_line':
        return LL.COMPANION.ACTION_DESC_SET_LINE();
      case 'fade_to_black':
        return LL.COMPANION.ACTION_DESC_FADE_TO_BLACK();
      case 'fade_from_black':
        return LL.COMPANION.ACTION_DESC_FADE_FROM_BLACK();
      case 'toggle_black':
        return LL.COMPANION.ACTION_DESC_TOGGLE_BLACK();
      case 'freeze_window':
        return LL.COMPANION.ACTION_DESC_FREEZE_WINDOW();
      case 'unfreeze_window':
        return LL.COMPANION.ACTION_DESC_UNFREEZE_WINDOW();
      case 'identify_windows':
        return LL.COMPANION.ACTION_DESC_IDENTIFY_WINDOWS();
      case 'set_display_mode':
        return LL.COMPANION.ACTION_DESC_SET_DISPLAY_MODE();
      case 'video_play':
        return LL.COMPANION.ACTION_DESC_VIDEO_PLAY();
      case 'video_pause':
        return LL.COMPANION.ACTION_DESC_VIDEO_PAUSE();
      case 'video_stop':
        return LL.COMPANION.ACTION_DESC_VIDEO_STOP();
      case 'video_seek':
        return LL.COMPANION.ACTION_DESC_VIDEO_SEEK();
      case 'get_state':
        return LL.COMPANION.ACTION_DESC_GET_STATE();
      case 'get_windows':
        return LL.COMPANION.ACTION_DESC_GET_WINDOWS();
      default:
        return action;
    }
  };

  useEffect(() => {
    if (!open) return;

    let isDisposed = false;

    const loadServerInfo = async () => {
      try {
        const info = await window.api?.getWsServerInfo?.();
        if (isDisposed || !info) return;
        setWsHosts(info.hosts || []);
        setWsPort(info.port);
        setClientCount(info.clientCount);
        if (typeof info.commandHandlingEnabled === 'boolean') {
          updateSetting('companionCommandsEnabled', info.commandHandlingEnabled);
        }
        setServerInfoAvailable(true);
      } catch {
        if (!isDisposed) setServerInfoAvailable(false);
      }
    };

    loadServerInfo();

    const cleanupClientCount = window.api?.onWsClientCount?.((data) => {
      if (typeof data?.count === 'number') {
        setClientCount(data.count);
      }
    });

    const cleanupLastCommand = window.api?.onWsLastCommand?.((data) => {
      const command: Record<string, unknown> = { action: data.action };
      if (data.target) command.target = data.target;
      if (data.payload) command.payload = data.payload;
      setLatestCommandJson(JSON.stringify(command));
      setHighlightedAction(data.action);

      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => {
        setHighlightedAction((current) => (current === data.action ? null : current));
      }, 1400);
    });

    return () => {
      isDisposed = true;
      if (typeof cleanupClientCount === 'function') cleanupClientCount();
      if (typeof cleanupLastCommand === 'function') cleanupLastCommand();
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = null;
      }
    };
  }, [open, updateSetting]);

  useEffect(() => {
    if (!selectedWsUrl && wsUrls.length > 0) {
      setSelectedWsUrl(wsUrls[0]);
    } else if (selectedWsUrl && !wsUrls.includes(selectedWsUrl)) {
      setSelectedWsUrl(wsUrls[0] ?? '');
    }
  }, [wsUrls, selectedWsUrl]);

  const buildCommand = (action: WSAction): string => {
    const cmd: Record<string, unknown> = { action: action.action };
    if (action.hasTarget && targetWindow) {
      cmd.target = targetWindow;
    }
    if (action.payload) {
      cmd.payload = Object.fromEntries(
        Object.entries(action.payload).map(([k, v]) => {
          const num = Number(v);
          return [k, isNaN(num) ? v : num];
        }),
      );
    }
    return JSON.stringify(cmd);
  };

  const handleCopy = async (action: WSAction) => {
    const text = buildCommand(action);
    await navigator.clipboard.writeText(text);
    setCopiedAction(action.action);
    setTimeout(() => setCopiedAction(null), 2000);
  };

  const handleCopyConnectionUrl = async () => {
    if (!selectedWsUrl) return;
    await navigator.clipboard.writeText(selectedWsUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleToggleEnabled = async (enabled: boolean) => {
    updateSetting('companionCommandsEnabled', enabled);
    try {
      await window.api?.setWsCommandHandlingEnabled?.(enabled);
    } catch {
      // Browser mode has no built-in Electron WS server; keep local setting only.
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <CableIcon />
            <Typography variant="h6">{LL.COMPANION.HELPER_TITLE()}</Typography>
          </Stack>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>
       <DialogContent sx={{ p: 0 }}>
        <Stack>
          {/* ── Top toolbar: enabled switch + target window + connection icon ── */}
          <Stack
            direction="row"
            spacing={2}
            sx={{ px: 3, py: 1.75, alignItems: 'center', flexWrap: 'wrap', borderBottom: 1, borderColor: 'divider', gap: 1.5 }}
          >
            <FormControlLabel
              sx={{ m: 0 }}
              control={<Switch size="small" checked={companionCommandsEnabled} onChange={(_, checked) => void handleToggleEnabled(checked)} />}
              label={
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {LL.COMPANION.ENABLED()}
                </Typography>
              }
            />

            <Box sx={{ flexGrow: 1 }} />

            {/* Target window selector */}
            <FormControl size="small" sx={{ minWidth: 170 }}>
              <InputLabel>{LL.COMPANION.TARGET_WINDOW()}</InputLabel>
              <Select value={targetWindow} label={LL.COMPANION.TARGET_WINDOW()} onChange={(e) => setTargetWindow(e.target.value)}>
                <MenuItem value="">{LL.COMPANION.NO_TARGET()}</MenuItem>
                {namedWindows.map((name) => (
                  <MenuItem key={name} value={name}>
                    {name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              size="small"
              label={LL.COMPANION.CUSTOM_TARGET()}
              value={targetWindow}
              onChange={(e) => setTargetWindow(e.target.value)}
              sx={{ width: 150 }}
            />

            {/* Active connection indicator */}
            <Tooltip title={LL.COMPANION.CONNECTIONS({ count: clientCount })}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <WifiTetheringIcon fontSize="small" color={clientCount > 0 ? 'success' : 'disabled'} />
                <Typography variant="body2" color={clientCount > 0 ? 'success.main' : 'text.disabled'} sx={{ fontWeight: 500, minWidth: 12 }}>
                  {clientCount}
                </Typography>
              </Box>
            </Tooltip>
          </Stack>

          {/* ── Latest received command ── */}
          {latestCommandJson && (
            <Stack direction="row" spacing={1} sx={{ px: 3, py: 1, bgcolor: 'action.hover', alignItems: 'center' }}>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                {LL.COMPANION.LATEST_COMMAND()}:
              </Typography>
              <Typography variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {latestCommandJson}
              </Typography>
            </Stack>
          )}

          {/* ── Actions table ── */}
          <TableContainer sx={{ maxHeight: 420, flexGrow: 1 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 180 }}>{LL.COMPANION.ACTION()}</TableCell>
                  <TableCell>{LL.COMPANION.DESCRIPTION()}</TableCell>
                  <TableCell sx={{ width: 100 }}>{LL.COMPANION.TARGET()}</TableCell>
                  <TableCell sx={{ width: 44 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {WS_ACTIONS.map((action) => (
                  <TableRow key={action.action} hover>
                    <TableCell>
                      <Chip
                        label={action.action}
                        size="small"
                        color={highlightedAction === action.action ? 'warning' : 'default'}
                        variant={highlightedAction === action.action ? 'filled' : 'outlined'}
                        sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{getActionDescription(action.action)}</Typography>
                    </TableCell>
                    <TableCell>
                      {action.hasTarget ? <Chip label={targetWindow || '—'} size="small" color="info" variant="outlined" /> : null}
                    </TableCell>
                    <TableCell padding="none">
                      <Tooltip title={copiedAction === action.action ? LL.COMPANION.COPIED() : LL.COMPANION.COPY()}>
                        <IconButton size="small" onClick={() => handleCopy(action)}>
                          <CopyIcon fontSize="small" color={copiedAction === action.action ? 'success' : 'inherit'} />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {/* ── Connection panel ── */}
          <Stack
            direction="row"
            spacing={1.5}
            sx={{ px: 3, py: 1.75, alignItems: 'center', flexWrap: 'wrap', borderTop: 1, borderColor: 'divider', gap: 1 }}
          >
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, flexShrink: 0 }}>
              {LL.COMPANION.CONNECTION_TITLE()}
            </Typography>
            {serverInfoAvailable && wsUrls.length > 0 ? (
              <>
                <FormControl size="small" sx={{ minWidth: 280, flexGrow: 1 }}>
                  <InputLabel>{LL.COMPANION.WS_URL()}</InputLabel>
                  <Select value={selectedWsUrl} label={LL.COMPANION.WS_URL()} onChange={(e) => setSelectedWsUrl(e.target.value)}>
                    {wsUrls.map((url) => (
                      <MenuItem key={url} value={url}>
                        {url}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button size="small" startIcon={<CopyIcon />} variant="outlined" onClick={() => void handleCopyConnectionUrl()} disabled={!selectedWsUrl}>
                  {copiedUrl ? LL.COMPANION.COPIED() : LL.COMPANION.COPY_URL()}
                </Button>
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {LL.COMPANION.SERVER_INFO_UNAVAILABLE()}
              </Typography>
            )}
          </Stack>
        </Stack>
      </DialogContent>
    </Dialog>
  );
};
