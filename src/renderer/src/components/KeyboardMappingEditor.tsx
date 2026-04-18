import { useState, useEffect, useCallback } from 'react';
import {
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { Edit as EditIcon, RestartAlt as ResetIcon } from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useAppSelector, useAppDispatch } from '@/store';
import { updateSetting } from '@/store/settingsSlice';

/** Default keyboard mapping per §22.1 */
export const DEFAULT_KEYBOARD_MAPPING: Record<string, string> = {
  prev_item: 'PageUp',
  next_item: 'PageDown',
  'Ctrl+prev_item': 'Ctrl+ArrowUp',
  'Ctrl+next_item': 'Ctrl+ArrowDown',
  prev_block: 'ArrowLeft',
  next_block: 'ArrowRight',
  prev_line: 'ArrowUp',
  next_line: 'ArrowDown',
  jump_to_start: 'Home',
  toggle_black: 'KeyB',
  close_drawer: 'Escape',
  toggle_video_playback: 'Space',
};

/** Default enabled state per action (all enabled by default) */
export const DEFAULT_KEYBOARD_ENABLED: Record<string, boolean> = {
  prev_item: true,
  next_item: true,
  prev_block: true,
  next_block: true,
  prev_line: true,
  next_line: true,
  jump_to_start: true,
  toggle_black: true,
  close_drawer: true,
  toggle_video_playback: true,
};

/** All configurable actions */
const ACTIONS = [
  'prev_item',
  'next_item',
  'prev_block',
  'next_block',
  'prev_line',
  'next_line',
  'jump_to_start',
  'toggle_black',
  'close_drawer',
  'toggle_video_playback',
] as const;

type ActionId = (typeof ACTIONS)[number];

/** Build a combo string from a keyboard event */
const eventToCombo = (e: KeyboardEvent): string => {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');
  if (e.metaKey) parts.push('Meta');
  // Don't include modifier-only keys as the main key
  if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
    parts.push(e.code);
  }
  return parts.join('+');
};

/** Get the action label from i18n */
const useActionLabel = (): ((action: ActionId) => string) => {
  const { LL } = useI18nContext();
  return useCallback(
    (action: ActionId): string => {
      switch (action) {
        case 'prev_item':
          return LL.KEYBOARD.ACTION_PREV_ITEM();
        case 'next_item':
          return LL.KEYBOARD.ACTION_NEXT_ITEM();
        case 'prev_block':
          return LL.KEYBOARD.ACTION_PREV_BLOCK();
        case 'next_block':
          return LL.KEYBOARD.ACTION_NEXT_BLOCK();
        case 'prev_line':
          return LL.KEYBOARD.ACTION_PREV_LINE();
        case 'next_line':
          return LL.KEYBOARD.ACTION_NEXT_LINE();
        case 'toggle_black':
          return LL.KEYBOARD.ACTION_TOGGLE_BLACK();
        case 'close_drawer':
          return LL.KEYBOARD.ACTION_CLOSE_DRAWER();
        case 'toggle_video_playback':
          return LL.KEYBOARD.ACTION_TOGGLE_VIDEO();
        default:
          return action;
      }
    },
    [LL],
  );
};

export const KeyboardMappingEditor = () => {
  const { LL } = useI18nContext();
  const dispatch = useAppDispatch();
  const keyboardMapping = useAppSelector((state) => state.settings.keyboardMapping);
  const keyboardEnabled = useAppSelector((state) => state.settings.keyboardEnabled) as Record<string, boolean> | undefined;
  const getActionLabel = useActionLabel();

  const [captureAction, setCaptureAction] = useState<ActionId | null>(null);

  // Merge user mapping with defaults
  const getMappedKey = (action: ActionId): string => {
    return keyboardMapping[action] || DEFAULT_KEYBOARD_MAPPING[action] || '';
  };

  // Check if action is enabled
  const isActionEnabled = (action: ActionId): boolean => {
    if (keyboardEnabled && action in keyboardEnabled) return keyboardEnabled[action];
    return DEFAULT_KEYBOARD_ENABLED[action] ?? true;
  };

  // Toggle enabled state for an action
  const handleToggleEnabled = (action: ActionId) => {
    const current = isActionEnabled(action);
    const newEnabled = { ...(keyboardEnabled || DEFAULT_KEYBOARD_ENABLED), [action]: !current };
    dispatch(updateSetting({ key: 'keyboardEnabled', value: newEnabled }));
  };

  // Key capture dialog handler
  useEffect(() => {
    if (!captureAction) return;

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const combo = eventToCombo(e);
      if (combo) {
        const newMapping = { ...keyboardMapping, [captureAction]: combo };
        dispatch(updateSetting({ key: 'keyboardMapping', value: newMapping }));
        setCaptureAction(null);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [captureAction, keyboardMapping, dispatch]);

  const handleReset = () => {
    dispatch(updateSetting({ key: 'keyboardMapping', value: {} }));
    dispatch(updateSetting({ key: 'keyboardEnabled', value: { ...DEFAULT_KEYBOARD_ENABLED } }));
  };

  return (
    <Stack spacing={2}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>
              <strong>{LL.KEYBOARD.MAPPING_ACTION()}</strong>
            </TableCell>
            <TableCell>
              <strong>{LL.KEYBOARD.MAPPING_KEY()}</strong>
            </TableCell>
            <TableCell width={50}>
              <strong>{LL.KEYBOARD.MAPPING_ENABLED()}</strong>
            </TableCell>
            <TableCell width={50} />
          </TableRow>
        </TableHead>
        <TableBody>
          {ACTIONS.map((action) => {
            const combo = getMappedKey(action);
            const isCustom = !!keyboardMapping[action];
            const enabled = isActionEnabled(action);

            return (
              <TableRow key={action} hover sx={{ opacity: enabled ? 1 : 0.5 }}>
                <TableCell>
                  <Typography variant="body2">{getActionLabel(action)}</Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    label={combo || '—'}
                    size="small"
                    variant={isCustom ? 'filled' : 'outlined'}
                    color={isCustom ? 'primary' : 'default'}
                    sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                  />
                </TableCell>
                <TableCell>
                  <Switch size="small" checked={enabled} onChange={() => handleToggleEnabled(action)} />
                </TableCell>
                <TableCell>
                  <IconButton size="small" onClick={() => setCaptureAction(action)} title={LL.KEYBOARD.MAPPING_EDIT()}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <Button variant="outlined" size="small" startIcon={<ResetIcon />} onClick={handleReset}>
        {LL.KEYBOARD.MAPPING_RESET()}
      </Button>

      {/* Key capture dialog */}
      <Dialog open={!!captureAction} onClose={() => setCaptureAction(null)}>
        <DialogTitle>{LL.KEYBOARD.MAPPING()}</DialogTitle>
        <DialogContent>
          <Stack alignItems="center" spacing={2} sx={{ py: 3, px: 4 }}>
            <Typography variant="body1">{captureAction && getActionLabel(captureAction)}</Typography>
            <Typography variant="h6" color="primary" sx={{ fontFamily: 'monospace' }}>
              {LL.KEYBOARD.MAPPING_PRESS()}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCaptureAction(null)}>{LL.COMMON.CANCEL()}</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};
