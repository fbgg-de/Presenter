import React, { useCallback, useEffect, useMemo, useRef, useState, MouseEvent, DragEvent, ReactNode } from 'react';
import {
  Alert,
  AppBar,
  Box,
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
  Snackbar,
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
  Monitor as NormalIcon,
  Cast as StreamIcon,
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
  OpenInNew as BringToFrontIcon,
  VisibilityOff as HideWindowIcon,
  TextFields as HideTextIcon,
  People as WsClientsIcon,
  Cable as MidiActiveIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useAppDispatch } from '@/store';
import { toggleBlack, toggleFreezeWindow, toggleTextHidden, useGetPresentationSettings } from '@/store/presentationSlice';
import { useGetWindows, useUpdateWindows, WindowConfig } from '@/store/windowSlice';
import type { SavedWindowConfig } from '@/store/windowSlice';
import { useGetStylesQuery } from '@/api/styles.api';
import { StyleEditor } from '@/components/style/StyleEditor';
import { WindowManager } from '@/components/layout/WindowManager';
import {
  openPresentationWindow,
  closePresentationWindow,
  getOpenWindows,
  getOpenWindowsSync,
  freezeWindow,
  unfreezeWindow,
  updateWindowConfigInBridge,
  adoptElectronWindow,
  getHasRestoredSavedWindows,
  markRestoredSavedWindows,
} from '@/utils/presentationBridge';
import { useGetSettings } from '@/store/settingsSlice';
import { useGetMusicianSettings, useUpdateMusicianSetting } from '@/store/musicianSlice';

const ConnectedWebsocketClients = ({
  wsClientCount,
  connected,
  connectedLabel,
  disconnectedLabel,
  onDisconnectAll,
}: {
  wsClientCount: number;
  connected: boolean;
  /** Multi-line breakdown of what is connected (see Footer's `wsClientsTooltip`). */
  connectedLabel: ReactNode;
  disconnectedLabel: string;
  /** Provided when there is something to clear — makes the chip clickable. */
  onDisconnectAll?: () => void;
}) => (
  <Tooltip title={connected ? connectedLabel : disconnectedLabel}>
    <Chip
      icon={<WsClientsIcon sx={{ pl: '0.25rem' }} />}
      label={wsClientCount}
      size="small"
      color={connected && wsClientCount > 0 ? 'primary' : 'default'}
      variant="outlined"
      onClick={onDisconnectAll}
      sx={{ alignSelf: 'center', fontSize: '0.7rem', cursor: onDisconnectAll ? 'pointer' : 'default', opacity: connected ? 1 : 0.5 }}
    />
  </Tooltip>
);

const FooterActions = ({ onOpenStyleEditor, onOpenWindowManager }: { onOpenStyleEditor: () => void; onOpenWindowManager: () => void }) => {
  const { LL } = useI18nContext();
  return (
    <>
      <Tooltip title={LL.STYLE.EDITOR()}>
        <IconButton size="small" onClick={onOpenStyleEditor}>
          <StyleIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={LL.HEADER.WINDOW_MANAGER()}>
        <IconButton size="small" onClick={onOpenWindowManager}>
          <WindowManagerIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </>
  );
};

/** A titled group of controls in the phone panel. */
const PanelSection = ({ title, children }: { title: string; children: ReactNode }) => (
  <Stack sx={{ gap: 1 }}>
    <Typography variant="overline" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
      {title}
    </Typography>
    {children}
  </Stack>
);

export type FooterProps = {
  /**
   * `bar` is the desktop strip along the bottom of the window. `panel` is the same controls as a
   * full-height page, which is how the phone layout reaches them — it has no room for the strip.
   */
  variant?: 'bar' | 'panel';
};

const Footer = ({ variant = 'bar' }: FooterProps) => {
  const { LL } = useI18nContext();
  const dispatch = useAppDispatch();

  // ── WS client count — from redux (kept in sync by usePresentationSync via useWsOperator)
  const {
    isBlack,
    isTextHidden,
    frozenWindows,
    wsConnectedCount: wsClientCount,
    wsPeers,
    wsMidiSyncAt,
    wsOperatorConnected,
  } = useGetPresentationSettings();
  const { windowConfigs: savedConfigs } = useGetWindows();
  const { windowFooterVisible, restoreWindowsOnStart } = useGetSettings();
  const { midiTrackingMaster } = useGetMusicianSettings();
  const updateWindowSetting = useUpdateWindows();
  const updateMusicianSetting = useUpdateMusicianSetting();

  // Clearing the connected clients is disruptive (every tablet/phone has to reconnect),
  // so it is confirmed rather than fired straight off the chip.
  const [disconnectConfirmOpen, setDisconnectConfirmOpen] = useState(false);
  const [disconnectResult, setDisconnectResult] = useState<{ severity: 'success' | 'warning'; text: string } | null>(null);
  const disconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The relay answers a disconnect request with the number of peers it closed. No answer
  // within a few seconds means the request was not understood — in practice a relay still
  // running a build from before this feature, which silently relays it as a normal message.
  useEffect(() => {
    const handler = (e: Event) => {
      if (disconnectTimeoutRef.current) {
        clearTimeout(disconnectTimeoutRef.current);
        disconnectTimeoutRef.current = null;
      }
      const count = (e as CustomEvent<{ count: number }>).detail?.count ?? 0;
      setDisconnectResult({ severity: 'success', text: LL.FOOTER.WS_DISCONNECT_DONE({ count }) });
    };
    window.addEventListener('presenter:ws-peers-disconnected', handler);
    return () => window.removeEventListener('presenter:ws-peers-disconnected', handler);
  }, [LL]);

  useEffect(() => () => clearTimeout(disconnectTimeoutRef.current ?? undefined), []);

  /**
   * Storage ran out. Worth interrupting for: the operator otherwise finds out only when a
   * setting or the open show has quietly forgotten itself after a restart. The two cases
   * differ in what to do about it — offline data was sacrificed and everything is saved
   * (informational), or nothing could be saved at all (needs action), so they are shown at
   * different severities and the second one stays up until dismissed.
   */
  const [storageWarning, setStorageWarning] = useState<{ severity: 'info' | 'error'; text: string } | null>(null);
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ freed: string[]; saved: boolean }>).detail;
      if (detail?.saved) {
        setStorageWarning({ severity: 'info', text: LL.FOOTER.STORAGE_FULL_FREED({ freed: (detail.freed ?? []).join(', ') }) });
      } else {
        setStorageWarning({ severity: 'error', text: LL.FOOTER.STORAGE_FULL_UNSAVED() });
      }
    };
    window.addEventListener('presenter:storage-full', handler);
    return () => window.removeEventListener('presenter:storage-full', handler);
  }, [LL]);

  const handleDisconnectAllClients = () => {
    setDisconnectConfirmOpen(false);
    setDisconnectResult(null);
    window.dispatchEvent(new Event('presenter:disconnect-ws-peers'));
    if (disconnectTimeoutRef.current) clearTimeout(disconnectTimeoutRef.current);
    disconnectTimeoutRef.current = setTimeout(() => {
      disconnectTimeoutRef.current = null;
      setDisconnectResult({ severity: 'warning', text: LL.FOOTER.WS_DISCONNECT_NO_REPLY() });
    }, 4000);
  };

  /**
   * Tooltip of the connected-clients chip: one line per kind of client, so a glance tells
   * whether the tablet that stopped following is on MIDI, independent, or simply gone.
   *
   * Clients that never described themselves (old musician/viewer builds) and the clients a
   * pre-breakdown relay only counts are folded into one "unidentified" line — the total
   * always adds up to the number on the chip, whatever the peers reported.
   */
  const wsClientsTooltip = useMemo(() => {
    if (wsClientCount <= 0) return LL.FOOTER.WS_CLIENTS_NONE();

    const musicians = wsPeers.filter((p) => p.role === 'musician');
    const byMode = (mode: string) =>
      musicians.filter((p) => (p.mode === 'midi' || p.mode === 'operator' || p.mode === 'off' ? p.mode : 'unknown') === mode);
    /**
     * Append the names, so "1 independent" also answers "which tablet?". Only when EVERY
     * member of the group is named — a partial list next to a count reads as if the count
     * were wrong, which is the opposite of helpful when hunting a missing client.
     */
    const withNames = (label: string, list: typeof wsPeers) => {
      const names = list.map((p) => p.name).filter((n): n is string => !!n);
      return names.length === list.length ? `${label} (${names.join(', ')})` : label;
    };
    const indent = (line: string) => `    ${line}`;

    const lines: string[] = [LL.FOOTER.WS_CLIENTS({ count: wsClientCount })];

    if (musicians.length > 0) {
      lines.push(LL.FOOTER.WS_CLIENTS_MUSICIANS({ count: musicians.length }));
      const modeLines: [string, (arg: { count: number }) => string][] = [
        ['midi', LL.FOOTER.WS_CLIENTS_MUSICIAN_MIDI],
        ['operator', LL.FOOTER.WS_CLIENTS_MUSICIAN_FOLLOWING],
        ['off', LL.FOOTER.WS_CLIENTS_MUSICIAN_INDEPENDENT],
        ['unknown', LL.FOOTER.WS_CLIENTS_MUSICIAN_UNKNOWN_MODE],
      ];
      for (const [mode, label] of modeLines) {
        const group = byMode(mode);
        if (group.length > 0) lines.push(indent(withNames(label({ count: group.length }), group)));
      }
    }

    const remotes = wsPeers.filter((p) => p.role === 'remote');
    if (remotes.length > 0) lines.push(LL.FOOTER.WS_CLIENTS_REMOTE({ count: remotes.length }));

    const viewers = wsPeers.filter((p) => p.role === 'viewer');
    if (viewers.length > 0) lines.push(LL.FOOTER.WS_CLIENTS_VIEWER({ count: viewers.length }));

    const operators = wsPeers.filter((p) => p.role === 'operator');
    if (operators.length > 0) lines.push(LL.FOOTER.WS_CLIENTS_OPERATOR({ count: operators.length }));

    // Peers of unknown role, plus any client the relay counted but did not describe.
    const unidentified = wsPeers.filter((p) => p.role === 'unknown').length + Math.max(0, wsClientCount - wsPeers.length);
    if (unidentified > 0) lines.push(LL.FOOTER.WS_CLIENTS_UNKNOWN({ count: unidentified }));

    // pre-wrap, not pre-line: the sub-lines are indented with plain spaces, which pre-line
    // would collapse away.
    return <Box sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{lines.join('\n')}</Box>;
  }, [LL, wsClientCount, wsPeers]);

  const MIDI_ACTIVE_TTL_MS = 10_000;
  const [midiSyncActive, setMidiSyncActive] = useState(false);
  useEffect(() => {
    if (!wsMidiSyncAt) return;
    setMidiSyncActive(true);
    const t = setTimeout(() => setMidiSyncActive(false), MIDI_ACTIVE_TTL_MS);
    return () => clearTimeout(t);
  }, [wsMidiSyncAt]);

  // The chip carries two independent facts and the click only changes one of them:
  //   `followingMidi`  — are we taking our position from the musician? (what the click toggles)
  //   `midiSyncActive` — is a musician broadcasting at all? (nothing to do with us)
  // Filling the chip for either one made "stop following" look like it had done nothing
  // while the musician kept playing, so the fill now tracks the toggle alone and the
  // musician's presence only lifts the dimming.
  const followingMidi = midiTrackingMaster === 'midi';
  const midiChipProps = {
    color: 'success' as const,
    variant: followingMidi ? ('filled' as const) : ('outlined' as const),
    tooltip: followingMidi ? LL.MIDI.FOLLOW_MIDI_ACTIVE() : LL.MIDI.SYNC_ACTIVE(),
    onClick: () => updateMusicianSetting('midiTrackingMaster', followingMidi ? 'operator' : 'midi'),
    sx: {
      alignSelf: 'center',
      fontSize: '0.7rem',
      cursor: 'pointer',
      opacity: followingMidi || midiSyncActive ? 1 : 0.25,
      transition: 'opacity 0.4s ease-in-out',
    },
  };

  const { data: styles = [] } = useGetStylesQuery();

  // Style editor + window manager state
  const [styleEditorOpen, setStyleEditorOpen] = useState(false);
  const [windowManagerOpen, setWindowManagerOpen] = useState(false);
  const [windowManagerOpenWithNew, setWindowManagerOpenWithNew] = useState(false);

  // Track open windows from the bridge
  const [openWindowsList, setOpenWindowsList] = useState<Array<{ id: string; config: WindowConfig; closed: boolean }>>([]);

  // Track hidden windows (by runtime id)
  const [hiddenWindows, setHiddenWindows] = useState<Set<string>>(new Set());

  // Refresh hidden windows state from Electron
  const refreshHiddenWindows = useCallback(async () => {
    if (window.api?.getWindowStates) {
      try {
        const states: Array<{ id: string; hidden?: boolean }> = await window.api.getWindowStates();
        const hidden = new Set(states.filter((s) => s.hidden).map((s) => s.id));
        setHiddenWindows(hidden);
      } catch {
        /* ignore */
      }
    }
  }, []);

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

  // Drag-and-drop reordering of window chips
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

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
      updateWindowSetting('windowConfigs', configs);
    },
    [updateWindowSetting],
  );

  // Drag-and-drop handlers for chip reordering
  const handleChipDragStart = useCallback((index: number) => {
    dragIndexRef.current = index;
  }, []);

  const handleChipDragOver = useCallback((e: DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  }, []);

  const handleChipDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  const handleChipDrop = useCallback(
    (e: DragEvent, toSavedIdx: number) => {
      e.preventDefault();
      setDragOverIndex(null);
      const fromIndex = dragIndexRef.current;
      dragIndexRef.current = null;
      if (fromIndex === null || fromIndex === toSavedIdx) return;
      const configs = [...(savedConfigsRef.current as SavedWindowConfig[])];
      const [moved] = configs.splice(fromIndex, 1);
      configs.splice(toSavedIdx, 0, moved);
      persistConfigs(configs);
    },
    [persistConfigs],
  );

  // ── Restore saved windows on mount/when saved configs become available ──
  // Run once per renderer lifetime. Previously we ran only on mount and used
  // the initial savedConfigs snapshot which could be empty when settings load
  // asynchronously. That prevented restores when configs arrived later.
  useEffect(() => {
    if (getHasRestoredSavedWindows()) return;
    const initial = (savedConfigs as SavedWindowConfig[]) || [];
    if (!(windowFooterVisible || restoreWindowsOnStart) || initial.length === 0) return;
    markRestoredSavedWindows();

    (async () => {
      // First: ask main process which presentation windows are ALREADY alive
      // (these survive renderer reload). Reconcile by name so we don't open
      // duplicates after a Cmd-R / HMR reload.
      let liveWindows: Array<{ id: string; name?: string; displayMode?: 'normal' | 'stream' }> = [];
      try {
        if (window.api?.getWindowStates) {
          liveWindows = await window.api.getWindowStates();
        }
      } catch {
        /* fall through — empty liveWindows means we'll open everything */
      }
      const liveByName = new Map<string, { id: string; name?: string }>();
      const liveIds = new Set<string>();
      for (const lw of liveWindows) {
        if (lw.name) liveByName.set(lw.name, lw);
        if (lw.id) liveIds.add(lw.id);
      }
      const adoptedIds = new Set<string>();

      const updated = [...initial];
      for (let i = 0; i < updated.length; i++) {
        const cfg = updated[i];
        // If a runtime id is already present, check whether the corresponding
        // window is still alive. On app restart the stored _runtimeId may be
        // stale; in that case we should open a fresh window.
        if (cfg._runtimeId) {
          if (liveIds.has(cfg._runtimeId)) {
            // Window with this id is alive — adopt it and skip opening.
            adoptElectronWindow(cfg._runtimeId, cfg);
            updated[i] = { ...cfg };
            continue;
          }
          // Stale runtime id — fall through and open a fresh window.
        }

        // 1) If a live window with the same name already exists, adopt it.
        const liveMatch = cfg.name ? liveByName.get(cfg.name) : undefined;
        if (liveMatch && !adoptedIds.has(liveMatch.id)) {
          adoptedIds.add(liveMatch.id);
          adoptElectronWindow(liveMatch.id, cfg);
          updated[i] = { ...cfg, _runtimeId: liveMatch.id };
          continue;
        }

        // 2) Otherwise open a fresh window.
        try {
          const id = await openPresentationWindow(cfg);
          updated[i] = { ...cfg, _runtimeId: id };
        } catch (e) {
          console.error('Failed to restore window:', e);
        }
      }
      persistConfigs(updated);
      getOpenWindows()
        .then(setOpenWindowsList)
        .catch(() => {});
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedConfigs, windowFooterVisible, restoreWindowsOnStart]);

  // Ref to avoid poll effect depending on savedConfigs (which changes on sync)
  const savedConfigsRef = useRef(savedConfigs);
  savedConfigsRef.current = savedConfigs;

  // Guard to prevent concurrent poll cycles from overlapping React work
  const isFetchingRef = useRef(false);

  // Poll for open windows status
  useEffect(() => {
    if (!windowFooterVisible) return;
    const refreshWindows = () => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      getOpenWindows()
        .then((windows) => {
          setOpenWindowsList(windows);
          // Sync fullscreen + hidden state from Electron back to savedConfigs
          if (window.api?.getWindowStates) {
            window.api
              .getWindowStates()
              .then((states: Array<{ id: string; fullscreen?: boolean; hidden?: boolean }>) => {
                let changed = false;
                const configs = [...(savedConfigsRef.current as SavedWindowConfig[])];
                for (const state of states) {
                  const idx = configs.findIndex((c) => c._runtimeId === state.id);
                  if (idx >= 0) {
                    if (state.fullscreen !== undefined && configs[idx].fullscreen !== state.fullscreen) {
                      configs[idx] = { ...configs[idx], fullscreen: state.fullscreen };
                      changed = true;
                    }
                  }
                }
                if (changed) persistConfigs(configs);
              })
              .catch(() => {});
          }
        })
        .catch(() => setOpenWindowsList(getOpenWindowsSync()))
        .finally(() => {
          isFetchingRef.current = false;
        });
    };
    const interval = setInterval(refreshWindows, 1000);
    refreshWindows();
    refreshHiddenWindows();
    return () => clearInterval(interval);
  }, [windowFooterVisible, persistConfigs, refreshHiddenWindows]);

  // ── Compute which saved configs are open/closed ──
  const openIds = useMemo(() => new Set(openWindowsList.filter((w) => !w.closed).map((w) => w.id)), [openWindowsList]);

  const windowEntries = useMemo(() => {
    // Build from saved configs — only show entries that are currently open OR have a known runtime ID
    const entries = (savedConfigs as SavedWindowConfig[])
      .map((cfg, savedIdx) => ({ cfg, savedIdx }))
      .filter(({ cfg }) => cfg._runtimeId) // skip configs with no runtime ID (never opened this session)
      .map(({ cfg, savedIdx }) => ({
        config: cfg,
        runtimeId: cfg._runtimeId!,
        isOpen: openIds.has(cfg._runtimeId!),
        savedIdx,
      }));
    // Also add any open windows not in saved configs (e.g., opened via IPC directly)
    for (const w of openWindowsList) {
      if (!w.closed && !entries.some((e) => e.runtimeId === w.id)) {
        entries.push({ config: w.config, runtimeId: w.id, isOpen: true, savedIdx: -1 });
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

      // Keep the bridge's per-window config in sync so the style resolver
      // (and any other consumer) sees the updated value on the next broadcast.
      updateWindowConfigInBridge(menuEntry.id, { [prop]: newValue });
      // Persist to redux — read CURRENT savedConfigs from the ref to avoid
      // racing with the 1s poll (which may have replaced the array since
      // this callback was created).
      const c = savedConfigsRef.current as SavedWindowConfig[];
      const idx = c.findIndex((c) => c._runtimeId === menuEntry.id);
      if (idx >= 0) {
        const next = c.map((c, i) => (i === idx ? { ...c, [prop]: newValue } : c));
        persistConfigs(next);
      }
      // Force a refresh of open windows so the menu reflects the new state
      getOpenWindows()
        .then(setOpenWindowsList)
        .catch(() => {});
    },
    [menuEntry, menuEntryConfig, persistConfigs],
  );

  // Assign a preset (style) to this window — keep menu open
  const handleSetWindowStyle = useCallback(
    (styleId: number | null) => {
      if (!menuEntry) return;
      // Sync the bridge registry so the windowStyleResolver picks up the new
      // styleId on the very next broadcast (without requiring close+reopen).
      updateWindowConfigInBridge(menuEntry.id, { styleId: styleId ?? 0 });
      // Read CURRENT savedConfigs from the ref to avoid racing with the poll.
      const current = savedConfigsRef.current as SavedWindowConfig[];
      const idx = current.findIndex((c) => c._runtimeId === menuEntry.id);
      if (idx >= 0) {
        const next = current.map((c, i) => (i === idx ? { ...c, styleId: styleId ?? 0 } : c));
        persistConfigs(next);
      }
      setWindowStyleAnchor(null);
    },
    [menuEntry, persistConfigs],
  );

  // Bring a window to front (focus it without changing always-on-top)
  const handleBringToFront = useCallback(async (runtimeId: string) => {
    const api = (window as unknown as { api?: Record<string, unknown> }).api;
    if (api?.focusPresentationWindow) {
      await (api.focusPresentationWindow as (id: string) => Promise<void>)(runtimeId);
    }
  }, []);

  // Hide / Show a window
  const handleToggleHideWindow = useCallback(async () => {
    if (!menuEntry) return;
    const api = (window as unknown as { api?: Record<string, unknown> }).api;
    const isHidden = hiddenWindows.has(menuEntry.id);
    if (isHidden) {
      if (api?.showPresentationWindow) {
        await (api.showPresentationWindow as (id: string) => Promise<void>)(menuEntry.id);
      }
    } else {
      if (api?.hidePresentationWindow) {
        await (api.hidePresentationWindow as (id: string) => Promise<void>)(menuEntry.id);
      }
    }
    await refreshHiddenWindows();
  }, [menuEntry, hiddenWindows, refreshHiddenWindows]);

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
      const current = savedConfigsRef.current as SavedWindowConfig[];
      const idx = current.findIndex((c) => c._runtimeId === menuEntry.id);
      if (idx >= 0) {
        const next = current.map((c, i) =>
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
    [menuEntry, persistConfigs],
  );

  // Rename a window
  const handleRenameConfirm = useCallback(() => {
    const newName = renameValue.trim();
    if (!newName || !menuEntry) return;
    const current = savedConfigsRef.current as SavedWindowConfig[];
    const idx = current.findIndex((c) => c._runtimeId === menuEntry.id);
    if (idx >= 0) {
      const next = current.map((c, i) => (i === idx ? { ...c, name: newName } : c));
      persistConfigs(next);
    }
    updateWindowConfigInBridge(menuEntry.id, { name: newName });
    setRenameDialogOpen(false);
    handleMenuClose();
  }, [renameValue, menuEntry, persistConfigs, handleMenuClose]);

  if (!windowFooterVisible) return null;

  /**
   * One chip per presentation window, and the controls that go with them.
   *
   * Pulled out of the toolbar because the phone shows the same things stacked rather than in a
   * row: same handlers, same menus, one definition.
   */
  const windowChips = windowEntries.map((entry, idx) => {
    const cfg = entry.config as SavedWindowConfig;
    const name = cfg.name || 'Window';
    const isFrozen = frozenWindows.includes(name);
    const isStream = cfg.displayMode === 'stream';
    const presetName = cfg.styleId ? styles.find((s) => s.id === cfg.styleId)?.name : undefined;
    const label = presetName ? `${name} (${presetName})` : name;

    // Build a composite icon showing active states
    const statusIcons: ReactNode[] = [];
    if (isFrozen) statusIcons.push(<FreezeIcon key="f" sx={{ fontSize: 14 }} />);
    if (cfg.fullscreen) statusIcons.push(<FullscreenIcon key="fs" sx={{ fontSize: 14 }} />);
    if (cfg.alwaysOnTop) statusIcons.push(<OnTopIcon key="ot" sx={{ fontSize: 14 }} />);
    if (cfg.styleId) statusIcons.push(<StyleIcon key="st" sx={{ fontSize: 14 }} />);
    const mainIcon = isStream ? <StreamIcon fontSize="small" /> : <NormalIcon fontSize="small" />;
    const chipIcon =
      statusIcons.length > 0 ? (
        <Stack
          direction="row"
          spacing={0.25}
          sx={{
            alignItems: 'center',
            pl: 0.5,
          }}
        >
          {mainIcon}
          {statusIcons}
        </Stack>
      ) : (
        mainIcon
      );

    if (entry.isOpen && entry.runtimeId) {
      const isHidden = hiddenWindows.has(entry.runtimeId);
      const isDraggable = entry.savedIdx >= 0;
      return (
        <Box
          key={entry.runtimeId}
          draggable={isDraggable}
          onDragStart={isDraggable ? () => handleChipDragStart(entry.savedIdx) : undefined}
          onDragOver={isDraggable ? (e: DragEvent) => handleChipDragOver(e, entry.savedIdx) : undefined}
          onDragLeave={isDraggable ? handleChipDragLeave : undefined}
          onDrop={isDraggable ? (e: DragEvent) => handleChipDrop(e, entry.savedIdx) : undefined}
          onDragEnd={() => setDragOverIndex(null)}
          sx={{
            display: 'inline-flex',
            cursor: isDraggable ? 'grab' : undefined,
            outline: dragOverIndex === entry.savedIdx ? '2px solid' : 'none',
            outlineColor: 'primary.main',
            borderRadius: 4,
            opacity: dragIndexRef.current === entry.savedIdx ? 0.5 : 1,
          }}
        >
          <Chip
            icon={chipIcon}
            label={label}
            size="small"
            variant={isFrozen ? 'filled' : 'outlined'}
            color={isFrozen ? 'info' : isBlack || isHidden ? 'default' : 'primary'}
            sx={{ fontSize: '0.75rem' }}
            onClick={(e) => handleChipContextMenu(e as unknown as MouseEvent<HTMLElement>, entry.runtimeId!)}
            deleteIcon={
              <Tooltip title={isHidden ? LL.FOOTER.SHOW_WINDOW() : LL.FOOTER.HIDE_WINDOW()}>
                {isHidden ? <ShowIcon fontSize="small" /> : <HideWindowIcon fontSize="small" />}
              </Tooltip>
            }
            onDelete={async () => {
              const api = (window as unknown as { api?: Record<string, unknown> }).api;
              if (isHidden) {
                if (api?.showPresentationWindow) await (api.showPresentationWindow as (id: string) => Promise<void>)(entry.runtimeId!);
              } else {
                if (api?.hidePresentationWindow) await (api.hidePresentationWindow as (id: string) => Promise<void>)(entry.runtimeId!);
              }
              await refreshHiddenWindows();
            }}
          />
        </Box>
      );
    } else {
      // Closed window — show dimmed chip that can be clicked to reopen
      const isDraggable = entry.savedIdx >= 0;
      return (
        <Box
          key={`closed-${idx}`}
          draggable={isDraggable}
          onDragStart={isDraggable ? () => handleChipDragStart(entry.savedIdx) : undefined}
          onDragOver={isDraggable ? (e: DragEvent) => handleChipDragOver(e, entry.savedIdx) : undefined}
          onDragLeave={isDraggable ? handleChipDragLeave : undefined}
          onDrop={isDraggable ? (e: DragEvent) => handleChipDrop(e, entry.savedIdx) : undefined}
          onDragEnd={() => setDragOverIndex(null)}
          sx={{
            display: 'inline-flex',
            cursor: isDraggable ? 'grab' : undefined,
            outline: dragOverIndex === entry.savedIdx ? '2px solid' : 'none',
            outlineColor: 'primary.main',
            borderRadius: 4,
            opacity: dragIndexRef.current === entry.savedIdx ? 0.5 : 1,
          }}
        >
          <Tooltip title={LL.WINDOW.OPEN()}>
            <Chip
              icon={isStream ? <StreamIcon fontSize="small" /> : <NormalIcon fontSize="small" />}
              label={label}
              size="small"
              variant="outlined"
              color="default"
              sx={{ fontSize: '0.75rem', opacity: 0.5 }}
              onClick={() => handleReopenWindow(idx)}
            />
          </Tooltip>
        </Box>
      );
    }
  });

  const windowMenus = (
    <>
      {/* Per-window context menu */}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={handleMenuClose}>
        {/* Close window */}
        <MenuItem
          onClick={() => {
            if (menuWindowId) handleCloseWindow(menuWindowId);
            handleMenuClose();
          }}
        >
          <ListItemIcon>
            <CloseIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText sx={{ color: 'error.main' }}>{LL.WINDOW.CLOSE()}</ListItemText>
        </MenuItem>

        <Divider />

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

        {/* Window style (preset) */}
        {styles.length > 0 && (
          <MenuItem onClick={(e) => setWindowStyleAnchor(e.currentTarget)}>
            <ListItemIcon>
              <StyleIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{LL.FOOTER.WINDOW_STYLE()}</ListItemText>
          </MenuItem>
        )}

        <Divider />

        {/* Hide / Show mouse */}
        <MenuItem onClick={() => handleToggleWindowProp('hideMouse')}>
          <ListItemIcon>
            <MouseIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>{menuEntryConfig?.hideMouse ? LL.FOOTER.SHOW_MOUSE() : LL.FOOTER.HIDE_MOUSE()}</ListItemText>
        </MenuItem>

        {/* Frameless */}
        <MenuItem onClick={() => handleToggleWindowProp('frameless')}>
          <ListItemIcon>{menuEntryConfig?.frameless ? <FramedIcon fontSize="small" /> : <FramelessIcon fontSize="small" />}</ListItemIcon>
          <ListItemText>{menuEntryConfig?.frameless ? LL.FOOTER.FRAMED() : LL.FOOTER.FRAMELESS()}</ListItemText>
        </MenuItem>

        {/* Fullscreen */}
        <MenuItem onClick={() => handleToggleWindowProp('fullscreen')}>
          <ListItemIcon>
            {menuEntryConfig?.fullscreen ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
          </ListItemIcon>
          <ListItemText>{menuEntryConfig?.fullscreen ? LL.FOOTER.EXIT_FULLSCREEN() : LL.FOOTER.FULLSCREEN()}</ListItemText>
        </MenuItem>

        {/* Always on top */}
        <MenuItem onClick={() => handleToggleWindowProp('alwaysOnTop')}>
          <ListItemIcon>
            <OnTopIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>{menuEntryConfig?.alwaysOnTop ? LL.FOOTER.NOT_ON_TOP() : LL.FOOTER.ALWAYS_ON_TOP()}</ListItemText>
        </MenuItem>

        {/* Move to screen */}
        {screens.length > 1 && (
          <MenuItem onClick={(e) => setScreenAnchor(e.currentTarget)}>
            <ListItemIcon>
              <ScreenIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{LL.WINDOW.MOVE_TO_SCREEN()}</ListItemText>
          </MenuItem>
        )}

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

        {/* Bring to front */}
        {menuEntry && (
          <MenuItem
            onClick={() => {
              handleBringToFront(menuEntry.id);
              handleMenuClose();
            }}
          >
            <ListItemIcon>
              <BringToFrontIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{LL.FOOTER.BRING_TO_FRONT()}</ListItemText>
          </MenuItem>
        )}

        {/* Hide / Show window */}
        {menuEntry && (
          <MenuItem
            onClick={() => {
              handleToggleHideWindow();
            }}
          >
            <ListItemIcon>
              <HideWindowIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{hiddenWindows.has(menuEntry.id) ? LL.FOOTER.SHOW_WINDOW() : LL.FOOTER.HIDE_WINDOW()}</ListItemText>
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
              <Typography
                component="span"
                variant="caption"
                sx={{
                  color: 'text.secondary',
                }}
              >
                {screen.bounds.width}×{screen.bounds.height}
              </Typography>
            </ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );

  const addWindowButton = (
    <Tooltip title={LL.WINDOW.ADD()}>
      <IconButton
        size="small"
        onClick={() => {
          setWindowManagerOpen(true);
          setWindowManagerOpenWithNew(true);
        }}
      >
        <AddIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );

  const connectionChips = (
    <>
      <ConnectedWebsocketClients
        connected={wsOperatorConnected}
        wsClientCount={wsClientCount}
        connectedLabel={wsClientsTooltip}
        disconnectedLabel={LL.FOOTER.WS_NOT_CONNECTED()}
        onDisconnectAll={wsOperatorConnected && wsClientCount > 0 ? () => setDisconnectConfirmOpen(true) : undefined}
      />
      <Tooltip title={midiChipProps.tooltip}>
        <Chip
          icon={<MidiActiveIcon sx={{ pl: '0.25rem' }} />}
          label="MIDI"
          size="small"
          color={midiChipProps.color}
          variant={midiChipProps.variant}
          onClick={midiChipProps.onClick}
          sx={midiChipProps.sx}
        />
      </Tooltip>
    </>
  );

  return (
    <>
      <StyleEditor open={styleEditorOpen} onClose={() => setStyleEditorOpen(false)} />
      <WindowManager
        open={windowManagerOpen}
        openWithNew={windowManagerOpenWithNew}
        onClose={() => {
          setWindowManagerOpen(false);
          setWindowManagerOpenWithNew(false);
        }}
      />
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
      {/* Disconnect all WebSocket clients */}
      <Dialog open={disconnectConfirmOpen} onClose={() => setDisconnectConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{LL.FOOTER.WS_DISCONNECT_ALL()}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{LL.FOOTER.WS_DISCONNECT_ALL_CONFIRM({ count: wsClientCount })}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDisconnectConfirmOpen(false)}>{LL.COMMON.CANCEL()}</Button>
          <Button variant="contained" color="warning" onClick={handleDisconnectAllClients}>
            {LL.FOOTER.WS_DISCONNECT_ALL()}
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={!!disconnectResult}
        autoHideDuration={disconnectResult?.severity === 'warning' ? 10000 : 4000}
        onClose={() => setDisconnectResult(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={disconnectResult?.severity ?? 'success'} onClose={() => setDisconnectResult(null)}>
          {disconnectResult?.text ?? ''}
        </Alert>
      </Snackbar>
      <Snackbar
        open={!!storageWarning}
        // Nothing could be saved: leave it up until acknowledged, since ignoring it costs
        // the operator their settings at the next restart.
        autoHideDuration={storageWarning?.severity === 'error' ? null : 8000}
        onClose={() => setStorageWarning(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={storageWarning?.severity ?? 'info'} onClose={() => setStorageWarning(null)}>
          {storageWarning?.text ?? ''}
        </Alert>
      </Snackbar>
      {windowMenus}
      {/* Phone layout: the bar's contents as a page. Everything the toolbar packs into 40px of
          height gets a section, a label and a tap target here — on a phone there is no hover to
          reveal what an icon means, and the vertical room to say it outright is free. */}
      {variant === 'panel' ? (
        <Stack sx={{ height: '100%', overflowY: 'auto', p: 2, gap: 3 }}>
          <PanelSection title={LL.FOOTER.PANEL_WINDOWS()}>
            {windowEntries.length > 0 ? (
              <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                {windowChips}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {LL.FOOTER.NO_WINDOWS()}
              </Typography>
            )}
            <Button
              size="small"
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => {
                setWindowManagerOpen(true);
                setWindowManagerOpenWithNew(true);
              }}
              sx={{ alignSelf: 'flex-start' }}
            >
              {LL.WINDOW.ADD()}
            </Button>
          </PanelSection>

          <PanelSection title={LL.FOOTER.PANEL_OUTPUT()}>
            <Button
              variant={isBlack ? 'contained' : 'outlined'}
              color={isBlack ? 'error' : 'inherit'}
              startIcon={isBlack ? <ShowIcon /> : <BlackIcon />}
              onClick={() => dispatch(toggleBlack())}
            >
              {isBlack ? LL.FOOTER.SHOW() : LL.FOOTER.BLACK()}
            </Button>
            <Button
              variant={isTextHidden ? 'contained' : 'outlined'}
              color={isTextHidden ? 'warning' : 'inherit'}
              startIcon={<HideTextIcon />}
              onClick={() => dispatch(toggleTextHidden())}
            >
              {isTextHidden ? LL.FOOTER.SHOW_TEXT() : LL.FOOTER.HIDE_TEXT()}
            </Button>
          </PanelSection>

          <PanelSection title={LL.FOOTER.PANEL_CONNECTIONS()}>
            <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap' }}>
              {connectionChips}
            </Stack>
          </PanelSection>

          <PanelSection title={LL.FOOTER.PANEL_TOOLS()}>
            <Button variant="outlined" color="inherit" startIcon={<StyleIcon />} onClick={() => setStyleEditorOpen(true)}>
              {LL.STYLE.EDITOR()}
            </Button>
            <Button variant="outlined" color="inherit" startIcon={<WindowManagerIcon />} onClick={() => setWindowManagerOpen(true)}>
              {LL.HEADER.WINDOW_MANAGER()}
            </Button>
          </PanelSection>
        </Stack>
      ) : (
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
                {windowChips}
                {addWindowButton}

                <Stack direction="row" sx={{ gap: 0.5, ml: 'auto' }}>
                  <Stack direction="row" sx={{ gap: 0.5, mr: 1 }}>
                    {connectionChips}
                  </Stack>

                  <Tooltip title={isTextHidden ? LL.FOOTER.SHOW_TEXT() : LL.FOOTER.HIDE_TEXT()}>
                    <IconButton size="small" onClick={() => dispatch(toggleTextHidden())} color={isTextHidden ? 'warning' : 'default'}>
                      <HideTextIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>

                  <Tooltip title={isBlack ? LL.FOOTER.SHOW() : LL.FOOTER.BLACK()}>
                    <IconButton size="small" onClick={() => dispatch(toggleBlack())} color={isBlack ? 'error' : 'default'}>
                      {isBlack ? <ShowIcon fontSize="small" /> : <BlackIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                  <FooterActions
                    onOpenStyleEditor={() => setStyleEditorOpen(true)}
                    onOpenWindowManager={() => setWindowManagerOpen(true)}
                  />
                </Stack>
              </>
            ) : (
              <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5, width: '100%' }}>
                {addWindowButton}
                <Typography variant="body2" sx={{ color: 'text.secondary', flexGrow: 1, textAlign: 'center' }}>
                  {LL.FOOTER.NO_WINDOWS()}
                </Typography>
                <Stack direction="row" sx={{ gap: 0.5 }}>
                  {connectionChips}
                  <FooterActions
                    onOpenStyleEditor={() => setStyleEditorOpen(true)}
                    onOpenWindowManager={() => setWindowManagerOpen(true)}
                  />
                </Stack>
              </Stack>
            )}
          </Toolbar>
        </AppBar>
      )}
    </>
  );
};

export default Footer;
