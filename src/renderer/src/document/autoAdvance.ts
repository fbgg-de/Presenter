/**
 * Pages that turn by themselves. While the live entry is a PDF or PowerPoint, the operator's app
 * moves it on when an armed page's time is up — the same step a key press makes, so every
 * screen, the remote and Companion follow as usual and no screen ever runs ahead on its own.
 *
 * Any step, by hand or by time, starts the time of the new step afresh. The layer bar reads the
 * step's clock from here to show when the next turn comes.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { useAppDispatch } from '@/store';
import { setActiveBlockFromMedia, useGetPresentationSettings } from '@/store/presentationSlice';
import { updateShowItem, useGetShow } from '@/store/showSlice';
import type { ShowItem } from '@/api/shows.api';
import { documentAdvanceOf, documentStepDurations } from './document';

export interface AdvanceClock {
  /** The show entry and step the clock belongs to. */
  itemIndex: number;
  block: number;
  /** When the step went on screen (ms since epoch). */
  startedAt: number;
  /** When the next step goes on — undefined while the step waits for the operator, or on the last page without loop. */
  dueAt?: number;
}

let clock: AdvanceClock | undefined;
const listeners = new Set<() => void>();
const publish = (next: AdvanceClock | undefined) => {
  clock = next;
  listeners.forEach((listener) => listener());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The live document's step clock (undefined when the live entry is not a document). */
export const useAdvanceClock = () => useSyncExternalStore(subscribe, () => clock);

/**
 * A document entry's armed pages and switching them: one page (its cards, its chips in the layer
 * bar's slides row), or every page at once. Counts leave out the pages left out of the show.
 */
export function useDocumentArming(item: ShowItem | undefined, itemIndex: number) {
  const dispatch = useAppDispatch();
  const { armed } = documentAdvanceOf(item);
  const pages = (item?.documentBuilds ?? [0]).map((_, page) => page);
  const shown = pages.filter((page) => !item?.documentHidden?.includes(page));
  const set = (next: number[]) =>
    item && dispatch(updateShowItem({ index: itemIndex, item: { documentAdvance: { ...item.documentAdvance, armed: next } } }));
  return {
    armed,
    armedCount: shown.filter((page) => armed.includes(page)).length,
    shownCount: shown.length,
    toggle: (page: number) => set(armed.includes(page) ? armed.filter((p) => p !== page) : [...armed, page].sort((a, b) => a - b)),
    armAll: () => set(pages),
    disarmAll: () => set([]),
  };
}

/** Turns the live document's pages when their time is up. Mounted once, in the operator. */
export function useDocumentAutoAdvance() {
  const dispatch = useAppDispatch();
  const { activeItemIndex, activeBlockIndex } = useGetPresentationSettings('activeItemIndex', 'activeBlockIndex');
  const { currentShow } = useGetShow();
  const item = currentShow?.order[activeItemIndex];
  const durations = item?.type === 'document' ? documentStepDurations(item) : [];
  const { running, loop } = documentAdvanceOf(item);
  // Everything the timer depends on, as one value: a new list every render must not restart it.
  const plan = item?.type === 'document' ? JSON.stringify([running, loop, durations]) : '';

  useEffect(() => {
    if (!plan) return publish(undefined);
    const [on, loops, times] = JSON.parse(plan) as [boolean, boolean, (number | null)[]];
    const ms = times[activeBlockIndex];
    const next = activeBlockIndex + 1 < times.length ? activeBlockIndex + 1 : loops && times.length > 1 ? 0 : undefined;
    const startedAt = Date.now();
    const due = on && next !== undefined && ms != null;
    publish({ itemIndex: activeItemIndex, block: activeBlockIndex, startedAt, dueAt: due ? startedAt + ms : undefined });
    if (!due) return;
    // Not the operator's own step: a slide picked for the preview stays picked.
    const timer = setTimeout(() => dispatch(setActiveBlockFromMedia(next)), ms);
    return () => clearTimeout(timer);
  }, [plan, activeItemIndex, activeBlockIndex, dispatch]);
}
