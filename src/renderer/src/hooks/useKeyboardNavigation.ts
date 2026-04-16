import { useEffect, useMemo } from 'react';
import { useAppSelector, useAppDispatch } from '@/store';
import { setActiveItemIndex, setActiveBlockIndex, setActiveLineIndex, setBlack, toggleBlack } from '@/store/presentationSlice';
import { selectCurrentSongOrder } from '@/store/songsSlice';
import { DEFAULT_KEYBOARD_MAPPING } from '@/components/KeyboardMappingEditor';

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

  const keyboardDisabled = useAppSelector((state) => state.presentation.keyboardDisabled);
  const keyboardNavigationSongs = useAppSelector((state) => state.settings.keyboardNavigationSongs);
  const keyboardNavigationBlocks = useAppSelector((state) => state.settings.keyboardNavigationBlocks);
  const keyboardNavigationLines = useAppSelector((state) => state.settings.keyboardNavigationLines);
  const resetBlackOnSwitch = useAppSelector((state) => state.settings.resetBlackOnSwitch);
  const keyboardMapping = useAppSelector((state) => state.settings.keyboardMapping);

  const activeItemIndex = useAppSelector((state) => state.presentation.activeItemIndex);
  const activeBlockIndex = useAppSelector((state) => state.presentation.activeBlockIndex);
  const activeLineIndex = useAppSelector((state) => state.presentation.activeLineIndex);

  const songs = useAppSelector((state) => state.songs.songs);
  const songsOrder = useAppSelector((state) => state.songs.songsOrder);

  const currentSongNumber = songsOrder[activeItemIndex];
  const currentSong = currentSongNumber != null ? songs[currentSongNumber] : undefined;
  const orderName = useAppSelector((state) => (currentSongNumber != null ? selectCurrentSongOrder(state, currentSongNumber) : 'Default'));

  // Build reverse mapping: combo string → action id
  const comboToAction = useMemo(() => {
    const merged = { ...DEFAULT_KEYBOARD_MAPPING, ...keyboardMapping };
    const reverse: Record<string, string> = {};
    for (const [action, combo] of Object.entries(merged)) {
      if (combo) reverse[combo] = action;
    }
    return reverse;
  }, [keyboardMapping]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (keyboardDisabled) return;

      // Don't intercept keyboard events when focus is inside form elements
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }

      const combo = eventToCombo(e);
      const action = comboToAction[combo];
      if (!action) return;

      const prevSong = () => {
        if (activeItemIndex > 0) {
          dispatch(setActiveItemIndex(activeItemIndex - 1));
          if (resetBlackOnSwitch) dispatch(setBlack(false));
        }
      };

      const nextSong = () => {
        if (activeItemIndex < songsOrder.length - 1) {
          dispatch(setActiveItemIndex(activeItemIndex + 1));
          if (resetBlackOnSwitch) dispatch(setBlack(false));
        }
      };

      const prevBlock = () => {
        if (activeBlockIndex > 0) {
          dispatch(setActiveBlockIndex(activeBlockIndex - 1));
        }
      };

      const nextBlock = () => {
        if (currentSong) {
          const allBlocks = currentSong.getBlocks(orderName);
          if (activeBlockIndex < allBlocks.length - 1) {
            dispatch(setActiveBlockIndex(activeBlockIndex + 1));
          }
        }
      };

      const prevLine = () => {
        if (currentSong) {
          if (activeLineIndex > 0) {
            dispatch(setActiveLineIndex(activeLineIndex - 1));
          } else if (activeBlockIndex > 0) {
            const prevBlockLines = currentSong.getBlock(orderName, activeBlockIndex - 1);
            dispatch(setActiveBlockIndex(activeBlockIndex - 1));
            dispatch(setActiveLineIndex(Math.max(0, prevBlockLines.length - 1)));
          }
        }
      };

      const nextLine = () => {
        if (currentSong) {
          const currentLines = currentSong.getBlock(orderName, activeBlockIndex);
          if (activeLineIndex < currentLines.length - 1) {
            dispatch(setActiveLineIndex(activeLineIndex + 1));
          } else {
            // Auto-advance to next block, but stop before the copyright pseudo-block
            const nonCopyrightCount = currentSong.getBlocks(orderName).filter((b) => !b.copyright).length;
            if (activeBlockIndex < nonCopyrightCount - 1) {
              dispatch(setActiveBlockIndex(activeBlockIndex + 1));
            }
          }
        }
      };

      switch (action) {
        case 'prev_item':
        case 'Ctrl+prev_item':
          if (keyboardNavigationSongs) {
            e.preventDefault();
            prevSong();
          }
          break;
        case 'next_item':
        case 'Ctrl+next_item':
          if (keyboardNavigationSongs) {
            e.preventDefault();
            nextSong();
          }
          break;
        case 'prev_block':
          if (keyboardNavigationBlocks) {
            e.preventDefault();
            prevBlock();
          }
          break;
        case 'next_block':
          if (keyboardNavigationBlocks) {
            e.preventDefault();
            nextBlock();
          }
          break;
        case 'prev_line':
          if (keyboardNavigationLines) {
            e.preventDefault();
            prevLine();
          }
          break;
        case 'next_line':
          if (keyboardNavigationLines) {
            e.preventDefault();
            nextLine();
          }
          break;
        case 'toggle_black':
          e.preventDefault();
          dispatch(toggleBlack());
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    dispatch,
    keyboardDisabled,
    keyboardNavigationSongs,
    keyboardNavigationBlocks,
    keyboardNavigationLines,
    resetBlackOnSwitch,
    keyboardMapping,
    comboToAction,
    activeItemIndex,
    activeBlockIndex,
    activeLineIndex,
    songs,
    songsOrder,
    currentSong,
    currentSongNumber,
    orderName,
  ]);
};
