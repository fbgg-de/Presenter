import { useSyncExternalStore } from 'react';
import { advanceCue, commandCue, initialTransport } from './engine';
import { mediaId, type CuePacket, type CueCommand, type MediaCue } from './types';

let packet: CuePacket | undefined;
let last = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());
export const getCuePacket = () => packet;
export const subscribeCue = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export const useCuePacket = () => useSyncExternalStore(subscribeCue, getCuePacket, getCuePacket);

export function configureCue(cue: MediaCue | undefined, showIdentity: string) {
  if (!cue) {
    if (packet) {
      packet = undefined;
      notify();
    }
    return;
  }
  const identity = `${showIdentity}/${cue.id}`;
  if (packet?.transport.session.startsWith(identity + '/')) {
    if (packet.cue === cue) return;
    // Live mute/unmute must not interrupt the shared video transport.
    if (JSON.stringify({ ...packet.cue, audioEnabled: undefined }) === JSON.stringify({ ...cue, audioEnabled: undefined })) {
      tickCue();
      packet = { ...packet, cue };
      notify();
      return;
    }
    // Preparation changes are published atomically, with transport held for review.
    packet = {
      cue,
      at: Date.now(),
      transport: {
        ...commandCue(cue, packet.transport, { type: 'pause' }),
        activeLoop: undefined,
        nextLoop: undefined,
        exitLoop: false,
        time: Math.min(packet.transport.time, cue.duration),
        enabled: {},
        bypass: [],
      },
    };
  } else packet = { cue, at: Date.now(), transport: initialTransport(identity + '/' + mediaId()) };
  last = performance.now();
  notify();
}
export function tickCue() {
  if (!packet) return;
  const now = performance.now();
  const transport = advanceCue(packet.cue, packet.transport, Math.max(0, (now - last) / 1000));
  last = now;
  if (!packet.transport.playing) return;
  packet = { ...packet, transport, at: Date.now() };
  notify();
}
export function sendCueCommand(command: CueCommand): boolean {
  if (!packet) return false;
  tickCue();
  packet = { ...packet, transport: commandCue(packet.cue, packet.transport, command), at: Date.now() };
  last = performance.now();
  notify();
  return true;
}
