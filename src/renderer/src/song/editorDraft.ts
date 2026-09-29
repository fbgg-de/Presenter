import { persistState, removePersistedState } from '@/store/persist';

/** Only serializable song content is stored; editor-generated page/line IDs are rebuilt on restore. */
export type SongEditorDraft = {
  title: string;
  authors: string;
  copyright: string;
  languages: string[];
  blocks: { name: string; lines: string[] }[];
  orders: Record<string, string[]>;
  currentOrder: string;
  rawText?: string;
};

export const songDraftKey = (backend: string, account: string | number, songNumber: number) =>
  `presenter_song_draft:${JSON.stringify([backend, String(account), songNumber])}`;

const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === 'string');

export function readSongDraft(key: string): SongEditorDraft | undefined {
  try {
    const record = JSON.parse(localStorage.getItem(key) ?? 'null');
    const data = record?.data;
    if (
      record?.version !== 1 ||
      !data ||
      !['title', 'authors', 'copyright', 'currentOrder'].every((field) => typeof data[field] === 'string')
    )
      return;
    if (
      !strings(data.languages) ||
      !Array.isArray(data.blocks) ||
      !data.blocks.every(
        (block: { name?: unknown; lines?: unknown } | null) => block && typeof block.name === 'string' && strings(block.lines),
      )
    )
      return;
    if (!data.orders || typeof data.orders !== 'object' || Array.isArray(data.orders) || !Object.values(data.orders).every(strings)) return;
    if (
      !Object.prototype.hasOwnProperty.call(data.orders, data.currentOrder) ||
      (data.rawText !== undefined && typeof data.rawText !== 'string')
    )
      return;
    return data;
  } catch {
    return undefined;
  }
}

export function writeSongDraft(key: string, data: SongEditorDraft): boolean {
  return persistState(key, { version: 1, data });
}

export function removeSongDraft(key: string): void {
  removePersistedState(key);
}
