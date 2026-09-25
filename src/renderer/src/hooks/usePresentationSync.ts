import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppSelector, useAppDispatch } from '@/store';
import { useMediaHost } from '@/media/useMediaHost';
import { useLyricFollow } from '@/media/useLyricFollow';
import { togglePlaybackKey } from '@/media/mediaControls';
import { getMasterRate, setMasterRate, useMasterRate } from '@/media/playback';
import { toggleFocusedAudio } from '@/media/audioPlayers';
import { selectCurrentSongOrder, useGetSongs } from '@/store/songsSlice';
import {
  broadcastContent,
  getOpenWindowsSync,
  invalidateSentContentCache,
  setScreenGroups,
  setWindowStyleResolver,
} from '@/utils/presentationBridge';
import { useGetScreenGroupsQuery } from '@/api/screenGroups.api';
import type { PresentationContent } from '@/presentation/types';
import { contentForItem, itemContentParts } from '@/presentation/itemContent';
import type { ResolvedStyle } from '@/utils/styleUtils';
import { useGetStylesQuery } from '@/api/styles.api';
import { lookInputFor, lookVariesByGroup, resolveLook, type LookInput } from '@/look/resolveLook';
import { navigableBlockCount } from '@/utils/itemBlocks';
import { useUpdateSetting, useGetSettings } from '@/store/settingsSlice';
import { useGetMusicianSettings } from '@/store/musicianSlice';
import { configIdForRuntimeId, upsertWindowConfig, useGetWindows, WindowConfig } from '@/store/windowSlice';
import { useGetPresentationSettings } from '@/store/presentationSlice';
import {
  setActiveItemIndex,
  setActiveBlockIndex,
  setActiveItemAndBlock,
  setBlack,
  toggleBlack,
  toggleTextHidden,
  toggleVideoVisible,
  setWsConnectedCount,
  setWsPeers,
  setWsMidiSyncAt,
  setWsOperatorConnected,
} from '@/store/presentationSlice';
import { isRemoteCommandAllowed, allowedRemoteCommands } from '@/utils/remoteCommands';
import { useGetShow } from '@/store/showSlice';
import { useI18nContext } from '@/i18n/i18n-react';
import { useGetSessionQuery } from '@/api/session.api';
import { useWsOperator, type WsOperatorIncomingSync } from '@/hooks/useWsOperator';
import { useAudioMixerHost } from '@/hooks/useAudioMixerHost';
import { resolveSyncIndex, showOrderSignature } from '@/utils/syncProtocol';

/**
 * Hook that watches Redux state and broadcasts presentation content
 * to all open presentation windows whenever relevant state changes.
 */
export const usePresentationSync = (): void => {
  const { LL } = useI18nContext();
  const dispatch = useAppDispatch();
  const {
    nextLinePreview,
    globalStyleId,
    transitionMode,
    transitionDuration,
    offlineMode,
    cachedStyles,
    showLicenseNumber,
    resetBlackOnSwitch,
    remoteControlCommands,
    hideTransitionMode,
    hideTransitionDuration,
    videoFadeDuration,
    operatorSyncAuthority,
    deviceId,
  } = useGetSettings(
    'nextLinePreview',
    'globalStyleId',
    'transitionMode',
    'transitionDuration',
    'offlineMode',
    'cachedStyles',
    'showLicenseNumber',
    'resetBlackOnSwitch',
    'remoteControlCommands',
    'hideTransitionMode',
    'hideTransitionDuration',
    'videoFadeDuration',
    'operatorSyncAuthority',
    'deviceId',
  );
  const { midiTrackingMaster } = useGetMusicianSettings();

  // Keep midiTrackingMaster in a ref so the WS callback always sees the latest value
  // without re-registering the callback (which would cause reconnects).
  const midiTrackingMasterRef = useRef(midiTrackingMaster);
  midiTrackingMasterRef.current = midiTrackingMaster;
  const { windowConfigs } = useGetWindows();
  const { currentShow } = useGetShow();
  const { songs } = useGetSongs();

  // Session — needed for the account number and WS host used in WS auth
  const { data: sessionData } = useGetSessionQuery(undefined, { skip: offlineMode });
  const wsAccount = useMemo(() => {
    const acc = sessionData?.account;
    return typeof acc === 'number' ? acc : null;
  }, [sessionData?.account]);

  // Derive wsUrl from global session ws_hosts (configured in config.php)
  const wsUrl = useMemo(() => {
    const h = sessionData?.settings?.wsHost;
    if (h?.host && h?.port) {
      const path = h.path && h.path !== '/' ? h.path : '';
      return `${h.wss ? 'wss' : 'ws'}://${h.host}:${h.port}${path}`;
    }
    return '';
  }, [sessionData?.settings?.wsHost]);

  /**
   * Is THIS app instance the one actually driving the show?
   *
   * Only a live operator broadcasts its position, answers `get_state` and acts on remote
   * commands. Everything else is a passive listener. Without the distinction every open
   * copy of the app — a second laptop, a phone left on the page — answered on the show's
   * behalf, and because those instances sit on whatever position they were opened at, the
   * last one to answer won: the projection snapped back to their item.
   *
   * `auto` reads it off the only fact that actually settles it: an instance with no
   * presentation window open is not presenting anything. `always`/`never` let the operator
   * override for setups the heuristic gets wrong.
   */
  const syncAuthorityRef = useRef(operatorSyncAuthority);
  syncAuthorityRef.current = operatorSyncAuthority;
  const isLiveOperator = useCallback(() => {
    const mode = syncAuthorityRef.current;
    if (mode === 'always') return true;
    if (mode === 'never') return false;
    return getOpenWindowsSync().some((w) => !w.closed);
  }, []);

  /** Fingerprint of the show we are holding — see `resolveSyncIndex`. */
  const showSigRef = useRef<string | undefined>(undefined);
  showSigRef.current = showOrderSignature(currentShow);
  /** Items of our show, for resolving a peer's index by song when the orders differ. */
  const showItemsRef = useRef<Array<{ type?: string; songNumber?: number }>>([]);
  showItemsRef.current = (currentShow?.order ?? []) as Array<{ type?: string; songNumber?: number }>;

  // Called when a musician broadcasts their position — only applied when
  // midiTrackingMaster === 'midi' (operator follows the MIDI musician).
  const handleMusicianSync = useCallback(
    (state: WsOperatorIncomingSync) => {
      if (midiTrackingMasterRef.current !== 'midi') return;
      const hasItem = typeof state.activeItemIndex === 'number';
      const hasBlock = typeof state.activeBlockIndex === 'number';

      // The protocol addresses items by index, so an index only means something between
      // two clients holding the same show order. When the show is edited mid-service the
      // peers that have not reloaded are one item off — following them lands on the wrong
      // song. Fall back to the song number they sent, and refuse rather than jump blind.
      const match = resolveSyncIndex({
        theirSig: state.showSig,
        ourSig: showSigRef.current,
        theirItemIndex: state.activeItemIndex,
        theirSongNumber: state.songNumber,
        ourItems: showItemsRef.current,
      });
      if (match.kind === 'stale') {
        // Silently dropping it would leave the footswitch looking broken, so tell the UI:
        // one side has to reload before indices mean the same thing again.
        window.dispatchEvent(
          new CustomEvent('presenter:sync-show-mismatch', {
            detail: { songTitle: state.songTitle, songNumber: state.songNumber, at: Date.now() },
          }),
        );
        return;
      }
      const itemIndex = match.kind === 'resolved' ? match.itemIndex : state.activeItemIndex;

      // Clamp against OUR order — the musician's show may be longer when this app missed a
      // reload; an out-of-range index would land the presentation on nothing at all.
      // (Block indices are intentionally not clamped: >= blocks.length means "copyright".)
      const clampItem = (idx: number) => Math.max(0, Math.min(idx, Math.max(0, remoteCtxRef.current.showItemCount - 1)));
      if (hasItem && hasBlock) {
        dispatch(setActiveItemAndBlock({ itemIndex: clampItem(itemIndex!), blockIndex: state.activeBlockIndex! }));
      } else if (hasItem) {
        dispatch(setActiveItemIndex(clampItem(itemIndex!)));
      } else if (hasBlock) {
        dispatch(setActiveBlockIndex(state.activeBlockIndex!));
      }
    },
    [dispatch],
  );

  // Counter incremented whenever a peer requests the current state — forces a re-broadcast
  // even if nothing in the presentation has changed.
  const [forceBroadcastCount, setForceBroadcastCount] = useState(0);
  const handleGetState = useCallback(() => {
    // Only the instance actually presenting answers. Every open copy of the app used to
    // reply to this, and a musician connecting or resyncing was enough to make the passive
    // ones publish their stale position — which then also became the relay's cached state
    // for the next client to connect.
    if (!isLiveOperator()) return;
    // Reset the dedup key so the next effect run always sends the current state.
    lastKeyRef.current = '';
    setForceBroadcastCount((c) => c + 1);
  }, [isLiveOperator]);

  // Listen for a custom DOM event dispatched by Footer (or other renderers) after
  // presentation windows are opened/restored, so they get content immediately.
  useEffect(() => {
    const handler = () => {
      lastKeyRef.current = '';
      setForceBroadcastCount((c) => c + 1);
    };
    window.addEventListener('presenter:force-broadcast', handler);
    return () => window.removeEventListener('presenter:force-broadcast', handler);
  }, []);

  // A presentation window (re)mounted its renderer. Main already replayed what it had,
  // but that snapshot predates this session's style/show state — re-broadcast from here
  // so the window gets content resolved through the current per-window style cascade.
  // Without this, windows restored on app start stay black until the operator navigates.
  useEffect(() => {
    const cleanup = window.api?.onPresentationWindowReady?.(({ id }) => {
      // The window we "already sent" this content to is a fresh renderer that never
      // received it — clear the dedupe snapshot or the re-broadcast below is a no-op.
      invalidateSentContentCache(id);
      lastKeyRef.current = '';
      setForceBroadcastCount((c) => c + 1);
    });
    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, []);

  // ── Remote-control commands (mobile control page, relayed as 'remote_command') ──
  // Context ref is assigned further below once song/show/order are derived.
  const remoteCtxRef = useRef<{
    showItemCount: number;
    currentSong: { getBlocks: (order: string) => { name: string; copyright: boolean }[] } | undefined;
    orderName: string;
    /** Song sections or verse pages of the active item. */
    blockCount: number;
    resetBlackOnSwitch: boolean;
    /** Per-command permission map from settings — missing key = allowed */
    allowed: Record<string, boolean>;
    videoVisible: boolean;
    hideTransitionMode: 'cut' | 'fade';
    hideTransitionDuration: number;
    videoFadeDuration: number;
  }>({
    showItemCount: 0,
    currentSong: undefined,
    orderName: 'Default',
    blockCount: 0,
    resetBlackOnSwitch: false,
    allowed: {},
    videoVisible: true,
    hideTransitionMode: 'cut',
    hideTransitionDuration: 300,
    videoFadeDuration: 0,
  });

  const handleRemoteCommand = useCallback(
    (data: Record<string, unknown>) => {
      // A passive instance must not act on this. Acting flips its own black/item state,
      // which in turn fires the broadcast effect below — that is how a single footswitch
      // `toggle_black` used to end with two background instances publishing item 0 and the
      // live operator dutifully following them back to the first song.
      if (!isLiveOperator()) return;
      const command = typeof data.command === 'string' ? data.command : '';
      const nav = navStateRef.current;
      const ctx = remoteCtxRef.current;
      // Permission gate — set_item/set_block (agenda/order jumps) are allowed when
      // item/block navigation is permitted in either direction.
      if (command === 'set_item') {
        if (!isRemoteCommandAllowed(ctx.allowed, 'next_item') && !isRemoteCommandAllowed(ctx.allowed, 'prev_item')) return;
      } else if (command === 'set_block') {
        if (!isRemoteCommandAllowed(ctx.allowed, 'next_block') && !isRemoteCommandAllowed(ctx.allowed, 'prev_block')) return;
      } else if (!isRemoteCommandAllowed(ctx.allowed, command)) {
        return;
      }
      switch (command) {
        case 'prev_item':
          if (nav.activeItemIndex > 0) {
            dispatch(setActiveItemIndex(nav.activeItemIndex - 1));
            if (ctx.resetBlackOnSwitch) dispatch(setBlack(false));
          }
          break;
        case 'next_item':
          if (nav.activeItemIndex < ctx.showItemCount - 1) {
            dispatch(setActiveItemIndex(nav.activeItemIndex + 1));
            if (ctx.resetBlackOnSwitch) dispatch(setBlack(false));
          }
          break;
        case 'set_item': {
          const idx = typeof data.index === 'number' ? Math.floor(data.index) : null;
          if (idx != null) {
            dispatch(setActiveItemIndex(Math.max(0, Math.min(idx, Math.max(0, ctx.showItemCount - 1)))));
            if (ctx.resetBlackOnSwitch) dispatch(setBlack(false));
          }
          break;
        }
        case 'prev_block':
          if (nav.activeBlockIndex > 0) {
            dispatch(setActiveBlockIndex(nav.activeBlockIndex - 1));
          }
          break;
        case 'next_block': {
          if (nav.activeBlockIndex < ctx.blockCount - 1) {
            dispatch(setActiveBlockIndex(nav.activeBlockIndex + 1));
          }
          break;
        }
        case 'set_block': {
          const idx = typeof data.index === 'number' ? Math.floor(data.index) : null;
          if (idx != null && ctx.blockCount > 0) {
            dispatch(setActiveBlockIndex(Math.max(0, Math.min(idx, ctx.blockCount - 1))));
          }
          break;
        }
        case 'toggle_black':
          dispatch(toggleBlack());
          break;
        case 'toggle_text':
          dispatch(toggleTextHidden());
          break;
        case 'toggle_video':
          // Mirrors the keyboard action: backgrounds are hidden through the content every window gets.
          dispatch(toggleVideoVisible());
          break;
        case 'toggle_video_playback':
          if (!toggleFocusedAudio()) togglePlaybackKey();
          break;
        case 'master_speed': {
          const value = Number(data.value);
          if (Number.isFinite(value)) setMasterRate(value);
          break;
        }
      }
    },
    [dispatch, isLiveOperator],
  );

  /**
   * Monitor mixing rides this same relay socket, which has not been opened yet — so the
   * host is handed a stable sender that reads the real one out of a ref once it exists.
   * A second socket would have been simpler and would also have made the operator show up
   * twice in its own connected-clients breakdown.
   */
  const wsBroadcastRef = useRef<(action: string, data?: Record<string, unknown>, to?: string | string[]) => void>(() => {});
  const sendRelay = useCallback(
    (action: string, data?: Record<string, unknown>, to?: string | string[]) => wsBroadcastRef.current(action, data, to),
    [],
  );
  const { handleRelayMessage: handleAudioRelayMessage } = useAudioMixerHost({ send: sendRelay });

  // Operator WebSocket connection to the relay server
  const {
    broadcast: wsBroadcast,
    connected: wsOperatorConnected,
    connectedCount,
    peers: wsPeers,
    lastMidiSyncAt,
    lastPeersDisconnected,
  } = useWsOperator(
    wsUrl,
    wsAccount,
    handleMusicianSync,
    handleGetState,
    handleRemoteCommand,
    midiTrackingMaster === 'midi',
    handleAudioRelayMessage,
  );
  wsBroadcastRef.current = wsBroadcast;

  // Relay confirmed a disconnect-peers request — hand the count back to the Footer, which
  // is waiting on it to tell "cleared N clients" from "the relay never answered".
  useEffect(() => {
    if (!lastPeersDisconnected) return;
    window.dispatchEvent(new CustomEvent('presenter:ws-peers-disconnected', { detail: lastPeersDisconnected }));
  }, [lastPeersDisconnected]);

  // Footer asks the relay to drop every other client of this account (stale tablets,
  // reloaded pages, phones that went to sleep). Routed through a DOM event — the same
  // indirection `presenter:force-broadcast` uses — so the Footer doesn't own the socket.
  useEffect(() => {
    const handler = () => wsBroadcast('disconnect_peers');
    window.addEventListener('presenter:disconnect-ws-peers', handler);
    return () => window.removeEventListener('presenter:disconnect-ws-peers', handler);
  }, [wsBroadcast]);

  // Also listen for direct Electron IPC musician sync (bypasses WS relay, works offline / same machine)
  useEffect(() => {
    const cleanup = window.api?.onMusicianSyncFromIpc?.((raw) => {
      const msg = raw as { action?: string; data?: WsOperatorIncomingSync };
      if (msg?.action === 'musician_sync' && msg.data) {
        dispatch(setWsMidiSyncAt(Date.now()));
        handleMusicianSync(msg.data);
      }
    });
    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
    // handleMusicianSync is stable (useCallback with [dispatch])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep Redux in sync with the WS peer count, connection state and last midi-sync timestamp.
  useEffect(() => {
    dispatch(setWsConnectedCount(Math.max(0, connectedCount)));
  }, [connectedCount, dispatch]);

  useEffect(() => {
    dispatch(setWsPeers(wsPeers));
  }, [wsPeers, dispatch]);

  useEffect(() => {
    dispatch(setWsOperatorConnected(wsOperatorConnected));
  }, [wsOperatorConnected, dispatch]);

  useEffect(() => {
    if (lastMidiSyncAt > 0) dispatch(setWsMidiSyncAt(lastMidiSyncAt));
  }, [lastMidiSyncAt, dispatch]);

  const { activeItemIndex, activeBlockIndex, activeLineIndex, isBlack, isTextHidden, videoVisible, mediaVisible } =
    useGetPresentationSettings(
      'activeItemIndex',
      'activeBlockIndex',
      'activeLineIndex',
      'isBlack',
      'isTextHidden',
      'videoVisible',
      'mediaVisible',
    );
  const updateSetting = useUpdateSetting();

  // Fetch all styles for cascade resolution
  const { data: fetchedStyles } = useGetStylesQuery(undefined, { skip: offlineMode });
  const allStyles = offlineMode ? (cachedStyles as typeof fetchedStyles) : fetchedStyles;

  // Cache styles to localStorage whenever we get a fresh fetch
  useEffect(() => {
    if (!offlineMode && fetchedStyles && fetchedStyles.length > 0) {
      updateSetting('cachedStyles', fetchedStyles as unknown as object[]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchedStyles, offlineMode]);

  // A signature of what each window's content depends on locally — moving a window into another
  // screen group must re-broadcast even though the global state is unchanged.
  const windowStylesSig = useMemo(
    () => windowConfigs?.map((c) => `${c.id}:${c._runtimeId}:${c.name ?? ''}:${c.screenGroupId ?? ''}`).join('|') ?? '',
    [windowConfigs],
  );

  // Get the active show item
  const activeItem = currentShow?.order?.[activeItemIndex];

  // Resolve the song's active order
  const currentSongNumber = activeItem?.type === 'song' ? activeItem.songNumber : undefined;
  const currentSong = currentSongNumber != null ? songs[currentSongNumber] : undefined;
  const orderName = useAppSelector((state) => (currentSongNumber != null ? selectCurrentSongOrder(state, currentSongNumber) : 'Default'));

  // Everything that decides the look of the active item, as resolveLook takes it.
  const lookInput = useMemo<LookInput>(
    () =>
      lookInputFor({
        globalStyleId,
        show: currentShow,
        item: activeItem,
        styles: allStyles,
      }),
    [globalStyleId, currentShow, activeItem, allStyles],
  );
  // Changes whenever something only a screen group sees changes — a variant edit leaves the
  // broadcast style untouched, so without this the windows would never be told.
  const lookSig = useMemo(() => {
    if (!lookVariesByGroup(lookInput)) return '';
    const ids = new Set(Object.values(lookInput.levels).map((level) => level?.styleId));
    return JSON.stringify([lookInput.levels, lookInput.styles.filter((s) => ids.has(s.id))]);
  }, [lookInput]);

  // Agenda for the mobile control page — one entry per show item, labels resolved
  // the same way the sidebar does. Sent inside musician_sync so the phone can render
  // an expandable agenda and jump to any item via `set_item`.
  const agenda = useMemo(
    () =>
      (currentShow?.order ?? []).map((item) => ({
        type: item.type,
        label:
          item.type === 'song'
            ? item.songNumber != null
              ? (songs[item.songNumber]?.title ?? `#${item.songNumber}`)
              : 'Song'
            : item.type === 'bible_verse'
              ? item.bibleRef || item.label || 'Bible'
              : item.label || item.mediaSubType || 'Media',
      })),
    [currentShow?.order, songs],
  );

  // Stable signature of the allowed remote-command list — changing a permission in
  // Settings must immediately rebroadcast the list (otherwise the phone only updates
  // on the next navigation, which reads as tiles briefly showing then disappearing).
  const remoteCommandsSig = useMemo(() => allowedRemoteCommands(remoteControlCommands).join(','), [remoteControlCommands]);
  const masterRate = useMasterRate();

  // Keep the remote-command context current (declared above the WS hook, filled here)
  remoteCtxRef.current = {
    showItemCount: currentShow?.order?.length ?? 0,
    currentSong,
    orderName,
    blockCount: navigableBlockCount(activeItem, currentSong, orderName),
    resetBlackOnSwitch,
    allowed: remoteControlCommands,
    videoVisible,
    hideTransitionMode,
    hideTransitionDuration,
    videoFadeDuration,
  };

  // Use a ref to avoid sending duplicate content — compare key fields only
  const lastKeyRef = useRef('');
  // Throttle/coalesce broadcast scheduling — see broadcast effect below.
  const broadcastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBroadcastAtRef = useRef(0);
  // Mirror the navigation indices so the deferred flush always sends the
  // newest values (otherwise a fast-repeating key would re-schedule the
  // timer with a stale closure). Updated synchronously below.
  const navStateRef = useRef({ activeItemIndex, activeBlockIndex, activeLineIndex, isBlack, isTextHidden, videoVisible });
  navStateRef.current = { activeItemIndex, activeBlockIndex, activeLineIndex, isBlack, isTextHidden, videoVisible };

  // ── Memoize expensive computations ──
  // These only recompute when content changes (song/show/styles), NOT on every index change.
  const parts = useMemo(() => itemContentParts(activeItem, currentSong, orderName), [currentSong, activeItem, orderName]);
  const { contentType, blocks, title } = parts;

  // The theme across account → show → agenda group (see look/resolveLook).
  const style = useMemo<ResolvedStyle>(() => resolveLook(lookInput).style, [lookInput]);

  // Screen groups decide which layers each window shows; the bridge re-sends when they change.
  const { data: screenGroups } = useGetScreenGroupsQuery();
  useEffect(() => {
    if (screenGroups) setScreenGroups(screenGroups);
  }, [screenGroups]);

  // Image and video entries play in their own layers (see media/useMediaHost). What they look like
  // right now joins the broadcast key, so a started, paused or ended entry reaches the windows.
  const playbacks = useMediaHost({
    show: currentShow,
    activeItemIndex,
    groups: screenGroups ?? [],
    backgroundVisible: videoVisible,
    contentVisible: mediaVisible,
    fadeMs: hideTransitionMode === 'fade' ? hideTransitionDuration : 0,
  });
  // Songs and the media entries mapped to them follow each other.
  useLyricFollow({
    show: currentShow,
    blocks: parts.blocks,
    groups: screenGroups ?? [],
    fadeMs: hideTransitionMode === 'fade' ? hideTransitionDuration : 0,
  });
  const mediaSig = useMemo(
    () =>
      JSON.stringify(
        playbacks.map((p) => [
          p.key,
          p.order,
          p.transport.session,
          p.transport.revision,
          p.transport.playing,
          p.transport.pausedAt,
          p.transport.activeLoop,
          p.hidden,
          p.covered,
          p.screens,
          p.endsAt,
          p.cue,
        ]),
      ),
    [playbacks],
  );

  // Keep frequently-changing object refs accessible inside the broadcast effect
  // WITHOUT making them part of its dependency array (would otherwise cause the
  // heavy effect — and IPC broadcast — to fire on every parent re-render).
  const broadcastRef = useRef({
    parts,
    contentType,
    blocks,
    style,
    title,
    activeItem,
    currentShow,
    currentSongNumber,
    orderName,
    nextLinePreview,
    transitionMode,
    transitionDuration,
    agenda,
  });
  broadcastRef.current = {
    parts,
    contentType,
    blocks,
    style,
    title,
    activeItem,
    currentShow,
    currentSongNumber,
    orderName,
    nextLinePreview,
    transitionMode,
    transitionDuration,
    agenda,
  };

  // A cheap content-identity hash (changes only when actual style values change).
  // `lookSig` joins in because a group variant can change without the broadcast style changing.
  const styleHash = useMemo(() => {
    try {
      return `${JSON.stringify(style)}|${lookSig}`;
    } catch {
      return '';
    }
  }, [style, lookSig]);

  useEffect(() => {
    const b = broadcastRef.current;
    if (!b.currentShow) return;

    // Throttled flush: when keys auto-repeat we get a Redux dispatch (and
    // thus this effect) per keypress. Previously we cancelled-and-rescheduled
    // a rAF on every keypress which meant the broadcast (and the
    // wsBroadcast → musician_sync) only fired once the user RELEASED the key.
    // Now we always send immediately if the throttle window has elapsed, and
    // otherwise schedule a single trailing flush — guaranteeing the latest
    // navigation state is delivered while still coalescing bursts.
    const MIN_INTERVAL_MS = 16; // ~60fps; identical broadcasts are deduped per-window

    const flush = () => {
      broadcastTimerRef.current = null;
      lastBroadcastAtRef.current = Date.now();

      // Read the LATEST navigation state from refs — not the closure values,
      // which may be stale by the time the trailing flush runs.
      const nav = navStateRef.current;
      const cb = broadcastRef.current;

      const content: PresentationContent = contentForItem(cb.parts, {
        item: cb.activeItem,
        songNumber: cb.currentSongNumber,
        blockIndex: nav.activeBlockIndex,
        lineIndex: nav.activeLineIndex,
        style: cb.style,
        isBlack: nav.isBlack,
        hideText: nav.isTextHidden,
        nextLinePreview: cb.nextLinePreview,
        transitionMode: cb.transitionMode,
        transitionDuration: cb.transitionDuration,
        showLicenseNumber,
        licenseLabel: LL.AUTH.LICENSE(),
      });

      broadcastContent(content);

      // Broadcast musician_sync via WebSocket relay server
      // Include the current block's name and text lines so viewer clients
      // (viewer/index.php) can display the lyrics without an extra API call.
      const activeBlock = cb.blocks[nav.activeBlockIndex];

      // A display title for the ACTIVE item, always a string so the control page's
      // partial-state merge overwrites a previous song title when a media/bible item
      // becomes active (songTitle alone is undefined for non-songs and would persist).
      const itemTitle =
        cb.contentType === 'song'
          ? (cb.title ?? (cb.activeItem?.type === 'media' ? cb.activeItem.label : undefined) ?? '')
          : cb.contentType === 'bible_verse'
            ? cb.activeItem?.bibleRef || cb.activeItem?.label || 'Bible'
            : cb.contentType === 'media'
              ? cb.activeItem?.label ||
                (cb.activeItem?.mediaSubType === 'color'
                  ? 'Color'
                  : cb.activeItem?.mediaSubType === 'video'
                    ? 'Video'
                    : cb.activeItem?.mediaSubType === 'image'
                      ? 'Image'
                      : 'Media')
              : '';

      // Passive instances stay quiet. Their state is not wrong for them — it is simply not
      // the show anyone is watching, and publishing it overwrites the relay's cached state
      // that every newly connecting client is handed.
      if (!isLiveOperator()) return;

      wsBroadcast('musician_sync', {
        // Who and which show — see `@/utils/syncProtocol`. Receivers use these to ignore a
        // peer that is not driving, and to tell a genuine index apart from one that means
        // a different item because the show was edited.
        senderRole: 'operator' as const,
        senderId: deviceId,
        showSig: showSigRef.current,
        activeItemIndex: nav.activeItemIndex,
        activeBlockIndex: nav.activeBlockIndex,
        activeLineIndex: nav.activeLineIndex,
        isBlack: nav.isBlack,
        isTextHidden: nav.isTextHidden,
        videoVisible: nav.videoVisible,
        songNumber: cb.currentSongNumber,
        songTitle: cb.title,
        showTitle: cb.currentShow?.title,
        orderName: cb.orderName,
        contentType: cb.contentType,
        blockName: activeBlock?.name,
        blockLines: activeBlock?.lines,
        // Extras for the mobile control page (/control):
        // - itemTitle: display title of the active item (song/media/bible)
        // - mediaSubType: so the phone can pick an icon for media items
        // - agenda: all show items (label+type) for the expandable agenda + set_item
        // - blockNames: current song's block names for the expandable order + set_block
        itemTitle,
        mediaSubType: cb.activeItem?.mediaSubType,
        agenda: cb.agenda,
        blockNames: cb.blocks.map((bl) => bl.name),
        // Which commands remote-control clients (/control) may trigger — they
        // hide/disable tiles for anything not listed here.
        remoteCommands: allowedRemoteCommands(remoteCtxRef.current.allowed),
        // The master playback speed — the phone's speed card shows and steps from it.
        masterRate: getMasterRate(),
      });
    };

    // Deduplicate scheduling using a lightweight key (includes styleHash so style
    // edits actually re-broadcast and apply immediately).
    const ai = b.activeItem;
    const contentKey = `${b.contentType}|${activeItemIndex}|${activeBlockIndex}|${activeLineIndex}|${isBlack}|${isTextHidden}|${videoVisible}|${mediaVisible}|${b.blocks.length}|${b.nextLinePreview}|${ai?.mediaColor}|${styleHash}|${windowStylesSig}|${remoteCommandsSig}|${masterRate}|${b.agenda.map((a) => a.label).join('~')}`;
    const key = contentKey + mediaSig;
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;

    const elapsed = Date.now() - lastBroadcastAtRef.current;
    if (elapsed >= MIN_INTERVAL_MS && broadcastTimerRef.current === null) {
      // Leading edge — fire immediately for snappy feedback.
      flush();
    } else if (broadcastTimerRef.current === null) {
      // Schedule a trailing flush; do NOT cancel an existing one (it will pick
      // up the latest state from refs when it fires).
      broadcastTimerRef.current = setTimeout(flush, Math.max(0, MIN_INTERVAL_MS - elapsed));
    }
  }, [
    mediaSig,
    activeItemIndex,
    activeBlockIndex,
    activeLineIndex,
    isBlack,
    isTextHidden,
    videoVisible,
    mediaVisible,
    styleHash,
    // The following primitives change rarely but should still trigger a re-broadcast:
    contentType,
    blocks.length,
    nextLinePreview,
    windowStylesSig,
    // A colour entry's colour can be edited while it is on screen.
    activeItem?.mediaColor,
    forceBroadcastCount,
    // Remote-control permission changes must rebroadcast the allowed list immediately.
    remoteCommandsSig,
    // The phone shows the master speed, so a change from anywhere reaches it.
    masterRate,
    // Agenda label/order changes (e.g. song titles loading in) rebroadcast the agenda.
    agenda,
    // Peer requested current state — force a re-broadcast even if nothing changed.
    wsBroadcast,
    // Whether this instance may publish at all, and the id it publishes under.
    isLiveOperator,
    deviceId,
  ]);

  const lookInputRef = useRef(lookInput);
  lookInputRef.current = lookInput;

  // A window whose screen group has a theme variant gets its look
  // resolved for that group; every other window keeps the broadcast style.
  useEffect(() => {
    setWindowStyleResolver((_id, config: WindowConfig) => {
      const input = lookInputRef.current;
      if (config.screenGroupId === undefined || !lookVariesByGroup(input)) return undefined;
      return resolveLook(input, String(config.screenGroupId)).style;
    });
    return () => setWindowStyleResolver(undefined);
  }, [lookInput, windowStylesSig]);

  // ── Presentation window bounds change listener (Electron only) ──
  // Updates windowConfigs in Redux/localStorage when user moves/resizes a presentation window.
  const savedWindowConfigsRef = useRef(windowConfigs);
  savedWindowConfigsRef.current = windowConfigs;

  useEffect(() => {
    if (!window.api?.onPresentationWindowBoundsChanged) return;

    const cleanup = window.api.onPresentationWindowBoundsChanged(({ id, bounds }) => {
      // `id` is the runtime handle; the config is keyed by its own stable id.
      const configId = configIdForRuntimeId(savedWindowConfigsRef.current, id);
      if (!configId) return;
      dispatch(upsertWindowConfig({ id: configId, positionX: bounds.x, positionY: bounds.y, width: bounds.width, height: bounds.height }));
    });
    return cleanup || undefined;
  }, [dispatch]);
};
