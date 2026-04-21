import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
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
  Tooltip,
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
  toggle_video_visible: 'Ctrl+Space',
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
  toggle_video_visible: true,
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
  'toggle_video_visible',
] as const;

type ActionId = (typeof ACTIONS)[number];

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
      case 'toggle_video_visible':
        return LL.KEYBOARD.ACTION_TOGGLE_VIDEO_VISIBLE();
        default:
          return action;
      }
    },
    [LL],
  );
};

type Pending = {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  mainKey: string | null; // e.code of last non-modifier key
};

const EMPTY_PENDING: Pending = { ctrl: false, shift: false, alt: false, meta: false, mainKey: null };

/** Convert a pending capture state into a combo string (e.g. "Ctrl+Shift+KeyH"). */
const pendingToCombo = (p: Pending): string => {
  const parts: string[] = [];
  if (p.ctrl) parts.push('Ctrl');
  if (p.shift) parts.push('Shift');
  if (p.alt) parts.push('Alt');
  if (p.meta) parts.push('Meta');
  if (p.mainKey) parts.push(p.mainKey);
  return parts.join('+');
};

/** Parse an existing combo string back into a Pending state so the dialog
 *  opens pre-filled with the current binding. */
const comboToPending = (combo: string): Pending => {
  const parts = combo.split('+').filter(Boolean);
  const p: Pending = { ...EMPTY_PENDING };
  for (const part of parts) {
    if (part === 'Ctrl') p.ctrl = true;
    else if (part === 'Shift') p.shift = true;
    else if (part === 'Alt') p.alt = true;
    else if (part === 'Meta') p.meta = true;
    else p.mainKey = part;
  }
  return p;
};

export const KeyboardMappingEditor = () => {
  const { LL } = useI18nContext();
  const dispatch = useAppDispatch();
  const keyboardMapping = useAppSelector((state) => state.settings.keyboardMapping);
  const keyboardEnabled = useAppSelector((state) => state.settings.keyboardEnabled) as Record<string, boolean> | undefined;
  const getActionLabel = useActionLabel();

  const [captureAction, setCaptureAction] = useState<ActionId | null>(null);
  // Live-tracked chord while capturing. Re-rendered on every key event so the
  // dialog displays the chord-in-progress (modifiers are kept even after the
  // main key is pressed; the dialog now waits for an explicit Apply click).
  const [pending, setPending] = useState<Pending>(EMPTY_PENDING);
  // Ref mirror to avoid stale state in the keydown closure.
  const pendingRef = useRef<Pending>(EMPTY_PENDING);
  const setPendingBoth = useCallback((next: Pending) => {
    pendingRef.current = next;
    setPending(next);
  }, []);

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

  /** Open the capture dialog for an action — seeds pending with current combo. */
  const openCapture = (action: ActionId) => {
    const combo = getMappedKey(action);
    setPendingBoth(combo ? comboToPending(combo) : EMPTY_PENDING);
    setCaptureAction(action);
  };

  /** Reset a single row to its default (removes the user override). */
  const handleResetRow = (action: ActionId) => {
    const next = { ...keyboardMapping };
    delete next[action];
    dispatch(updateSetting({ key: 'keyboardMapping', value: next }));
  };

  /** Apply the currently captured chord and close the dialog. */
  const handleApplyCapture = () => {
    if (!captureAction || !pendingRef.current.mainKey) return;
    const combo = pendingToCombo(pendingRef.current);
    dispatch(updateSetting({ key: 'keyboardMapping', value: { ...keyboardMapping, [captureAction]: combo } }));
    setCaptureAction(null);
  };

  // Key capture: track the live chord WITHOUT auto-closing on first key —
  // previously a single keydown for Ctrl was committed before the user could
  // press the main key (so e.g. Ctrl+H bound only "Ctrl"). Now we track
  // modifiers + main key independently and wait for Apply.
  useEffect(() => {
    if (!captureAction) return;

    const isModifier = (code: string) =>
      code === 'ControlLeft' || code === 'ControlRight' ||
      code === 'ShiftLeft' || code === 'ShiftRight' ||
      code === 'AltLeft' || code === 'AltRight' ||
      code === 'MetaLeft' || code === 'MetaRight';

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Allow Escape to cancel quickly.
      if (e.key === 'Escape' && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
        setCaptureAction(null);
        return;
      }
      const next: Pending = {
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
        alt: e.altKey,
        meta: e.metaKey,
        mainKey: isModifier(e.code) ? pendingRef.current.mainKey : e.code,
      };
      setPendingBoth(next);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Update modifier flags on release, but keep the captured main key so
      // the user can release everything before clicking Apply.
      const next: Pending = {
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
        alt: e.altKey,
        meta: e.metaKey,
        mainKey: pendingRef.current.mainKey,
      };
      // If only modifiers are part of the chord (no main key yet) and the
      // user just released them, clear the modifier flags too so the chip
      // resets visually.
      if (!next.mainKey) setPendingBoth(next);
      else setPendingBoth({ ...next, ctrl: pendingRef.current.ctrl || next.ctrl, shift: pendingRef.current.shift || next.shift, alt: pendingRef.current.alt || next.alt, meta: pendingRef.current.meta || next.meta });
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }, [captureAction, setPendingBoth]);

  const handleReset = () => {
    dispatch(updateSetting({ key: 'keyboardMapping', value: {} }));
    dispatch(updateSetting({ key: 'keyboardEnabled', value: { ...DEFAULT_KEYBOARD_ENABLED } }));
  };

  const liveCombo = pendingToCombo(pending);
  const currentCombo = captureAction ? getMappedKey(captureAction) : '';

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
            <TableCell width={90} />
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
                  <Stack direction="row" spacing={0.5}>
                    <Tooltip title={LL.KEYBOARD.MAPPING_EDIT()}>
                      <IconButton size="small" onClick={() => openCapture(action)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={LL.KEYBOARD.MAPPING_RESET_ROW()}>
                      <span>
                        <IconButton size="small" onClick={() => handleResetRow(action)} disabled={!isCustom}>
                          <ResetIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Stack>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <Button variant="outlined" size="small" startIcon={<ResetIcon />} onClick={handleReset}>
        {LL.KEYBOARD.MAPPING_RESET()}
      </Button>

      {/* Key capture dialog — does NOT auto-close. The user must click Apply
          (or Cancel/Escape). Modifier-only presses no longer commit. */}
      <Dialog open={!!captureAction} onClose={() => setCaptureAction(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{LL.KEYBOARD.MAPPING()}</DialogTitle>
        <DialogContent>
          <Stack alignItems="center" spacing={2} sx={{ py: 2, px: 2 }}>
            <Typography variant="body1">{captureAction && getActionLabel(captureAction)}</Typography>
            <Typography variant="caption" color="text.secondary" textAlign="center">
              {LL.KEYBOARD.MAPPING_PRESS_HINT()}
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
              <Stack alignItems="center" spacing={0.5}>
                <Typography variant="caption" color="text.secondary">{LL.KEYBOARD.MAPPING_CURRENT()}</Typography>
                <Chip label={currentCombo || '—'} size="small" variant="outlined" sx={{ fontFamily: 'monospace' }} />
              </Stack>
              <Stack alignItems="center" spacing={0.5}>
                <Typography variant="caption" color="text.secondary">{LL.KEYBOARD.MAPPING_NEW()}</Typography>
                <Chip
                  label={liveCombo || LL.KEYBOARD.MAPPING_PRESS()}
                  size="small"
                  color={liveCombo && pending.mainKey ? 'primary' : 'default'}
                  variant={liveCombo && pending.mainKey ? 'filled' : 'outlined'}
                  sx={{ fontFamily: 'monospace' }}
                />
              </Stack>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => captureAction && handleResetRow(captureAction)}
            disabled={!captureAction || !keyboardMapping[captureAction]}
            startIcon={<ResetIcon />}
          >
            {LL.KEYBOARD.MAPPING_RESET_ROW()}
          </Button>
          <Box flexGrow={1} />
          <Button onClick={() => setCaptureAction(null)}>{LL.COMMON.CANCEL()}</Button>
          <Button onClick={handleApplyCapture} disabled={!pending.mainKey} variant="contained">
            {LL.KEYBOARD.MAPPING_APPLY()}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};
