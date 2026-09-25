/**
 * The media a preview of one agenda entry shows on one screen group, without touching the live
 * outputs: the entry itself when it is an image or video (on a clock of its own), and behind a
 * song or verse the background it would have — the one running there if it comes from the same
 * agenda group, else that group's first background, else whatever keeps running.
 */
import type { Show } from '@/api/shows.api';
import type { ScreenGroupEntity } from '@/screens/types';
import { DEFAULT_GROUP_ID } from '@/utils/showGroups';
import { initialTransport, commandCue } from './engine';
import { activeVersionOf, assignmentFor, mediaItemDataOf } from './mediaItem';
import { mediaForScreen, screenKeyOf, type Playback } from './playback';
import { playbackEntryFor } from './useMediaHost';
import type { CuePacket } from './types';

/** A video whose length is not known yet plays on until its file ends. */
const UNKNOWN_LENGTH = 24 * 60 * 60;

function previewPacket(show: Show, index: number, groupId: number | undefined, groups: ScreenGroupEntity[], startedAt: number) {
  const entry = playbackEntryFor(show.order[index], index, groups);
  if (!entry || !entry.screens.includes(screenKeyOf(groupId))) return undefined;
  const assignment = assignmentFor(entry.cue, groupId);
  if (!assignment?.sourceId) return undefined;
  const hasVideo = entry.cue.sources.some((source) => source.type === 'video');
  const plays = hasVideo || !!entry.cue.slideshow;
  const cue = hasVideo && entry.cue.duration <= 0 ? { ...entry.cue, duration: UNKNOWN_LENGTH } : entry.cue;
  let transport = initialTransport(`preview/${entry.key}/${startedAt}`);
  if (plays) transport = commandCue(cue, transport, { type: 'play' });
  const packet: CuePacket = { cue, transport, at: startedAt, assignment, visible: true, fadeMs: 0 };
  return { role: entry.role, packet };
}

export function previewMedia(args: {
  show: Show | null | undefined;
  itemIndex: number;
  groupId: number | undefined;
  groups: ScreenGroupEntity[];
  playbacks: Playback[];
  /** When the preview of this entry started, for its own clock. */
  startedAt: number;
}): { background?: CuePacket; contents: CuePacket[] } | undefined {
  const { show, itemIndex, groupId, groups, playbacks, startedAt } = args;
  const item = show?.order?.[itemIndex];
  if (!show || !item) return undefined;
  const agendaGroupId = item.groupId ?? DEFAULT_GROUP_ID;
  const live = mediaForScreen(playbacks, groupId, { backgroundVisible: true });
  const liveBackground = live.background && playbacks.find((p) => p.transport.session === live.background!.transport.session);

  const own = mediaItemDataOf(item) ? previewPacket(show, itemIndex, groupId, groups, startedAt) : undefined;
  if (own?.role === 'content') return { contents: [own.packet], background: liveBackground ? live.background : undefined };
  if (own?.role === 'background') return { background: own.packet, contents: [] };

  if (liveBackground?.agendaGroupId === agendaGroupId) return { background: live.background, contents: [] };
  for (let index = 0; index < show.order.length; index++) {
    const candidate = show.order[index];
    const data = mediaItemDataOf(candidate);
    if ((candidate.groupId ?? DEFAULT_GROUP_ID) !== agendaGroupId || data?.role !== 'background') continue;
    if (!assignmentFor(activeVersionOf(data), groupId)?.sourceId) continue;
    const packet = previewPacket(show, index, groupId, groups, startedAt);
    if (packet) return { background: packet.packet, contents: [] };
  }
  return live.background ? { background: live.background, contents: [] } : undefined;
}
