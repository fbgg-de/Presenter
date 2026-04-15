import type { ISong, TBlocks } from '@/song/index';

export class Song implements ISong {
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

  constructor(
    song?: Pick<
      ISong,
      | 'title'
      | 'authors'
      | 'copyright'
      | 'songNumber'
      | 'blocks'
      | 'initialOrder'
      | 'order'
      | 'account'
      | 'background'
      | 'css'
      | 'lastUpdate'
    >,
  ) {
    this.title = song?.title ?? '';
    this.authors = song?.authors ?? '';
    this.copyright = song?.copyright ?? '';
    this.songNumber = song?.songNumber ?? -Date.now();
    this.blocks = song?.blocks ?? {};
    this.initialOrder = song?.initialOrder ?? [];
    this.order = song?.order ?? {};
    this.account = song?.account;
    this.background = song?.background ?? '';
    this.css = song?.css ?? '';
    this.lastUpdate = song?.lastUpdate ?? Date.now();
  }

  hasBlock(type: string): boolean {
    return Object.keys(type).includes(type);
  }

  setBlock(type: string, block: string[]): Song {
    type = type.replaceAll(',', '');

    this.blocks[type] = block;

    return this;
  }

  removeBlock(type: string): Song {
    if (delete this.blocks[type]) {
      for (const order in this.order) {
        this.order[order] = this.order[order].filter((e: string) => e !== type);
      }
    }

    return this;
  }

  getCurrentOrder(order: string): string[] {
    return this.order[order] ?? [];
  }

  getOrder(order: string): string[] {
    return this.getCurrentOrder(order);
  }

  getBlock(order: string, index: number) {
    const currentOrder = this.getCurrentOrder(order);
    return this.blocks[currentOrder[index]] ?? [];
  }

  getBlocks(order: string) {
    const blocks: { name: string; lines: string[]; copyright: boolean }[] = [];
    const currentOrder = this.getCurrentOrder(order);

    currentOrder.forEach((order) => {
      blocks.push({
        name: order,
        lines: this.blocks[order],
        copyright: false,
      });
    });

    blocks.push({ name: '© Copyright', lines: [], copyright: true });

    return blocks;
  }

  generateBlockName(type?: string): string {
    const keys = Object.keys(this.blocks);

    if (type) {
      if (keys.includes(type)) {
        let counter = 1;
        while (keys.includes(`${type} [${counter}]`)) {
          counter++;
        }

        return `${type} [${counter}]`;
      }
    } else {
      let counter = 1;
      while (keys.includes(`${type} [${counter}]`)) {
        counter++;
      }

      type = `[${counter}]`;
    }

    return type;
  }
}
