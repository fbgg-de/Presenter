import type { MediaFrame } from './types';

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
