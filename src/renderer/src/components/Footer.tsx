import { useCallback, useEffect, useMemo, useState, MouseEvent } from 'react';
import {
  AppBar,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
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
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useAppSelector, useAppDispatch } from '@/store';
import { toggleBlack, toggleIdentify, toggleFreezeWindow } from '@/store/presentationSlice';
import { updateSetting } from '@/store/settingsSlice';
import { useGetStylesQuery } from '@/api/styles.api';
import { StyleEditor } from '@/components/StyleEditor';
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
  const savedConfigs = useAppSelector((state) => state.settings.windowConfigs) as SavedWindowConfig[];
  const isBlack = useAppSelector((state) => state.presentation.isBlack);
  const isIdentifying = useAppSelector((state) => state.presentation.isIdentifying);
  const frozenWindows = useAppSelector((state) => state.presentation.frozenWindows);
  const globalStyleId = useAppSelector((state) => state.settings.globalStyleId);

  const { data: styles = [] } = useGetStylesQuery();

  // Style editor state
  const [styleEditorOpen, setStyleEditorOpen] = useState(false);

  // Track open windows from the bridge
  const [openWindowsList, setOpenWindowsList] = useState<Array<{ id: string; config: WindowConfig; closed: boolean }>>([]);

  // Per-window context menu state
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuWindowId, setMenuWindowId] = useState<string | null>(null);

  // Style sub-menu anchors
  const [windowStyleAnchor, setWindowStyleAnchor] = useState<null | HTMLElement>(null);
  const [itemStyleAnchor, setItemStyleAnchor] = useState<null | HTMLElement>(null);

  const menuEntry = useMemo(() => openWindowsList.find((w) => w.id === menuWindowId), [openWindowsList, menuWindowId]);

  // ── Persist configs whenever the open windows list changes ──
  const persistConfigs = useCallback(
    (configs: SavedWindowConfig[]) => {
      dispatch(updateSetting({ key: 'windowConfigs', value: configs }));
    },
    [dispatch],
  );

  // ── Restore saved windows on mount ──
  useEffect(() => {
    if (!windowFooterVisible || savedConfigs.length === 0) return;
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
        getOpenWindows().then(setOpenWindowsList).catch(() => {});
      }
    };

    restoreWindows();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run only on mount

  // Poll for open windows status
  useEffect(() => {
    if (!windowFooterVisible) return;
    const refreshWindows = () => {
      getOpenWindows()
        .then(setOpenWindowsList)
        .catch(() => setOpenWindowsList(getOpenWindowsSync()));
    };
    const interval = setInterval(refreshWindows, 1000);
    refreshWindows();
    return () => clearInterval(interval);
  }, [windowFooterVisible]);

  // ── Compute which saved configs are open/closed ──
  const openIds = useMemo(() => new Set(openWindowsList.filter((w) => !w.closed).map((w) => w.id)), [openWindowsList]);

  const windowEntries = useMemo(() => {
    // Build from saved configs, marking open/closed
    const entries = (savedConfigs as SavedWindowConfig[]).map((cfg) => ({
      config: cfg,
      runtimeId: cfg._runtimeId,
      isOpen: cfg._runtimeId ? openIds.has(cfg._runtimeId) : false,
    }));
    // Also add any open windows not in saved configs (manually opened)
    for (const w of openWindowsList) {
      if (!w.closed && !entries.some((e) => e.runtimeId === w.id)) {
        entries.push({ config: w.config, runtimeId: w.id, isOpen: true });
      }
    }
    return entries;
  }, [savedConfigs, openWindowsList, openIds]);

  const handleOpenWindow = useCallback(async () => {
    const config: SavedWindowConfig = { name: 'Presentation', displayMode: 'normal' };
    const id = await openPresentationWindow(config);
    config._runtimeId = id;
    persistConfigs([...savedConfigs as SavedWindowConfig[], config]);
    getOpenWindows().then(setOpenWindowsList).catch(() => {});
  }, [savedConfigs, persistConfigs]);

  const handleCloseWindow = useCallback(async (runtimeId: string) => {
    await closePresentationWindow(runtimeId);
    getOpenWindows().then(setOpenWindowsList).catch(() => {});
  }, []);

  const handleReopenWindow = useCallback(async (index: number) => {
    const configs = [...savedConfigs] as SavedWindowConfig[];
    const cfg = configs[index];
    if (!cfg) return;
    try {
      const id = await openPresentationWindow(cfg);
      configs[index] = { ...cfg, _runtimeId: id };
      persistConfigs(configs);
      getOpenWindows().then(setOpenWindowsList).catch(() => {});
    } catch (e) {
      console.error('Failed to reopen window:', e);
    }
  }, [savedConfigs, persistConfigs]);

  const handleRemoveConfig = useCallback((index: number) => {
    const configs = [...savedConfigs] as SavedWindowConfig[];
    const cfg = configs[index];
    if (cfg._runtimeId) {
      closePresentationWindow(cfg._runtimeId).catch(() => {});
    }
    configs.splice(index, 1);
    persistConfigs(configs);
  }, [savedConfigs, persistConfigs]);

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
    setItemStyleAnchor(null);
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
    handleMenuClose();
  }, [menuEntry, frozenWindows, dispatch, handleMenuClose]);

  // Toggle-style helpers for Electron window properties
  const handleToggleWindowProp = useCallback(
    async (prop: keyof WindowConfig) => {
      if (!menuEntry) return;
      const api = (window as unknown as { api?: Record<string, unknown> }).api;
      if (api?.updateWindowConfig) {
        const current = menuEntry.config[prop];
        await (api.updateWindowConfig as (id: string, patch: Partial<WindowConfig>) => Promise<void>)(menuEntry.id, { [prop]: !current });
        // Optimistically update local config
        menuEntry.config[prop] = !current as never;
      }
      handleMenuClose();
    },
    [menuEntry, handleMenuClose],
  );

  if (!windowFooterVisible) return null;

  return (
    <>
      <StyleEditor open={styleEditorOpen} onClose={() => setStyleEditorOpen(false)} />
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
                const name = entry.config.name || 'Window';
                const isFrozen = frozenWindows.includes(name);
                const isStream = entry.config.displayMode === 'stream';

                if (entry.isOpen && entry.runtimeId) {
                  return (
                    <Chip
                      key={entry.runtimeId}
                      icon={isStream ? <StreamIcon fontSize="small" /> : <NormalIcon fontSize="small" />}
                      label={name}
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
                        label={name}
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
                  <ListItemText>{menuEntry?.config.hideMouse ? LL.FOOTER.SHOW_MOUSE() : LL.FOOTER.HIDE_MOUSE()}</ListItemText>
                </MenuItem>

                {/* Fullscreen */}
                <MenuItem onClick={() => handleToggleWindowProp('fullscreen')}>
                  <ListItemIcon>
                    {menuEntry?.config.fullscreen ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
                  </ListItemIcon>
                  <ListItemText>{menuEntry?.config.fullscreen ? LL.FOOTER.EXIT_FULLSCREEN() : LL.FOOTER.FULLSCREEN()}</ListItemText>
                </MenuItem>

                {/* Frameless */}
                <MenuItem onClick={() => handleToggleWindowProp('frameless')}>
                  <ListItemIcon>
                    {menuEntry?.config.frameless ? <FramedIcon fontSize="small" /> : <FramelessIcon fontSize="small" />}
                  </ListItemIcon>
                  <ListItemText>{menuEntry?.config.frameless ? LL.FOOTER.FRAMED() : LL.FOOTER.FRAMELESS()}</ListItemText>
                </MenuItem>

                {/* Always on top */}
                <MenuItem onClick={() => handleToggleWindowProp('alwaysOnTop')}>
                  <ListItemIcon>
                    <OnTopIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>{menuEntry?.config.alwaysOnTop ? LL.FOOTER.NOT_ON_TOP() : LL.FOOTER.ALWAYS_ON_TOP()}</ListItemText>
                </MenuItem>

                {styles.length > 0 && <Divider />}

                {/* Window style */}
                {styles.length > 0 && (
                  <MenuItem onClick={(e) => setWindowStyleAnchor(e.currentTarget)}>
                    <ListItemIcon>
                      <StyleIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>{LL.FOOTER.WINDOW_STYLE()}</ListItemText>
                  </MenuItem>
                )}

                {/* Item style */}
                {styles.length > 0 && (
                  <MenuItem onClick={(e) => setItemStyleAnchor(e.currentTarget)}>
                    <ListItemIcon>
                      <StyleIcon fontSize="small" color="secondary" />
                    </ListItemIcon>
                    <ListItemText>{LL.FOOTER.ITEM_STYLE()}</ListItemText>
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
                  onClick={() => {
                    setWindowStyleAnchor(null);
                    handleMenuClose();
                  }}
                  sx={{ fontSize: '0.85rem' }}
                >
                  <em>{LL.STYLE.NONE()}</em>
                </MenuItem>
                {styles.map((s) => (
                  <MenuItem
                    key={s.id}
                    onClick={() => {
                      setWindowStyleAnchor(null);
                      handleMenuClose();
                    }}
                    selected={s.id === globalStyleId}
                    sx={{ fontSize: '0.85rem' }}
                  >
                    {s.name}
                  </MenuItem>
                ))}
              </Menu>

              {/* Item style sub-menu */}
              <Menu
                anchorEl={itemStyleAnchor}
                open={Boolean(itemStyleAnchor)}
                onClose={() => setItemStyleAnchor(null)}
                anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'left' }}
              >
                <MenuItem
                  onClick={() => {
                    setItemStyleAnchor(null);
                    handleMenuClose();
                  }}
                  sx={{ fontSize: '0.85rem' }}
                >
                  <em>{LL.STYLE.NONE()}</em>
                </MenuItem>
                {styles.map((s) => (
                  <MenuItem
                    key={s.id}
                    onClick={() => {
                      setItemStyleAnchor(null);
                      handleMenuClose();
                    }}
                    sx={{ fontSize: '0.85rem' }}
                  >
                    {s.name}
                  </MenuItem>
                ))}
              </Menu>

              <Stack direction="row" sx={{ ml: 'auto' }} gap={0.5}>
                <Tooltip title={LL.STYLE.EDITOR()}>
                  <IconButton size="small" onClick={() => setStyleEditorOpen(true)}>
                    <StyleIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title={LL.WINDOW.ADD()}>
                  <IconButton size="small" onClick={handleOpenWindow}>
                    <AddIcon fontSize="small" />
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
