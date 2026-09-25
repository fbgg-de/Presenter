/**
 * Monitors Redux presentation state and broadcasts a `state_update` payload
 * to all connected WS clients whenever navigation state changes.
 * This covers changes triggered by the operator UI, keyboard, MIDI, and WS commands.
 *
 * The WS command hook sets `wsActionTrigger` before dispatching so the last/active
 * action names are included in the broadcast.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useAppSelector } from '@/store';
import { useGetPresentationSettings } from '@/store/presentationSlice';
import { selectCurrentSongOrder, useGetSongs } from '@/store/songsSlice';
import { useGetShow } from '@/store/showSlice';
import { versePages } from '@/utils/itemBlocks';
import { sectionColor } from '@/utils/sectionColor';
import { mediaItemLabel } from '@/media/mediaItem';
import type { ShowItem } from '@/api/shows.api';
import type { ISong } from '@/song';
import { useGetSettings } from '@/store/settingsSlice';
import { useStageStatus } from '@/hooks/useStageEngine';
import { resolveCue } from '@/stage/types';
import { useMasterRate, usePlaybackClock, usePlaybacks } from '@/media/playback';
import { focusedPlayback } from '@/media/mediaControls';
import { rateOf } from '@/media/engine';
import { useReadiness } from '@/components/operator/ReadinessChip';

/**
 * Everything beyond slide navigation a Companion button can show: modes and layer eyes, stage
 * layers with their timers, the focused media entry's clock, and the readiness checks.
 *
 * Clocks go out as anchors, not as ticking values — the module counts locally — so `key` changes
 * only when something a button shows actually changes, not every frame a video plays.
 */
const useCompanionExtras = () => {
  const { operatorMode, uiLanguage } = useGetSettings('operatorMode', 'uiLanguage');
  const { previewTarget, videoVisible, mediaVisible } = useGetPresentationSettings('previewTarget', 'videoVisible', 'mediaVisible');
  const stage = useStageStatus();
  const playbacks = usePlaybacks();
  // The media clock resyncs the module every five seconds (see `key`).
  const clock = usePlaybackClock();
  const masterRate = useMasterRate();
  const checks = useReadiness(0);

  return useMemo(() => {
    const focused = playbacks.length ? focusedPlayback() : undefined;
    const t = focused?.transport;
    const media =
      focused && t ? { label: focused.label, playing: t.playing, time: t.time, duration: focused.cue.duration, rate: rateOf(t) } : null;
    const stageLayers = stage.statuses.map((s) => {
      const wire = s.cue && s.started && !s.finished ? resolveCue(s.cue, s, uiLanguage || 'en') : null;
      return {
        id: s.layer.id,
        name: s.layer.name,
        cueName: s.cue && s.started ? s.cue.name || (s.cue.kind === 'message' ? s.cue.text : s.cue.kind) : '',
        cueIndex: s.cueIndex,
        cueCount: s.cueCount,
        paused: s.paused,
        hidden: s.hidden,
        started: s.started,
        finished: s.finished,
        timer:
          wire?.kind === 'timer'
            ? {
                direction: wire.direction,
                anchor: wire.anchor,
                frozenAt: wire.frozenAt ?? null,
                clampAtZero: wire.clampAtZero,
                warnSec: wire.warnSec ?? null,
                dangerSec: wire.dangerSec ?? null,
              }
            : null,
      };
    });
    const extras = {
      operatorMode,
      previewPending: !!previewTarget,
      videoVisible,
      mediaVisible,
      stageHidden: stage.allHidden,
      stageLayers,
      media,
      ready: checks.every((c) => c.ok),
      readinessIssues: checks.filter((c) => !c.ok).map((c) => c.label),
      masterRate,
    };
    // A playing clock moves every tick: only its state, and a 5-second step (which also catches
    // a loop jumping back), count as a change.
    const mediaKey =
      focused && t ? [focused.key, t.playing, t.pausedAt, t.activeLoop, t.revision, rateOf(t), Math.floor(t.time / 5)].join('|') : '';
    return { extras, key: JSON.stringify({ ...extras, media: mediaKey }) };
  }, [operatorMode, uiLanguage, previewTarget, videoVisible, mediaVisible, stage, playbacks, clock, checks, masterRate]);
};

/** What an agenda entry is called on a Companion button. */
const itemTitle = (item: ShowItem | undefined, songs: Record<number, ISong>): string => {
  if (!item) return '';
  if (item.type === 'song')
    return (item.songNumber != null ? songs[item.songNumber]?.title : undefined) ?? item.label ?? `#${item.songNumber ?? ''}`;
  if (item.type === 'bible_verse') return item.bibleRef || item.label || '';
  return mediaItemLabel(item);
};

/** Shared mutable trigger set by useWsCompanionCommands before each dispatch. */
export const wsActionTrigger = {
  pending: '',
};

const ACTIVE_ACTION_RESET_MS = 400;

export const useBroadcastCompanionState = () => {
  const { activeItemIndex, activeBlockIndex, activeLineIndex, isBlack, isTextHidden } = useGetPresentationSettings(
    'activeItemIndex',
    'activeBlockIndex',
    'activeLineIndex',
    'isBlack',
    'isTextHidden',
  );
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
  const orderName = useAppSelector((state) => (currentSongNumber != null ? selectCurrentSongOrder(state, currentSongNumber) : 'Default'));

  const showItemCount = currentShow?.order?.length ?? songsOrder.length;
  const { extras, key: extrasKey } = useCompanionExtras();

  // Stable ref for broadcast metadata
  const lastTriggeredActionRef = useRef('');
  const activeActionRef = useRef('');
  const activeActionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ref bundle for non-reactive values needed in the broadcast
  const ctxRef = useRef({
    activeItemIndex,
    activeBlockIndex,
    activeLineIndex,
    isBlack,
    isTextHidden,
    songsOrder,
    songs,
    orderName,
    showItemCount,
    currentShow,
    extras,
  });
  ctxRef.current = {
    activeItemIndex,
    activeBlockIndex,
    activeLineIndex,
    isBlack,
    isTextHidden,
    songsOrder,
    songs,
    orderName,
    showItemCount,
    currentShow,
    extras,
  };

  // Stable broadcast function — always reads latest state from ctxRef
  const doBroadcast = useCallback((overrideActiveAction?: string) => {
    if (!window.api?.wsBroadcastState) return;
    const s = ctxRef.current;

    const showItem = s.currentShow?.order?.[s.activeItemIndex];
    // Resolve the song via the show item — songsOrder indices don't line up with
    // activeItemIndex when the show contains non-song items.
    const songNum = showItem ? (showItem.type === 'song' ? showItem.songNumber : undefined) : s.songsOrder[s.activeItemIndex];
    const song = songNum != null ? s.songs[songNum] : undefined;
    // Verse pages count as blocks, like song sections.
    const nonCopyrightBlocks = song
      ? song.getBlocks(s.orderName).filter((b) => !b.copyright)
      : showItem?.type === 'bible_verse'
        ? versePages(showItem)
        : [];
    const activeBlock = nonCopyrightBlocks[s.activeBlockIndex];
    const nextBlock = nonCopyrightBlocks[s.activeBlockIndex + 1];

    window.api.wsBroadcastState({
      lastTriggeredAction: lastTriggeredActionRef.current,
      activeAction: overrideActiveAction !== undefined ? overrideActiveAction : activeActionRef.current,
      itemIndex: s.activeItemIndex,
      blockIndex: s.activeBlockIndex,
      lineIndex: s.activeLineIndex,
      isBlack: s.isBlack,
      isTextHidden: s.isTextHidden,
      showTitle: s.currentShow?.title ?? '',
      showItemCount: s.showItemCount,
      songTitle: song?.title ?? '',
      songNumber: songNum ?? null,
      blockName: activeBlock?.name ?? '',
      nextBlockName: nextBlock?.name ?? '',
      blockCount: nonCopyrightBlocks.length,
      showItemType: showItem?.type ?? '',
      orderName: s.orderName,
      itemTitle: itemTitle(showItem, s.songs),
      nextItemTitle: itemTitle(s.currentShow?.order?.[s.activeItemIndex + 1], s.songs),
      // For the Companion module's generated buttons: one per agenda entry, one per section.
      items: (s.currentShow?.order ?? []).map((item) => ({ title: itemTitle(item, s.songs), type: item.type })),
      blocks: nonCopyrightBlocks.map((b) => ({ name: b.name, color: sectionColor(b.name) })),
      ...s.extras,
      // Presenter's clock at sending, so the module can correct timer anchors for its own.
      sentAt: Date.now(),
    });
  }, []); // stable — reads everything via refs

  // Broadcast whenever any tracked presentation state changes
  useEffect(() => {
    // Consume any pending WS/MIDI action trigger
    if (wsActionTrigger.pending) {
      lastTriggeredActionRef.current = wsActionTrigger.pending;
      activeActionRef.current = wsActionTrigger.pending;
      wsActionTrigger.pending = '';

      // Schedule reset of activeAction
      if (activeActionTimerRef.current) clearTimeout(activeActionTimerRef.current);
      activeActionTimerRef.current = setTimeout(() => {
        activeActionRef.current = '';
        doBroadcast('');
      }, ACTIVE_ACTION_RESET_MS);
    }

    doBroadcast();
  }, [
    activeItemIndex,
    activeBlockIndex,
    activeLineIndex,
    isBlack,
    isTextHidden,
    songsOrder,
    songs,
    currentShow,
    orderName,
    extrasKey,
    doBroadcast,
  ]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (activeActionTimerRef.current) clearTimeout(activeActionTimerRef.current);
    };
  }, []);
};
