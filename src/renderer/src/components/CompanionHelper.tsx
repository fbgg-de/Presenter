import { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
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
import { ContentCopy as CopyIcon, Close as CloseIcon, Cable as CableIcon } from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useAppSelector } from '@/store';

type WSAction = {
  action: string;
  description: string;
  hasTarget: boolean;
  payload?: Record<string, string>;
};

const WS_ACTIONS: WSAction[] = [
  { action: 'next_item', description: 'Next item in show', hasTarget: false },
  { action: 'prev_item', description: 'Previous item', hasTarget: false },
  { action: 'next_block', description: 'Next block', hasTarget: false },
  { action: 'prev_block', description: 'Previous block', hasTarget: false },
  { action: 'next_line', description: 'Next line', hasTarget: false },
  { action: 'prev_line', description: 'Previous line', hasTarget: false },
  { action: 'set_item', description: 'Jump to item by index', hasTarget: false, payload: { index: '0' } },
  { action: 'set_block', description: 'Jump to block by index', hasTarget: false, payload: { index: '0' } },
  { action: 'set_line', description: 'Jump to line within block', hasTarget: false, payload: { index: '0' } },
  { action: 'fade_to_black', description: 'Fade window(s) to black', hasTarget: true },
  { action: 'fade_from_black', description: 'Show content', hasTarget: true },
  { action: 'toggle_black', description: 'Toggle black', hasTarget: true },
  { action: 'freeze_window', description: 'Freeze a named window', hasTarget: true },
  { action: 'unfreeze_window', description: 'Unfreeze a named window', hasTarget: true },
  { action: 'identify_windows', description: 'Show name/number overlay on all windows', hasTarget: false },
  { action: 'set_display_mode', description: 'Change display mode', hasTarget: true, payload: { mode: 'normal' } },
  { action: 'video_play', description: 'Play video', hasTarget: true },
  { action: 'video_pause', description: 'Pause video', hasTarget: true },
  { action: 'video_stop', description: 'Stop video', hasTarget: true },
  { action: 'video_seek', description: 'Seek video to position', hasTarget: true, payload: { position: '0' } },
  { action: 'get_state', description: 'Get current state', hasTarget: false },
  { action: 'get_windows', description: 'List windows with status', hasTarget: false },
];

export const CompanionHelper = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { LL } = useI18nContext();
  const wsPort = useAppSelector((state) => state.settings.wsPort);
  const [targetWindow, setTargetWindow] = useState('');
  const [copiedAction, setCopiedAction] = useState<string | null>(null);

  const wsUrl = `ws://localhost:${wsPort || 9001}`;

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
    return JSON.stringify(cmd, null, 2);
  };

  const handleCopy = async (action: WSAction) => {
    const text = buildCommand(action);
    await navigator.clipboard.writeText(text);
    setCopiedAction(action.action);
    setTimeout(() => setCopiedAction(null), 2000);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Stack direction="row" spacing={1} alignItems="center">
            <CableIcon />
            <Typography variant="h6">{LL.COMPANION_HELPER_TITLE()}</Typography>
          </Stack>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {/* Connection Info */}
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Typography variant="body2" fontWeight={600}>
                  {LL.COMPANION_WS_URL()}:
                </Typography>
                <Chip label={wsUrl} variant="outlined" size="small" sx={{ fontFamily: 'monospace' }} />
                <Tooltip title={LL.COMPANION_COPY()}>
                  <IconButton
                    size="small"
                    onClick={() => {
                      navigator.clipboard.writeText(wsUrl);
                    }}
                  >
                    <CopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            </CardContent>
          </Card>

          {/* Target Window Selector */}
          <Stack direction="row" spacing={2} alignItems="center">
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>{LL.COMPANION_TARGET_WINDOW()}</InputLabel>
              <Select value={targetWindow} label={LL.COMPANION_TARGET_WINDOW()} onChange={(e) => setTargetWindow(e.target.value)}>
                <MenuItem value="">{LL.COMPANION_NO_TARGET()}</MenuItem>
                <MenuItem value="Main Lyrics">Main Lyrics</MenuItem>
                <MenuItem value="Stream">Stream</MenuItem>
              </Select>
            </FormControl>
            <TextField
              size="small"
              label={LL.COMPANION_CUSTOM_TARGET()}
              value={targetWindow}
              onChange={(e) => setTargetWindow(e.target.value)}
              sx={{ minWidth: 200 }}
            />
          </Stack>

          <Divider />

          {/* Actions Table */}
          <TableContainer sx={{ maxHeight: 400 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>{LL.COMPANION_ACTION()}</TableCell>
                  <TableCell>{LL.COMPANION_DESCRIPTION()}</TableCell>
                  <TableCell>{LL.COMPANION_TARGET()}</TableCell>
                  <TableCell width={60} />
                </TableRow>
              </TableHead>
              <TableBody>
                {WS_ACTIONS.map((action) => (
                  <TableRow key={action.action} hover>
                    <TableCell>
                      <Chip label={action.action} size="small" variant="outlined" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{action.description}</Typography>
                    </TableCell>
                    <TableCell>
                      {action.hasTarget ? <Chip label={targetWindow || '—'} size="small" color="info" variant="outlined" /> : '—'}
                    </TableCell>
                    <TableCell>
                      <Tooltip title={copiedAction === action.action ? LL.COMPANION_COPIED() : LL.COMPANION_COPY()}>
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

          {/* Preview */}
          <Typography variant="subtitle2">{LL.COMPANION_EXAMPLES()}:</Typography>
          <Box
            sx={{
              bgcolor: 'grey.900',
              color: 'grey.100',
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              p: 2,
              borderRadius: 1,
              whiteSpace: 'pre',
              overflow: 'auto',
              maxHeight: 200,
            }}
          >
            {`${JSON.stringify({ action: 'fade_to_black', target: 'Main Lyrics' }, null, 2)}\n\n`}
            {`${JSON.stringify({ action: 'set_block', payload: { index: 0 } }, null, 2)}\n\n`}
            {`${JSON.stringify({ action: 'identify_windows' }, null, 2)}\n\n`}
            {`${JSON.stringify({ action: 'video_play', target: 'Main Lyrics' }, null, 2)}`}
          </Box>
        </Stack>
      </DialogContent>
    </Dialog>
  );
};
