/**
 * Notices a PDF or PowerPoint of the show changing in the media folder — saved again from
 * PowerPoint, say — so the agenda can offer to load the new version, as it does for songs.
 * The file's Last-Modified and size stand for its version. Its first version seen is what the
 * entry shows; a later, different one is a change until the operator reloads it.
 */
import { useCallback, useEffect, useState } from 'react';
import { store, useAppDispatch } from '@/store';
import { updateShowItem, useGetShow } from '@/store/showSlice';
import { resolveMediaUrl } from '@/utils/mediaUrl';
import type { ShowItem } from '@/api/shows.api';

const POLL_MS = 10_000;

/** The file's version now, or undefined when it cannot be told (server down, file gone). */
async function fileVersion(path: string): Promise<string | undefined> {
  const url = resolveMediaUrl(path);
  if (!url) return undefined;
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    const modified = res.headers.get('Last-Modified');
    const size = res.headers.get('Content-Length');
    return res.ok && (modified || size) ? `${modified ?? ''}|${size ?? ''}` : undefined;
  } catch {
    return undefined;
  }
}

/** The show's entries of one file, as the store has them now. */
const eachEntryOf = (path: string, visit: (item: ShowItem, index: number) => void) =>
  (store.getState().show.currentShow?.order ?? []).forEach((item, index) => {
    if (item.type === 'document' && item.mediaPath === path) visit(item, index);
  });

/** Files of the show that changed since their entries loaded them (path → version now), and how to load one anew. */
export function useDocumentFileWatch() {
  const dispatch = useAppDispatch();
  const { currentShow } = useGetShow();
  const [changed, setChanged] = useState<Record<string, string>>({});
  const paths = JSON.stringify(
    [...new Set((currentShow?.order ?? []).flatMap((item) => (item.type === 'document' && item.mediaPath ? [item.mediaPath] : [])))].sort(),
  );

  useEffect(() => {
    const list: string[] = JSON.parse(paths);
    if (!list.length) return;
    let cancelled = false;
    const check = async () => {
      const found: Record<string, string> = {};
      for (const path of list) {
        const version = await fileVersion(path);
        if (cancelled) return;
        if (!version) continue;
        eachEntryOf(path, (item, index) => {
          if (!item.documentVersion) dispatch(updateShowItem({ index, item: { documentVersion: version } }));
          else if (item.documentVersion !== version) found[path] = version;
        });
      }
      setChanged((old) => (JSON.stringify(old) === JSON.stringify(found) ? old : found));
    };
    void check();
    const timer = setInterval(check, POLL_MS);
    window.addEventListener('focus', check);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('focus', check);
    };
  }, [paths, dispatch]);

  /** Every entry of the file shows the version found now; screens and cards open it anew. */
  const reload = useCallback(
    (path: string) => {
      const version = changed[path];
      if (!version) return;
      eachEntryOf(path, (item, index) =>
        dispatch(updateShowItem({ index, item: { documentVersion: version, documentRevision: (item.documentRevision ?? 0) + 1 } })),
      );
      setChanged(({ [path]: _done, ...rest }) => rest);
    },
    [changed, dispatch],
  );

  return { changed, reload };
}
