/**
 * The live position — item, block, line and the blank/hide switches — kept across an operator
 * reload and a restart.
 *
 * Without it a renderer crash-reload (main process, max 3 a minute) brought the operator back on
 * item 0 with black off, and its first broadcast moved the surviving outputs there: the sermon
 * slide replaced by the first song, a blacked-out screen suddenly lit. ProPresenter's and
 * FreeShow's release notes are full of the same "after relaunch" fixes.
 *
 * sessionStorage survives a reload of the same window; localStorage covers a restart, for
 * RESTART_WINDOW_MS. Both only apply to the show they were written for. Only the operator page
 * writes (see `keepLivePosition`) — the musician window has its own store, always on item 0.
 */
import type { PresentationState } from './presentationSlice';

const KEY = 'presenter_live_position';
const RESTART_WINDOW_MS = 30 * 60 * 1000;

const FIELDS = ['activeItemIndex', 'activeBlockIndex', 'activeLineIndex', 'isBlack', 'isTextHidden', 'videoVisible', 'mediaVisible'] as const;
export type LivePosition = Pick<PresentationState, (typeof FIELDS)[number]>;

type Saved = LivePosition & { show: string; at: number };

/** Title + date: a show has no id of its own on the client. */
export const showIdentity = (show: { title?: string; date?: string } | null | undefined): string =>
  show ? `${show.date ?? ''}|${show.title ?? ''}` : '';

/** The persisted show (showSlice's key), read without importing the slice. */
function persistedShowIdentity(): string {
  try {
    return showIdentity(JSON.parse(localStorage.getItem('presenter_show') || '{}').currentShow);
  } catch {
    return '';
  }
}

function read(storage: Storage | undefined, maxAge: number): Saved | null {
  try {
    const saved = JSON.parse(storage?.getItem(KEY) || 'null') as Saved | null;
    if (!saved || typeof saved.activeItemIndex !== 'number' || Date.now() - saved.at > maxAge) return null;
    return saved;
  } catch {
    return null;
  }
}

/** What to start with: the reload copy first, else a recent restart copy — for the open show only. */
export function restoreLivePosition(): Partial<LivePosition> {
  const saved = read(globalThis.sessionStorage, Infinity) ?? read(globalThis.localStorage, RESTART_WINDOW_MS);
  if (!saved || !saved.show || saved.show !== persistedShowIdentity()) return {};
  const restored: Partial<LivePosition> = {};
  for (const field of FIELDS) {
    if (typeof saved[field] === (field.startsWith('active') ? 'number' : 'boolean')) {
      (restored as Record<string, unknown>)[field] = saved[field];
    }
  }
  return restored;
}

/**
 * Write the position whenever it changes. A store subscription, not a hook, so the operator view
 * does not re-render for it. Returns the unsubscribe.
 */
export function keepLivePosition(store: {
  getState: () => { presentation: PresentationState; show: { currentShow: { title?: string; date?: string } | null } };
  subscribe: (listener: () => void) => () => void;
}): () => void {
  let last = '';
  const write = () => {
    const { presentation, show } = store.getState();
    const identity = showIdentity(show.currentShow);
    if (!identity) return;
    const position = Object.fromEntries(FIELDS.map((field) => [field, presentation[field]]));
    const key = identity + JSON.stringify(position);
    if (key === last) return;
    last = key;
    const value = JSON.stringify({ ...position, show: identity, at: Date.now() });
    try {
      sessionStorage.setItem(KEY, value);
      localStorage.setItem(KEY, value);
    } catch {
      // Storage full or blocked: the position simply is not kept — never break the live view for it.
    }
  };
  write();
  const unsubscribe = store.subscribe(write);
  // A sermon can sit on one slide longer than the restart window: refresh the timestamp meanwhile.
  const heartbeat = setInterval(() => {
    last = '';
    write();
  }, 60_000);
  return () => {
    unsubscribe();
    clearInterval(heartbeat);
  };
}
