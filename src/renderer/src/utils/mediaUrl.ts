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
import { getNextcloud, nextcloudFileUrl, nextcloudMediaActive } from '@/nextcloud/connection';
import { createTaskQueue } from './taskQueue';

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
  // The web version connected to Nextcloud plays the media folder from its public link.
  const nextcloud = getNextcloud();
  if (nextcloudMediaActive(nextcloud)) return nextcloudFileUrl(nextcloud, clean);
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
const PROBE_TIMEOUT_MS = 5_000;
const MAX_PROBE_CACHE = 256;
const queueProbe = createTaskQueue(4);
const pendingProbes = new Map<string, { controller: AbortController; promise: Promise<MediaProbeStatus> }>();
let probeGeneration = 0;
const probeListeners = new Set<() => void>();
export const getMediaProbeGeneration = () => probeGeneration;
export const subscribeMediaProbes = (listener: () => void) => {
  probeListeners.add(listener);
  return () => {
    probeListeners.delete(listener);
  };
};

export function probeMediaUrl(url: string): Promise<MediaProbeStatus> {
  const cached = probeCache.get(url);
  if (cached && Date.now() - cached.ts < PROBE_TTL_MS) {
    probeCache.delete(url);
    probeCache.set(url, cached);
    return Promise.resolve(cached.status);
  }
  const pending = pendingProbes.get(url);
  if (pending) return pending.promise;
  const controller = new AbortController();
  const promise = queueProbe(async () => {
    if (controller.signal.aborted) return 'server_down' as const;
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    let status: MediaProbeStatus = 'server_down';
    try {
      const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
      // Auth failures, unsupported HEAD and server errors do not prove a file is missing.
      status = res.ok ? 'ok' : res.status === 404 || res.status === 410 ? 'not_found' : 'server_down';
    } catch {
      // Network errors, CORS and timeouts are inconclusive.
    } finally {
      clearTimeout(timer);
    }
    // An invalidated request may finish after its replacement; never restore its old result.
    if (pendingProbes.get(url)?.controller === controller) {
      probeCache.delete(url);
      probeCache.set(url, { status, ts: Date.now() });
      if (probeCache.size > MAX_PROBE_CACHE) probeCache.delete(probeCache.keys().next().value!);
    }
    return status;
  }).finally(() => {
    if (pendingProbes.get(url)?.controller === controller) pendingProbes.delete(url);
  });
  pendingProbes.set(url, { controller, promise });
  return promise;
}

/** Force-invalidate the probe cache for a URL (e.g. after server start). */
export function invalidateMediaProbe(url?: string): void {
  if (url) {
    probeCache.delete(url);
    pendingProbes.get(url)?.controller.abort();
    pendingProbes.delete(url);
  } else {
    probeCache.clear();
    for (const pending of pendingProbes.values()) pending.controller.abort();
    pendingProbes.clear();
  }
  probeGeneration++;
  probeListeners.forEach((listener) => listener());
}
