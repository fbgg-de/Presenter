/**
 * Where a folder picker browses: the media folder on this computer (desktop app), or folders in
 * the user's Nextcloud (web version).
 */
import { mediaServerBase } from '@/media/mediaFiles';
import { getNextcloud, nextcloudPath } from './connection';
import { listFolder, makeFolder } from './relay';

export interface FolderSource {
  /** Sub-folder names of `path`. */
  list: (path: string) => Promise<string[]>;
  /** Create `name` in `parent`; returns the new folder's path. Absent: folders cannot be created. */
  create?: (parent: string, name: string) => Promise<string>;
}

const join = (parent: string, name: string) => [parent.replace(/\/+$/, ''), name].filter(Boolean).join('/');

/** The media folder on this computer, through the local media server. */
export const localFolderSource = (mediaPath: string): FolderSource => ({
  list: async (path) => {
    const base = await mediaServerBase(mediaPath);
    const response = await fetch(`${base}/list?${new URLSearchParams({ path, limit: '1' })}`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(String(response.status));
    return ((await response.json()) as { dirs?: string[] }).dirs ?? [];
  },
  create: window.api?.createMediaFolder ? (parent, name) => window.api!.createMediaFolder!(mediaPath, parent, name) : undefined,
});

/**
 * Folders in Nextcloud. With `withinMediaFolder`, paths are relative to the connection's media
 * folder; without, to the user's files (for choosing the media folder itself).
 */
export const nextcloudFolderSource = (withinMediaFolder: boolean): FolderSource => {
  const full = (path: string) => {
    const connection = getNextcloud();
    return withinMediaFolder && connection ? nextcloudPath(connection, path) : path;
  };
  return {
    list: async (path) => (await listFolder(full(path))).dirs,
    create: async (parent, name) => {
      if (!name.trim() || /[\\/]/.test(name)) throw new Error('Invalid folder name');
      await makeFolder(full(join(parent, name.trim())));
      return join(parent, name.trim());
    },
  };
};
