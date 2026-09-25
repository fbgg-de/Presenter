/**
 * Does a lyric line still fit on screen?
 *
 * The song editor marks lines that the theme would wrap and pages with more lines than fit, so a
 * problem is seen while typing instead of during the service. This measures the same way the
 * screen does: the theme's font at the output's own size, against the width left between the
 * paddings. It is an estimate — the renderer has the last word — so only clear overflow is marked.
 */
import type { ResolvedStyle } from '@/utils/styleUtils';
import { buildFontFamily } from '@/utils/styleUtils';

/** What one screen leaves for the text, in the output's pixels. */
export interface FitLimits {
  /** Widest a line may be. */
  maxWidth: number;
  /** How many lines one page holds. */
  maxLines: number;
  /** CSS `font` shorthand of the theme, for measuring. */
  font: string;
  letterSpacing: number;
}

/** The output the editor measures against: a 1080p screen, like the preview. */
const OUTPUT = { width: 1920, height: 1080 };

/** A CSS length in the output's pixels. `vw`/`vh`/`%` follow the output, like the renderer. */
export function lengthToPx(value: string | undefined, base: number, fallback = 0): number {
  if (!value) return fallback;
  const match = /^(-?[\d.]+)\s*(px|vw|vh|vmin|vmax|%|em|rem)?$/.exec(value.trim());
  if (!match) return fallback;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return fallback;
  switch (match[2]) {
    case 'vw':
      return (number / 100) * OUTPUT.width;
    case 'vh':
      return (number / 100) * OUTPUT.height;
    case 'vmin':
      return (number / 100) * Math.min(OUTPUT.width, OUTPUT.height);
    case 'vmax':
      return (number / 100) * Math.max(OUTPUT.width, OUTPUT.height);
    case '%':
      return (number / 100) * base;
    case 'em':
    case 'rem':
      return number * base;
    default:
      return number;
  }
}

/** The four sides of a CSS padding shorthand, in the output's pixels. */
const paddingSides = (shorthand: string | undefined) => {
  const parts = (shorthand ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { top: 0, right: 0, bottom: 0, left: 0 };
  const [top, right = top, bottom = top, left = right] = parts;
  return {
    top: lengthToPx(top, OUTPUT.height),
    right: lengthToPx(right, OUTPUT.width),
    bottom: lengthToPx(bottom, OUTPUT.height),
    left: lengthToPx(left, OUTPUT.width),
  };
};

/** What the theme leaves for one page of lyrics. */
export function fitLimits(style: ResolvedStyle): FitLimits {
  const fontSize = lengthToPx(style.fontSize, OUTPUT.width, 0.04 * OUTPUT.width);
  const lineHeight = lengthToPx(style.lineHeight, fontSize, fontSize * 1.2) || fontSize * 1.2;
  const screen = paddingSides(style.padding);
  const paragraph = paddingSides(style.paragraphPadding);
  const maxWidth = Math.max(100, OUTPUT.width - screen.left - screen.right - paragraph.left - paragraph.right);
  const height = Math.max(100, OUTPUT.height - screen.top - screen.bottom - paragraph.top - paragraph.bottom);
  return {
    maxWidth,
    maxLines: Math.max(1, Math.floor(height / lineHeight)),
    font: [
      style.fontItalic ? 'italic' : '',
      style.fontBold ? 'bold' : '',
      `${fontSize}px`,
      buildFontFamily(style.fontFamily, style.fontFallback) || 'sans-serif',
    ]
      .filter(Boolean)
      .join(' '),
    letterSpacing: lengthToPx(style.letterSpacing, fontSize),
  };
}

let canvas: HTMLCanvasElement | undefined;

/** How wide a line would be on screen, in the output's pixels; 0 where there is no canvas. */
export function measureLine(text: string, limits: FitLimits, transform?: ResolvedStyle['textTransform']): number {
  if (!text.trim()) return 0;
  const shown = transform === 'uppercase' ? text.toUpperCase() : transform === 'lowercase' ? text.toLowerCase() : text;
  try {
    canvas ??= document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return 0;
    context.font = limits.font;
    return context.measureText(shown).width + Math.max(0, limits.letterSpacing) * shown.length;
  } catch {
    // No canvas (tests, a locked-down browser): nothing is flagged rather than everything.
    return 0;
  }
}

/** A line the theme would wrap. A little slack, so a hairline overshoot is not flagged. */
export const lineOverflows = (text: string, limits: FitLimits, transform?: ResolvedStyle['textTransform']): boolean =>
  measureLine(text, limits, transform) > limits.maxWidth * 1.02;
