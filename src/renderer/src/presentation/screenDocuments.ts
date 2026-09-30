/** Documents in a screen window: its input kept away from them, and files opened ahead of time. */
import { warmDocument } from '@/document/openDocument';
import type { PresentationContent } from './types';

/** Everything that could step the PowerPoint show on its own. Double-click stays: it toggles fullscreen. */
const INPUT_EVENTS = [
  'keydown',
  'keyup',
  'keypress',
  'click',
  'mousedown',
  'mouseup',
  'pointerdown',
  'pointerup',
  'wheel',
  'contextmenu',
  'touchstart',
  'touchend',
];
const swallow = (event: Event) => event.stopImmediatePropagation();

let blocked = false;
/**
 * The show must move only when the operator steps it: an arrow key after a stray click on this
 * window (or on the operator's preview of it) would otherwise step this one screen out of line.
 * The screen page takes no input of its own, so this stays for the window's life. It must come
 * before the first document opens: listeners on the window run in the order they were added.
 */
export function blockScreenInput() {
  if (blocked) return;
  blocked = true;
  for (const type of INPUT_EVENTS) window.addEventListener(type, swallow, true);
}

/** Opens the documents the operator expects next, so they are ready when they go live. */
export function warmDocuments(files: PresentationContent['documentsAhead']) {
  if (!files?.length) return;
  blockScreenInput();
  for (const file of files) warmDocument(file.kind, file.url);
}
