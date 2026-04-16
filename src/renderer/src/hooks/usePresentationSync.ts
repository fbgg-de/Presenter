import { useEffect, useRef } from 'react';
import { useAppSelector, useAppDispatch } from '@/store';
import { selectCurrentSongOrder } from '@/store/songsSlice';
import { broadcastContent } from '@/utils/presentationBridge';
import { SONG_TRANSLATION_LINE_REGEX } from '@/song';
import type { PresentationContent, PresentationBlock, PresentationLine, ContentType } from '@/presentation/types';
import { resolveStyleCascade, mergeStyles, DEFAULT_STYLE, type ResolvedStyle } from '@/utils/styleUtils';
import { useGetStylesQuery } from '@/api/styles.api';
import {
  setActiveItemIndex,
  setActiveBlockIndex,
  setActiveLineIndex,
  nextItem,
  prevItem,
  nextBlock,
  prevBlock,
  nextLine,
  prevLine,
  toggleBlack,
  setBlack,
  freezeWindow as freezeWindowAction,
  unfreezeWindow as unfreezeWindowAction,
} from '@/store/presentationSlice';

/**
 * Parse song block lines to extract language tags.
 * Lines like "[EN] Some text" are tagged with the language.
 * Lines without tags are considered universal (no language).
 */
const parseSongLines = (rawLines: string[]): PresentationLine[] => {
  return rawLines.map((line) => {
    const match = line.match(SONG_TRANSLATION_LINE_REGEX);
    if (match) {
      return {
        text: match[2],
        language: match[1].toUpperCase(),
      };
    }
    return { text: line };
  });
};

/**
 * Hook that watches Redux state and broadcasts presentation content
 * to all open presentation windows whenever relevant state changes.
 */
export const usePresentationSync = (): void => {
  const dispatch = useAppDispatch();
  const activeItemIndex = useAppSelector((state) => state.presentation.activeItemIndex);
  const activeBlockIndex = useAppSelector((state) => state.presentation.activeBlockIndex);
  const activeLineIndex = useAppSelector((state) => state.presentation.activeLineIndex);
  const isBlack = useAppSelector((state) => state.presentation.isBlack);
  const frozenWindows = useAppSelector((state) => state.presentation.frozenWindows);

  const currentShow = useAppSelector((state) => state.show.currentShow);
  const songs = useAppSelector((state) => state.songs.songs);
  const songsOrder = useAppSelector((state) => state.songs.songsOrder);

  const nextLinePreview = useAppSelector((state) => state.settings.nextLinePreview);
  const nextLinePreviewColor = useAppSelector((state) => state.settings.nextLinePreviewColor);
  const globalStyleId = useAppSelector((state) => state.settings.globalStyleId);

  // Fetch all styles for cascade resolution
  const { data: allStyles } = useGetStylesQuery();

  // Get the active show item
  const activeItem = currentShow?.order?.[activeItemIndex];

  // Resolve the song's active order
  const currentSongNumber = activeItem?.type === 'song' ? activeItem.songNumber : undefined;
  const currentSong = currentSongNumber != null ? songs[currentSongNumber] : undefined;
  const orderName = useAppSelector((state) => (currentSongNumber != null ? selectCurrentSongOrder(state, currentSongNumber) : 'Default'));

  // Use a ref to avoid sending duplicate content — compare key fields only
  const lastKeyRef = useRef('');

  useEffect(() => {
    if (!currentShow) return;
    // ...existing code for building content...

    let contentType: ContentType = 'empty';
    let blocks: PresentationBlock[] = [];
    let title: string | undefined;
    let copyright: string | undefined;
    let authors: string | undefined;

    if (activeItem) {
      switch (activeItem.type) {
        case 'song': {
          contentType = 'song';
          if (currentSong) {
            title = currentSong.title;
            authors = currentSong.authors;
            copyright = currentSong.copyright;

            const songBlocks = currentSong.getBlocks(orderName);
            blocks = songBlocks
              .filter((b) => !b.copyright) // Exclude the copyright pseudo-block
              .map((b) => ({
                name: b.name,
                lines: parseSongLines(b.lines || []),
              }));
          }
          break;
        }

        case 'bible_verse': {
          contentType = 'bible_verse';
          // Bible verse text is in the label field
          const verseText = activeItem.label || activeItem.bibleRef || '';
          blocks = [
            {
              name: activeItem.bibleRef || 'Bible Verse',
              lines: verseText.split('\n').map((text) => {
                // Check for bold segments
                const segments = activeItem.bibleFormattedSegments || [];
                const lineStart = verseText.indexOf(text);
                const lineEnd = lineStart + text.length;
                const isBold = segments.some((s) => s.bold && s.start <= lineEnd && s.end >= lineStart);
                return { text, bold: isBold };
              }),
            },
          ];
          break;
        }

        case 'media': {
          contentType = 'media';
          // Media items don't have text blocks
          break;
        }
      }
    }

    // Compute next-block preview lines
    let nextBlockPreviewLines: PresentationLine[] | undefined;
    if (nextLinePreview && blocks.length > 0 && contentType === 'song') {
      const nextBlockIndex = activeBlockIndex + 1;
      if (nextBlockIndex < blocks.length) {
        const nextBlock = blocks[nextBlockIndex];
        if (nextBlock && nextBlock.lines.length > 0) {
          nextBlockPreviewLines = [nextBlock.lines[0]];
        }
      }
    }

    // Resolve the three-level style cascade (Global → Show → Item)
    const styles = allStyles ?? [];
    const globalStyle = globalStyleId ? styles.find((s) => s.id === globalStyleId) : undefined;
    const showStyle = currentShow?.styleId ? styles.find((s) => s.id === currentShow.styleId) : undefined;
    const itemStyle = activeItem?.styleId ? styles.find((s) => s.id === activeItem.styleId) : undefined;
    const resolvedCascade = resolveStyleCascade(globalStyle, showStyle, itemStyle, undefined, styles);
    const style: ResolvedStyle = mergeStyles(DEFAULT_STYLE, resolvedCascade);

    const content: PresentationContent = {
      contentType,
      displayMode: 'normal',
      activeBlockIndex,
      activeLineIndex,
      blocks,
      style,
      isBlack,
      title,
      copyright,
      authors,
      mediaSubType: activeItem?.mediaSubType,
      mediaPath: activeItem?.mediaPath,
      mediaColor: activeItem?.mediaColor,
      bibleRef: activeItem?.bibleRef,
      bibleTranslation: activeItem?.bibleTranslation,
      nextBlockPreviewLines,
      nextLinePreviewColor,
    };

    // Deduplicate broadcasts using a lightweight key (not full JSON.stringify)
    const contentKey = `${contentType}|${activeItemIndex}|${activeBlockIndex}|${activeLineIndex}|${isBlack}|${globalStyleId}|${currentShow?.styleId}|${activeItem?.styleId}|${blocks.length}|${nextLinePreview}|${nextLinePreviewColor}|${activeItem?.mediaPath}|${activeItem?.mediaColor}|${allStyles?.length}`;
    if (contentKey === lastKeyRef.current) return;
    lastKeyRef.current = contentKey;

    broadcastContent(content);

    // Broadcast musician_sync via WebSocket (Electron only) for musician views
    if (window.api?.wsBroadcast) {
      window.api.wsBroadcast('musician_sync', {
        activeItemIndex,
        activeBlockIndex,
        activeLineIndex,
        songNumber: currentSongNumber,
        songTitle: title,
        orderName,
        contentType,
      });
    }
  }, [
    activeItemIndex,
    activeBlockIndex,
    activeLineIndex,
    isBlack,
    frozenWindows,
    currentShow,
    activeItem,
    currentSong,
    orderName,
    songs,
    songsOrder,
    nextLinePreview,
    nextLinePreviewColor,
    allStyles,
    globalStyleId,
  ]);

  // ── WebSocket navigation action listener (Electron only, §22.2) ──
  useEffect(() => {
    if (!window.api?.onWsNavigationAction) return;

    const handleWsAction = (data: unknown) => {
      const msg = data as { action: string; payload?: Record<string, unknown> };
      const maxItemIndex = (currentShow?.order?.length ?? 1) - 1;

      switch (msg.action) {
        case 'next_item':
          dispatch(nextItem({ maxIndex: maxItemIndex }));
          break;
        case 'prev_item':
          dispatch(prevItem());
          break;
        case 'next_block':
          // We'd need to know maxBlockIndex, but we can use a large number as a safeguard
          dispatch(nextBlock({ maxIndex: 999 }));
          break;
        case 'prev_block':
          dispatch(prevBlock());
          break;
        case 'next_line':
          dispatch(nextLine({ maxLineIndex: 999, maxBlockIndex: 999 }));
          break;
        case 'prev_line':
          dispatch(prevLine({ prevBlockLastLineIndex: 999 }));
          break;
        case 'set_item':
          if (msg.payload && typeof msg.payload.index === 'number') {
            dispatch(setActiveItemIndex(msg.payload.index));
          }
          break;
        case 'set_block':
          if (msg.payload && typeof msg.payload.index === 'number') {
            dispatch(setActiveBlockIndex(msg.payload.index));
          }
          break;
        case 'set_line':
          if (msg.payload && typeof msg.payload.index === 'number') {
            dispatch(setActiveLineIndex(msg.payload.index));
          }
          break;
        case 'toggle_black':
          dispatch(toggleBlack());
          break;
        case 'set_black':
          if (msg.payload && typeof msg.payload.value === 'boolean') {
            dispatch(setBlack(msg.payload.value));
          }
          break;
        case 'freeze_window':
          if (msg.payload && typeof msg.payload.windowName === 'string') {
            dispatch(freezeWindowAction(msg.payload.windowName));
          }
          break;
        case 'unfreeze_window':
          if (msg.payload && typeof msg.payload.windowName === 'string') {
            dispatch(unfreezeWindowAction(msg.payload.windowName));
          }
          break;
      }
    };

    window.api.onWsNavigationAction(handleWsAction);

    return () => {
      window.api?.removeAllWsListeners?.();
    };
  }, [dispatch, currentShow]);

  // ── WebSocket state request handler (Electron only) ──
  useEffect(() => {
    if (!window.api?.onWsGetState) return;

    const handleGetState = () => {
      window.api.sendWsStateResponse({
        activeItemIndex,
        activeBlockIndex,
        activeLineIndex,
        isBlack,
        showTitle: currentShow?.title,
        itemCount: currentShow?.order?.length ?? 0,
      });
    };

    window.api.onWsGetState(handleGetState);
  }, [activeItemIndex, activeBlockIndex, activeLineIndex, isBlack, currentShow]);
};
