import type { MediaFrame } from './types';

/** One screen of a video wall: column `col`, row `row` of a `cols`×`rows` grid. */
export type WallTile = { cols: number; rows: number; col: number; row: number };

export const isFullCrop = (frame: MediaFrame) => frame.crop.x === 0 && frame.crop.y === 0 && frame.crop.w === 1 && frame.crop.h === 1;

/** The frame that shows one tile of a wall: the crop is that part of the file, the placement fills the screen. */
export const tileFrame = (frame: MediaFrame, { cols, rows, col, row }: WallTile): MediaFrame => ({
  ...frame,
  scale: 100,
  x: 50,
  y: 50,
  crop: { x: col / cols, y: row / rows, w: 1 / cols, h: 1 / rows },
});

/** Which wall tile a frame shows, if it shows exactly one. 1×1 is the whole picture. */
export function tileOf(frame: MediaFrame): WallTile | undefined {
  if (frame.scale !== 100 || frame.x !== 50 || frame.y !== 50) return undefined;
  const c = frame.crop;
  const cols = Math.round(1 / c.w);
  const rows = Math.round(1 / c.h);
  const col = Math.round(c.x * cols);
  const row = Math.round(c.y * rows);
  const near = (a: number, b: number) => Math.abs(a - b) < 0.001;
  return near(c.w, 1 / cols) && near(c.h, 1 / rows) && near(c.x, col / cols) && near(c.y, row / rows)
    ? { cols, rows, col, row }
    : undefined;
}

/**
 * The wall a picture of aspect `ratio` is made for, on screens of `screenRatio`: a 32:9 clip on
 * 16:9 screens is two side by side, 48:9 three, 16:18 two stacked. Undefined for a picture shaped
 * like one screen, or one that is no whole number of screens (21:9 cinema is not a wall).
 */
export function wallFor(ratio: number, screenRatio: number): { cols: number; rows: number } | undefined {
  const r = ratio / screenRatio;
  const cols = Math.max(1, Math.round(r));
  const rows = Math.max(1, Math.round(1 / r));
  if (cols * rows === 1 || Math.abs((r * rows) / cols - 1) > 0.08) return undefined;
  return { cols, rows };
}

/** Same source-pixel crop calculation for the editor and presentation output. */
export function frameGeometry(frame: MediaFrame, width: number, height: number, sourceWidth: number, sourceHeight: number) {
  const c = frame.crop;
  const pw = (width * frame.scale) / 100,
    ph = (height * frame.scale) / 100;
  let sx = pw / (sourceWidth * c.w),
    sy = ph / (sourceHeight * c.h);
  if (frame.fit !== 'fill') sx = sy = frame.fit === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy);
  return {
    placement: { left: (width * frame.x) / 100 - pw / 2, top: (height * frame.y) / 100 - ph / 2, width: pw, height: ph },
    crop: {
      left: (pw - sourceWidth * c.w * sx) / 2,
      top: (ph - sourceHeight * c.h * sy) / 2,
      width: sourceWidth * c.w * sx,
      height: sourceHeight * c.h * sy,
    },
    source: { left: -sourceWidth * c.x * sx, top: -sourceHeight * c.y * sy, width: sourceWidth * sx, height: sourceHeight * sy },
    blur: (frame.blur * width) / 1920,
  };
}
