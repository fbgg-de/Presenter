/**
 * Media files as the agenda sees them: what kind a file is, where it sits relative to the media
 * folder, and finding a file by name when all that is known is how it is called.
 *
 * A media item always stores its path relative to the media folder with forward slashes, never an
 * absolute path — so every computer that syncs the folder resolves the same file.
 */
import { MEDIA_SERVER_BASE } from '@/utils/mediaUrl';

export type MediaFileKind = 'image' | 'video' | 'audio';

const EXTENSIONS: Record<MediaFileKind, string[]> = {
  image: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'],
  video: ['.mp4', '.webm', '.mov', '.avi', '.mkv'],
  audio: ['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg'],
};

/** Lyric files the agenda imports as songs. */
export const SONG_FILE_EXTENSIONS = ['.sng', '.txt'];

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
};

/** The kind of media a file name is, or undefined when it is not a media file. */
export function mediaKindOf(name: string): MediaFileKind | undefined {
  const ext = extensionOf(name);
  return (Object.keys(EXTENSIONS) as MediaFileKind[]).find((kind) => EXTENSIONS[kind].includes(ext));
}

export const isSongFileName = (name: string): boolean => SONG_FILE_EXTENSIONS.includes(extensionOf(name));

/** The last path segment. */
export const fileNameOf = (path: string): string => path.replace(/\\/g, '/').split('/').pop() ?? path;

/** A readable label for a media file: its name without the extension. */
export const mediaLabelOf = (path: string): string => fileNameOf(path).replace(/\.[^.]+$/, '') || fileNameOf(path);

/** The folder part of a path (Windows or POSIX separators), without a trailing slash. */
export const folderOf = (path: string): string => {
  const normal = path.replace(/\\/g, '/');
  const slash = normal.lastIndexOf('/');
  return slash >= 0 ? normal.slice(0, slash) : '';
};

/**
 * A file's path relative to the media folder, or undefined when it lies outside it. Compared
 * case-insensitively for Windows drive paths, which is how Windows itself treats them.
 */
export function relativeToMediaRoot(absolutePath: string, mediaRoot: string): string | undefined {
  if (!absolutePath || !mediaRoot) return undefined;
  const normal = (path: string) => path.replace(/\\/g, '/').replace(/\/+$/, '');
  const file = normal(absolutePath);
  const root = normal(mediaRoot);
  const windows = /^[a-zA-Z]:\//.test(root) || /^\/\//.test(root);
  const fold = (path: string) => (windows ? path.toLowerCase() : path);
  if (!fold(file).startsWith(`${fold(root)}/`)) return undefined;
  const relative = file.slice(root.length + 1);
  return relative && !relative.split('/').includes('..') ? relative : undefined;
}

/** Joins a folder inside the media folder with a file name. */
export const joinMediaPath = (folder: string, name: string): string => (folder ? `${folder.replace(/\/+$/, '')}/${name}` : name);

/**
 * The base URL the media folder is served from: the desktop app's own media server, or the
 * configured address on the web.
 */
export async function mediaServerBase(mediaPath: string): Promise<string | undefined> {
  if (window.api?.startMediaServer) {
    if (!mediaPath) return undefined;
    return (await window.api.startMediaServer(mediaPath)) || MEDIA_SERVER_BASE;
  }
  return mediaPath ? mediaPath.replace(/\/+$/, '') : undefined;
}

export interface FoundMediaFile {
  path: string;
  size: number;
}

/**
 * Files with exactly this name anywhere in the media folder. Empty when the server cannot search
 * (an older desktop app, or a plain web server without the search endpoint).
 */
export async function findMediaFilesByName(base: string | undefined, name: string): Promise<FoundMediaFile[]> {
  if (!base || !name) return [];
  try {
    const response = await fetch(`${base}/find?${new URLSearchParams({ name, limit: '20' })}`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return [];
    const data = (await response.json()) as { results?: FoundMediaFile[] };
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    return [];
  }
}
