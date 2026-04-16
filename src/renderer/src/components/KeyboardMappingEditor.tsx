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
  toggle_black: 'KeyB',
  toggle_fullscreen: 'KeyF',
  close_drawer: 'Escape',
};

/** All configurable actions */
const ACTIONS = [
  'prev_item',
  'next_item',
  'prev_block',
  'next_block',
  'prev_line',
  'next_line',
  'toggle_black',
  'toggle_fullscreen',
  'close_drawer',
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
        case 'toggle_fullscreen':
          return LL.KEYBOARD.ACTION_TOGGLE_FULLSCREEN();
        case 'close_drawer':
          return LL.KEYBOARD.ACTION_CLOSE_DRAWER();
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
  const getActionLabel = useActionLabel();

  const [captureAction, setCaptureAction] = useState<ActionId | null>(null);

  // Merge user mapping with defaults
  const getMappedKey = (action: ActionId): string => {
    return keyboardMapping[action] || DEFAULT_KEYBOARD_MAPPING[action] || '';
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
            <TableCell width={50} />
          </TableRow>
        </TableHead>
        <TableBody>
          {ACTIONS.map((action) => {
            const combo = getMappedKey(action);
            const isCustom = !!keyboardMapping[action];

            return (
              <TableRow key={action} hover>
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
