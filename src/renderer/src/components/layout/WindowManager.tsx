import { useCallback, useEffect, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  Collapse,
  Divider,
  Drawer,
  FormControlLabel,
  Grid,
  IconButton,
  List,
  ListItem,
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
  ExpandMore as ExpandMoreIcon,
  Fingerprint as IdentifyIcon,
  Monitor as NormalIcon,
  Save as SaveIcon,
  Cast as StreamIcon,
  Visibility as ShowIcon,
  VisibilityOff as HideWindowIcon,
  Add as AddIcon,
  Palette as StyleIcon,
  Edit as EditIcon,
  MouseOutlined as MouseIcon,
  Fullscreen as FullscreenIcon,
  CropFree as FramelessIcon,
  VerticalAlignTop as OnTopIcon,
  Opacity as TransparentIcon,
  Tune as TuneIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useAppDispatch } from '@/store';
import { toggleFreezeWindow, toggleBlack, toggleIdentify, useGetPresentationSettings } from '@/store/presentationSlice';
import { useGetWindows, useUpdateWindows, WindowConfig } from '@/store/windowSlice';
import { useGetStylesQuery } from '@/api/styles.api';
import { useMetrics } from '@/hooks/useMetrics';
import {
  openPresentationWindow,
  closePresentationWindow,
  closeAllPresentationWindows,
  identifyWindows,
  hideIdentify,
  getOpenWindows,
  getOpenWindowsSync,
  listScreens,
  updateWindowConfigInBridge,
} from '@/utils/presentationBridge';
import { ScreenPicker, screenIdForBounds, type ScreenInfo, type ScreenPickerWindow } from './ScreenPicker';

interface WindowManagerProps {
  open: boolean;
  onClose: () => void;
  openWithNew?: boolean;
}

/** Shared form for creating / editing a window config */
const WindowConfigForm = ({
  cfg,
  onChange,
  screens,
  openWindows,
  styles,
  onSubmit,
  submitLabel,
  isEdit,
  LL,
}: {
  cfg: Partial<WindowConfig> & {
    name: string;
    width: number;
    height: number;
    displayMode: 'normal' | 'stream';
    screenId?: number | '';
    styleId?: number;
    transparent?: boolean;
    positionX?: number | undefined;
    positionY?: number | undefined;
  };
  onChange: (patch: Partial<typeof cfg>) => void;
  screens: ScreenInfo[];
  /** Open windows with live bounds, drawn onto the screen map. */
  openWindows: ScreenPickerWindow[];
  styles: Array<{ id: number; name: string }>;
  onSubmit: () => void;
  submitLabel: string;
  isEdit?: boolean;
  LL: ReturnType<typeof useI18nContext>['LL'];
}) => (
  <Stack spacing={1.5}>
    <Stack direction="row" spacing={1}>
      <TextField
        label={LL.WINDOW.NAME()}
        value={cfg.name}
        onChange={(e) => onChange({ name: e.target.value })}
        size="small"
        sx={{ flex: 2 }}
      />
      <Select
        value={cfg.displayMode}
        onChange={(e) => onChange({ displayMode: e.target.value as 'normal' | 'stream' })}
        size="small"
        sx={{ flex: 1 }}
      >
        <MenuItem value="normal">
          <Stack
            direction="row"
            spacing={0.5}
            sx={{
              alignItems: 'center',
            }}
          >
            <NormalIcon fontSize="small" />
            <span>{LL.FOOTER.NORMAL_MODE()}</span>
          </Stack>
        </MenuItem>
        <MenuItem value="stream">
          <Stack
            direction="row"
            spacing={0.5}
            sx={{
              alignItems: 'center',
            }}
          >
            <StreamIcon fontSize="small" />
            <span>{LL.FOOTER.STREAM_MODE()}</span>
          </Stack>
        </MenuItem>
      </Select>
    </Stack>
    {/* Screen assignment — the normal way to place a window. Picking a screen fills in
        its bounds, so size/coordinates never have to be typed for the common case. */}
    <ScreenPicker
      screens={screens}
      value={cfg.screenId ?? ''}
      windows={openWindows}
      onChange={(screenId) => {
        const target = screens.find((s) => s.id === screenId);
        if (!target) return;
        onChange({
          screenId,
          positionX: target.bounds.x,
          positionY: target.bounds.y,
          width: target.bounds.width,
          height: target.bounds.height,
        });
      }}
    />
    {/* Everything below is expert territory: exact pixel geometry. Collapsed by default so
        the common path (pick a screen, name it, go) stays a three-decision form. */}
    <Accordion disableGutters elevation={0} sx={{ '&:before': { display: 'none' }, bgcolor: 'transparent' }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 36, px: 0, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
          <TuneIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {LL.WINDOW.ADVANCED_GEOMETRY()}
          </Typography>
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 0, pt: 0 }}>
        <Stack direction="row" spacing={1}>
          <TextField
            label={LL.WINDOW.WIDTH()}
            type="number"
            value={cfg.width}
            onChange={(e) => onChange({ width: Number(e.target.value) })}
            size="small"
            sx={{ flex: 1 }}
          />
          <TextField
            label={LL.WINDOW.HEIGHT()}
            type="number"
            value={cfg.height}
            onChange={(e) => onChange({ height: Number(e.target.value) })}
            size="small"
            sx={{ flex: 1 }}
          />
          <TextField
            label={LL.WINDOW.POSITION_X()}
            type="number"
            value={cfg.positionX ?? ''}
            onChange={(e) => onChange({ positionX: e.target.value === '' ? undefined : Number(e.target.value) })}
            size="small"
            placeholder="auto"
            sx={{ flex: 1 }}
          />
          <TextField
            label={LL.WINDOW.POSITION_Y()}
            type="number"
            value={cfg.positionY ?? ''}
            onChange={(e) => onChange({ positionY: e.target.value === '' ? undefined : Number(e.target.value) })}
            size="small"
            placeholder="auto"
            sx={{ flex: 1 }}
          />
        </Stack>
      </AccordionDetails>
    </Accordion>
    {/* Switches in 2 columns */}
    <Grid container spacing={0.5} sx={{ paddingX: 2 }}>
      <Grid size={6}>
        <FormControlLabel
          control={<Switch checked={cfg.fullscreen || false} onChange={(e) => onChange({ fullscreen: e.target.checked })} size="small" />}
          label={
            <Stack
              direction="row"
              spacing={0.5}
              sx={{
                alignItems: 'center',
              }}
            >
              <FullscreenIcon sx={{ fontSize: 16 }} />
              <Typography variant="body2">{LL.WINDOW.FULLSCREEN()}</Typography>
            </Stack>
          }
        />
      </Grid>
      <Grid size={6}>
        <FormControlLabel
          control={<Switch checked={cfg.frameless !== false} onChange={(e) => onChange({ frameless: e.target.checked })} size="small" />}
          label={
            <Stack
              direction="row"
              spacing={0.5}
              sx={{
                alignItems: 'center',
              }}
            >
              <FramelessIcon sx={{ fontSize: 16 }} />
              <Typography variant="body2">{LL.WINDOW.FRAMELESS()}</Typography>
            </Stack>
          }
        />
      </Grid>
      <Grid size={6}>
        <FormControlLabel
          control={<Switch checked={cfg.alwaysOnTop || false} onChange={(e) => onChange({ alwaysOnTop: e.target.checked })} size="small" />}
          label={
            <Stack
              direction="row"
              spacing={0.5}
              sx={{
                alignItems: 'center',
              }}
            >
              <OnTopIcon sx={{ fontSize: 16 }} />
              <Typography variant="body2">{LL.WINDOW.ALWAYS_ON_TOP()}</Typography>
            </Stack>
          }
        />
      </Grid>
      <Grid size={6}>
        <FormControlLabel
          control={<Switch checked={cfg.hideMouse || false} onChange={(e) => onChange({ hideMouse: e.target.checked })} size="small" />}
          label={
            <Stack
              direction="row"
              spacing={0.5}
              sx={{
                alignItems: 'center',
              }}
            >
              <MouseIcon sx={{ fontSize: 16 }} />
              <Typography variant="body2">{LL.FOOTER.HIDE_MOUSE()}</Typography>
            </Stack>
          }
        />
      </Grid>
      <Grid size={6}>
        <FormControlLabel
          control={<Switch checked={cfg.transparent || false} onChange={(e) => onChange({ transparent: e.target.checked })} size="small" />}
          label={
            <Stack
              direction="row"
              spacing={0.5}
              sx={{
                alignItems: 'center',
              }}
            >
              <TransparentIcon sx={{ fontSize: 16 }} />
              <Typography variant="body2">{LL.WINDOW.TRANSPARENT()}</Typography>
            </Stack>
          }
        />
      </Grid>
    </Grid>
    {styles.length > 0 && (
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: 'center',
        }}
      >
        <StyleIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
        <Select
          size="small"
          value={cfg.styleId || 0}
          onChange={(e) => onChange({ styleId: e.target.value as number })}
          sx={{ flex: 1, fontSize: '0.8rem' }}
          displayEmpty
        >
          <MenuItem value={0}>
            <em>{LL.STYLE.NONE()}</em>
          </MenuItem>
          {styles.map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {s.name}
            </MenuItem>
          ))}
        </Select>
      </Stack>
    )}
    <Button variant="contained" onClick={onSubmit} startIcon={isEdit ? <SaveIcon /> : <AddIcon />}>
      {submitLabel}
    </Button>
  </Stack>
);

export const WindowManager = ({ open, onClose, openWithNew }: WindowManagerProps) => {
  const { LL } = useI18nContext();
  const dispatch = useAppDispatch();
  const { trackEvent } = useMetrics();

  const { windowConfigs: savedConfigs } = useGetWindows();
  const updateWindowSetting = useUpdateWindows();
  const { isBlack, isIdentifying, frozenWindows } = useGetPresentationSettings();

  const { data: styles = [] } = useGetStylesQuery();

  const [openWindowsList, setOpenWindowsList] = useState<Array<{ id: string; config: WindowConfig; closed: boolean }>>([]);
  const [screens, setScreens] = useState<ScreenInfo[]>([]);
  const [hiddenWindows, setHiddenWindows] = useState<Set<string>>(new Set());
  /** Live geometry per window id — drives the screen map and the per-window screen badge. */
  const [windowBounds, setWindowBounds] = useState<Record<string, { x: number; y: number; width: number; height: number }>>({});

  const refreshHiddenWindows = useCallback(async () => {
    if (window.api?.getWindowStates) {
      try {
        const states: Array<{ id: string; hidden?: boolean; bounds?: { x: number; y: number; width: number; height: number } }> =
          await window.api.getWindowStates();
        setHiddenWindows(new Set(states.filter((s) => s.hidden).map((s) => s.id)));
        setWindowBounds(Object.fromEntries(states.filter((s) => s.bounds).map((s) => [s.id, s.bounds!])));
      } catch {
        /* ignore */
      }
    }
  }, []);

  // New window form state
  const [newCfg, setNewCfg] = useState({
    name: 'Presentation',
    displayMode: 'normal' as 'normal' | 'stream',
    transparent: false,
    fullscreen: false,
    frameless: true,
    alwaysOnTop: false,
    hideMouse: false,
    width: 1920,
    height: 1080,
    screenId: '' as number | '',
    styleId: 0,
    positionX: 0,
    positionY: 0,
  });

  // Which window's edit accordion is expanded
  const [expandedWindowId, setExpandedWindowId] = useState<string | null>(null);

  // Per-window edit config overrides
  const [editConfigs, setEditConfigs] = useState<
    Record<string, Partial<WindowConfig> & { styleId?: number; transparent?: boolean; screenId?: number | '' }>
  >({});

  // Create accordion expanded state (controlled)
  const [createExpanded, setCreateExpanded] = useState(false);

  useEffect(() => {
    if (!open) return;
    const refreshWindows = () => {
      getOpenWindows()
        .then(setOpenWindowsList)
        .catch(() => setOpenWindowsList(getOpenWindowsSync()));
      // Bounds move when the user drags a window — keep the map honest while it is open.
      void refreshHiddenWindows();
    };
    const interval = setInterval(refreshWindows, 1000);
    refreshWindows();
    if (openWithNew) setCreateExpanded(true);
    listScreens()
      .then(setScreens)
      .catch(() => {});
    return () => clearInterval(interval);
  }, [open, refreshHiddenWindows]);

  const activeWindows = openWindowsList.filter((w) => !w.closed);

  /** Open windows in the shape the screen map wants (name + live bounds). */
  const mappedWindows: ScreenPickerWindow[] = activeWindows.map((w) => ({
    id: w.id,
    name: w.config.name || 'Window',
    bounds: windowBounds[w.id],
  }));

  // When accordion opens for a window, pre-fill edit config from current config
  const handleToggleEdit = (windowId: string, currentCfg: WindowConfig & { _runtimeId?: string; styleId?: number }) => {
    if (expandedWindowId === windowId) {
      setExpandedWindowId(null);
    } else {
      setExpandedWindowId(windowId);
      if (!editConfigs[windowId]) {
        setEditConfigs((prev) => ({
          ...prev,
          [windowId]: {
            ...currentCfg,
            styleId: currentCfg.styleId ?? 0,
            // Preselect the screen the window actually sits on, so the map opens showing
            // where this window IS rather than an empty choice.
            screenId: screenIdForBounds(windowBounds[windowId], screens) ?? '',
          },
        }));
      }
    }
  };

  const handleCreateWindow = useCallback(async () => {
    const selectedScreen = screens.find((s) => s.id === newCfg.screenId);
    // The screen picker writes position+size into the form, so those are the source of
    // truth here; the selected screen only fills in for a form that was never touched.
    const positionX = newCfg.positionX ?? selectedScreen?.bounds.x;
    const positionY = newCfg.positionY ?? selectedScreen?.bounds.y;
    const id = await openPresentationWindow({
      name: newCfg.name,
      displayMode: newCfg.displayMode,
      transparent: newCfg.transparent,
      fullscreen: newCfg.fullscreen,
      frameless: newCfg.frameless,
      alwaysOnTop: newCfg.alwaysOnTop,
      hideMouse: newCfg.hideMouse,
      width: newCfg.width,
      height: newCfg.height,
      positionX,
      positionY,
      left: positionX,
      top: positionY,
    });
    // Persist the new config so the window can be restored after restart. Position must be
    // part of it — without it a restored window lands on the primary screen instead of the
    // beamer it was created for.
    const newConfig = {
      name: newCfg.name,
      displayMode: newCfg.displayMode,
      transparent: newCfg.transparent,
      fullscreen: newCfg.fullscreen,
      frameless: newCfg.frameless,
      alwaysOnTop: newCfg.alwaysOnTop,
      hideMouse: newCfg.hideMouse,
      width: newCfg.width,
      height: newCfg.height,
      positionX,
      positionY,
      styleId: newCfg.styleId || undefined,
      _runtimeId: id,
    };
    updateWindowSetting('windowConfigs', [...(savedConfigs || []), newConfig]);
    trackEvent('window_opened', 'window', id, {
      name: newCfg.name,
      displayMode: newCfg.displayMode,
      width: newCfg.width,
      height: newCfg.height,
      left: selectedScreen?.bounds.x,
      top: selectedScreen?.bounds.y,
      screen: selectedScreen?.label,
      fullscreen: newCfg.fullscreen,
      frameless: newCfg.frameless,
      transparent: newCfg.transparent,
      alwaysOnTop: newCfg.alwaysOnTop,
      styleId: newCfg.styleId || undefined,
    });
    setCreateExpanded(false);
    getOpenWindows()
      .then(setOpenWindowsList)
      .catch(() => {});
  }, [newCfg, screens, savedConfigs, updateWindowSetting]);

  const handleApplyEdit = useCallback(
    async (windowId: string) => {
      const patch = editConfigs[windowId];
      if (!patch) return;
      const api = (window as unknown as { api?: Record<string, unknown> }).api;
      if (api?.updateWindowConfig) {
        try {
          await (api.updateWindowConfig as (id: string, p: Partial<WindowConfig>) => Promise<void>)(windowId, patch);
        } catch (e) {
          console.error('Failed to update window config:', e);
        }
      }
      updateWindowConfigInBridge(windowId, patch);
      const configs = [...(savedConfigs || [])];
      const idx = configs.findIndex((c) => c._runtimeId === windowId);
      if (idx >= 0) {
        configs[idx] = { ...configs[idx], ...patch };
        updateWindowSetting('windowConfigs', configs);
      }
      setExpandedWindowId(null);
    },
    [editConfigs, savedConfigs, updateWindowSetting],
  );

  const handleCloseWindow = useCallback(
    async (id: string) => {
      await closePresentationWindow(id);
      const configs = (savedConfigs || []).filter((c) => c._runtimeId !== id);
      updateWindowSetting('windowConfigs', configs);
      setTimeout(() => {
        getOpenWindows()
          .then(setOpenWindowsList)
          .catch(() => {});
      }, 100);
    },
    [savedConfigs, updateWindowSetting],
  );

  return (
    <Drawer open={open} anchor="right" onClose={onClose}>
      <Stack sx={{ width: 'min(90vw, 600px)', height: '100%' }}>
        {/* Header */}
        <Stack
          direction="row"
          sx={{
            alignItems: 'center',
            p: 2,
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {LL.WINDOW.PANEL_TITLE()}
          </Typography>
          <Box
            sx={{
              flexGrow: 1,
            }}
          />
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

            <Button
              size="small"
              variant={isIdentifying ? 'contained' : 'outlined'}
              color={isIdentifying ? 'error' : 'primary'}
              startIcon={<IdentifyIcon />}
              onClick={() => {
                if (isIdentifying) hideIdentify();
                else identifyWindows();
                dispatch(toggleIdentify());
              }}
            >
              {LL.FOOTER.IDENTIFY()}
            </Button>

            <Box sx={{ flexGrow: 1 }} />

            {activeWindows.length > 0 && (
              <Button
                size="small"
                variant="outlined"
                color="error"
                startIcon={<CloseIcon />}
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
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: 700,
            }}
          >
            {LL.WINDOW.OPEN()} ({activeWindows.length})
          </Typography>

          {activeWindows.length === 0 ? (
            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
              }}
            >
              {LL.WINDOW.NO_OPEN()}
            </Typography>
          ) : (
            <List dense disablePadding>
              {activeWindows.map((entry) => {
                const name = entry.config.name || 'Window';
                const isFrozen = frozenWindows.includes(name);
                const isStream = entry.config.displayMode === 'stream';
                const savedCfg = (savedConfigs || []).find((c) => c._runtimeId === entry.id);
                const cfg = savedCfg || entry.config;
                const isEditExpanded = expandedWindowId === entry.id;
                // Which physical display this window is on right now — the single most
                // useful fact about a presentation window, and previously nowhere in the UI.
                const onScreen = screens.find((s) => s.id === screenIdForBounds(windowBounds[entry.id], screens));

                return (
                  <ListItem key={entry.id} disablePadding sx={{ borderBottom: 1, borderColor: 'divider', display: 'block' }}>
                    {/* Summary row */}
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{
                        alignItems: 'center',
                        px: 1,
                        py: 0.75,
                      }}
                    >
                      {isStream ? <StreamIcon fontSize="small" color="action" /> : <NormalIcon fontSize="small" color="action" />}

                      <Chip
                        label={isStream ? LL.FOOTER.STREAM_MODE() : LL.FOOTER.NORMAL_MODE()}
                        size="small"
                        variant="outlined"
                        sx={{ height: 18, fontSize: '0.62rem' }}
                      />
                      <Typography
                        variant="body2"
                        noWrap
                        sx={{
                          fontWeight: 600,
                        }}
                      >
                        {name}
                      </Typography>
                      {onScreen && (
                        <Chip
                          icon={<NormalIcon sx={{ fontSize: '0.7rem' }} />}
                          label={onScreen.label}
                          size="small"
                          variant="outlined"
                          sx={{ height: 18, fontSize: '0.62rem', maxWidth: 150 }}
                        />
                      )}

                      <Box sx={{ flexGrow: 1 }} />
                      <Tooltip title={hiddenWindows.has(entry.id) ? LL.FOOTER.SHOW_WINDOW() : LL.FOOTER.HIDE_WINDOW()}>
                        <IconButton
                          size="small"
                          color={hiddenWindows.has(entry.id) ? 'warning' : 'default'}
                          onClick={async () => {
                            const api = (window as unknown as { api?: Record<string, unknown> }).api;
                            if (hiddenWindows.has(entry.id)) {
                              if (api?.showPresentationWindow)
                                await (api.showPresentationWindow as (id: string) => Promise<void>)(entry.id);
                            } else {
                              if (api?.hidePresentationWindow)
                                await (api.hidePresentationWindow as (id: string) => Promise<void>)(entry.id);
                            }
                            await refreshHiddenWindows();
                          }}
                        >
                          {hiddenWindows.has(entry.id) ? <ShowIcon fontSize="small" /> : <HideWindowIcon fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={isFrozen ? LL.FOOTER.UNFREEZE() : LL.FOOTER.FREEZE()}>
                        <IconButton size="small" onClick={() => dispatch(toggleFreezeWindow(name))} color={isFrozen ? 'info' : 'default'}>
                          <FreezeIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={LL.WINDOW.EDIT_SETTINGS()}>
                        <IconButton
                          size="small"
                          onClick={() => handleToggleEdit(entry.id, cfg as WindowConfig & { styleId?: number })}
                          color={isEditExpanded ? 'primary' : 'default'}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={LL.WINDOW.CLOSE()}>
                        <IconButton size="small" onClick={() => handleCloseWindow(entry.id)} color="error">
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                    {/* Expandable edit form — animated with Collapse */}
                    <Collapse in={isEditExpanded} unmountOnExit>
                      <Box sx={{ px: 2, pb: 2, pt: 1, bgcolor: 'action.hover', borderTop: 1, borderColor: 'divider' }}>
                        {editConfigs[entry.id] && (
                          <WindowConfigForm
                            cfg={{
                              name: editConfigs[entry.id].name ?? name,
                              displayMode: (editConfigs[entry.id].displayMode ?? cfg.displayMode ?? 'normal') as 'normal' | 'stream',
                              width: editConfigs[entry.id].width ?? (cfg as WindowConfig).width ?? 1920,
                              height: editConfigs[entry.id].height ?? (cfg as WindowConfig).height ?? 1080,
                              fullscreen: editConfigs[entry.id].fullscreen ?? cfg.fullscreen,
                              frameless: editConfigs[entry.id].frameless ?? cfg.frameless,
                              alwaysOnTop: editConfigs[entry.id].alwaysOnTop ?? cfg.alwaysOnTop,
                              hideMouse: editConfigs[entry.id].hideMouse ?? cfg.hideMouse,
                              transparent: editConfigs[entry.id].transparent,
                              styleId: editConfigs[entry.id].styleId ?? 0,
                              screenId: editConfigs[entry.id].screenId ?? '',
                              positionX: editConfigs[entry.id].positionX,
                              positionY: editConfigs[entry.id].positionY,
                            }}
                            onChange={(patch) => setEditConfigs((prev) => ({ ...prev, [entry.id]: { ...prev[entry.id], ...patch } }))}
                            screens={screens}
                            openWindows={mappedWindows}
                            styles={styles}
                            onSubmit={() => handleApplyEdit(entry.id)}
                            submitLabel={LL.COMMON.APPLY()}
                            isEdit
                            LL={LL}
                          />
                        )}
                      </Box>
                    </Collapse>
                  </ListItem>
                );
              })}
            </List>
          )}

          <Divider />

          {/* Create Window */}
          <Accordion
            expanded={createExpanded || activeWindows.length === 0}
            onChange={(_e, exp) => setCreateExpanded(exp)}
            disableGutters
            elevation={0}
            sx={{ '&:before': { display: 'none' } }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack
                direction="row"
                spacing={1}
                sx={{
                  alignItems: 'center',
                }}
              >
                <AddIcon fontSize="small" />
                <Typography
                  sx={{
                    fontWeight: 600,
                  }}
                >
                  {LL.WINDOW.CREATE()}
                </Typography>
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              <WindowConfigForm
                cfg={newCfg}
                onChange={(patch) => setNewCfg((prev) => ({ ...prev, ...patch }))}
                screens={screens}
                openWindows={mappedWindows}
                styles={styles}
                onSubmit={handleCreateWindow}
                submitLabel={LL.WINDOW.CREATE()}
                LL={LL}
              />
            </AccordionDetails>
          </Accordion>
        </Stack>
      </Stack>
    </Drawer>
  );
};
