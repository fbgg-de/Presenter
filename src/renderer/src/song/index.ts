export * from './Song';
export * from './CcliSong';

export type TBlocks = { [key: string]: string[] };

export const SONG_CUSTOM_NUMBER_LIMIT = 10000;
export const SONG_BLOCK_SEPARATOR = '---';
export const SONG_TRANSLATION_LINE_REGEX = /^\[(\w{2})] (.*)$/;

export interface ISong {
  title: string;
  authors?: string;
  copyright?: string;
  songNumber: number;
  blocks: TBlocks;
  initialOrder?: string[];
  order: Record<string, string[]>;
  account?: number;
  background?: string;
  css?: string;
  lastUpdate?: number;

  getBlock: (order: string, index: number) => string[];
  getBlocks: (order: string) => { name: string; lines: string[]; copyright: boolean }[];
  getOrder: (order: string) => string[];
}
