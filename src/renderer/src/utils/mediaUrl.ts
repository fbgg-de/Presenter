/**
 * Centralized media URL resolution.
 *
 * Per app design, all media is served from the configured media directory via
 * the local media server on http://localhost:9100. Absolute filesystem paths
 * (file://, /abs/path, C:\...) are NOT supported — they don't work reliably
 * under the renderer's webSecurity:false and contradict the "media folder
 * relative" rule. http(s):// URLs are passed through unchanged for remote
 * sources (e.g. user-pasted CDN URLs).
 *
 * This helper replaces previous duplicate `resolveMediaUrl` functions in
 * usePresentationSync, Control, ControlMedia, StyleEditor and MediaBrowser.
 */

export const MEDIA_SERVER_BASE = 'http://127.0.0.1:9100';

/**
 * Resolve a stored media path to an absolute URL safe for <img>/<video> src.
 * Returns undefined for empty input or unsupported absolute filesystem paths
 * (logs a warning so legacy data can be spotted).
 */
export function resolveMediaUrl(path: string | undefined | null): string | undefined {
  if (!path) return undefined;
  // Remote URLs pass through.
  if (/^https?:\/\//i.test(path)) return path;
  // Reject absolute filesystem paths — see header comment.
  if (path.startsWith('file://') || path.startsWith('/') || /^[a-zA-Z]:[/\\]/.test(path)) {
    if (typeof console !== 'undefined') {
      console.warn('[mediaUrl] Absolute paths are no longer supported, ignoring:', path);
    }
    return undefined;
  }
  // Relative path — encode each segment, strip leading slashes.
  const clean = path.replace(/^\/+/, '').replace(/\\/g, '/');
  return `${MEDIA_SERVER_BASE}/${clean.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * Lightweight HEAD-based probe for a media URL. Used by previews/thumbnails
 * to distinguish "loading", "ok", "not_found" and "server_down" states.
 *
 * Results are cached in a module-level Map keyed by URL so repeated probes
 * (e.g. when a thumbnail re-mounts during scroll) cost nothing.
 */
export type MediaProbeStatus = 'ok' | 'not_found' | 'server_down';
const probeCache = new Map<string, { status: MediaProbeStatus; ts: number }>();
const PROBE_TTL_MS = 30_000;

export async function probeMediaUrl(url: string): Promise<MediaProbeStatus> {
  const cached = probeCache.get(url);
  if (cached && Date.now() - cached.ts < PROBE_TTL_MS) return cached.status;
  try {
    const res = await fetch(url, { method: 'HEAD' });
    const status: MediaProbeStatus = res.ok ? 'ok' : 'not_found';
    probeCache.set(url, { status, ts: Date.now() });
    return status;
  } catch {
    const status: MediaProbeStatus = 'server_down';
    probeCache.set(url, { status, ts: Date.now() });
    return status;
  }
}

/** Force-invalidate the probe cache for a URL (e.g. after server start). */
export function invalidateMediaProbe(url?: string): void {
  if (url) probeCache.delete(url);
  else probeCache.clear();
}
