/**
 * MIDI Learn Dialog — lets the user map MIDI buttons to navigation actions (§11.10).
 */
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  FiberManualRecord as RecordIcon,
  Stop as StopIcon,
  Bluetooth as BluetoothIcon,
  UsbOff as DisconnectedIcon,
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

  function StatusChip({ status }: { status: MidiStatus }) {
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
  }

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

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={2}>
          <Typography variant="h6">{LL.MIDI.SETTINGS()}</Typography>
          <StatusChip status={midi.status} />
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        {!midi.isSupported ? (
          <Typography color="error">{LL.MIDI.NOT_SUPPORTED()}</Typography>
        ) : (
          <Stack spacing={2}>
            {/* Connected Devices */}
            <Typography variant="subtitle2" fontWeight={700}>
              {LL.MIDI.DEVICES({ count: midi.devices.length })}
            </Typography>
            {midi.devices.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {LL.MIDI.NO_DEVICES()}
              </Typography>
            ) : (
              <Stack direction="row" spacing={1} flexWrap="wrap">
                {midi.devices.map((d) => (
                  <Chip
                    key={d.id}
                    label={d.name}
                    color={d.connected ? 'success' : 'default'}
                    variant={d.connected ? 'filled' : 'outlined'}
                    size="small"
                  />
                ))}
              </Stack>
            )}

            <Divider />

            {/* MIDI Learn */}
            <Typography variant="subtitle2" fontWeight={700}>
              {LL.MIDI.LEARN()}
            </Typography>
            {midi.isLearning && (
              <Stack
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{
                  p: 1.5,
                  bgcolor: 'warning.main',
                  color: 'warning.contrastText',
                  borderRadius: 1,
                }}
              >
                <RecordIcon sx={{ animation: 'pulse 1s infinite' }} />
                <Typography variant="body2" fontWeight={600}>
                  {LL.MIDI.PRESS_FOR({ action: actionLabel(midi.learnAction as MidiAction) })}
                </Typography>
                <Box flexGrow={1} />
                <Button size="small" variant="outlined" color="inherit" startIcon={<StopIcon />} onClick={midi.cancelLearn}>
                  {LL.COMMON.CANCEL()}
                </Button>
              </Stack>
            )}

            <List dense disablePadding>
              {MIDI_ACTION_KEYS.map((actKey) => (
                <ListItem
                  key={actKey}
                  secondaryAction={
                    <Button
                      size="small"
                      variant={midi.isLearning && midi.learnAction === actKey ? 'contained' : 'outlined'}
                      color={midi.isLearning && midi.learnAction === actKey ? 'warning' : 'primary'}
                      startIcon={<RecordIcon />}
                      onClick={() => midi.startLearn(actKey)}
                      disabled={midi.devices.length === 0}
                    >
                      {LL.MIDI.LEARN_BUTTON()}
                    </Button>
                  }
                >
                  <ListItemText primary={actionLabel(actKey as MidiAction)} />
                </ListItem>
              ))}
            </List>

            <Divider />

            {/* Current Mappings */}
            <Typography variant="subtitle2" fontWeight={700}>
              {LL.MIDI.CURRENT_MAPPINGS()}
            </Typography>
            {Object.keys(midi.midiMappings).length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {LL.MIDI.NO_MAPPINGS()}
              </Typography>
            ) : (
              Object.entries(midi.midiMappings).map(([deviceName, mappings]) => (
                <Box key={deviceName}>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                    <Typography variant="body2" fontWeight={600}>
                      {deviceName}
                    </Typography>
                    <IconButton size="small" color="error" onClick={() => midi.clearMapping(deviceName)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                  <List dense disablePadding sx={{ pl: 2 }}>
                    {Object.entries(mappings).map(([key, action]) => (
                      <ListItem
                        key={key}
                        secondaryAction={
                          <IconButton size="small" onClick={() => midi.removeMapping(deviceName, key)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        }
                      >
                        <ListItemText
                          primary={LL.MIDI.MAPPING_ENTRY({ key, action: actionLabel(action as MidiAction) })}
                          slotProps={{ primary: { variant: 'body2', fontFamily: 'monospace' } }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              ))
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{LL.COMMON.CANCEL()}</Button>
      </DialogActions>
    </Dialog>
  );
};
