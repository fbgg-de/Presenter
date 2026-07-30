/**
 * Remote Control dialog — maps MIDI buttons AND keyboard keys to navigation actions.
 * Each action can have multiple MIDI and keyboard mappings at the same time.
 *
 * MIDI learn uses this dialog's own useMidi instance (Web MIDI attaches via
 * `input.onmidimessage` assignment, so instances don't stack). The keyboard remote
 * is a window-level listener, so the page owns the single instance and passes it in.
 */
import {
  alpha,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Slider,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Radar as RecordIcon,
  Stop as StopIcon,
  Bluetooth as BluetoothIcon,
  UsbOff as DisconnectedIcon,
  Piano as PianoIcon,
  Keyboard as KeyboardIcon,
  SettingsRemote as RemoteIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useMidi, type MidiAction, type MidiStatus } from '@/hooks/useMidi';
import type { KeyboardRemote } from '@/hooks/useKeyboardRemote';
import { REMOTE_DEBOUNCE_MAX_MS } from '@/hooks/useRemoteActionFilter';
import { useGetMusicianSettings, useUpdateMusicianSetting } from '@/store/musicianSlice';

const ACTION_KEYS: MidiAction[] = [
  'next_page',
  'prev_page',
  'next_song',
  'prev_song',
  'next_block',
  'prev_block',
  'toggle_black',
  'toggle_tracking',
];

const StatusChip = ({ status }: { status: MidiStatus }) => {
  const { LL } = useI18nContext();
  switch (status) {
    case 'connected':
      return <Chip icon={<BluetoothIcon />} label={LL.MIDI.STATUS_CONNECTED()} color="success" size="small" />;
    case 'scanning':
      return <Chip label={LL.MIDI.STATUS_SCANNING()} color="info" size="small" />;
    case 'unsupported':
      return <Chip icon={<DisconnectedIcon />} label={LL.MIDI.STATUS_UNSUPPORTED()} color="error" size="small" />;
    default:
      return <Chip icon={<DisconnectedIcon />} label={LL.MIDI.STATUS_DISCONNECTED()} color="default" size="small" />;
  }
};

interface RemoteControlDialogProps {
  open: boolean;
  onClose: () => void;
  onAction?: (action: MidiAction) => void;
  /** The page-owned keyboard remote instance (single window listener). */
  keyboard: KeyboardRemote;
  enabled?: boolean;
}

export const RemoteControlDialog = ({ open, onClose, onAction, keyboard, enabled = true }: RemoteControlDialogProps) => {
  const { LL } = useI18nContext();
  const midi = useMidi({ onAction, enabled: enabled && open });
  const { musicianRemoteDebounceMs: debounceMs } = useGetMusicianSettings();
  const updateMusicianSetting = useUpdateMusicianSetting();

  const actionLabel = (key: MidiAction) => {
    switch (key) {
      case 'next_page':
        return LL.MIDI.NEXT_PAGE();
      case 'prev_page':
        return LL.MIDI.PREV_PAGE();
      case 'next_song':
        return LL.MIDI.NEXT_SONG();
      case 'prev_song':
        return LL.MIDI.PREV_SONG();
      case 'next_block':
        return LL.MIDI.NEXT_BLOCK();
      case 'prev_block':
        return LL.MIDI.PREV_BLOCK();
      case 'toggle_black':
        return LL.MIDI.TOGGLE_BLACK();
      case 'toggle_tracking':
        return LL.MIDI.TOGGLE_TRACKING();
      default:
        return key;
    }
  };

  /** Collect all keys of a mapping record that map to the given action */
  const mappingsForAction = (mappings: Record<string, MidiAction>, action: MidiAction): string[] =>
    Object.entries(mappings)
      .filter(([, mappedAction]) => mappedAction === action)
      .map(([key]) => key);

  const noDevices = midi.devices.length === 0;
  const learning = midi.isLearning || keyboard.isLearning;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      {/* Header */}
      <DialogTitle
        sx={(theme) => ({
          background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.15)} 0%, ${alpha(theme.palette.secondary.main, 0.08)} 100%)`,
          borderBottom: `1px solid ${theme.palette.divider}`,
          pb: 1.5,
        })}
      >
        <Stack
          direction="row"
          spacing={1.5}
          sx={{
            alignItems: 'center',
          }}
        >
          <RemoteIcon color="primary" />
          <Typography
            variant="h6"
            sx={{
              fontWeight: 700,
            }}
          >
            {LL.REMOTE.TITLE()}
          </Typography>
          <Box
            sx={{
              flexGrow: 1,
            }}
          />
          <StatusChip status={midi.status} />
        </Stack>

        {/* MIDI devices row */}
        {midi.isSupported && (
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{
              flexWrap: 'wrap',
              mt: 1.5,
              minHeight: 28,
            }}
          >
            {midi.devices.length === 0 ? (
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                }}
              >
                {LL.MIDI.NO_DEVICES()}
              </Typography>
            ) : (
              midi.devices.map((d) => (
                <Chip
                  key={d.id}
                  label={d.name}
                  color={d.connected ? 'success' : 'default'}
                  variant={d.connected ? 'filled' : 'outlined'}
                  size="small"
                />
              ))
            )}
          </Stack>
        )}
      </DialogTitle>
      <DialogContent sx={{ px: 2, py: 2 }}>
        <Stack spacing={0.5}>
          {/* "Learning" banner (MIDI or keyboard) */}
          {learning && (
            <Stack
              direction="row"
              spacing={1}
              sx={[
                {
                  alignItems: 'center',
                },
                (theme) => ({
                  px: 2,
                  py: 1.25,
                  mb: 0.5,
                  bgcolor: alpha(theme.palette.warning.main, 0.15),
                  border: `1px solid ${theme.palette.warning.main}`,
                  borderRadius: 2,
                }),
              ]}
            >
              <RecordIcon color="warning" fontSize="small" sx={{ animation: 'pulse 1s infinite' }} />
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  color: 'warning.main',
                  flexGrow: 1,
                }}
              >
                {midi.isLearning
                  ? LL.MIDI.PRESS_FOR({ action: actionLabel(midi.learnAction as MidiAction) })
                  : LL.REMOTE.PRESS_KEY_FOR({ action: actionLabel(keyboard.learnAction as MidiAction) })}
              </Typography>
              <Button
                size="small"
                color="warning"
                variant="outlined"
                startIcon={<StopIcon />}
                onClick={() => {
                  midi.cancelLearn();
                  keyboard.cancelLearn();
                }}
              >
                {LL.COMMON.CANCEL()}
              </Button>
            </Stack>
          )}

          {/* Action rows */}
          {ACTION_KEYS.map((actKey, idx) => {
            const midiMappings = midi.isSupported ? mappingsForAction(midi.midiMappings, actKey) : [];
            const keyMappings = mappingsForAction(keyboard.keyboardMappings, actKey);
            const learningMidi = midi.isLearning && midi.learnAction === actKey;
            const learningKey = keyboard.isLearning && keyboard.learnAction === actKey;

            return (
              <Box key={actKey}>
                <Stack
                  direction="row"
                  spacing={1.5}
                  sx={[
                    {
                      alignItems: 'center',
                    },
                    (theme) => ({
                      px: 1.5,
                      py: 1,
                      borderRadius: 2,
                      transition: 'background 0.2s',
                      bgcolor: learningMidi || learningKey ? alpha(theme.palette.warning.main, 0.1) : 'transparent',
                      '&:hover': { bgcolor: alpha(theme.palette.action.hover, 0.6) },
                    }),
                  ]}
                >
                  {/* Action label */}
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 600,
                      minWidth: 130,
                    }}
                  >
                    {actionLabel(actKey)}
                  </Typography>

                  {/* Mapped chips (MIDI + keyboard) */}
                  <Stack
                    direction="row"
                    spacing={0.5}
                    useFlexGap
                    sx={{
                      flexWrap: 'wrap',
                      flexGrow: 1,
                    }}
                  >
                    {midiMappings.length === 0 && keyMappings.length === 0 && (
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'text.disabled',
                          lineHeight: '24px',
                        }}
                      >
                        {LL.MIDI.NO_MAPPING()}
                      </Typography>
                    )}
                    {midiMappings.map((midiKey) => (
                      <Chip
                        key={`midi-${midiKey}`}
                        icon={<PianoIcon sx={{ fontSize: '0.9rem' }} />}
                        label={midiKey}
                        size="small"
                        color="primary"
                        variant="outlined"
                        onDelete={() => midi.removeMapping(midiKey)}
                        sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}
                      />
                    ))}
                    {keyMappings.map((combo) => (
                      <Chip
                        key={`kbd-${combo}`}
                        icon={<KeyboardIcon sx={{ fontSize: '0.9rem' }} />}
                        label={combo}
                        size="small"
                        color="info"
                        variant="outlined"
                        onDelete={() => keyboard.removeMapping(combo)}
                        sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}
                      />
                    ))}
                  </Stack>

                  {/* Learn MIDI */}
                  {midi.isSupported && (
                    <Tooltip title={noDevices ? LL.MIDI.NO_DEVICES() : LL.REMOTE.LEARN_MIDI()}>
                      <span>
                        <IconButton
                          size="small"
                          color={learningMidi ? 'warning' : 'primary'}
                          disabled={noDevices}
                          onClick={() => {
                            keyboard.cancelLearn();
                            if (learningMidi) midi.cancelLearn();
                            else midi.startLearn(actKey);
                          }}
                          sx={(theme) => ({
                            border: `1px solid ${learningMidi ? theme.palette.warning.main : theme.palette.primary.main}`,
                            borderRadius: 1.5,
                            '&:disabled': { borderColor: theme.palette.action.disabled },
                          })}
                        >
                          {learningMidi ? <StopIcon fontSize="small" /> : <PianoIcon fontSize="small" />}
                        </IconButton>
                      </span>
                    </Tooltip>
                  )}

                  {/* Learn keyboard */}
                  <Tooltip title={LL.REMOTE.LEARN_KEY()}>
                    <IconButton
                      size="small"
                      color={learningKey ? 'warning' : 'info'}
                      onClick={() => {
                        midi.cancelLearn();
                        if (learningKey) keyboard.cancelLearn();
                        else keyboard.startLearn(actKey);
                      }}
                      sx={(theme) => ({
                        border: `1px solid ${learningKey ? theme.palette.warning.main : theme.palette.info.main}`,
                        borderRadius: 1.5,
                      })}
                    >
                      {learningKey ? <StopIcon fontSize="small" /> : <KeyboardIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                </Stack>
                {idx < ACTION_KEYS.length - 1 && <Divider sx={{ mx: 1.5 }} />}
              </Box>
            );
          })}

          {/* MIDI unsupported hint (keyboard mapping still works) */}
          {!midi.isSupported && (
            <Typography variant="caption" sx={{ color: 'text.secondary', px: 1.5, pt: 1 }}>
              {LL.MIDI.NOT_SUPPORTED()}
            </Typography>
          )}

          {/* Bounce filter — footswitches often emit a press twice in quick succession */}
          <Divider sx={{ mx: 1.5, pt: 1 }} />
          <Stack sx={{ px: 1.5, pt: 1.5 }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Typography variant="body2" sx={{ fontWeight: 600, flexGrow: 1 }}>
                {LL.REMOTE.DEBOUNCE_TITLE()}
              </Typography>
              <Chip
                size="small"
                variant="outlined"
                color={debounceMs > 0 ? 'primary' : 'default'}
                label={debounceMs > 0 ? LL.REMOTE.DEBOUNCE_VALUE({ ms: debounceMs }) : LL.REMOTE.DEBOUNCE_OFF()}
                sx={{ fontFamily: 'monospace', fontSize: '0.7rem', minWidth: 64 }}
              />
            </Stack>
            <Slider
              value={debounceMs}
              onChange={(_e, value) => updateMusicianSetting('musicianRemoteDebounceMs', value as number)}
              min={0}
              max={REMOTE_DEBOUNCE_MAX_MS}
              step={50}
              marks={[
                { value: 0, label: LL.REMOTE.DEBOUNCE_OFF() },
                { value: 500, label: '500' },
                { value: REMOTE_DEBOUNCE_MAX_MS, label: '1000' },
              ]}
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => `${v} ms`}
              aria-label={LL.REMOTE.DEBOUNCE_TITLE()}
              sx={{ mt: 0.5 }}
            />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {LL.REMOTE.DEBOUNCE_HINT()}
            </Typography>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{LL.COMMON.CLOSE()}</Button>
      </DialogActions>
    </Dialog>
  );
};
