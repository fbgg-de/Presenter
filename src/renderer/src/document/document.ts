/**
 * Document entries (PDF, PowerPoint) as the agenda and navigation see them.
 *
 * A document steps like a song: every page is a slide, and every click build on a page (an
 * animation PowerPoint plays on click) is one more step after it. The builds per page are read
 * from the file when it is opened and stored on the entry (`ShowItem.documentBuilds`), so the
 * keyboard, remote and screens can count without opening the file themselves.
 */

import type { ShowItem } from '@/api/shows.api';
import type { TranslationFunctions } from '@/i18n/i18n-types';

export type DocumentKind = 'pdf' | 'pptx';

/** PDF or PowerPoint by file name; `.ppsx` is a PowerPoint show, the same format. */
export function documentKindOf(name: string): DocumentKind | undefined {
  if (/\.pdf$/i.test(name)) return 'pdf';
  if (/\.(pptx|ppsx)$/i.test(name)) return 'pptx';
  return undefined;
}

/** The format's name as people know it — a brand, the same in every language. */
export const documentKindName = (kind: DocumentKind | undefined): string => (kind === 'pptx' ? 'PowerPoint' : 'PDF');

/** "PowerPoint · 12 slides · 2 hidden", "PDF · 8 pages"; the count is known once the entry was opened. */
export const documentSummary = (LL: TranslationFunctions, item: ShowItem): string => {
  const kind = documentKindOf(item.mediaPath ?? '');
  const count = item.documentBuilds?.length;
  const pages = count ? (kind === 'pptx' ? LL.DOCUMENT.SLIDES({ count }) : LL.DOCUMENT.PAGES({ count })) : '';
  const hidden = count ? (item.documentHidden ?? []).filter((page) => page < count).length : 0;
  return [documentKindName(kind), pages, hidden ? LL.DOCUMENT.HIDDEN_COUNT({ count: hidden }) : ''].filter(Boolean).join(' · ');
};

export interface DocumentStep {
  page: number;
  /** Click builds shown so far on the page: 0 = the page as it enters. */
  step: number;
}

/**
 * Every step of a document in order: each page, then each of its builds. A document not read yet
 * (`builds` undefined) counts as a single page, so it can still be sent before it has loaded.
 * `hidden` pages are left out — all of them at once never, that would leave nothing to show.
 */
export function documentSteps(builds: readonly number[] | undefined, hidden?: readonly number[]): DocumentStep[] {
  const pages = builds?.length ? builds : [0];
  const all = pages.map((_, page) => page);
  const shown = all.filter((page) => !hidden?.includes(page));
  return (shown.length ? shown : all).flatMap((page) =>
    Array.from({ length: Math.max(0, pages[page]) + 1 }, (_, step) => ({ page, step })),
  );
}

/** A step's short name: "3" for page 3 as it enters, "3.2" after its second build. */
export const documentStepName = ({ page, step }: DocumentStep): string => (step ? `${page + 1}.${step}` : String(page + 1));

/** Seconds a page stays when it turns by itself and the file gives it no time of its own. */
export const DOCUMENT_SECONDS_DEFAULT = 8;

/**
 * Which pages turn by themselves (`armed`, none until set), whether that is held for now, how long
 * a page without a time of its own stays, and whether the last one goes back to the first.
 */
export const documentAdvanceOf = (item: ShowItem | undefined) => ({
  running: !item?.documentAdvance?.paused,
  armed: item?.documentAdvance?.armed ?? [],
  seconds: item?.documentAdvance?.seconds ?? DOCUMENT_SECONDS_DEFAULT,
  loop: !!item?.documentAdvance?.loop,
});

/** How long a page stays before it turns, ms: its own time from the file, else the entry's seconds. At least a second. */
export const documentPageMs = (item: ShowItem, page: number): number =>
  Math.max(1000, item.documentTimings?.[page] ?? documentAdvanceOf(item).seconds * 1000);

/**
 * How long each step stays before the next one comes by itself, ms; null where it waits for the
 * operator (its page is not armed). A page with builds waits that long before each of them, the way
 * PowerPoint's timer stands in for the click.
 */
export function documentStepDurations(item: ShowItem): (number | null)[] {
  const { armed } = documentAdvanceOf(item);
  return documentSteps(item.documentBuilds, item.documentHidden).map(({ page }) =>
    armed.includes(page) ? documentPageMs(item, page) : null,
  );
}

/**
 * Whether the deck's pages show their auto-turn at all: once one is armed or the file times any.
 * Before that most decks are turned by hand, and the chips stay out of the way.
 */
export const documentArmingShown = (item: ShowItem): boolean =>
  documentAdvanceOf(item).armed.length > 0 || !!item.documentTimings?.some((ms) => ms !== null);

/** A page's auto-turn as a tooltip: its time, where the time comes from, and what a click does. */
export const documentArmHint = (LL: TranslationFunctions, item: ShowItem, page: number): string => {
  const D = LL.DOCUMENT;
  const seconds = Math.round(documentPageMs(item, page) / 1000);
  const own = item.documentTimings?.[page] != null;
  const armed = documentAdvanceOf(item).armed.includes(page);
  return [
    own ? `${D.ADVANCE_AFTER({ seconds })} · ${D.ADVANCE_FILE()}` : D.ADVANCE_AFTER({ seconds }),
    armed ? D.ADVANCE_ARMED() : D.ADVANCE_DISARMED(),
  ].join('\n');
};

/** The first step (block index) of a page; -1 for a hidden one. */
export function documentBlockOfPage(builds: readonly number[] | undefined, page: number, hidden?: readonly number[]): number {
  return documentSteps(builds, hidden).findIndex((s) => s.page === page);
}
