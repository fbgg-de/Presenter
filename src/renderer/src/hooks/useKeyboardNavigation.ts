import { useEffect, useMemo, useRef } from 'react';
import { useAppSelector, useAppDispatch } from '@/store';
import {
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
import { SONG_TRANSLATION_LINE_REGEX } from '@/song';
import { useGetSettings } from '@/store/settingsSlice';
import { useGetShow } from '@/store/showSlice';

/** Count only primary (non-translated) lines in a raw block lines array. */
const countPrimaryLines = (lines: string[]): number => lines.filter((l) => !SONG_TRANSLATION_LINE_REGEX.test(l)).length;

/** Build a combo string from a keyboard event (matches KeyboardMappingEditor.eventToCombo) */
const eventToCombo = (e: KeyboardEvent): string => {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');
  if (e.metaKey) parts.push('Meta');
  if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
    parts.push(e.code);
  }
  return parts.join('+');
};

/**
 * Keyboard navigation hook — reads all state from Redux and dispatches
 * navigation actions for songs, blocks, and lines.
 * Uses data-driven keyboard mapping from settingsSlice.
 */
export const useKeyboardNavigation = () => {
  const dispatch = useAppDispatch();

  const { resetBlackOnSwitch, keyboardMapping, hideTransitionMode, hideTransitionDuration, videoFadeDuration } = useGetSettings();
  const { keyboardDisabled, videoVisible, activeItemIndex, activeBlockIndex, activeLineIndex } = useGetPresentationSettings();
  const { songsOrder, songs } = useGetSongs();
  const { currentShow } = useGetShow();

  const currentSongNumber = songsOrder[activeItemIndex];
  const currentSong = currentSongNumber != null ? songs[currentSongNumber] : undefined;
  const orderName = useAppSelector((state) => (currentSongNumber != null ? selectCurrentSongOrder(state, currentSongNumber) : 'Default'));
  const showItemCount = currentShow?.order?.length ?? songsOrder.length;

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
    hideTransitionMode,
    hideTransitionDuration,
    videoVisible,
    videoFadeDuration,
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
    hideTransitionMode,
    hideTransitionDuration,
    videoVisible,
    videoFadeDuration,
  };

  // Register the listener only ONCE
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if (s.keyboardDisabled) return;

      // Don't intercept keyboard events when focus is inside form elements
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }

      const combo = eventToCombo(e);
      const action = s.comboToAction[combo];
      if (!action) return;

      // Check if this action is enabled
      if (!s.isEnabled(action)) return;

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
        if (s.currentSong) {
          const allBlocks = s.currentSong.getBlocks(s.orderName);
          if (s.activeBlockIndex < allBlocks.length - 1) {
            dispatch(setActiveBlockIndex(s.activeBlockIndex + 1));
          }
        }
      };

      const prevLine = () => {
        if (s.currentSong) {
          if (s.activeLineIndex > 0) {
            dispatch(setActiveLineIndex(s.activeLineIndex - 1));
          } else if (s.activeBlockIndex > 0) {
            const prevBlockLines = s.currentSong.getBlock(s.orderName, s.activeBlockIndex - 1);
            const primaryCount = countPrimaryLines(prevBlockLines);
            dispatch(setActiveBlockIndex(s.activeBlockIndex - 1));
            dispatch(setActiveLineIndex(Math.max(0, primaryCount - 1)));
          }
        }
      };

      const nextLine = () => {
        if (s.currentSong) {
          const currentLines = s.currentSong.getBlock(s.orderName, s.activeBlockIndex);
          const primaryCount = countPrimaryLines(currentLines);
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
        case 'toggle_text_hidden':
          e.preventDefault();
          dispatch(toggleTextHidden());
          break;
        case 'jump_to_start':
          e.preventDefault();
          dispatch(setActiveBlockIndex(0));
          break;
        case 'toggle_video_playback':
          e.preventDefault();
          if (window.api?.videoCommand) {
            window.api.videoCommand({ action: 'toggle', fadeDuration: s.videoFadeDuration });
          }
          break;
        case 'toggle_video_visible':
          e.preventDefault();
          if (window.api?.setVideoVisible) {
            const nextVisible = !s.videoVisible;
            dispatch(toggleVideoVisible());
            window.api.setVideoVisible({
              value: nextVisible,
              mode: s.hideTransitionMode,
              durationMs: s.hideTransitionDuration,
            });
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [dispatch]);
};
