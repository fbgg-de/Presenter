/**
 * Talking to Nextcloud through the presenter server (api/NextcloudRelay.php). The server always
 * uses the signed-in account's Nextcloud; the connection's login goes along with every request in
 * headers and the server keeps nothing.
 */
import { getBackendBaseUrl } from '@/api/base.api';
import { getNextcloud, nextcloudPath, type NextcloudConnection } from './connection';

/** Chunk size for uploads: above Nextcloud's 5 MB minimum, small enough for most proxies. */
export const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;

export class NextcloudError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// From the site root (or the configured backend in the desktop app) — a relative path would
// resolve against whatever page the app is on and fetch the app's own HTML instead.
const url = (action: string, query?: Record<string, string>) => {
  const base = getBackendBaseUrl();
  return `${base ? `${base}/` : '/'}rest/NextcloudRelay/${action}${query ? `?${new URLSearchParams(query)}` : ''}`;
};

const authHeaders = (connection: NextcloudConnection | null): Record<string, string> =>
  connection
    ? {
        'X-Nextcloud-User': connection.loginName,
        'X-Nextcloud-Password': connection.appPassword,
      }
    : {};

async function call<T>(
  action: string,
  options: {
    method?: string;
    body?: unknown;
    raw?: Blob;
    query?: Record<string, string>;
    connection?: NextcloudConnection | null;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const connection = options.connection === undefined ? getNextcloud() : options.connection;
  const response = await fetch(url(action, options.query), {
    method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
    credentials: 'include',
    signal: options.signal,
    headers: {
      Accept: 'application/json',
      ...(options.raw
        ? { 'Content-Type': 'application/octet-stream' }
        : options.body !== undefined
          ? { 'Content-Type': 'application/json' }
          : {}),
      ...authHeaders(connection),
    },
    body: options.raw ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
  });
  // Anything but JSON means the request never reached the relay (a proxy, a sign-in page, an
  // app build without it). Saying so beats a later "cannot read property of undefined".
  const text = await response.text();
  let data: unknown = undefined;
  try {
    data = JSON.parse(text);
  } catch {
    // A PHP notice printed before the answer leaves the JSON intact but no longer alone.
    const start = text.search(/[[{]/);
    if (start > 0) {
      try {
        data = JSON.parse(text.slice(start));
      } catch {
        /* still not JSON — reported below */
      }
    }
  }
  if (data === undefined) {
    throw new NextcloudError(
      response.ok ? 'The presenter server did not answer the Nextcloud request' : `HTTP ${response.status}`,
      response.ok ? 502 : response.status,
    );
  }
  if (!response.ok) throw new NextcloudError((data as { message?: string })?.message || `HTTP ${response.status}`, response.status);
  return data as T;
}

// ── Signing in ──

export interface LoginStart {
  server: string;
  loginUrl: string;
  poll: { endpoint: string; token: string };
}

export const startLogin = () => call<LoginStart>('loginStart', { body: {}, connection: null });

export const pollLogin = (token: string) =>
  call<{ pending: true } | { server: string; loginName: string; appPassword: string }>('loginPoll', {
    body: { token },
    connection: null,
  });

/**
 * The whole Login Flow v2 with the account's Nextcloud: open its sign-in in a new window (where
 * the shared identity provider signs the user in) and wait for the app password. Resolves null
 * when cancelled.
 */
export async function signIn(
  options: { signal?: AbortSignal; onOpened?: (loginUrl: string) => void } = {},
): Promise<Pick<NextcloudConnection, 'server' | 'loginName' | 'appPassword'> | null> {
  // Opened while the click is still being handled — a window.open after the await is blocked
  // as a pop-up. It waits on about:blank until Nextcloud's address arrives.
  const popup = window.open('', 'presenter-nextcloud-login', 'popup,width=520,height=720');
  try {
    const started = await startLogin();
    if (!started?.loginUrl || !started.poll?.token) {
      throw new NextcloudError('The presenter server did not return a Nextcloud sign-in', 502);
    }
    if (popup) popup.location.href = started.loginUrl;
    options.onOpened?.(started.loginUrl);
    return await pollForPassword(started, popup, options.signal);
  } catch (error) {
    try {
      popup?.close();
    } catch {
      /* the popup belongs to the Nextcloud origin now */
    }
    throw error;
  }
}

/** Ask the Nextcloud every two seconds whether the sign-in went through. */
async function pollForPassword(
  started: LoginStart,
  popup: Window | null,
  signal?: AbortSignal,
): Promise<Pick<NextcloudConnection, 'server' | 'loginName' | 'appPassword'> | null> {
  const deadline = Date.now() + 20 * 60 * 1000;
  try {
    while (Date.now() < deadline) {
      if (signal?.aborted) return null;
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const answer = await pollLogin(started.poll.token);
      if (!('pending' in answer)) return answer;
    }
    return null;
  } finally {
    try {
      popup?.close();
    } catch {
      /* the popup belongs to the Nextcloud origin now */
    }
  }
}

export const checkConnection = (connection: NextcloudConnection) => call<{ user: string; displayName: string }>('check', { connection });

export const revokeConnection = (connection: NextcloudConnection) => call<{ message: string }>('revoke', { body: {}, connection });

// ── Files (paths inside the Nextcloud user's files) ──

export interface NextcloudListing {
  path: string;
  dirs: string[];
  files: { name: string; size: number; mtime: number | null; type: string }[];
}

export const listFolder = (path: string, signal?: AbortSignal) => call<NextcloudListing>('list', { query: { path }, signal });

export const makeFolder = (path: string) => call<{ path: string }>('mkdir', { body: { path } });

export const shareFolder = (path: string, connection?: NextcloudConnection) =>
  call<{ token: string; url: string }>('share', { body: { path }, connection });

/**
 * Upload one file into a folder of the media folder, in chunks. Returns the path inside the media
 * folder. `onProgress` gets 0–1.
 */
export async function uploadFile(
  file: File,
  mediaFolder: string,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  const connection = getNextcloud();
  if (!connection) throw new NextcloudError('Not connected to Nextcloud', 401);
  const relative = [mediaFolder.replace(/^\/+|\/+$/g, ''), file.name].filter(Boolean).join('/');
  const destination = nextcloudPath(connection, relative);
  const { uploadId } = await call<{ uploadId: string }>('uploadStart', { body: { destination }, signal });
  const chunks = Math.max(1, Math.ceil(file.size / UPLOAD_CHUNK_BYTES));
  for (let index = 0; index < chunks; index++) {
    const start = index * UPLOAD_CHUNK_BYTES;
    await call('uploadChunk', {
      method: 'PUT',
      raw: file.slice(start, Math.min(file.size, start + UPLOAD_CHUNK_BYTES)),
      query: { uploadId, index: String(index + 1), destination },
      signal,
    });
    onProgress?.((index + 1) / chunks);
  }
  await call('uploadFinish', { body: { uploadId, destination, size: file.size }, signal });
  return relative;
}
