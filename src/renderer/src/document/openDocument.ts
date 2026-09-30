/**
 * Opening a document file for the screens or the operator's cards. The renderers are loaded on
 * first use only — the PowerPoint one is several megabytes and most services never need it.
 */
import type { DocumentKind } from './document';

export interface OpenedDocument {
  /** Click builds per page (0 for a page without any). */
  builds: number[];
  /** Page width / height. */
  aspect: number;
  /** Speaker notes per page ('' for none; always empty for a PDF). */
  notes: string[];
  /** Fonts the file uses that this computer does not have (a PDF carries its own). */
  missingFonts: string[];
  /** How long each page stays by the file's own timing, ms (PowerPoint's "After"); null for none. */
  timings: (number | null)[];
  /** The file's slide show loops and turns pages by its timings (PowerPoint's set-up); false for a PDF. */
  loops: boolean;
  usesTimings: boolean;
  /** Draws a page, fully built, into `target`, fitted to it (operator cards). */
  drawPage(page: number, target: HTMLElement): Promise<void>;
  /**
   * Shows a page at a build step in the host the document was opened in (screens). One step
   * forward animates; anything else jumps there.
   */
  show(page: number, step: number): void;
  /** Stops what plays (video, sound, the show); the next `show` starts its page afresh. */
  park(): void;
  destroy(): void;
}

/** Opens `url` into `host`: visible for a screen, an off-screen element for thumbnails only. */
async function openDocument(kind: DocumentKind, url: string, host: HTMLElement): Promise<OpenedDocument> {
  const { open } = kind === 'pdf' ? await import('./pdfDocument') : await import('./pptxDocument');
  return open(url, host);
}

/** Loads the PowerPoint renderer ahead of time, so the first deck opens without waiting for it. */
export const preloadPptxRenderer = () => void import('./pptxDocument').catch(() => {});

export interface DocumentLease {
  /** Where the document draws. It starts out hidden; a screen moves it into its own box. */
  host: HTMLElement;
  opened: Promise<OpenedDocument>;
  /** Done with it for now: kept, and parked once nobody in this window uses it. */
  release(): void;
}

interface Kept {
  host: HTMLElement;
  opened: Promise<OpenedDocument>;
  /** Leases not released yet. One screen shows it; any number draw its pages (cards, stage). */
  users: number;
}

/** Documents this window opened, least recently used first. */
const kept = new Map<string, Kept>();
/** How many stay open: a PowerPoint holds its slides and pictures in memory. */
const KEEP = 3;

/**
 * Hosts wait here, the size of the window and invisible, so a document laid out while parked
 * looks the same the moment a screen takes it.
 */
let parking: HTMLElement | undefined;
function park(host: HTMLElement) {
  if (!parking) {
    parking = document.createElement('div');
    parking.style.cssText = 'position:fixed;inset:0;visibility:hidden;pointer-events:none;overflow:hidden;z-index:-1';
    document.body.appendChild(parking);
  }
  parking.appendChild(host);
}

/**
 * The document at `url` — the copy this window already has open (shared: drawing pages never
 * disturbs a screen showing it), or a new one. A screen shows it by moving `host` into its box.
 */
export function takeDocument(kind: DocumentKind, url: string): DocumentLease {
  const key = `${kind} ${url}`;
  let entry = kept.get(key);
  if (entry) kept.delete(key);
  else {
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center';
    park(host);
    const opened = openDocument(kind, url, host);
    const created: Kept = { host, opened, users: 0 };
    // A file that failed is tried again next time.
    opened.catch(() => {
      if (kept.get(key) === created) kept.delete(key);
      host.remove();
    });
    entry = created;
  }
  kept.set(key, entry);
  const taken = entry;
  taken.users++;
  let released = false;
  return {
    host: taken.host,
    opened: taken.opened,
    release() {
      if (released) return;
      released = true;
      if (--taken.users > 0) return;
      park(taken.host);
      void taken.opened.then(
        (doc) => taken.users === 0 && doc.park(),
        () => {},
      );
      for (const [other, old] of kept) {
        if (kept.size <= KEEP) break;
        if (old.users > 0) continue;
        kept.delete(other);
        old.host.remove();
        void old.opened.then(
          (doc) => doc.destroy(),
          () => {},
        );
      }
    },
  };
}

/** Opens `url` now and keeps it, so the screen that needs it later finds it ready. */
export function warmDocument(kind: DocumentKind, url: string) {
  takeDocument(kind, url).release();
}
