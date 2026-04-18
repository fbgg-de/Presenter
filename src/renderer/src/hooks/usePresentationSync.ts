import { useEffect, useMemo, useRef } from 'react';
import { useAppSelector, useAppDispatch } from '@/store';
import { selectCurrentSongOrder } from '@/store/songsSlice';
import { broadcastContent, setWindowStyleResolver, type WindowConfig } from '@/utils/presentationBridge';
import { SONG_TRANSLATION_LINE_REGEX } from '@/song';
import type { PresentationContent, PresentationBlock, PresentationLine, ContentType } from '@/presentation/types';
import { resolveStyleCascade, mergeStyles, resolveStyleData, DEFAULT_STYLE, type ResolvedStyle } from '@/utils/styleUtils';
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

const MEDIA_SERVER_BASE = 'http://localhost:9100';

/** Resolve a relative media path to an absolute URL using the local media server. */
function resolveMediaUrl(path: string | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('file://') || path.startsWith('/')) {
    return path;
  }
  // Windows absolute path (e.g. C:\...) — convert to file:// URL so the renderer can load it
  if (/^[a-zA-Z]:[/\\]/.test(path)) {
    return 'file:///' + path.replace(/\\/g, '/');
  }
  // Normalise backslashes then encode each segment
  const normalised = path.replace(/\\/g, '/');
  return `${MEDIA_SERVER_BASE}/${normalised.split('/').map(encodeURIComponent).join('/')}`;
}

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

  const currentShow = useAppSelector((state) => state.show.currentShow);

  const nextLinePreview = useAppSelector((state) => state.settings.nextLinePreview);
  const nextLinePreviewColor = useAppSelector((state) => state.settings.nextLinePreviewColor);
  const globalStyleId = useAppSelector((state) => state.settings.globalStyleId);
  const windowConfigs = useAppSelector((state) => state.settings.windowConfigs);
  const transitionMode = useAppSelector((state) => state.settings.transitionMode);
  const transitionDuration = useAppSelector((state) => state.settings.transitionDuration);

  // Fetch all styles for cascade resolution
  const { data: allStyles } = useGetStylesQuery();

  // A signature of per-window styleIds — when a user assigns a preset to a
  // window we must re-broadcast even though the global state is unchanged.
  const windowStylesSig = useMemo(
    () => (windowConfigs as Array<{ name?: string; styleId?: number }> | undefined)
      ?.map((c) => `${c.name ?? ''}:${c.styleId ?? ''}`)
      .join('|') ?? '',
    [windowConfigs],
  );

  // Get the active show item
  const activeItem = currentShow?.order?.[activeItemIndex];

  // Resolve the song's active order
  const currentSongNumber = activeItem?.type === 'song' ? activeItem.songNumber : undefined;
  const currentSong = useAppSelector((state) => currentSongNumber != null ? state.songs.songs[currentSongNumber] : undefined);
  const orderName = useAppSelector((state) => (currentSongNumber != null ? selectCurrentSongOrder(state, currentSongNumber) : 'Default'));

  // Use a ref to avoid sending duplicate content — compare key fields only
  const lastKeyRef = useRef('');
  const rafRef = useRef<number>(0);

  // ── Memoize expensive computations ──
  // These only recompute when content changes (song/show/styles), NOT on every index change.
  const { contentType, blocks, style, title, copyright, authors } = useMemo(() => {
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
              .filter((b) => !b.copyright)
              .map((b) => ({
                name: b.name,
                lines: parseSongLines(b.lines || []),
              }));
          }
          break;
        }

        case 'bible_verse': {
          contentType = 'bible_verse';
          const verseText = activeItem.label || activeItem.bibleRef || '';
          blocks = [
            {
              name: activeItem.bibleRef || 'Bible Verse',
              lines: verseText.split('\n').map((text) => {
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
          break;
        }
      }
    }

    // Resolve the three-level style cascade (Global → Show → Item)
    const styles = allStyles ?? [];
    const globalStyle = globalStyleId ? styles.find((s) => s.id === globalStyleId) : undefined;
    const showStyle = currentShow?.styleId ? styles.find((s) => s.id === currentShow.styleId) : undefined;
    const itemStyle = activeItem?.styleId ? styles.find((s) => s.id === activeItem.styleId) : undefined;
    const resolvedCascade = resolveStyleCascade(globalStyle, showStyle, itemStyle, undefined, styles);
    const rawStyle: ResolvedStyle = mergeStyles(DEFAULT_STYLE, resolvedCascade);

    // Resolve relative media paths so presentation windows can load them
    const style: ResolvedStyle = {
      ...rawStyle,
      backgroundImage: resolveMediaUrl(rawStyle.backgroundImage),
      backgroundVideo: resolveMediaUrl(rawStyle.backgroundVideo),
    };

    return { contentType, blocks, style, title, copyright, authors };
  }, [currentSong, activeItem, orderName, allStyles, globalStyleId, currentShow?.styleId]);

  // Keep frequently-changing object refs accessible inside the broadcast effect
  // WITHOUT making them part of its dependency array (would otherwise cause the
  // heavy effect — and IPC broadcast — to fire on every parent re-render).
  const broadcastRef = useRef({
    contentType,
    blocks,
    style,
    title,
    copyright,
    authors,
    activeItem,
    currentShow,
    currentSongNumber,
    orderName,
    nextLinePreview,
    nextLinePreviewColor,
    transitionMode,
    transitionDuration,
  });
  broadcastRef.current = {
    contentType,
    blocks,
    style,
    title,
    copyright,
    authors,
    activeItem,
    currentShow,
    currentSongNumber,
    orderName,
    nextLinePreview,
    nextLinePreviewColor,
    transitionMode,
    transitionDuration,
  };

  // A cheap content-identity hash (changes only when actual style values change).
  const styleHash = useMemo(() => {
    try { return JSON.stringify(style); } catch { return ''; }
  }, [style]);

  useEffect(() => {
    const b = broadcastRef.current;
    if (!b.currentShow) return;

    // Compute next-block preview lines
    let nextBlockPreviewLines: PresentationLine[] | undefined;
    if (b.nextLinePreview && b.blocks.length > 0 && b.contentType === 'song') {
      const nextBlockIndex = activeBlockIndex + 1;
      if (nextBlockIndex < b.blocks.length) {
        const nb = b.blocks[nextBlockIndex];
        if (nb && nb.lines.length > 0) {
          nextBlockPreviewLines = [nb.lines[0]];
        }
      }
    }

    const content: PresentationContent = {
      contentType: b.contentType,
      displayMode: 'normal',
      activeBlockIndex,
      activeLineIndex,
      blocks: b.blocks,
      style: b.style,
      isBlack,
      title: b.title,
      copyright: b.copyright,
      authors: b.authors,
      showCopyright: b.contentType === 'song' && !!b.copyright && activeBlockIndex >= b.blocks.length,
      mediaSubType: b.activeItem?.mediaSubType,
      mediaPath: resolveMediaUrl(b.activeItem?.mediaPath),
      mediaColor: b.activeItem?.mediaColor,
      bibleRef: b.activeItem?.bibleRef,
      bibleTranslation: b.activeItem?.bibleTranslation,
      nextBlockPreviewLines,
      nextLinePreviewColor: b.nextLinePreviewColor,
      transitionMode: b.transitionMode,
      transitionDuration: b.transitionDuration,
    };

    // Deduplicate broadcasts using a lightweight key (includes styleHash so style
    // edits actually re-broadcast and apply immediately).
    const contentKey = `${b.contentType}|${activeItemIndex}|${activeBlockIndex}|${activeLineIndex}|${isBlack}|${b.blocks.length}|${b.nextLinePreview}|${b.nextLinePreviewColor}|${b.activeItem?.mediaPath}|${b.activeItem?.mediaColor}|${styleHash}|${windowStylesSig}`;
    if (contentKey === lastKeyRef.current) return;
    lastKeyRef.current = contentKey;

    // Use requestAnimationFrame to batch rapid navigation into a single broadcast
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      broadcastContent(content);

      // Broadcast musician_sync via WebSocket (Electron only) for musician views
      if (window.api?.wsBroadcast) {
        window.api.wsBroadcast('musician_sync', {
          activeItemIndex,
          activeBlockIndex,
          activeLineIndex,
          songNumber: b.currentSongNumber,
          songTitle: b.title,
          orderName: b.orderName,
          contentType: b.contentType,
        });
      }
    });
  }, [
    activeItemIndex,
    activeBlockIndex,
    activeLineIndex,
    isBlack,
    styleHash,
    // The following primitives change rarely but should still trigger a re-broadcast:
    contentType,
    blocks.length,
    nextLinePreview,
    nextLinePreviewColor,
    windowStylesSig,
  ]);

  // ── Register a per-window style resolver so windows with a configured
  //    preset (styleId) — and active items with per-window overrides — get
  //    their style merged on top of the cascade. ──
  const activeItemRef = useRef(activeItem);
  activeItemRef.current = activeItem;

  useEffect(() => {
    setWindowStyleResolver((_id, config: WindowConfig) => {
      if (!allStyles) return undefined;
      let merged: ResolvedStyle | undefined;

      // Window-level preset
      if (config.styleId) {
        const s = allStyles.find((x) => x.id === config.styleId);
        if (s) {
          const resolved = resolveStyleData(s.data);
          merged = mergeStyles(merged ?? {}, {
            ...resolved,
            backgroundImage: resolveMediaUrl(resolved.backgroundImage),
            backgroundVideo: resolveMediaUrl(resolved.backgroundVideo),
          });
        }
      }

      // Per-item per-window override (highest priority)
      const item = activeItemRef.current;
      const wname = config.name;
      if (item?.itemStyleByWindow && wname && item.itemStyleByWindow[wname] != null) {
        const sid = item.itemStyleByWindow[wname];
        if (sid) {
          const s = allStyles.find((x) => x.id === sid);
          if (s) merged = mergeStyles(merged ?? {}, resolveStyleData(s.data));
        }
      }
      return merged;
    });
    return () => setWindowStyleResolver(undefined);
  }, [allStyles]);

  // ── WebSocket navigation action listener (Electron only, §22.2) ──
  const currentShowRef = useRef(currentShow);
  currentShowRef.current = currentShow;

  useEffect(() => {
    if (!window.api?.onWsNavigationAction) return;

    const handleWsAction = (data: unknown) => {
      const msg = data as { action: string; payload?: Record<string, unknown> };
      const maxItemIndex = (currentShowRef.current?.order?.length ?? 1) - 1;

      switch (msg.action) {
        case 'next_item':
          dispatch(nextItem({ maxIndex: maxItemIndex }));
          break;
        case 'prev_item':
          dispatch(prevItem());
          break;
        case 'next_block':
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

    const cleanup = window.api.onWsNavigationAction(handleWsAction);
    return cleanup;
  }, [dispatch]);

  // ── WebSocket state request handler (Electron only) ──
  // Use refs so the handler always reads current values without re-registering
  const stateRef = useRef({ activeItemIndex, activeBlockIndex, activeLineIndex, isBlack, currentShow });
  stateRef.current = { activeItemIndex, activeBlockIndex, activeLineIndex, isBlack, currentShow };

  useEffect(() => {
    if (!window.api?.onWsGetState) return;

    const handleGetState = () => {
      const s = stateRef.current;
      window.api.sendWsStateResponse({
        activeItemIndex: s.activeItemIndex,
        activeBlockIndex: s.activeBlockIndex,
        activeLineIndex: s.activeLineIndex,
        isBlack: s.isBlack,
        showTitle: s.currentShow?.title,
        itemCount: s.currentShow?.order?.length ?? 0,
      });
    };

    const cleanup = window.api.onWsGetState(handleGetState);
    return cleanup;
  }, []);
};
