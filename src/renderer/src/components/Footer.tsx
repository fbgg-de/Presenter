import React, { useCallback, useEffect, useMemo, useRef, useState, MouseEvent } from 'react';
import {
  AppBar,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Stack,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
  Button,
} from '@mui/material';
import {
  Brightness1 as BlackIcon,
  Visibility as ShowIcon,
  Fingerprint as IdentifyIcon,
  Monitor as NormalIcon,
  Stream as StreamIcon,
  Add as AddIcon,
  Close as CloseIcon,
  AcUnit as FreezeIcon,
  PlayArrow as UnfreezeIcon,
  MouseOutlined as MouseIcon,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
  CropFree as FramelessIcon,
  Crop as FramedIcon,
  VerticalAlignTop as OnTopIcon,
  Palette as StyleIcon,
  Window as WindowManagerIcon,
  Edit as EditIcon,
  Tv as ScreenIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useAppSelector, useAppDispatch } from '@/store';
import { toggleBlack, toggleIdentify, toggleFreezeWindow } from '@/store/presentationSlice';
import { updateSetting } from '@/store/settingsSlice';
import { useGetStylesQuery } from '@/api/styles.api';
import { StyleEditor } from '@/components/StyleEditor';
import { WindowManager } from '@/components/WindowManager';
import {
  openPresentationWindow,
  closePresentationWindow,
  closeAllPresentationWindows,
  identifyWindows,
  hideIdentify,
  getOpenWindows,
  getOpenWindowsSync,
  freezeWindow,
  unfreezeWindow,
  type WindowConfig,
} from '@/utils/presentationBridge';

/** Saved window config with optional runtime id */
interface SavedWindowConfig extends WindowConfig {
  _runtimeId?: string; // set when the window is open
}

const Footer = () => {
  const { LL } = useI18nContext();
  const dispatch = useAppDispatch();
  const windowFooterVisible = useAppSelector((state) => state.settings.windowFooterVisible);
  const restoreWindowsOnStart = useAppSelector((state) => state.settings.restoreWindowsOnStart);
  const savedConfigs = useAppSelector((state) => state.settings.windowConfigs) as SavedWindowConfig[];
  const isBlack = useAppSelector((state) => state.presentation.isBlack);
  const isIdentifying = useAppSelector((state) => state.presentation.isIdentifying);
  const frozenWindows = useAppSelector((state) => state.presentation.frozenWindows);

  const { data: styles = [] } = useGetStylesQuery();

  // Style editor + window manager state
  const [styleEditorOpen, setStyleEditorOpen] = useState(false);
  const [windowManagerOpen, setWindowManagerOpen] = useState(false);

  // Track open windows from the bridge
  const [openWindowsList, setOpenWindowsList] = useState<Array<{ id: string; config: WindowConfig; closed: boolean }>>([]);

  // Per-window context menu state
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuWindowId, setMenuWindowId] = useState<string | null>(null);

  // Style sub-menu anchor
  const [windowStyleAnchor, setWindowStyleAnchor] = useState<null | HTMLElement>(null);
  // Screen assignment sub-menu
  const [screenAnchor, setScreenAnchor] = useState<null | HTMLElement>(null);
  const [screens, setScreens] = useState<
    Array<{ id: number; label: string; bounds: { x: number; y: number; width: number; height: number }; isPrimary: boolean }>
  >([]);
  // Rename dialog
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  const menuEntryConfig = useMemo(() => {
    // Read from savedConfigs (which has up-to-date toggle state) rather than
    // openWindowsList (which only has the initial config from the bridge).
    if (!menuWindowId) return undefined;
    const saved = (savedConfigs as SavedWindowConfig[]).find((c) => c._runtimeId === menuWindowId);
    if (saved) return saved;
    const fromBridge = openWindowsList.find((w) => w.id === menuWindowId);
    return fromBridge ? fromBridge.config : undefined;
  }, [menuWindowId, savedConfigs, openWindowsList]);

  const menuEntry = useMemo(() => {
    if (!menuWindowId) return undefined;
    const fromBridge = openWindowsList.find((w) => w.id === menuWindowId);
    if (fromBridge) return { ...fromBridge, config: menuEntryConfig || fromBridge.config };
    return undefined;
  }, [menuWindowId, openWindowsList, menuEntryConfig]);

  // ── Persist configs whenever the open windows list changes ──
  const persistConfigs = useCallback(
    (configs: SavedWindowConfig[]) => {
      dispatch(updateSetting({ key: 'windowConfigs', value: configs }));
    },
    [dispatch],
  );

  // ── Restore saved windows on mount ──
  // Guard against React Strict Mode double-invocation and other remount scenarios.
  const hasRestoredRef = useRef(false);
  useEffect(() => {
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;
    if (!(windowFooterVisible || restoreWindowsOnStart) || savedConfigs.length === 0) return;
    let cancelled = false;

    const restoreWindows = async () => {
      const updated = [...savedConfigs] as SavedWindowConfig[];
      for (let i = 0; i < updated.length; i++) {
        if (cancelled) return;
        const cfg = updated[i];
        if (!cfg._runtimeId) {
          try {
            const id = await openPresentationWindow(cfg);
            updated[i] = { ...cfg, _runtimeId: id };
          } catch (e) {
            console.error('Failed to restore window:', e);
          }
        }
      }
      if (!cancelled) {
        persistConfigs(updated);
        getOpenWindows()
          .then(setOpenWindowsList)
          .catch(() => {});
      }
    };

    restoreWindows();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run only on mount

  // Ref to avoid poll effect depending on savedConfigs (which changes on sync)
  const savedConfigsRef = useRef(savedConfigs);
  savedConfigsRef.current = savedConfigs;

  // Poll for open windows status
  useEffect(() => {
    if (!windowFooterVisible) return;
    const refreshWindows = () => {
      getOpenWindows()
        .then((windows) => {
          setOpenWindowsList(windows);
          // Sync fullscreen state from Electron back to savedConfigs
          if (window.api?.getWindowStates) {
            window.api.getWindowStates().then((states: Array<{ id: string; fullscreen?: boolean }>) => {
              let changed = false;
              const configs = [...(savedConfigsRef.current as SavedWindowConfig[])];
              for (const state of states) {
                const idx = configs.findIndex((c) => c._runtimeId === state.id);
                if (idx >= 0 && state.fullscreen !== undefined && configs[idx].fullscreen !== state.fullscreen) {
                  configs[idx] = { ...configs[idx], fullscreen: state.fullscreen };
                  changed = true;
                }
              }
              if (changed) persistConfigs(configs);
            }).catch(() => {});
          }
        })
        .catch(() => setOpenWindowsList(getOpenWindowsSync()));
    };
    const interval = setInterval(refreshWindows, 1000);
    refreshWindows();
    return () => clearInterval(interval);
  }, [windowFooterVisible, persistConfigs]);

  // ── Compute which saved configs are open/closed ──
  const openIds = useMemo(() => new Set(openWindowsList.filter((w) => !w.closed).map((w) => w.id)), [openWindowsList]);

  const windowEntries = useMemo(() => {
    // Build from saved configs — only show entries that are currently open OR have a known runtime ID
    const entries = (savedConfigs as SavedWindowConfig[])
      .filter((cfg) => cfg._runtimeId) // skip configs with no runtime ID (never opened this session)
      .map((cfg) => ({
        config: cfg,
        runtimeId: cfg._runtimeId!,
        isOpen: openIds.has(cfg._runtimeId!),
      }));
    // Also add any open windows not in saved configs (e.g., opened via IPC directly)
    for (const w of openWindowsList) {
      if (!w.closed && !entries.some((e) => e.runtimeId === w.id)) {
        entries.push({ config: w.config, runtimeId: w.id, isOpen: true });
      }
    }
    return entries;
  }, [savedConfigs, openWindowsList, openIds]);

  const handleOpenWindow = useCallback(async () => {
    const config: SavedWindowConfig = {
      name: 'Presentation',
      displayMode: 'normal',
      fullscreen: false,
      frameless: true,
      alwaysOnTop: false,
      hideMouse: false,
    };
    const id = await openPresentationWindow(config);
    config._runtimeId = id;
    persistConfigs([...(savedConfigs as SavedWindowConfig[]), config]);
    getOpenWindows()
      .then(setOpenWindowsList)
      .catch(() => {});
  }, [savedConfigs, persistConfigs]);

  const handleCloseWindow = useCallback(
    async (runtimeId: string) => {
      await closePresentationWindow(runtimeId);
      // Remove the config from savedConfigs entirely when a window is closed.
      // This prevents stale "inactive" entries accumulating across restarts.
      const configs = (savedConfigs as SavedWindowConfig[]).filter((c) => c._runtimeId !== runtimeId);
      persistConfigs(configs);
      getOpenWindows()
        .then(setOpenWindowsList)
        .catch(() => {});
    },
    [savedConfigs, persistConfigs],
  );

  const handleReopenWindow = useCallback(
    async (index: number) => {
      const configs = [...savedConfigs] as SavedWindowConfig[];
      const cfg = configs[index];
      if (!cfg) return;
      try {
        const id = await openPresentationWindow(cfg);
        configs[index] = { ...cfg, _runtimeId: id };
        persistConfigs(configs);
        getOpenWindows()
          .then(setOpenWindowsList)
          .catch(() => {});
      } catch (e) {
        console.error('Failed to reopen window:', e);
      }
    },
    [savedConfigs, persistConfigs],
  );

  const handleRemoveConfig = useCallback(
    (index: number) => {
      const configs = [...savedConfigs] as SavedWindowConfig[];
      const cfg = configs[index];
      if (cfg._runtimeId) {
        closePresentationWindow(cfg._runtimeId).catch(() => {});
      }
      configs.splice(index, 1);
      persistConfigs(configs);
    },
    [savedConfigs, persistConfigs],
  );

  const handleCloseAll = useCallback(async () => {
    await closeAllPresentationWindows();
    // Clear runtime IDs but keep configs
    const configs = (savedConfigs as SavedWindowConfig[]).map((c) => ({ ...c, _runtimeId: undefined }));
    persistConfigs(configs);
    setOpenWindowsList([]);
  }, [savedConfigs, persistConfigs]);

  const handleIdentify = useCallback(() => {
    if (isIdentifying) {
      hideIdentify();
    } else {
      identifyWindows();
    }
    dispatch(toggleIdentify());
  }, [isIdentifying, dispatch]);

  // Per-window context menu
  const handleChipContextMenu = useCallback((event: MouseEvent<HTMLElement>, id: string) => {
    event.preventDefault();
    setMenuAnchor(event.currentTarget);
    setMenuWindowId(id);
  }, []);

  const handleMenuClose = useCallback(() => {
    setMenuAnchor(null);
    setMenuWindowId(null);
    setWindowStyleAnchor(null);
    setScreenAnchor(null);
  }, []);

  const handleToggleFreeze = useCallback(async () => {
    if (!menuEntry) return;
    const name = menuEntry.config.name || 'Presentation';
    const isFrozen = frozenWindows.includes(name);
    if (isFrozen) {
      await unfreezeWindow(name);
    } else {
      await freezeWindow(name);
    }
    dispatch(toggleFreezeWindow(name));
    // Keep menu open
  }, [menuEntry, frozenWindows, dispatch]);

  // Toggle-style helpers for Electron window properties
  const handleToggleWindowProp = useCallback(
    async (prop: keyof WindowConfig) => {
      if (!menuEntry) return;
      // Read current value from the saved config (menuEntryConfig), not bridge snapshot
      const current = menuEntryConfig ? (menuEntryConfig as Record<string, unknown>)[prop] : undefined;
      const newValue = !current;
      const api = (window as unknown as { api?: Record<string, unknown> }).api;
      if (api?.updateWindowConfig) {
        try {
          await (api.updateWindowConfig as (id: string, patch: Partial<WindowConfig>) => Promise<void>)(menuEntry.id, { [prop]: newValue });
        } catch (e) {
          console.error('Failed to update window config:', e);
        }
      }
      // Persist to redux (immutable update)
      const idx = (savedConfigs as SavedWindowConfig[]).findIndex((c) => c._runtimeId === menuEntry.id);
      if (idx >= 0) {
        const next = (savedConfigs as SavedWindowConfig[]).map((c, i) => (i === idx ? { ...c, [prop]: newValue } : c));
        persistConfigs(next);
      }
      // Force a refresh of open windows so the menu reflects the new state
      getOpenWindows()
        .then(setOpenWindowsList)
        .catch(() => {});
    },
    [menuEntry, menuEntryConfig, savedConfigs, persistConfigs],
  );

  // Assign a preset (style) to this window — keep menu open
  const handleSetWindowStyle = useCallback(
    (styleId: number | null) => {
      if (!menuEntry) return;
      const idx = (savedConfigs as SavedWindowConfig[]).findIndex((c) => c._runtimeId === menuEntry.id);
      if (idx >= 0) {
        const next = (savedConfigs as SavedWindowConfig[]).map((c, i) => (i === idx ? { ...c, styleId: styleId ?? 0 } : c));
        persistConfigs(next);
      }
      setWindowStyleAnchor(null);
    },
    [menuEntry, savedConfigs, persistConfigs],
  );

  // Load screens when menu opens
  useEffect(() => {
    if (menuAnchor && window.api?.listScreens) {
      window.api
        .listScreens()
        .then(setScreens)
        .catch(() => {});
    }
  }, [menuAnchor]);

  // Move window to screen
  const handleMoveToScreen = useCallback(
    async (screenBounds: { x: number; y: number; width: number; height: number }) => {
      if (!menuEntry) return;
      const api = (window as unknown as { api?: Record<string, unknown> }).api;
      if (api?.updateWindowConfig) {
        await (api.updateWindowConfig as (id: string, patch: Partial<WindowConfig>) => Promise<void>)(menuEntry.id, {
          positionX: screenBounds.x,
          positionY: screenBounds.y,
          width: screenBounds.width,
          height: screenBounds.height,
        });
      }
      const idx = (savedConfigs as SavedWindowConfig[]).findIndex((c) => c._runtimeId === menuEntry.id);
      if (idx >= 0) {
        const next = (savedConfigs as SavedWindowConfig[]).map((c, i) =>
          i === idx
            ? {
                ...c,
                left: screenBounds.x,
                top: screenBounds.y,
                width: screenBounds.width,
                height: screenBounds.height,
                positionX: screenBounds.x,
                positionY: screenBounds.y,
              }
            : c,
        );
        persistConfigs(next);
      }
      setScreenAnchor(null);
    },
    [menuEntry, savedConfigs, persistConfigs],
  );

  // Rename a window
  const handleRenameConfirm = useCallback(() => {
    const newName = renameValue.trim();
    if (!newName || !menuEntry) return;
    const idx = (savedConfigs as SavedWindowConfig[]).findIndex((c) => c._runtimeId === menuEntry.id);
    if (idx >= 0) {
      const next = (savedConfigs as SavedWindowConfig[]).map((c, i) => (i === idx ? { ...c, name: newName } : c));
      persistConfigs(next);
    }
    setRenameDialogOpen(false);
    handleMenuClose();
  }, [renameValue, menuEntry, savedConfigs, persistConfigs, handleMenuClose]);

  if (!windowFooterVisible) return null;

  return (
    <>
      <StyleEditor open={styleEditorOpen} onClose={() => setStyleEditorOpen(false)} />
      <WindowManager open={windowManagerOpen} onClose={() => setWindowManagerOpen(false)} />

      {/* Rename window dialog */}
      <Dialog open={renameDialogOpen} onClose={() => setRenameDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{LL.WINDOW.RENAME()}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            size="small"
            fullWidth
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameConfirm();
            }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameDialogOpen(false)}>{LL.COMMON.CANCEL()}</Button>
          <Button variant="contained" onClick={handleRenameConfirm}>
            {LL.COMMON.SAVE()}
          </Button>
        </DialogActions>
      </Dialog>
      <AppBar
        position="static"
        color="default"
        elevation={2}
        sx={{
          top: 'auto',
          bottom: 0,
          borderTop: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Toolbar variant="dense" sx={{ minHeight: 40, gap: 1 }}>
          {windowEntries.length > 0 ? (
            <>
              {windowEntries.map((entry, idx) => {
                const cfg = entry.config as SavedWindowConfig;
                const name = cfg.name || 'Window';
                const isFrozen = frozenWindows.includes(name);
                const isStream = cfg.displayMode === 'stream';
                const presetName = cfg.styleId ? styles.find((s) => s.id === cfg.styleId)?.name : undefined;
                const label = presetName ? `${name} (${presetName})` : name;

                // Build a composite icon showing active states
                const statusIcons: React.ReactNode[] = [];
                if (isFrozen) statusIcons.push(<FreezeIcon key="f" sx={{ fontSize: 14 }} />);
                if (cfg.fullscreen) statusIcons.push(<FullscreenIcon key="fs" sx={{ fontSize: 14 }} />);
                if (cfg.alwaysOnTop) statusIcons.push(<OnTopIcon key="ot" sx={{ fontSize: 14 }} />);
                if (cfg.styleId) statusIcons.push(<StyleIcon key="st" sx={{ fontSize: 14 }} />);
                const mainIcon = isStream ? <StreamIcon fontSize="small" /> : <NormalIcon fontSize="small" />;
                const chipIcon =
                  statusIcons.length > 0 ? (
                    <Stack direction="row" spacing={0.25} alignItems="center" sx={{ pl: 0.5 }}>
                      {mainIcon}
                      {statusIcons}
                    </Stack>
                  ) : (
                    mainIcon
                  );

                if (entry.isOpen && entry.runtimeId) {
                  return (
                    <Chip
                      key={entry.runtimeId}
                      icon={chipIcon}
                      label={label}
                      size="small"
                      variant={isFrozen ? 'filled' : 'outlined'}
                      color={isFrozen ? 'info' : isBlack ? 'default' : 'primary'}
                      sx={{ fontSize: '0.75rem' }}
                      onClick={(e) => handleChipContextMenu(e, entry.runtimeId!)}
                      onContextMenu={(e) => handleChipContextMenu(e, entry.runtimeId!)}
                      onDelete={() => handleCloseWindow(entry.runtimeId!)}
                      deleteIcon={<CloseIcon fontSize="small" />}
                    />
                  );
                } else {
                  // Closed window — show dimmed chip that can be clicked to reopen
                  return (
                    <Tooltip key={`closed-${idx}`} title={LL.WINDOW.OPEN()}>
                      <Chip
                        icon={isStream ? <StreamIcon fontSize="small" /> : <NormalIcon fontSize="small" />}
                        label={label}
                        size="small"
                        variant="outlined"
                        color="default"
                        sx={{ fontSize: '0.75rem', opacity: 0.5 }}
                        onClick={() => handleReopenWindow(idx)}
                        onDelete={() => handleRemoveConfig(idx)}
                        deleteIcon={<CloseIcon fontSize="small" />}
                      />
                    </Tooltip>
                  );
                }
              })}

              {/* Per-window context menu */}
              <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={handleMenuClose}>
                {/* Freeze / Unfreeze */}
                {menuEntry &&
                  (() => {
                    const name = menuEntry.config.name || 'Presentation';
                    const isFrozen = frozenWindows.includes(name);
                    return (
                      <MenuItem onClick={handleToggleFreeze}>
                        <ListItemIcon>{isFrozen ? <UnfreezeIcon fontSize="small" /> : <FreezeIcon fontSize="small" />}</ListItemIcon>
                        <ListItemText>{isFrozen ? LL.FOOTER.UNFREEZE() : LL.FOOTER.FREEZE()}</ListItemText>
                      </MenuItem>
                    );
                  })()}

                {/* Hide / Show mouse */}
                <MenuItem onClick={() => handleToggleWindowProp('hideMouse')}>
                  <ListItemIcon>
                    <MouseIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>{menuEntryConfig?.hideMouse ? LL.FOOTER.SHOW_MOUSE() : LL.FOOTER.HIDE_MOUSE()}</ListItemText>
                </MenuItem>

                {/* Fullscreen */}
                <MenuItem onClick={() => handleToggleWindowProp('fullscreen')}>
                  <ListItemIcon>
                    {menuEntryConfig?.fullscreen ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
                  </ListItemIcon>
                  <ListItemText>{menuEntryConfig?.fullscreen ? LL.FOOTER.EXIT_FULLSCREEN() : LL.FOOTER.FULLSCREEN()}</ListItemText>
                </MenuItem>

                {/* Frameless */}
                <MenuItem onClick={() => handleToggleWindowProp('frameless')}>
                  <ListItemIcon>
                    {menuEntryConfig?.frameless ? <FramedIcon fontSize="small" /> : <FramelessIcon fontSize="small" />}
                  </ListItemIcon>
                  <ListItemText>{menuEntryConfig?.frameless ? LL.FOOTER.FRAMED() : LL.FOOTER.FRAMELESS()}</ListItemText>
                </MenuItem>

                {/* Always on top */}
                <MenuItem onClick={() => handleToggleWindowProp('alwaysOnTop')}>
                  <ListItemIcon>
                    <OnTopIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>{menuEntryConfig?.alwaysOnTop ? LL.FOOTER.NOT_ON_TOP() : LL.FOOTER.ALWAYS_ON_TOP()}</ListItemText>
                </MenuItem>

                <Divider />

                {/* Move to screen */}
                {screens.length > 1 && (
                  <MenuItem onClick={(e) => setScreenAnchor(e.currentTarget)}>
                    <ListItemIcon>
                      <ScreenIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>{LL.WINDOW.MOVE_TO_SCREEN()}</ListItemText>
                  </MenuItem>
                )}

                {/* Rename */}
                <MenuItem
                  onClick={() => {
                    setRenameValue(menuEntry?.config.name || '');
                    setRenameDialogOpen(true);
                  }}
                >
                  <ListItemIcon>
                    <EditIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>{LL.WINDOW.RENAME()}</ListItemText>
                </MenuItem>

                {styles.length > 0 && <Divider />}

                {/* Window style (preset) */}
                {styles.length > 0 && (
                  <MenuItem onClick={(e) => setWindowStyleAnchor(e.currentTarget)}>
                    <ListItemIcon>
                      <StyleIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>{LL.FOOTER.WINDOW_STYLE()}</ListItemText>
                  </MenuItem>
                )}
              </Menu>

              {/* Window style sub-menu */}
              <Menu
                anchorEl={windowStyleAnchor}
                open={Boolean(windowStyleAnchor)}
                onClose={() => setWindowStyleAnchor(null)}
                anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'left' }}
              >
                <MenuItem
                  onClick={() => handleSetWindowStyle(null)}
                  selected={!(menuEntry?.config as SavedWindowConfig | undefined)?.styleId}
                  sx={{ fontSize: '0.85rem' }}
                >
                  <em>{LL.STYLE.NONE()}</em>
                </MenuItem>
                {styles.map((s) => (
                  <MenuItem
                    key={s.id}
                    onClick={() => handleSetWindowStyle(s.id)}
                    selected={s.id === (menuEntry?.config as SavedWindowConfig | undefined)?.styleId}
                    sx={{ fontSize: '0.85rem' }}
                  >
                    {s.name}
                  </MenuItem>
                ))}
              </Menu>

              {/* Screen assignment sub-menu */}
              <Menu
                anchorEl={screenAnchor}
                open={Boolean(screenAnchor)}
                onClose={() => setScreenAnchor(null)}
                anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'left' }}
              >
                {screens.map((screen) => (
                  <MenuItem key={screen.id} onClick={() => handleMoveToScreen(screen.bounds)} sx={{ fontSize: '0.85rem' }}>
                    <ListItemIcon>
                      <ScreenIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>
                      {screen.label}
                      {screen.isPrimary ? ` (${LL.WINDOW.PRIMARY_SCREEN()})` : ''}{' '}
                      <Typography component="span" variant="caption" color="text.secondary">
                        {screen.bounds.width}×{screen.bounds.height}
                      </Typography>
                    </ListItemText>
                  </MenuItem>
                ))}
              </Menu>
              <Tooltip title={LL.WINDOW.ADD()}>
                <IconButton size="small" onClick={handleOpenWindow}>
                  <AddIcon fontSize="small" />
                </IconButton>
              </Tooltip>

              <Stack direction="row" sx={{ ml: 'auto' }} gap={0.5}>
                <Tooltip title={LL.HEADER.WINDOW_MANAGER()}>
                  <IconButton size="small" onClick={() => setWindowManagerOpen(true)}>
                    <WindowManagerIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title={LL.STYLE.EDITOR()}>
                  <IconButton size="small" onClick={() => setStyleEditorOpen(true)}>
                    <StyleIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title={isBlack ? LL.FOOTER.SHOW() : LL.FOOTER.BLACK()}>
                  <IconButton size="small" onClick={() => dispatch(toggleBlack())} color={isBlack ? 'error' : 'default'}>
                    {isBlack ? <ShowIcon fontSize="small" /> : <BlackIcon fontSize="small" />}
                  </IconButton>
                </Tooltip>
                <Tooltip title={LL.FOOTER.IDENTIFY()}>
                  <IconButton size="small" onClick={handleIdentify} color={isIdentifying ? 'primary' : 'default'}>
                    <IdentifyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                {windowEntries.filter((e) => e.isOpen).length > 1 && (
                  <Tooltip title={LL.WINDOW.CLOSE_ALL()}>
                    <IconButton size="small" color="error" onClick={handleCloseAll}>
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </Stack>
            </>
          ) : (
            <Stack direction="row" alignItems="center" sx={{ width: '100%' }}>
              <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1, textAlign: 'center' }}>
                {LL.FOOTER.NO_WINDOWS()}
              </Typography>
              <Stack direction="row" gap={0.5}>
                <Tooltip title={LL.STYLE.EDITOR()}>
                  <IconButton size="small" onClick={() => setStyleEditorOpen(true)}>
                    <StyleIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title={LL.HEADER.WINDOW_MANAGER()}>
                  <IconButton size="small" onClick={() => setWindowManagerOpen(true)}>
                    <WindowManagerIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title={LL.WINDOW.OPEN()}>
                  <IconButton size="small" onClick={handleOpenWindow}>
                    <AddIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Stack>
          )}
        </Toolbar>
      </AppBar>
    </>
  );
};

export default Footer;
