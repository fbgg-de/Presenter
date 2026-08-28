/**
 * Recognising browser-extension noise in client error reports.
 *
 * Mobile browsers — Brave and Firefox on iOS in particular — inject content scripts into every
 * page they load. When one of those scripts fails it surfaces through `window.onerror` exactly as
 * if the page itself had thrown, so it reaches the server error log looking like an application
 * fault. A single phone session produced dozens of them, which is more than enough to bury the
 * errors that actually matter.
 *
 * They are unactionable by definition: the code is not ours, we cannot fix it, and the page keeps
 * working regardless. So they are dropped before they are ever sent.
 *
 * Shared by the early capture script (error-fallback.ts) and the app's reporter
 * (clientErrorLog.ts) so both agree on what is worth a line. Keep this module dependency-free —
 * it is bundled into the early script, which runs before anything else exists.
 */

/**
 * Globals and URL schemes only injected extension code touches.
 *
 * Matched case-insensitively against the message and its reported location. The `__firefox__`
 * namespace covers a whole family (reader, playlistLongPressed_*, refresh_youtube_quality_*),
 * which is why the prefix is matched rather than each individual member.
 */
const EXTENSION_MARKERS = [
  '__firefox__',
  '__gcrweb', // Chrome and Brave on iOS — the same class of injected bridge
  'darkreader',
  'window.ethereum',
  'ethereum.selectedaddress',
  'chrome-extension://',
  'moz-extension://',
  'safari-extension://',
  'safari-web-extension://',
];

/**
 * True when a report comes from injected third-party code rather than from the application.
 *
 * @param message The error message as reported.
 * @param at      Where the browser says it happened, when it says anything at all.
 */
export function isThirdPartyNoise(message: string, at?: string | null): boolean {
  const haystack = `${message} ${at ?? ''}`.toLowerCase();

  for (const marker of EXTENSION_MARKERS) {
    if (haystack.indexOf(marker) !== -1) return true;
  }

  // "Script error." is what a browser reports for a cross-origin script it refuses to describe.
  // Everything this app loads is same-origin, so the only scripts that can produce one are
  // injected — and the report carries no file, line or stack to act on in any case.
  if (message.trim().replace(/\.+$/, '').toLowerCase() === 'script error') return true;

  return false;
}
