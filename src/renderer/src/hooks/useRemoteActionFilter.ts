/**
 * Suppresses accidental repeat triggers of the same remote-control action.
 *
 * Footswitches (and some MIDI pedals) bounce: a single press can emit two events a few
 * dozen milliseconds apart, which reads as a double "next block" and jumps too far. This
 * filter drops a repeat of the SAME action inside the configured window.
 *
 * Deliberately per-action rather than a global cooldown, so pressing two *different*
 * switches in quick succession (e.g. next block then next song) still works.
 *
 * A rejected press does NOT extend the window — holding a switch down blocks for one
 * window and then fires again, instead of being locked out indefinitely.
 */
import { useCallback, useRef } from 'react';
import type { MidiAction } from '@/hooks/useMidi';

/** Upper bound of the configurable window, also the slider maximum. */
export const REMOTE_DEBOUNCE_MAX_MS = 1000;

/**
 * @param windowMs How long the same action stays blocked after firing. 0 disables the filter.
 * @returns `accept(action)` — true when the action should run, false when it is a bounce.
 */
export const useRemoteActionFilter = (windowMs: number) => {
  const lastFiredRef = useRef<Partial<Record<MidiAction, number>>>({});
  // Read via ref so changing the setting never re-creates the callback (which would
  // otherwise re-register the MIDI/keyboard listeners that depend on it).
  const windowRef = useRef(windowMs);
  windowRef.current = windowMs;

  return useCallback((action: MidiAction): boolean => {
    const limit = windowRef.current;
    if (!(limit > 0)) return true;
    const now = Date.now();
    const last = lastFiredRef.current[action];
    if (last != null && now - last < limit) return false;
    lastFiredRef.current[action] = now;
    return true;
  }, []);
};
