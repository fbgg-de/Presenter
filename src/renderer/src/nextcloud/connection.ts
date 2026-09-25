/**
 * The Nextcloud connection of the web version, kept in this browser only.
 *
 * Signing in (Login Flow v2) gives an app password for this device; it never reaches the
 * presenter database. The media folder is a folder in that Nextcloud; its read-only public link
 * is what screens play media from, so presentation windows and viewers need no Nextcloud login.
 * Media paths stay relative to that folder — the same paths the desktop app uses for the folder
 * the Nextcloud client syncs.
 *
 * Each presenter account has its own Nextcloud (set by an admin). A stored connection only counts
 * while it belongs to the signed-in account and that account still uses the same Nextcloud
 * (`useNextcloudAccountCheck`).
 *
 * The desktop app never uses this: it plays from its synced folder.
 */
import { useSyncExternalStore } from 'react';

export interface NextcloudConnection {
  /** Base address, e.g. https://cloud.example.com — the account's Nextcloud when signing in. */
  server: string;
  /** The presenter account that signed in. */
  account?: number;
  loginName: string;
  appPassword: string;
  displayName?: string;
  /** The media folder, relative to the user's files ('' for all files). */
  root: string;
  /** The read-only public link of the media folder. */
  share?: { token: string; url: string };
}

const STORAGE_KEY = 'presenter_nextcloud_connection';

const isDesktop = () => typeof window !== 'undefined' && !!(window as { api?: unknown }).api;

const read = (): NextcloudConnection | null => {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as NextcloudConnection) : null;
    return parsed?.server && parsed.loginName && parsed.appPassword ? parsed : null;
  } catch {
    return null;
  }
};

let current: NextcloudConnection | null = read();
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((fn) => fn());

export const getNextcloud = () => current;

export function setNextcloud(next: NextcloudConnection | null): void {
  current = next;
  try {
    if (next) globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
    else globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable: the connection lasts for this page only */
  }
  notify();
}

export const updateNextcloud = (patch: Partial<NextcloudConnection>) => {
  if (current) setNextcloud({ ...current, ...patch });
};

// Another tab (or a presentation window) signing in or out.
if (typeof window !== 'undefined') {
  window.addEventListener?.('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    current = read();
    notify();
  });
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export const useNextcloud = () => useSyncExternalStore(subscribe, getNextcloud, getNextcloud);

/** Whether media paths resolve through Nextcloud: the web version, signed in, with a media folder link. */
export const nextcloudMediaActive = (connection = current): connection is NextcloudConnection & { share: { token: string; url: string } } =>
  !isDesktop() && !!connection?.share?.token;

/** A path inside the Nextcloud user's files for a path inside the media folder. */
export const nextcloudPath = (connection: NextcloudConnection, relative: string): string =>
  [connection.root, relative]
    .map((part) => part.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');

/**
 * The address screens load a media file from: the public link's download for that file. Ranges
 * are supported there, so videos seek.
 */
export function nextcloudFileUrl(connection: NextcloudConnection & { share: { token: string } }, relative: string): string {
  const clean = relative.replace(/\\/g, '/').replace(/^\/+/, '');
  const slash = clean.lastIndexOf('/');
  const folder = slash >= 0 ? `/${clean.slice(0, slash)}` : '/';
  const file = slash >= 0 ? clean.slice(slash + 1) : clean;
  return `${connection.server.replace(/\/+$/, '')}/s/${encodeURIComponent(connection.share.token)}/download?${new URLSearchParams({ path: folder, files: file })}`;
}
