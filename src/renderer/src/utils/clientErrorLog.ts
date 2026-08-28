import { getBackendBaseUrl } from '@/api/base.api';
import { isThirdPartyNoise } from './errorNoise';

/**
 * Forwarding of browser errors to the server log.
 *
 * Written as a plain module rather than a hook because the errors worth having are the ones React
 * never sees: a crash during boot, a failing import, a rejection from a listener outside the tree.
 * `install()` runs before the first render, so those are covered too.
 *
 * `fetch` directly rather than the RTK endpoint for the same reason — RTK needs a store, and it
 * drops every request in offline mode, which would swallow exactly the reports worth keeping.
 */

export type ClientErrorSource = 'window_onerror' | 'unhandled_rejection' | 'react_boundary' | 'manual';

export type ClientErrorReport = {
  message: string;
  stack?: string;
  source: ClientErrorSource;
  /** Where `window.onerror` says it happened; a bundle path is still better than nothing. */
  at?: string;
};

/** A crash loop can fire hundreds of times a second. Report enough to diagnose, then stop. */
const MAX_PER_SESSION = 25;
/** The same error re-thrown on every render is one fact, not fifty. */
const REPEAT_WINDOW_MS = 30_000;

let sent = 0;
const lastSeen = new Map<string, number>();

/** Fingerprint on message + origin: the same fault from two places is two reports. */
const key = (report: ClientErrorReport): string => `${report.source}:${report.message}:${report.at ?? ''}`;

const describeClient = (): string => {
  const parts: string[] = [];

  // Every one of these is a guess about what the browser exposes, and this code runs *because*
  // something already went wrong — it must not be the thing that throws next.
  try {
    parts.push(`UA=${navigator.userAgent}`);
  } catch {}
  try {
    parts.push(`Lang=${navigator.language}`);
  } catch {}
  try {
    parts.push(`Viewport=${window.innerWidth}x${window.innerHeight}`);
  } catch {}
  try {
    parts.push(`Screen=${screen.width}x${screen.height}@${window.devicePixelRatio ?? 1}`);
  } catch {}

  return parts.join('; ') || 'client details unavailable';
};

const currentPage = (): string => {
  try {
    return `${location.pathname}${location.search}`;
  } catch {
    return '-';
  }
};

/**
 * Send one error to the server log. Never throws and never rejects: a reporter that can break the
 * page it is reporting on is worse than no reporter.
 */
export const reportClientError = (report: ClientErrorReport): void => {
  try {
    // Dropped before the rate limiter, not after: a page full of extension errors would
    // otherwise spend the whole session budget and leave nothing for a real fault.
    if (isThirdPartyNoise(report.message, report.at)) return;

    if (sent >= MAX_PER_SESSION) return;

    const now = Date.now();
    const fingerprint = key(report);
    const previous = lastSeen.get(fingerprint);
    if (previous !== undefined && now - previous < REPEAT_WINDOW_MS) return;

    lastSeen.set(fingerprint, now);
    sent += 1;

    const details = [report.message, report.at ? `at ${report.at}` : '', report.stack ? `Stack: ${report.stack}` : '', describeClient()]
      .filter(Boolean)
      .join(' | ');

    const base = getBackendBaseUrl();

    void fetch(`${base ? `${base}/` : '/'}rest/Log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'include',
      // The page may be on its way out — a navigation, a reload after a crash. keepalive is what
      // lets the report survive that.
      keepalive: true,
      body: JSON.stringify({ message: details, severity: 'ERROR', source: report.source, page: currentPage() }),
    }).catch((error) => {
      // Nothing to escalate to: the log is the escalation path. Leave a trace in the console for
      // whoever is standing in front of the device.
      console.warn('[clientErrorLog] could not report to the server log', error);
    });
  } catch (error) {
    console.warn('[clientErrorLog] failed to build a report', error);
  }
};

let installed = false;

/**
 * Start listening for uncaught errors. Safe to call more than once.
 *
 * Call this as early as the app can — before the store, before React — so a failure during boot is
 * reported rather than leaving a blank screen and no record of why.
 */
export const installClientErrorLog = (): void => {
  if (installed) return;
  installed = true;

  window.addEventListener(
    'error',
    (event: ErrorEvent) => {
      // Failed <img>/<script> loads arrive on the same event but carry no Error. They are worth a
      // line too — a missing chunk is a common cause of "undefined is not an object" further on.
      if (!event.message && event.target && event.target !== window) {
        const element = event.target as HTMLElement & { src?: string; href?: string };

        reportClientError({
          message: `Failed to load ${element.tagName?.toLowerCase() ?? 'resource'}`,
          at: element.src ?? element.href,
          source: 'window_onerror',
        });
        return;
      }

      reportClientError({
        message: event.message || 'Unknown error',
        stack: event.error?.stack,
        at: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined,
        source: 'window_onerror',
      });
      // Capture phase: resource errors do not bubble, so a listener on window only sees them here.
    },
    true,
  );

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason));

    reportClientError({ message: reason.message || 'Unhandled rejection', stack: reason.stack, source: 'unhandled_rejection' });
  });
};
