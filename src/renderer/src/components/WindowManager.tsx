import { useCallback, useEffect, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  AcUnit as FreezeIcon,
  Brightness1 as BlackIcon,
  Close as CloseIcon,
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
  Fingerprint as IdentifyIcon,
  Monitor as NormalIcon,
  Save as SaveIcon,
  Stream as StreamIcon,
  Thermostat as UnfreezeIcon,
  Visibility as ShowIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useAppSelector, useAppDispatch } from '@/store';
import { toggleFreezeWindow, toggleBlack, toggleIdentify } from '@/store/presentationSlice';
import { updateSetting } from '@/store/settingsSlice';
import {
  openPresentationWindow,
  closePresentationWindow,
  closeAllPresentationWindows,
  identifyWindows,
  hideIdentify,
  getOpenWindows,
  getOpenWindowsSync,
  listScreens,
  type WindowConfig,
} from '@/utils/presentationBridge';

interface WindowManagerProps {
  open: boolean;
  onClose: () => void;
}

export const WindowManager = ({ open, onClose }: WindowManagerProps) => {
  const { LL } = useI18nContext();
  const dispatch = useAppDispatch();
  const isBlack = useAppSelector((state) => state.presentation.isBlack);
  const isIdentifying = useAppSelector((state) => state.presentation.isIdentifying);
  const frozenWindows = useAppSelector((state) => state.presentation.frozenWindows);
  const windowPresets = useAppSelector((state) => state.settings.windowPresets) as Record<string, WindowConfig[]>;

  // Track open windows
  const [openWindowsList, setOpenWindowsList] = useState<Array<{ id: string; config: WindowConfig; closed: boolean }>>([]);

  // Available screens (Electron)
  const [screens, setScreens] = useState<
    Array<{ id: number; label: string; bounds: { x: number; y: number; width: number; height: number }; isPrimary: boolean }>
  >([]);

  // New window form
  const [newName, setNewName] = useState('Presentation');
  const [newMode, setNewMode] = useState<'normal' | 'stream'>('normal');
  const [newTransparent, setNewTransparent] = useState(false);
  const [newFullscreen, setNewFullscreen] = useState(false);
  const [newFrameless, setNewFrameless] = useState(true);
  const [newAlwaysOnTop, setNewAlwaysOnTop] = useState(false);
  const [newHideMouse, setNewHideMouse] = useState(false);
  const [newWidth, setNewWidth] = useState(1920);
  const [newHeight, setNewHeight] = useState(1080);
  const [newScreenId, setNewScreenId] = useState<number | ''>('');

  // Preset save
  const [presetName, setPresetName] = useState('');

  useEffect(() => {
    if (!open) return;
    const refreshWindows = () => {
      getOpenWindows()
        .then(setOpenWindowsList)
        .catch(() => setOpenWindowsList(getOpenWindowsSync()));
    };
    const interval = setInterval(refreshWindows, 1000);
    refreshWindows();
    // Load available screens
    listScreens()
      .then(setScreens)
      .catch(() => {});
    return () => clearInterval(interval);
  }, [open]);

  const activeWindows = openWindowsList.filter((w) => !w.closed);

  const handleCreateWindow = useCallback(async () => {
    const selectedScreen = screens.find((s) => s.id === newScreenId);
    await openPresentationWindow({
      name: newName,
      displayMode: newMode,
      transparent: newTransparent,
      fullscreen: newFullscreen,
      frameless: newFrameless,
      alwaysOnTop: newAlwaysOnTop,
      hideMouse: newHideMouse,
      width: newWidth,
      height: newHeight,
      left: selectedScreen?.bounds.x,
      top: selectedScreen?.bounds.y,
    });
    getOpenWindows()
      .then(setOpenWindowsList)
      .catch(() => {});
  }, [
    newName,
    newMode,
    newTransparent,
    newFullscreen,
    newFrameless,
    newAlwaysOnTop,
    newHideMouse,
    newWidth,
    newHeight,
    newScreenId,
    screens,
  ]);

  const handleCloseWindow = useCallback(async (id: string) => {
    await closePresentationWindow(id);
    setTimeout(() => {
      getOpenWindows()
        .then(setOpenWindowsList)
        .catch(() => {});
    }, 100);
  }, []);

  const handleSavePreset = useCallback(() => {
    if (!presetName.trim()) return;
    const configs = activeWindows.map((w) => w.config);
    const newPresets = { ...windowPresets, [presetName.trim()]: configs };
    dispatch(updateSetting({ key: 'windowPresets', value: newPresets }));
    setPresetName('');
  }, [presetName, activeWindows, windowPresets, dispatch]);

  const handleLoadPreset = useCallback(
    async (name: string) => {
      const configs = windowPresets[name];
      if (!configs) return;
      await closeAllPresentationWindows();
      setTimeout(async () => {
        for (const config of configs) {
          await openPresentationWindow(config);
        }
        setTimeout(() => {
          getOpenWindows()
            .then(setOpenWindowsList)
            .catch(() => {});
        }, 200);
      }, 100);
    },
    [windowPresets],
  );

  const handleDeletePreset = useCallback(
    (name: string) => {
      const newPresets = { ...windowPresets };
      delete newPresets[name];
      dispatch(updateSetting({ key: 'windowPresets', value: newPresets }));
    },
    [windowPresets, dispatch],
  );

  return (
    <Drawer open={open} anchor="right" onClose={onClose}>
      <Stack sx={{ width: 'min(90vw, 600px)', height: '100%' }}>
        {/* Header */}
        <Stack direction="row" alignItems="center" sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {LL.WINDOW.PANEL_TITLE()}
          </Typography>
          <Box flexGrow={1} />
          <Tooltip title={LL.FOOTER.IDENTIFY()}>
            <IconButton
              onClick={() => {
                if (isIdentifying) {
                  hideIdentify();
                } else {
                  identifyWindows();
                }
                dispatch(toggleIdentify());
              }}
              sx={{ mr: 1 }}
              color={isIdentifying ? 'primary' : 'default'}
            >
              <IdentifyIcon />
            </IconButton>
          </Tooltip>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Stack>

        <Stack sx={{ flex: 1, overflow: 'auto', p: 2 }} spacing={2}>
          {/* Global actions */}
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              variant={isBlack ? 'contained' : 'outlined'}
              color={isBlack ? 'error' : 'primary'}
              startIcon={isBlack ? <ShowIcon /> : <BlackIcon />}
              onClick={() => dispatch(toggleBlack())}
            >
              {isBlack ? LL.FOOTER.SHOW() : LL.FOOTER.BLACK()}
            </Button>
            {activeWindows.length > 0 && (
              <Button
                size="small"
                variant="outlined"
                color="error"
                onClick={async () => {
                  await closeAllPresentationWindows();
                  setOpenWindowsList([]);
                }}
              >
                {LL.WINDOW.CLOSE_ALL()}
              </Button>
            )}
          </Stack>

          <Divider />

          {/* Window list */}
          <Typography variant="subtitle2" fontWeight={700}>
            {LL.WINDOW.OPEN()} ({activeWindows.length})
          </Typography>

          {activeWindows.length === 0 ? (
            <Typography color="text.secondary" variant="body2">
              {LL.WINDOW.NO_OPEN()}
            </Typography>
          ) : (
            <List dense disablePadding>
              {activeWindows.map((entry) => {
                const name = entry.config.name || 'Window';
                const isFrozen = frozenWindows.includes(name);
                const isStream = entry.config.displayMode === 'stream';

                return (
                  <ListItem
                    key={entry.id}
                    secondaryAction={
                      <Stack direction="row" spacing={0.5}>
                        <Tooltip title={isFrozen ? LL.FOOTER.UNFREEZE() : LL.FOOTER.FREEZE()}>
                          <IconButton size="small" onClick={() => dispatch(toggleFreezeWindow(name))} color={isFrozen ? 'info' : 'default'}>
                            {isFrozen ? <UnfreezeIcon fontSize="small" /> : <FreezeIcon fontSize="small" />}
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={LL.WINDOW.CLOSE()}>
                          <IconButton size="small" onClick={() => handleCloseWindow(entry.id)} color="error">
                            <CloseIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    }
                    sx={{ borderBottom: 1, borderColor: 'divider' }}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      {isStream ? <StreamIcon fontSize="small" /> : <NormalIcon fontSize="small" />}
                    </ListItemIcon>
                    <ListItemText
                      primary={name}
                      secondary={
                        <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
                          <Chip
                            label={isStream ? LL.FOOTER.STREAM_MODE() : LL.FOOTER.NORMAL_MODE()}
                            size="small"
                            variant="outlined"
                            sx={{ height: 20, fontSize: '0.65rem' }}
                          />
                          {isFrozen && (
                            <Chip label={LL.WINDOW.STATUS_FROZEN()} size="small" color="info" sx={{ height: 20, fontSize: '0.65rem' }} />
                          )}
                          {entry.config.transparent && (
                            <Chip
                              label={LL.WINDOW.TRANSPARENT()}
                              size="small"
                              variant="outlined"
                              sx={{ height: 20, fontSize: '0.65rem' }}
                            />
                          )}
                        </Stack>
                      }
                    />
                  </ListItem>
                );
              })}
            </List>
          )}

          <Divider />

          {/* Create Window */}
          <Accordion defaultExpanded={activeWindows.length === 0}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <AddIcon fontSize="small" />
                <Typography fontWeight={600}>{LL.WINDOW.CREATE()}</Typography>
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={2}>
                <TextField label={LL.WINDOW.NAME()} value={newName} onChange={(e) => setNewName(e.target.value)} size="small" fullWidth />
                <Select value={newMode} onChange={(e) => setNewMode(e.target.value as 'normal' | 'stream')} size="small" fullWidth>
                  <MenuItem value="normal">{LL.FOOTER.NORMAL_MODE()}</MenuItem>
                  <MenuItem value="stream">{LL.FOOTER.STREAM_MODE()}</MenuItem>
                </Select>
                <Stack direction="row" spacing={2}>
                  <TextField
                    label={LL.WINDOW.WIDTH()}
                    type="number"
                    value={newWidth}
                    onChange={(e) => setNewWidth(Number(e.target.value))}
                    size="small"
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    label={LL.WINDOW.HEIGHT()}
                    type="number"
                    value={newHeight}
                    onChange={(e) => setNewHeight(Number(e.target.value))}
                    size="small"
                    sx={{ flex: 1 }}
                  />
                </Stack>
                {screens.length > 1 && (
                  <Select
                    value={newScreenId}
                    onChange={(e) => setNewScreenId(e.target.value as number)}
                    size="small"
                    fullWidth
                    displayEmpty
                  >
                    <MenuItem value="">Auto</MenuItem>
                    {screens.map((s) => (
                      <MenuItem key={s.id} value={s.id}>
                        {s.label} ({s.bounds.width}×{s.bounds.height}){s.isPrimary ? ' ★' : ''}
                      </MenuItem>
                    ))}
                  </Select>
                )}
                <FormControlLabel
                  control={<Switch checked={newFullscreen} onChange={(e) => setNewFullscreen(e.target.checked)} size="small" />}
                  label="Fullscreen"
                />
                <FormControlLabel
                  control={<Switch checked={newFrameless} onChange={(e) => setNewFrameless(e.target.checked)} size="small" />}
                  label="Frameless"
                />
                <FormControlLabel
                  control={<Switch checked={newAlwaysOnTop} onChange={(e) => setNewAlwaysOnTop(e.target.checked)} size="small" />}
                  label="Always on Top"
                />
                <FormControlLabel
                  control={<Switch checked={newHideMouse} onChange={(e) => setNewHideMouse(e.target.checked)} size="small" />}
                  label="Hide Mouse Cursor"
                />
                <FormControlLabel
                  control={<Switch checked={newTransparent} onChange={(e) => setNewTransparent(e.target.checked)} size="small" />}
                  label={LL.WINDOW.TRANSPARENT()}
                />
                <Button variant="contained" onClick={handleCreateWindow} startIcon={<AddIcon />}>
                  {LL.WINDOW.CREATE()}
                </Button>
              </Stack>
            </AccordionDetails>
          </Accordion>

          {/* Presets */}
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography fontWeight={600}>{LL.WINDOW.PRESETS()}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={2}>
                {/* Save preset */}
                <Stack direction="row" spacing={1}>
                  <TextField
                    label={LL.WINDOW.PRESET_NAME()}
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    size="small"
                    sx={{ flex: 1 }}
                  />
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<SaveIcon />}
                    onClick={handleSavePreset}
                    disabled={!presetName.trim() || activeWindows.length === 0}
                  >
                    {LL.COMMON.SAVE()}
                  </Button>
                </Stack>

                {/* Preset list */}
                {Object.keys(windowPresets).length > 0 ? (
                  <List dense disablePadding>
                    {Object.entries(windowPresets).map(([name, configs]) => (
                      <ListItem
                        key={name}
                        secondaryAction={
                          <IconButton size="small" onClick={() => handleDeletePreset(name)} color="error">
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        }
                      >
                        <ListItemText primary={name} secondary={`${(configs as WindowConfig[]).length} window(s)`} />
                        <Button size="small" onClick={() => handleLoadPreset(name)} sx={{ mr: 4 }}>
                          {LL.WINDOW.PRESET_LOAD()}
                        </Button>
                      </ListItem>
                    ))}
                  </List>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    {LL.STYLE.NONE()}
                  </Typography>
                )}
              </Stack>
            </AccordionDetails>
          </Accordion>
        </Stack>
      </Stack>
    </Drawer>
  );
};
