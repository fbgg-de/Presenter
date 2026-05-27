/**
 * MIDI Learn Dialog — lets the user map MIDI buttons to navigation actions (§11.10).
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
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useMidi, type MidiAction, type MidiStatus } from '@/hooks/useMidi';

const MIDI_ACTION_KEYS: MidiAction[] = ['next_page', 'prev_page', 'next_song', 'prev_song', 'next_block', 'prev_block', 'toggle_tracking'];

interface MidiLearnDialogProps {
  open: boolean;
  onClose: () => void;
  onAction?: (action: MidiAction) => void;
  enabled?: boolean;
}

export const MidiLearnDialog = ({ open, onClose, onAction, enabled = true }: MidiLearnDialogProps) => {
  const { LL } = useI18nContext();
  const midi = useMidi({ onAction, enabled: enabled && open });

  const StatusChip = ({ status }: { status: MidiStatus }) => {
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
      case 'toggle_tracking':
        return LL.MIDI.TOGGLE_TRACKING();
      default:
        return key;
    }
  };

  /** Collect all midiKeys that map to the given action */
  const mappingsForAction = (action: MidiAction): string[] =>
    Object.entries(midi.midiMappings)
      .filter(([, mappedAction]) => mappedAction === action)
      .map(([midiKey]) => midiKey);

  const isLearningThis = (action: MidiAction) => midi.isLearning && midi.learnAction === action;
  const noDevices = midi.devices.length === 0;

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
          <PianoIcon color="primary" />
          <Typography
            variant="h6"
            sx={{
              fontWeight: 700,
            }}
          >
            {LL.MIDI.SETTINGS()}
          </Typography>
          <Box
            sx={{
              flexGrow: 1,
            }}
          />
          <StatusChip status={midi.status} />
        </Stack>

        {/* Devices row */}
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
        {!midi.isSupported ? (
          <Typography color="error" sx={{ p: 1 }}>
            {LL.MIDI.NOT_SUPPORTED()}
          </Typography>
        ) : (
          <Stack spacing={0.5}>
            {/* "Learning" banner */}
            {midi.isLearning && (
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
                  {LL.MIDI.PRESS_FOR({ action: actionLabel(midi.learnAction as MidiAction) })}
                </Typography>
                <Button size="small" color="warning" variant="outlined" startIcon={<StopIcon />} onClick={midi.cancelLearn}>
                  {LL.COMMON.CANCEL()}
                </Button>
              </Stack>
            )}

            {/* Action rows */}
            {MIDI_ACTION_KEYS.map((actKey, idx) => {
              const mappings = mappingsForAction(actKey);
              const learning = isLearningThis(actKey);

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
                        bgcolor: learning ? alpha(theme.palette.warning.main, 0.1) : 'transparent',
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

                    {/* Mapped key chips */}
                    <Stack
                      direction="row"
                      spacing={0.5}
                      useFlexGap
                      sx={{
                        flexWrap: 'wrap',
                        flexGrow: 1,
                      }}
                    >
                      {mappings.length === 0 ? (
                        <Typography
                          variant="caption"
                          sx={{
                            color: 'text.disabled',
                            lineHeight: '24px',
                          }}
                        >
                          {LL.MIDI.NO_MAPPING()}
                        </Typography>
                      ) : (
                        mappings.map((midiKey) => (
                          <Chip
                            key={midiKey}
                            label={midiKey}
                            size="small"
                            color="primary"
                            variant="outlined"
                            onDelete={() => midi.removeMapping(midiKey)}
                            sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}
                          />
                        ))
                      )}
                    </Stack>

                    {/* Learn button */}
                    <Tooltip title={noDevices ? LL.MIDI.NO_DEVICES() : ''}>
                      <span>
                        <IconButton
                          size="small"
                          color={learning ? 'warning' : 'primary'}
                          disabled={noDevices}
                          onClick={() => (learning ? midi.cancelLearn() : midi.startLearn(actKey))}
                          sx={(theme) => ({
                            border: `1px solid ${learning ? theme.palette.warning.main : theme.palette.primary.main}`,
                            borderRadius: 1.5,
                            '&:disabled': { borderColor: theme.palette.action.disabled },
                          })}
                        >
                          {learning ? <StopIcon fontSize="small" /> : <RecordIcon fontSize="small" />}
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Stack>
                  {idx < MIDI_ACTION_KEYS.length - 1 && <Divider sx={{ mx: 1.5 }} />}
                </Box>
              );
            })}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{LL.COMMON.CLOSE()}</Button>
      </DialogActions>
    </Dialog>
  );
};
