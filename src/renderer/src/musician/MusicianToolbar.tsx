import { IconButton, SpeedDial, SpeedDialAction, Stack, Tooltip, Typography, useTheme } from '@mui/material';
import {
  Settings as SettingsIcon,
  LooksOne as OnePageIcon,
  LooksTwo as LooksTwoIcon,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
  VisibilityOff as VisibilityOffIcon,
  Visibility as VisibilityIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  FitScreen as FitWidthIcon,
  AspectRatio as Zoom100Icon,
  Create as AnnotateIcon,
  PictureAsPdf as PdfIcon,
  Menu as MenuIcon,
  Sync as SyncIcon,
  SyncDisabled as SyncDisabledIcon,
  SettingsInputAntenna as MidiIcon,
  Wifi as WifiIcon,
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
  RotateLeft as RefetchAnnotationsIcon,
} from '@mui/icons-material';
import { alpha, type Palette } from '@mui/material/styles';
import { useI18nContext } from '@/i18n/i18n-react';
import { useAppSelector, useAppDispatch } from '@/store';
import { updateSetting } from '@/store/settingsSlice';
import { useState, useCallback, useEffect, ReactNode } from 'react';

const FAB_SIZE = 44;
const NAV_MARGIN = 36;

export type SyncMode = 'off' | 'operator' | 'midi' | 'midi-ws';

/** Shared base floating button style using theme palette tokens */
export const floatingBtnSx = (palette: Palette, isActive = false) => {
  const isDark = palette.mode === 'dark';
  if (isActive) {
    // Active: uses the primary color prominently
    return {
      width: FAB_SIZE,
      height: FAB_SIZE,
      backdropFilter: 'blur(12px)',
      backgroundColor: alpha(palette.primary.main, isDark ? 0.35 : 0.85),
      color: palette.primary.contrastText,
      border: '1px solid',
      borderColor: alpha(palette.primary.light, isDark ? 0.6 : 0.9),
      boxShadow: `0 2px 8px ${alpha(palette.primary.dark, 0.4)}`,
      transition: 'all 0.2s',
      // Ensure individual buttons are always interactive even when the surrounding
      // Stack has pointerEvents: 'none' to let drawing events pass through.
      pointerEvents: 'auto' as const,
      '&:hover': {
        backgroundColor: alpha(palette.primary.main, isDark ? 0.5 : 0.95),
      },
    };
  }
  // Inactive: subtle semi-transparent grey
  const bg = isDark ? palette.grey[900] : palette.grey[600];
  return {
    width: FAB_SIZE,
    height: FAB_SIZE,
    backdropFilter: 'blur(12px)',
    backgroundColor: alpha(bg, 0.7),
    color: palette.common.white,
    border: '1px solid',
    borderColor: alpha(isDark ? palette.common.white : palette.common.black, 0.12),
    boxShadow: `0 2px 8px ${alpha(palette.common.black, isDark ? 0.5 : 0.18)}`,
    transition: 'all 0.2s',
    // Ensure individual buttons are always interactive even when the surrounding
    // Stack has pointerEvents: 'none' to let drawing events pass through.
    pointerEvents: 'auto' as const,
    '&:hover': {
      backgroundColor: alpha(bg, 0.95),
    },
  };
};

export const FloatingButton = ({
  icon,
  tooltip,
  onClick,
  active,
}: {
  icon: ReactNode;
  tooltip: string;
  onClick: () => void;
  active?: boolean;
}) => {
  const { palette } = useTheme();
  return (
    <Tooltip title={tooltip} placement="left">
      <IconButton onClick={onClick} size="small" sx={floatingBtnSx(palette, active)}>
        {icon}
      </IconButton>
    </Tooltip>
  );
};

export const makeSpeedDialFabSx = (palette: Palette, isActive = false) => {
  return { ...floatingBtnSx(palette, isActive), minHeight: FAB_SIZE };
};

/** Compact SpeedDial root sx — reduces default action spacing to match FloatingButton layout */
const speedDialCompactSx = {
  // Allow pointer events on the SpeedDial itself even though the parent Stack has pointerEvents:none
  pointerEvents: 'auto' as const,
  '& .MuiSpeedDial-actions': {
    gap: '6px',
    paddingLeft: '6px',
    // MUI adds individual margins on each action — zero them out so gap controls spacing
    '& .MuiSpeedDialAction-staticTooltipLabel': { marginLeft: 0 },
    '& > .MuiButtonBase-root, & > .MuiSpeedDialAction-staticTooltip': { margin: 0 },
  },
};

interface MusicianToolbarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  syncMode: SyncMode;
  onSetSyncMode: (mode: SyncMode) => void;
  onOpenSettings: () => void;
  onOpenPdfModal: () => void;
  isSongItem: boolean;
  activeSongNumber?: number;
  pageView: 'two-page' | 'one-page';
  onSetPageView: (mode: 'two-page' | 'one-page') => void;
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onZoomFitWidth: () => void;
  annotateMode: boolean;
  onToggleAnnotate: () => void;
  hasPdfs: boolean;
  /** Triggers an immediate annotation reload from the server. Only available when a PDF is shown. */
  onRefetchAnnotations?: () => void;
}

export const MusicianToolbar = ({
  sidebarOpen,
  onToggleSidebar,
  syncMode,
  onSetSyncMode,
  onOpenSettings,
  onOpenPdfModal,
  isSongItem,
  activeSongNumber,
  pageView,
  onSetPageView,
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onZoomFitWidth,
  annotateMode,
  onToggleAnnotate,
  hasPdfs,
  onRefetchAnnotations,
}: MusicianToolbarProps) => {
  const { LL } = useI18nContext();
  const dispatch = useAppDispatch();
  const { palette } = useTheme();
  const isDark = palette.mode === 'dark';
  const toolbarExpanded = useAppSelector((s) => s.settings.musicianToolbarExpanded);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null);
  const [pageCountOpen, setPageCountOpen] = useState(false);
  const [syncDialOpen, setSyncDialOpen] = useState(false);
  const [zoomDialOpen, setZoomDialOpen] = useState(false);

  // Safari-compatible fullscreen helpers
  const getFullscreenElement = (): Element | null => document.fullscreenElement ?? (document as any).webkitFullscreenElement ?? null;

  const toggleFullscreen = useCallback(() => {
    const el = document.documentElement as any;
    if (!getFullscreenElement()) {
      if (el.requestFullscreen) {
        el.requestFullscreen().catch(() => {});
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      }
    }
  }, []);

  useEffect(() => {
    const h = () => setIsFullscreen(!!getFullscreenElement());
    document.addEventListener('fullscreenchange', h);
    document.addEventListener('webkitfullscreenchange', h);
    return () => {
      document.removeEventListener('fullscreenchange', h);
      document.removeEventListener('webkitfullscreenchange', h);
    };
  }, []);

  // Wake Lock (keep screen awake)
  const supportsWakeLock = 'wakeLock' in navigator;

  const toggleWakeLock = useCallback(async () => {
    if (wakeLock) {
      await wakeLock.release();
      setWakeLock(null);
    } else {
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        sentinel.addEventListener('release', () => setWakeLock(null));
        setWakeLock(sentinel);
      } catch {
        // Wake lock request failed (e.g. page not visible)
      }
    }
  }, [wakeLock]);

  // Release wake lock on unmount
  useEffect(() => {
    return () => {
      wakeLock?.release().catch(() => {});
    };
  }, [wakeLock]);

  const syncModeIcon: Record<SyncMode, ReactNode> = {
    off: <SyncDisabledIcon fontSize="small" />,
    operator: <SyncIcon fontSize="small" />,
    midi: <MidiIcon fontSize="small" />,
    'midi-ws': <WifiIcon fontSize="small" />,
  };
  const syncModeLabel: Record<SyncMode, string> = {
    off: 'Sync Off',
    operator: 'Operator Sync',
    midi: 'MIDI Sync',
    'midi-ws': 'MIDI over WebSocket',
  };

  const toggleExpanded = () => dispatch(updateSetting({ key: 'musicianToolbarExpanded', value: !toolbarExpanded }));

  const zoomPercent = Math.round(zoomLevel * 100);

  const activeActionFabSx = (active: boolean) =>
    active
      ? {
          backgroundColor: alpha(palette.primary.main, isDark ? 0.35 : 0.85),
          color: palette.primary.contrastText,
          border: '2px solid',
          borderColor: alpha(palette.primary.light, isDark ? 0.6 : 0.9),
          '&:hover': { backgroundColor: alpha(palette.primary.main, isDark ? 0.5 : 0.95) },
        }
      : {};

  const showPdfTools = isSongItem && hasPdfs;

  return (
    <Stack
      spacing={0.75}
      alignItems="flex-end"
      sx={{ position: 'absolute', top: 10, right: NAV_MARGIN, zIndex: 10, pointerEvents: 'none' }}
    >
      {/* Row 1: Sync (left) + Toggle Toolbar (right) — always visible */}
      <Stack direction="row" spacing={0.75} alignItems="center">
        <SpeedDial
          ariaLabel="Sync mode"
          sx={speedDialCompactSx}
          open={syncDialOpen}
          onOpen={() => setSyncDialOpen(true)}
          onClose={() => setSyncDialOpen(false)}
          direction="left"
          icon={syncModeIcon[syncMode]}
          FabProps={{ size: 'small', sx: makeSpeedDialFabSx(palette, syncMode !== 'off') }}
        >
          {(['off', 'operator', 'midi', 'midi-ws'] as SyncMode[]).map((mode) => (
            <SpeedDialAction
              key={mode}
              icon={syncModeIcon[mode]}
              tooltipTitle={syncModeLabel[mode]}
              tooltipPlacement="bottom"
              onClick={() => {
                onSetSyncMode(mode);
                setSyncDialOpen(false);
              }}
              FabProps={{ sx: activeActionFabSx(syncMode === mode) }}
            />
          ))}
        </SpeedDial>
        <FloatingButton
          icon={toolbarExpanded ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
          tooltip={LL.MUSICIAN.TOOLBAR_TOGGLE()}
          onClick={toggleExpanded}
        />
      </Stack>

      {/* Expandable toolbar column */}
      {toolbarExpanded && (
        <>
          {/* Sidebar toggle */}
          <FloatingButton
            icon={<MenuIcon fontSize="small" />}
            tooltip={LL.MUSICIAN.SIDEBAR_TOGGLE()}
            onClick={onToggleSidebar}
            active={sidebarOpen}
          />

          {/* Fullscreen */}
          <FloatingButton
            icon={isFullscreen ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
            tooltip={isFullscreen ? LL.MUSICIAN.EXIT_FULLSCREEN() : LL.MUSICIAN.FULLSCREEN()}
            onClick={toggleFullscreen}
            active={isFullscreen}
          />

          {/* Keep screen awake */}
          {supportsWakeLock && (
            <FloatingButton
              icon={wakeLock ? <LockIcon fontSize="small" /> : <LockOpenIcon fontSize="small" />}
              tooltip={wakeLock ? LL.MUSICIAN.WAKE_LOCK_OFF() : LL.MUSICIAN.WAKE_LOCK_ON()}
              onClick={toggleWakeLock}
              active={!!wakeLock}
            />
          )}

          {/* 3. Page spread (per-PDF) */}
          <SpeedDial
            ariaLabel="Page display count"
            sx={speedDialCompactSx}
            open={pageCountOpen}
            onOpen={() => setPageCountOpen(true)}
            onClose={() => setPageCountOpen(false)}
            direction="left"
            icon={pageView === 'two-page' ? <LooksTwoIcon fontSize="small" /> : <OnePageIcon fontSize="small" />}
            FabProps={{ size: 'small', sx: makeSpeedDialFabSx(palette) }}
          >
            <SpeedDialAction
              icon={<OnePageIcon fontSize="small" />}
              tooltipTitle={LL.MUSICIAN.PAGE_ONE()}
              tooltipPlacement="bottom"
              onClick={() => {
                onSetPageView('one-page');
                setPageCountOpen(false);
              }}
              FabProps={{ sx: activeActionFabSx(pageView === 'one-page') }}
            />
            <SpeedDialAction
              icon={<LooksTwoIcon fontSize="small" />}
              tooltipTitle={LL.MUSICIAN.PAGE_TWO()}
              tooltipPlacement="bottom"
              onClick={() => {
                onSetPageView('two-page');
                setPageCountOpen(false);
              }}
              FabProps={{ sx: activeActionFabSx(pageView === 'two-page') }}
            />
          </SpeedDial>

          {/* 4. PDF management */}
          {isSongItem && activeSongNumber != null && (
            <FloatingButton
              icon={<PdfIcon fontSize="small" />}
              tooltip={hasPdfs ? LL.PDF.MANAGE_TITLE() : LL.PDF.IMPORT_TITLE()}
              onClick={onOpenPdfModal}
            />
          )}

          {/* 5. Annotate — only when PDF is shown */}
          {showPdfTools && (
            <FloatingButton
              icon={<AnnotateIcon fontSize="small" />}
              tooltip={LL.MUSICIAN.ANNOTATE()}
              onClick={onToggleAnnotate}
              active={annotateMode}
            />
          )}

          {/* 5b. Refetch annotations — only when PDF is shown */}
          {showPdfTools && onRefetchAnnotations && (
            <FloatingButton
              icon={<RefetchAnnotationsIcon fontSize="small" />}
              tooltip={LL.ANNOTATION.REFETCH()}
              onClick={onRefetchAnnotations}
            />
          )}

          {/* 6. Zoom — only when PDF is shown */}
          {showPdfTools && (
            <SpeedDial
              ariaLabel="Zoom controls"
              sx={speedDialCompactSx}
              open={zoomDialOpen}
              onOpen={() => setZoomDialOpen(true)}
              onClose={() => setZoomDialOpen(false)}
              direction="left"
              icon={
                <Stack alignItems="center" justifyContent="center" sx={{ width: '100%', height: '100%' }}>
                  <ZoomInIcon sx={{ fontSize: '1.1rem' }} />
                  <Typography sx={{ fontSize: '0.5rem', lineHeight: 1, fontWeight: 700, mt: '-2px' }}>{zoomPercent}%</Typography>
                </Stack>
              }
              FabProps={{ size: 'small', sx: makeSpeedDialFabSx(palette) }}
            >
              <SpeedDialAction
                icon={<ZoomInIcon fontSize="small" />}
                tooltipTitle={LL.MUSICIAN.ZOOM_IN()}
                tooltipPlacement="bottom"
                onClick={() => onZoomIn()}
              />
              <SpeedDialAction
                icon={<ZoomOutIcon fontSize="small" />}
                tooltipTitle={LL.MUSICIAN.ZOOM_OUT()}
                tooltipPlacement="bottom"
                onClick={() => onZoomOut()}
              />
              <SpeedDialAction
                icon={<Zoom100Icon fontSize="small" />}
                tooltipTitle={LL.MUSICIAN.ZOOM_100()}
                tooltipPlacement="bottom"
                onClick={() => {
                  onZoomReset();
                  setZoomDialOpen(false);
                }}
                FabProps={{ sx: activeActionFabSx(zoomPercent === 100) }}
              />
              <SpeedDialAction
                icon={<FitWidthIcon fontSize="small" />}
                tooltipTitle={LL.MUSICIAN.ZOOM_FIT_WIDTH()}
                tooltipPlacement="bottom"
                onClick={() => {
                  onZoomFitWidth();
                  setZoomDialOpen(false);
                }}
              />
            </SpeedDial>
          )}

          {/* 7. Settings */}
          <FloatingButton icon={<SettingsIcon fontSize="small" />} tooltip={LL.MUSICIAN.SETTINGS()} onClick={onOpenSettings} />
        </>
      )}
    </Stack>
  );
};
