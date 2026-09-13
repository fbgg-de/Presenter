import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppDispatch } from '@/store';
import { setActiveBlockFromMedia, useGetPresentationSettings } from '@/store/presentationSlice';
import { useGetWindows } from '@/store/windowSlice';
import { resolveMediaUrl } from '@/utils/mediaUrl';
import { setWindowCueResolver } from '@/utils/presentationBridge';
import type { PresentationBlock } from '@/presentation/types';
import type { Show, ShowItem } from '@/api/shows.api';
import type { CuePacket } from './types';
import { contains, lyricAt, lyricOccurrences, validateCue } from './engine';
import { configureCue, getCuePacket, sendCueCommand, subscribeCue, tickCue } from './runtime';

export function useMediaCueHost(show: Show | null, item: ShowItem | undefined, blocks: PresentationBlock[]) {
  const dispatch = useAppDispatch();
  const nav = useGetPresentationSettings();
  const { windowConfigs } = useGetWindows();
  const storedCue = show?.mediaCues?.find((c) => c.id === item?.mediaCue?.cueId);
  const cue = useMemo(() => (storedCue && !validateCue(storedCue) ? storedCue : undefined), [storedCue]);
  const resolvedCue = useMemo(
    () => cue && { ...cue, sources: cue.sources.map((s) => ({ ...s, path: resolveMediaUrl(s.path) || s.path })) },
    [cue],
  );
  const [packet, setPacket] = useState<CuePacket>();
  const context = useRef({ item, blocks, nav });
  context.current = { item, blocks, nav };
  useEffect(() => {
    let lastPublish = 0,
      previousRevision = -1,
      wasPlaying = false;
    const update = () => {
      const p = getCuePacket();
      const now = Date.now();
      if (!p || now - lastPublish >= 250 || p.transport.revision !== previousRevision || wasPlaying !== p.transport.playing) {
        setPacket(p);
        lastPublish = now;
        previousRevision = p?.transport.revision ?? -1;
        wasPlaying = p?.transport.playing ?? false;
      }
      const { item: active, blocks: currentBlocks, nav: navigation } = context.current;
      const binding = active?.mediaCue;
      if (!p || !binding?.followVideo || binding.cueId !== p.cue.id) return;
      const arrangement = lyricOccurrences(currentBlocks);
      if (binding.arrangement !== arrangement.signature) return;
      const section = lyricAt(p.cue, p.transport.time, binding.lyrics);
      const target = section && binding.lyrics[section.id];
      const index = target === 'clear' ? -1 : arrangement.blocks.find((b) => b.id === target)?.index;
      if (index !== undefined && index !== navigation.activeBlockIndex) dispatch(setActiveBlockFromMedia(index));
    };
    const cleanup = subscribeCue(update);
    const timer = setInterval(tickCue, 30);
    update();
    return () => {
      cleanup();
      clearInterval(timer);
      configureCue(undefined, '');
    };
  }, [dispatch]);
  useEffect(() => {
    configureCue(resolvedCue, show?.title ?? '');
    setPacket(getCuePacket());
  }, [resolvedCue, show?.title]);
  useEffect(() => {
    if (nav.blockChangeOrigin !== 'operator') return;
    const binding = item?.mediaCue,
      p = getCuePacket();
    if (!binding?.followLyrics || !p || binding.cueId !== p.cue.id) return;
    const arrangement = lyricOccurrences(blocks);
    if (binding.arrangement !== arrangement.signature) return;
    const id = arrangement.blocks[nav.activeBlockIndex]?.id;
    if (!id) return;
    const matches = p.cue.regions.filter((s) => s.kind !== 'pause' && binding.lyrics[s.id] === id).sort((a, b) => a.start - b.start);
    const target = matches.find((s) => contains(s, p.transport.time)) ?? matches.find((s) => s.start >= p.transport.time) ?? matches[0];
    if (target) sendCueCommand({ type: 'seek', time: target.start, navigate: true });
    // A deliberate navigation revision triggers this, not media-driven lyric updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.blockChangeRevision]);
  useEffect(() => {
    setWindowCueResolver((id, content) => {
      const config = windowConfigs.find((c) => c._runtimeId === id);
      const p = content.mediaCue;
      if (!p || !config?.mediaRole) return undefined;
      // A role has exactly one local owner, for visual placement.
      if (windowConfigs.find((c) => c.mediaRole === config.mediaRole)?.id !== config.id) return undefined;
      const assignment = p.cue.assignments.find((a) => a.role === config.mediaRole);
      return assignment ? { ...p, assignment, visible: nav.videoVisible && !config.hideBackground } : undefined;
    });
    return () => setWindowCueResolver(undefined);
  }, [windowConfigs, nav.videoVisible]);
  return packet?.cue.id === cue?.id ? packet : undefined;
}
