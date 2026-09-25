/**
 * Signing in again without leaving the page (web version). When the session runs out during a
 * service, sending the operator view to the login page would drop everything on it; instead the
 * sign-in runs in a small window. With a live session at the identity provider it finishes by
 * itself in a moment, the window tells this page and closes, and the page reloads its data.
 *
 * The desktop app cannot do this: only its main window catches the sign-in callback, so it keeps
 * the full-page login.
 */
import { isElectronApp } from '@/utils';

/** What the sign-in window posts to the page that opened it once the new session exists. */
export const RELOGIN_DONE_MESSAGE = 'presenter:relogin-done';

/** Where the sign-in window lands after the provider: the login page, told to report back and close. */
export const RELOGIN_DONE_PATH = '/login?relogin=done';

/**
 * Opens the sign-in window. Null when that is not possible (desktop app, pop-up blocked); the
 * caller then signs in on the page itself.
 */
export function openReloginWindow(): Window | null {
  if (isElectronApp()) return null;
  const url = `/login?relogin=1&next=${encodeURIComponent(RELOGIN_DONE_PATH)}`;
  return window.open(url, 'presenter-relogin', 'popup,width=520,height=720');
}
