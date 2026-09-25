import { commandFocusedPlayback } from '@/media/mediaControls';
import { getMasterRate, setMasterRate } from '@/media/playback';
import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  freezeWindow,
  setActiveBlockIndex,
  setActiveItemIndex,
  setActiveLineIndex,
  setBlack,
  setTextHidden,
  toggleTextHidden,
  toggleVideoVisible,
  setMediaVisible,
  toggleBlack,
  unfreezeWindow,
  useGetPresentationSettings,
} from '@/store/presentationSlice';
import { useGetSettings, useUpdateSetting } from '@/store/settingsSlice';
import {
  stageAdjust,
  stageBack,
  stageGo,
  stageSetHidden,
  stageStart,
  stageStop,
  stageTogglePause,
  toggleStageAllHidden,
} from '@/store/stageSlice';
import { useStageStatus } from '@/hooks/useStageEngine';
import { useSlideSelect } from '@/hooks/useSlideSelect';
import { selectCurrentSongOrder, useGetSongs } from '@/store/songsSlice';
import { useGetShow } from '@/store/showSlice';
import { countPrimaryLines } from '@/song';
import { navigableBlockCount } from '@/utils/itemBlocks';
import { wsActionTrigger } from './useBroadcastCompanionState';

const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

/** Set the pending action trigger so the state-watcher broadcast includes it. */
const trigger = (action: string) => {
  wsActionTrigger.pending = action;
};

export const useWsCompanionCommands = () => {
  const dispatch = useAppDispatch();
  const { companionCommandsEnabled, resetBlackOnSwitch, operatorMode } = useGetSettings(
    'companionCommandsEnabled',
    'resetBlackOnSwitch',
    'operatorMode',
  );
  const updateSetting = useUpdateSetting();
  const { activeItemIndex, activeBlockIndex, activeLineIndex, isBlack, mediaVisible } = useGetPresentationSettings(
    'activeItemIndex',
    'activeBlockIndex',
    'activeLineIndex',
    'isBlack',
    'mediaVisible',
  );
  const { statuses: stageStatuses } = useStageStatus();
  const { sendPreviewLive } = useSlideSelect();
  const { songsOrder, songs } = useGetSongs();
  const { currentShow } = useGetShow();

  // Resolve the current song from the SHOW order (not songsOrder — that array only
  // contains songs, so its indices diverge from activeItemIndex once non-song items exist).
  const activeShowItem = currentShow?.order?.[activeItemIndex];
  const currentSongNumber = activeShowItem
    ? activeShowItem.type === 'song'
      ? activeShowItem.songNumber
      : undefined
    : songsOrder[activeItemIndex];
  const currentSong = currentSongNumber != null ? songs[currentSongNumber] : undefined;
  const orderName = useAppSelector((state) => (currentSongNumber != null ? selectCurrentSongOrder(state, currentSongNumber) : 'Default'));

  const showItemCount = currentShow?.order?.length ?? songsOrder.length;
  // Song sections or verse pages — what next/set block steps through.
  const blockCount = navigableBlockCount(activeShowItem, currentSong, orderName);

  // Keep a stable ref so event handlers always see latest state
  const stateRef = useRef({
    companionCommandsEnabled,
    resetBlackOnSwitch,
    activeItemIndex,
    activeBlockIndex,
    activeLineIndex,
    isBlack,
    currentSong,
    orderName,
    showItemCount,
    blockCount,
    currentShow,
    songsOrder,
    songs,
    operatorMode,
    updateSetting,
    mediaVisible,
    stageStatuses,
    sendPreviewLive,
  });

  stateRef.current = {
    companionCommandsEnabled,
    resetBlackOnSwitch,
    activeItemIndex,
    activeBlockIndex,
    activeLineIndex,
    isBlack,
    currentSong,
    orderName,
    showItemCount,
    blockCount,
    currentShow,
    songsOrder,
    songs,
    operatorMode,
    updateSetting,
    mediaVisible,
    stageStatuses,
    sendPreviewLive,
  };

  useEffect(() => {
    // Register navigation listener if available
    const removeNavigationListener = window.api?.onWsNavigationAction?.((data) => {
      const s = stateRef.current;
      if (!s.companionCommandsEnabled) return;

      switch (data.action) {
        case 'prev_item':
          if (s.activeItemIndex > 0) {
            trigger(data.action);
            dispatch(setActiveItemIndex(s.activeItemIndex - 1));
            if (s.resetBlackOnSwitch) dispatch(setBlack(false));
          }
          break;
        case 'next_item':
          if (s.activeItemIndex < s.showItemCount - 1) {
            trigger(data.action);
            dispatch(setActiveItemIndex(s.activeItemIndex + 1));
            if (s.resetBlackOnSwitch) dispatch(setBlack(false));
          }
          break;
        case 'prev_block':
          if (s.activeBlockIndex > 0) {
            trigger(data.action);
            dispatch(setActiveBlockIndex(s.activeBlockIndex - 1));
          }
          break;
        case 'next_block': {
          if (s.activeBlockIndex < s.blockCount - 1) {
            trigger(data.action);
            dispatch(setActiveBlockIndex(s.activeBlockIndex + 1));
          }
          break;
        }
        case 'prev_line': {
          if (!s.currentSong) break;
          if (s.activeLineIndex > 0) {
            trigger(data.action);
            dispatch(setActiveLineIndex(s.activeLineIndex - 1));
          } else if (s.activeBlockIndex > 0) {
            const prevBlockLines = s.currentSong.getBlock(s.orderName, s.activeBlockIndex - 1);
            const primaryCount = countPrimaryLines(prevBlockLines, s.currentSong.languages?.[0]);
            trigger(data.action);
            dispatch(setActiveBlockIndex(s.activeBlockIndex - 1));
            dispatch(setActiveLineIndex(Math.max(0, primaryCount - 1)));
          }
          break;
        }
        case 'next_line': {
          if (!s.currentSong) break;
          const currentLines = s.currentSong.getBlock(s.orderName, s.activeBlockIndex);
          const primaryCount = countPrimaryLines(currentLines, s.currentSong.languages?.[0]);
          if (s.activeLineIndex < primaryCount - 1) {
            trigger(data.action);
            dispatch(setActiveLineIndex(s.activeLineIndex + 1));
          } else {
            const nonCopyrightCount = s.currentSong.getBlocks(s.orderName).filter((b) => !b.copyright).length;
            if (s.activeBlockIndex < nonCopyrightCount - 1) {
              trigger(data.action);
              dispatch(setActiveBlockIndex(s.activeBlockIndex + 1));
            }
          }
          break;
        }
        case 'set_item': {
          const index = asNumber(data.payload?.index);
          if (index != null) {
            const clamped = Math.max(0, Math.min(Math.floor(index), Math.max(0, s.showItemCount - 1)));
            trigger(data.action);
            dispatch(setActiveItemIndex(clamped));
            if (s.resetBlackOnSwitch) dispatch(setBlack(false));
          }
          break;
        }
        case 'set_block': {
          const index = asNumber(data.payload?.index);
          if (index != null && s.blockCount > 0) {
            const max = s.blockCount - 1;
            const clamped = Math.max(0, Math.min(Math.floor(index), max));
            trigger(data.action);
            dispatch(setActiveBlockIndex(clamped));
          }
          break;
        }
        case 'set_line': {
          const index = asNumber(data.payload?.index);
          if (index != null && s.currentSong) {
            const currentLines = s.currentSong.getBlock(s.orderName, s.activeBlockIndex);
            const max = Math.max(0, countPrimaryLines(currentLines, s.currentSong.languages?.[0]) - 1);
            const clamped = Math.max(0, Math.min(Math.floor(index), max));
            trigger(data.action);
            dispatch(setActiveLineIndex(clamped));
          }
          break;
        }
        case 'set_black': {
          const newBlack = Boolean(data.payload?.value);
          trigger(data.action);
          dispatch(setBlack(newBlack));
          break;
        }
        case 'toggle_black': {
          trigger(data.action);
          dispatch(toggleBlack());
          break;
        }
        case 'toggle_text': {
          trigger(data.action);
          dispatch(toggleTextHidden());
          break;
        }
        case 'set_text_hidden': {
          trigger(data.action);
          dispatch(setTextHidden(Boolean(data.payload?.value)));
          break;
        }
        case 'take':
          trigger(data.action);
          s.sendPreviewLive();
          break;
        case 'set_mode': {
          const mode = data.payload?.mode === 'toggle' ? (s.operatorMode === 'live' ? 'prepare' : 'live') : data.payload?.mode;
          if (mode === 'prepare' || mode === 'live') {
            trigger(data.action);
            s.updateSetting('operatorMode', mode);
          }
          break;
        }
        // The layer bar's eyes.
        case 'toggle_background':
          trigger(data.action);
          dispatch(toggleVideoVisible());
          break;
        case 'toggle_media_layer':
          trigger(data.action);
          dispatch(setMediaVisible(!s.mediaVisible));
          break;
        case 'toggle_stage_overlays':
          trigger(data.action);
          dispatch(toggleStageAllHidden());
          break;
        // One stage layer (timers, countdowns, messages), as its transport in the layer bar.
        case 'stage': {
          const status = s.stageStatuses.find((st) => st.layer.id === asNumber(data.payload?.layerId));
          if (!status) break;
          const layerId = status.layer.id;
          const at = Date.now();
          trigger(data.action);
          switch (data.payload?.command) {
            case 'start':
              dispatch(stageStart({ layerId, at }));
              break;
            case 'go':
              dispatch(stageGo({ layerId, cueCount: status.cueCount, at }));
              break;
            case 'back':
              dispatch(stageBack({ layerId, at }));
              break;
            case 'pause':
              dispatch(stageTogglePause({ layerId, at }));
              break;
            case 'plus_minute':
            case 'minus_minute':
              dispatch(stageAdjust({ layerId, deltaMs: data.payload?.command === 'plus_minute' ? 60_000 : -60_000 }));
              break;
            case 'stop':
              dispatch(stageStop({ layerId, cueCount: status.cueCount, at }));
              break;
            case 'hide':
              dispatch(stageSetHidden({ layerId, hidden: !status.hidden, at }));
              break;
          }
          break;
        }
        case 'freeze_window':
          if (typeof data.payload?.windowName === 'string' && data.payload.windowName) {
            trigger(data.action);
            dispatch(freezeWindow(data.payload.windowName));
          }
          break;
        case 'unfreeze_window':
          if (typeof data.payload?.windowName === 'string' && data.payload.windowName) {
            trigger(data.action);
            dispatch(unfreezeWindow(data.payload.windowName));
          }
          break;
        default:
          break;
      }
    });

    const removeVideoListener = window.api?.onWsVideoAction?.((data) => {
      const s = stateRef.current;
      if (!s.companionCommandsEnabled) return;

      // Videos are media entries now: the commands act on the top playing entry (content, else
      // the background). A window name no longer narrows them down.
      switch (data.action) {
        case 'video_play':
          trigger(data.action);
          commandFocusedPlayback({ type: 'play' });
          break;
        case 'video_pause':
          trigger(data.action);
          commandFocusedPlayback({ type: 'pause' });
          break;
        case 'video_toggle':
          trigger(data.action);
          commandFocusedPlayback({ type: 'toggle' });
          break;
        // { value } sets it, { step } nudges it (a rotary encoder), { reset: true } is normal speed.
        case 'master_speed': {
          const value = asNumber(data.payload?.value);
          const step = asNumber(data.payload?.step);
          trigger(data.action);
          if (data.payload?.reset) setMasterRate(1);
          else if (value != null) setMasterRate(value);
          else if (step != null) setMasterRate(getMasterRate() + step);
          break;
        }
        case 'video_rate': {
          const rate = asNumber(data.payload?.rate);
          if (rate != null) {
            trigger(data.action);
            commandFocusedPlayback({ type: 'rate', rate });
          }
          break;
        }
        case 'video_stop':
          trigger(data.action);
          commandFocusedPlayback({ type: 'stop' });
          break;
        case 'video_seek': {
          const position = asNumber(data.payload?.position);
          if (position != null) {
            trigger(data.action);
            commandFocusedPlayback({ type: 'seek', time: position });
          }
          break;
        }
        default:
          break;
      }
    });

    return () => {
      if (typeof removeNavigationListener === 'function') removeNavigationListener();
      if (typeof removeVideoListener === 'function') removeVideoListener();
    };
    // Register listeners once — state is always read from stateRef
  }, [dispatch]);
};
