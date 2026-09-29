import { sidePanelState, toggleSidePanel } from '@/components/operator/sidePanel';
import { useEffect, useMemo, useRef } from 'react';
import { useAppSelector, useAppDispatch } from '@/store';
import {
  setActiveItemAndBlock,
  setActiveItemIndex,
  setActiveBlockIndex,
  setActiveLineIndex,
  setBlack,
  toggleBlack,
  toggleTextHidden,
  toggleVideoVisible,
  useGetPresentationSettings,
} from '@/store/presentationSlice';
import { selectCurrentSongOrder, useGetSongs } from '@/store/songsSlice';
import { DEFAULT_KEYBOARD_MAPPING } from '@/components/settings/KeyboardMappingEditor';
import { countPrimaryLines } from '@/song';
import { useGetSettings, useUpdateSetting } from '@/store/settingsSlice';
import { useGetShow } from '@/store/showSlice';
import { shuttle, togglePlaybackKey } from '@/media/mediaControls';
import { goMedia, switchBackground } from '@/media/useMediaHost';
import { useGetScreenGroupsQuery } from '@/api/screenGroups.api';
import { DEFAULT_GROUP_ID } from '@/utils/showGroups';
import { toggleFocusedAudio } from '@/media/audioPlayers';
import { navigableBlockCount } from '@/utils/itemBlocks';
import { eventToCombo, shouldIgnorePresentationKey } from '@/utils/keyboard';
import { emitAppEvent } from '@/utils/appEvents';

/** Count only primary (non-translated) lines in a raw block lines array. */

/**
 * Keyboard navigation hook — reads all state from Redux and dispatches
 * navigation actions for songs, blocks, and lines.
 * Uses data-driven keyboard mapping from settingsSlice.
 */
export const useKeyboardNavigation = () => {
  const dispatch = useAppDispatch();

  const {
    resetBlackOnSwitch,
    keyboardMapping,
    hideTransitionMode,
    hideTransitionDuration,
    videoFadeDuration,
    operatorSetListOpen,
    operatorSidePanelOpen,
    operatorInspectorOpen,
    operatorPreviewOpen,
  } = useGetSettings(
    'resetBlackOnSwitch',
    'keyboardMapping',
    'hideTransitionMode',
    'hideTransitionDuration',
    'videoFadeDuration',
    'operatorSetListOpen',
    'operatorSidePanelOpen',
    'operatorInspectorOpen',
    'operatorPreviewOpen',
  );
  const updateSetting = useUpdateSetting();
  const { keyboardDisabled, videoVisible, activeItemIndex, activeBlockIndex, activeLineIndex, previewTarget, openItemIndex } =
    useGetPresentationSettings(
      'keyboardDisabled',
      'videoVisible',
      'activeItemIndex',
      'activeBlockIndex',
      'activeLineIndex',
      'previewTarget',
      'openItemIndex',
    );
  const { songsOrder, songs } = useGetSongs();
  const { currentShow } = useGetShow();
  const { data: screenGroups = [] } = useGetScreenGroupsQuery();

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
  // Song sections or verse pages — what next/previous block steps through.
  const blockCount = navigableBlockCount(activeShowItem, currentSong, orderName);

  // Build reverse mapping: combo string → action id
  const comboToAction = useMemo(() => {
    const merged = { ...DEFAULT_KEYBOARD_MAPPING, ...keyboardMapping };
    const reverse: Record<string, string> = {};
    for (const [action, data] of Object.entries(merged)) {
      if (data?.key) reverse[data.key] = action;
    }
    return reverse;
  }, [keyboardMapping]);

  // Helper to check if an action is enabled
  const isEnabled = useMemo(() => {
    return (action: string): boolean => {
      if (keyboardMapping[action] && 'enabled' in keyboardMapping[action]) return keyboardMapping[action].enabled;
      return DEFAULT_KEYBOARD_MAPPING[action]?.enabled ?? true;
    };
  }, [keyboardMapping]);

  // Keep a ref of all values the handler needs
  const stateRef = useRef({
    keyboardDisabled,
    resetBlackOnSwitch,
    comboToAction,
    isEnabled,
    activeItemIndex,
    activeBlockIndex,
    activeLineIndex,
    currentSong,
    orderName,
    showItemCount,
    blockCount,
    setListOpen: operatorSetListOpen !== false,
    sidePanel: sidePanelState({ operatorSidePanelOpen, operatorInspectorOpen, operatorPreviewOpen }),
    updateSetting,
    hideTransitionMode,
    hideTransitionDuration,
    videoVisible,
    videoFadeDuration,
    previewTarget,
    openItemIndex,
    currentShow,
    screenGroups,
  });
  stateRef.current = {
    keyboardDisabled,
    resetBlackOnSwitch,
    comboToAction,
    isEnabled,
    activeItemIndex,
    activeBlockIndex,
    activeLineIndex,
    currentSong,
    orderName,
    showItemCount,
    blockCount,
    setListOpen: operatorSetListOpen !== false,
    sidePanel: sidePanelState({ operatorSidePanelOpen, operatorInspectorOpen, operatorPreviewOpen }),
    updateSetting,
    hideTransitionMode,
    hideTransitionDuration,
    videoVisible,
    videoFadeDuration,
    previewTarget,
    openItemIndex,
    currentShow,
    screenGroups,
  };

  // Register the listener only ONCE
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if (s.keyboardDisabled || shouldIgnorePresentationKey(e)) return;

      const combo = eventToCombo(e);
      const mediaFade = s.hideTransitionMode === 'fade' ? s.hideTransitionDuration : 0;
      const agendaGroupId = s.currentShow?.order?.[s.activeItemIndex]?.groupId ?? DEFAULT_GROUP_ID;

      // Alt+1…9: switch to that background of the active agenda group (fixed, like the tiles show).
      const digit = /^Alt\+Digit([1-9])$/.exec(combo);
      if (digit && s.currentShow) {
        e.preventDefault();
        if (e.repeat) return;
        void switchBackground(s.currentShow, agendaGroupId, Number(digit[1]), s.screenGroups, mediaFade);
        return;
      }

      const action = s.comboToAction[combo];
      if (!action) return;

      // Check if this action is enabled
      if (!s.isEnabled(action)) return;
      // Holding a toggle must not flicker the live output or repeatedly start media.
      // Navigation remains repeatable for operators who intentionally hold an arrow key.
      if (
        e.repeat &&
        ![
          'prev_item',
          'Ctrl+prev_item',
          'next_item',
          'Ctrl+next_item',
          'prev_block',
          'advance',
          'next_block',
          'prev_line',
          'next_line',
        ].includes(action)
      ) {
        e.preventDefault();
        return;
      }

      const prevSong = () => {
        if (s.activeItemIndex > 0) {
          dispatch(setActiveItemIndex(s.activeItemIndex - 1));
          if (s.resetBlackOnSwitch) dispatch(setBlack(false));
        }
      };

      const nextSong = () => {
        if (s.activeItemIndex < s.showItemCount - 1) {
          dispatch(setActiveItemIndex(s.activeItemIndex + 1));
          if (s.resetBlackOnSwitch) dispatch(setBlack(false));
        }
      };

      const prevBlock = () => {
        if (s.activeBlockIndex > 0) {
          dispatch(setActiveBlockIndex(s.activeBlockIndex - 1));
        }
      };

      const nextBlock = () => {
        if (s.activeBlockIndex < s.blockCount - 1) {
          dispatch(setActiveBlockIndex(s.activeBlockIndex + 1));
        }
      };

      const prevLine = () => {
        // Verse pages have no line navigation of their own: a line step is a page step.
        if (!s.currentSong) {
          prevBlock();
          return;
        }
        if (s.currentSong) {
          if (s.activeLineIndex > 0) {
            dispatch(setActiveLineIndex(s.activeLineIndex - 1));
          } else if (s.activeBlockIndex > 0) {
            const prevBlockLines = s.currentSong.getBlock(s.orderName, s.activeBlockIndex - 1);
            const primaryCount = countPrimaryLines(prevBlockLines, s.currentSong.languages?.[0]);
            dispatch(setActiveBlockIndex(s.activeBlockIndex - 1));
            dispatch(setActiveLineIndex(Math.max(0, primaryCount - 1)));
          }
        }
      };

      const nextLine = () => {
        if (!s.currentSong) {
          nextBlock();
          return;
        }
        if (s.currentSong) {
          const currentLines = s.currentSong.getBlock(s.orderName, s.activeBlockIndex);
          const primaryCount = countPrimaryLines(currentLines, s.currentSong.languages?.[0]);
          if (s.activeLineIndex < primaryCount - 1) {
            dispatch(setActiveLineIndex(s.activeLineIndex + 1));
          } else {
            const nonCopyrightCount = s.currentSong.getBlocks(s.orderName).filter((b) => !b.copyright).length;
            if (s.activeBlockIndex < nonCopyrightCount - 1) {
              dispatch(setActiveBlockIndex(s.activeBlockIndex + 1));
            }
          }
        }
      };

      switch (action) {
        case 'prev_item':
        case 'Ctrl+prev_item':
          e.preventDefault();
          prevSong();
          break;
        case 'next_item':
        case 'Ctrl+next_item':
          e.preventDefault();
          nextSong();
          break;
        case 'prev_block':
          e.preventDefault();
          prevBlock();
          break;
        case 'advance':
        case 'next_block':
          e.preventDefault();
          nextBlock();
          break;
        case 'prev_line':
          e.preventDefault();
          prevLine();
          break;
        case 'next_line':
          e.preventDefault();
          nextLine();
          break;
        case 'toggle_black':
          e.preventDefault();
          dispatch(toggleBlack());
          break;
        // Operator view columns (also in the View menu).
        case 'toggle_set_list':
          e.preventDefault();
          s.updateSetting('operatorSetListOpen', !s.setListOpen);
          break;
        case 'send_preview_live': {
          // A slide waiting in the preview, else the first slide of an entry opened in the agenda.
          // Neither: leave Enter to whatever has focus.
          const target =
            s.previewTarget ??
            (s.openItemIndex !== null && s.openItemIndex !== s.activeItemIndex ? { itemIndex: s.openItemIndex, blockIndex: 0 } : null);
          if (!target) return;
          e.preventDefault();
          if (target.itemIndex !== s.activeItemIndex) {
            dispatch(setActiveItemAndBlock({ itemIndex: target.itemIndex, blockIndex: target.blockIndex }));
            if (s.resetBlackOnSwitch) dispatch(setBlack(false));
          } else {
            dispatch(setActiveBlockIndex(target.blockIndex));
          }
          break;
        }
        case 'toggle_inspector':
          e.preventDefault();
          toggleSidePanel(s.sidePanel, s.updateSetting);
          break;
        case 'toggle_text_hidden':
          e.preventDefault();
          dispatch(toggleTextHidden());
          break;
        case 'jump_to_start':
          e.preventDefault();
          dispatch(setActiveBlockIndex(0));
          break;
        case 'open_search':
          e.preventDefault();
          emitAppEvent('presenter:open-search', {});
          break;
        case 'media_go':
          if (!s.currentShow) return;
          e.preventDefault();
          void goMedia(s.currentShow, agendaGroupId, s.screenGroups, mediaFade);
          break;
        case 'media_back':
        case 'media_play':
          // Nothing to play: leave the key alone.
          if (shuttle(action === 'media_back' ? 'back' : 'play')) e.preventDefault();
          break;
        case 'toggle_video_playback':
          e.preventDefault();
          if (!toggleFocusedAudio()) togglePlaybackKey();
          break;
        case 'toggle_video_visible':
          e.preventDefault();
          // Backgrounds are hidden through the content every window gets (see media/playback).
          dispatch(toggleVideoVisible());
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [dispatch]);
};
