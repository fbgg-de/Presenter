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
import { useGetStylesQuery } from '@/api/styles.api';
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

const Footer = () => {
  const { LL } = useI18nContext();
  const dispatch = useAppDispatch();
  const windowFooterVisible = useAppSelector((state) => state.settings.windowFooterVisible);
  const isBlack = useAppSelector((state) => state.presentation.isBlack);
  const isIdentifying = useAppSelector((state) => state.presentation.isIdentifying);
  const frozenWindows = useAppSelector((state) => state.presentation.frozenWindows);
  const globalStyleId = useAppSelector((state) => state.settings.globalStyleId);

  const { data: styles = [] } = useGetStylesQuery();

  // Track open windows from the bridge
  const [openWindowsList, setOpenWindowsList] = useState<Array<{ id: string; config: WindowConfig; closed: boolean }>>([]);

  // Per-window context menu state
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuWindowId, setMenuWindowId] = useState<string | null>(null);

  // Style sub-menu anchors
  const [windowStyleAnchor, setWindowStyleAnchor] = useState<null | HTMLElement>(null);
  const [itemStyleAnchor, setItemStyleAnchor] = useState<null | HTMLElement>(null);

  const menuEntry = useMemo(() => openWindowsList.find((w) => w.id === menuWindowId), [openWindowsList, menuWindowId]);

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

  const handleOpenWindow = useCallback(async () => {
    await openPresentationWindow({ name: 'Presentation', displayMode: 'normal' });
    getOpenWindows()
      .then(setOpenWindowsList)
      .catch(() => {});
  }, []);

  const handleCloseWindow = useCallback(async (id: string) => {
    await closePresentationWindow(id);
    getOpenWindows()
      .then(setOpenWindowsList)
      .catch(() => {});
  }, []);

  const handleCloseAll = useCallback(async () => {
    await closeAllPresentationWindows();
    setOpenWindowsList([]);
  }, []);

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

  const activeWindows = openWindowsList.filter((w) => !w.closed);

  return (
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
        {activeWindows.length > 0 ? (
          <>
            {activeWindows.map((entry) => {
              const name = entry.config.name || 'Window';
              const isFrozen = frozenWindows.includes(name);
              const isStream = entry.config.displayMode === 'stream';

              return (
                <Chip
                  key={entry.id}
                  icon={isStream ? <StreamIcon fontSize="small" /> : <NormalIcon fontSize="small" />}
                  label={name}
                  size="small"
                  variant={isFrozen ? 'filled' : 'outlined'}
                  color={isFrozen ? 'info' : isBlack ? 'default' : 'primary'}
                  sx={{ fontSize: '0.75rem' }}
                  onClick={(e) => handleChipContextMenu(e, entry.id)}
                  onContextMenu={(e) => handleChipContextMenu(e, entry.id)}
                  onDelete={() => handleCloseWindow(entry.id)}
                  deleteIcon={<CloseIcon fontSize="small" />}
                />
              );
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
                      <ListItemText>{isFrozen ? LL.FOOTER_UNFREEZE() : LL.FOOTER_FREEZE()}</ListItemText>
                    </MenuItem>
                  );
                })()}

              {/* Hide / Show mouse */}
              <MenuItem onClick={() => handleToggleWindowProp('hideMouse')}>
                <ListItemIcon>
                  <MouseIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>{menuEntry?.config.hideMouse ? LL.FOOTER_SHOW_MOUSE() : LL.FOOTER_HIDE_MOUSE()}</ListItemText>
              </MenuItem>

              {/* Fullscreen */}
              <MenuItem onClick={() => handleToggleWindowProp('fullscreen')}>
                <ListItemIcon>
                  {menuEntry?.config.fullscreen ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
                </ListItemIcon>
                <ListItemText>{menuEntry?.config.fullscreen ? LL.FOOTER_EXIT_FULLSCREEN() : LL.FOOTER_FULLSCREEN()}</ListItemText>
              </MenuItem>

              {/* Frameless */}
              <MenuItem onClick={() => handleToggleWindowProp('frameless')}>
                <ListItemIcon>
                  {menuEntry?.config.frameless ? <FramedIcon fontSize="small" /> : <FramelessIcon fontSize="small" />}
                </ListItemIcon>
                <ListItemText>{menuEntry?.config.frameless ? LL.FOOTER_FRAMED() : LL.FOOTER_FRAMELESS()}</ListItemText>
              </MenuItem>

              {/* Always on top */}
              <MenuItem onClick={() => handleToggleWindowProp('alwaysOnTop')}>
                <ListItemIcon>
                  <OnTopIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>{menuEntry?.config.alwaysOnTop ? LL.FOOTER_NOT_ON_TOP() : LL.FOOTER_ALWAYS_ON_TOP()}</ListItemText>
              </MenuItem>

              {styles.length > 0 && <Divider />}

              {/* Window style */}
              {styles.length > 0 && (
                <MenuItem onClick={(e) => setWindowStyleAnchor(e.currentTarget)}>
                  <ListItemIcon>
                    <StyleIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>{LL.FOOTER_WINDOW_STYLE()}</ListItemText>
                </MenuItem>
              )}

              {/* Item style */}
              {styles.length > 0 && (
                <MenuItem onClick={(e) => setItemStyleAnchor(e.currentTarget)}>
                  <ListItemIcon>
                    <StyleIcon fontSize="small" color="secondary" />
                  </ListItemIcon>
                  <ListItemText>{LL.FOOTER_ITEM_STYLE()}</ListItemText>
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
                <em>{LL.STYLE_NONE()}</em>
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
                <em>{LL.STYLE_NONE()}</em>
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
              <Tooltip title={LL.WINDOW_ADD()}>
                <IconButton size="small" onClick={handleOpenWindow}>
                  <AddIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={isBlack ? LL.FOOTER_SHOW() : LL.FOOTER_BLACK()}>
                <IconButton size="small" onClick={() => dispatch(toggleBlack())} color={isBlack ? 'error' : 'default'}>
                  {isBlack ? <ShowIcon fontSize="small" /> : <BlackIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
              <Tooltip title={LL.FOOTER_IDENTIFY()}>
                <IconButton size="small" onClick={handleIdentify}>
                  <IdentifyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              {activeWindows.length > 1 && (
                <Tooltip title={LL.WINDOW_CLOSE_ALL()}>
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
              {LL.FOOTER_NO_WINDOWS()}
            </Typography>
            <Tooltip title={LL.WINDOW_OPEN()}>
              <IconButton size="small" onClick={handleOpenWindow}>
                <AddIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        )}
      </Toolbar>
    </AppBar>
  );
};

export default Footer;
