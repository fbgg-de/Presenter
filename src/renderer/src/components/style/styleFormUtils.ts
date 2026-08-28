import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { StyleData, LanguageStyleEntry } from '@/api/styles.api';
import { buildFontFamily, resolveStyleData } from '@/utils/styleUtils';
import { MAIN_LANGUAGE_SLOT, entryForSlot, visibleSlots } from '@/utils/languageSlots';
import { SONG_BLOCK_SEPARATOR } from '@/song';

/** Pure helpers shared by the style form, the preview and the gallery thumbnails. */

/**
 * CSS overrides for one language slot, mirroring the presentation's per-slot styling.
 * `fontScale` shrinks viewport-relative font sizes for the small preview canvas.
 */
export const languageEntryCss = (entries: LanguageStyleEntry[] | undefined, slot: number, fontScale = 1): CSSProperties => {
  const entry = entryForSlot(entries, slot);
  if (!entry) return {};
  const css: CSSProperties = {};
  if (entry.fontColorEnabled && entry.fontColor) css.color = entry.fontColor;
  if (entry.fontSizeEnabled && entry.fontSize) css.fontSize = fontScale === 1 ? entry.fontSize : `calc(${entry.fontSize} * ${fontScale})`;
  if (entry.fontStyleEnabled) {
    if (entry.fontBold) css.fontWeight = 'bold';
    if (entry.fontItalic) css.fontStyle = 'italic';
    if (entry.fontUnderline) css.textDecoration = 'underline';
  }
  if (entry.letterSpacingEnabled && entry.letterSpacing) css.letterSpacing = entry.letterSpacing;
  if (entry.textShadowEnabled && entry.textShadow) css.textShadow = `${entry.textShadow} ${entry.textShadowColor || 'rgba(0,0,0,0.5)'}`;
  if (entry.textStrokeEnabled && entry.textStroke) (css as Record<string, unknown>).WebkitTextStroke = entry.textStroke;
  if (entry.opacityEnabled && entry.opacity !== undefined) css.opacity = entry.opacity;
  return css;
};

export const createEmptyStyleData = (): StyleData => ({
  backgroundColor: { enabled: true, value: '#000000' },
  fontFamily: { enabled: true, value: 'Roboto' },
  fontFallback: { enabled: true, value: ['Arial'] },
  fontColor: { enabled: true, value: '#FFFFFF' },
  fontSize: { enabled: true, value: '4vw' },
  fontBold: { enabled: true, value: true },
  lineHeight: { enabled: false, value: '120%' },
  textAlign: { enabled: true, value: 'center' },
  padding: { enabled: true, value: '0vw 0vh' },
});

/** Generate a CSS text block from the current StyleData for copying into the Custom CSS field. */
export const generateCssFromStyleData = (data: StyleData): string => {
  const r = resolveStyleData(data);
  const containerLines: string[] = [];
  const textLines: string[] = [];

  if (r.backgroundColor) containerLines.push(`  background-color: ${r.backgroundColor};`);
  if (r.backgroundImage) {
    containerLines.push(`  background-image: url("${r.backgroundImage}");`);
    containerLines.push(`  background-size: ${r.backgroundSize || 'cover'};`);
    containerLines.push(`  background-position: ${r.backgroundPosition || 'center'};`);
    containerLines.push(`  background-repeat: no-repeat;`);
  }
  if (r.padding) containerLines.push(`  padding: ${r.padding};`);

  if (r.opacity !== undefined) containerLines.push(`  opacity: ${r.opacity};`);

  if (r.fontFamily || r.fontFallback) textLines.push(`  font-family: ${buildFontFamily(r.fontFamily, r.fontFallback)};`);
  if (r.fontColor) textLines.push(`  color: ${r.fontColor};`);
  if (r.fontSize) textLines.push(`  font-size: ${r.fontSize};`);
  if (r.fontBold) textLines.push(`  font-weight: bold;`);
  if (r.fontItalic) textLines.push(`  font-style: italic;`);
  if (r.fontUnderline) textLines.push(`  text-decoration: underline;`);
  if (r.textTransform && r.textTransform !== 'none') textLines.push(`  text-transform: ${r.textTransform};`);
  if (r.textAlign) textLines.push(`  text-align: ${r.textAlign};`);
  if (r.lineHeight) textLines.push(`  line-height: ${r.lineHeight};`);
  if (r.letterSpacing) textLines.push(`  letter-spacing: ${r.letterSpacing};`);
  if (r.textShadow) textLines.push(`  text-shadow: ${r.textShadow} ${r.textShadowColor || 'rgba(0,0,0,0.5)'};`);
  if (r.textStroke) textLines.push(`  -webkit-text-stroke: ${r.textStroke};`);

  const parts: string[] = [];
  if (containerLines.length) parts.push(`.presentation {\n${containerLines.join('\n')}\n}`);
  if (textLines.length) parts.push(`.presentation-line {\n${textLines.join('\n')}\n}`);
  if (r.paragraphPadding) {
    parts.push(`.presentation-block,\n.presentation-stream-block,\n.presentation-next-preview {\n  padding: ${r.paragraphPadding};\n}`);
  }

  // Per-slot overrides. The main slot styles every line, the rest target their own slot.
  const langEntries = data.languageStyles?.value || [];
  for (const entry of langEntries) {
    const selector = entry.slot === MAIN_LANGUAGE_SLOT ? '.presentation-line' : `.presentation-line[data-slot="${entry.slot}"]`;
    const langLines: string[] = [];
    if (entry.fontColor) langLines.push(`  color: ${entry.fontColor};`);
    if (entry.fontSize) langLines.push(`  font-size: ${entry.fontSize};`);
    if (entry.fontBold) langLines.push(`  font-weight: bold;`);
    if (entry.fontItalic) langLines.push(`  font-style: italic;`);
    if (entry.fontUnderline) langLines.push(`  text-decoration: underline;`);
    if (entry.letterSpacing) langLines.push(`  letter-spacing: ${entry.letterSpacing};`);
    if (entry.textShadow) langLines.push(`  text-shadow: ${entry.textShadow} ${entry.textShadowColor || 'rgba(0,0,0,0.5)'};`);
    if (entry.textStroke) langLines.push(`  -webkit-text-stroke: ${entry.textStroke};`);
    if (entry.opacity !== undefined) langLines.push(`  opacity: ${entry.opacity};`);
    if (langLines.length) parts.push(`${selector} {\n${langLines.join('\n')}\n}`);
  }

  return parts.join('\n\n');
};

/**
 * The screen the preview canvas stands in for.
 *
 * A style is written for a projector, so the preview is only honest if it is a scale model of
 * one. 1920×1080 matches the canvas's own 16:9 frame and is what almost every output actually
 * is; the exact number matters less than having one, since everything below is a ratio.
 */
export const PREVIEW_REFERENCE_WIDTH = 1920;

/**
 * Rewrite the lengths in a CSS value so they mean on the preview canvas what they would mean
 * on a presentation screen.
 *
 * `vw` and `vh` resolve against the browser viewport, which in the editor is the whole app
 * window — so a `4vw` heading rendered at 77px in a 300px-wide preview, wildly out of
 * proportion to everything around it. There is no CSS way to re-base a viewport unit, so the
 * numbers are converted to pixels against the canvas instead: 1vw becomes one hundredth of the
 * canvas width, exactly as it is one hundredth of the screen.
 *
 * Absolute lengths are scaled by the same ratio, because they too are a fraction of the real
 * screen. Without that, a 40px font would draw at 40px in a 320px canvas — an eighth of the
 * width, where on the projector it is a fiftieth — and the preview would flatter it badly.
 *
 * Percentages and `em` are left alone: they are already relative to something that scales.
 */
export const scaleCssLength = (value: string, canvasWidth: number, canvasHeight: number): string => {
  if (canvasWidth <= 0) return value;

  const ratio = canvasWidth / PREVIEW_REFERENCE_WIDTH;

  return value.replace(/(-?\d*\.?\d+)(vw|vh|vmin|vmax|px)\b/gi, (whole, amount: string, unit: string) => {
    const size = parseFloat(amount);
    if (!Number.isFinite(size)) return whole;

    switch (unit.toLowerCase()) {
      case 'px':
        return `${size * ratio}px`;
      case 'vw':
        return `${(size * canvasWidth) / 100}px`;
      case 'vh':
        return `${(size * canvasHeight) / 100}px`;
      case 'vmin':
        return `${(size * Math.min(canvasWidth, canvasHeight)) / 100}px`;
      default:
        return `${(size * Math.max(canvasWidth, canvasHeight)) / 100}px`;
    }
  });
};

/** {@link scaleCssLength} across every length in a style object. */
export const scalePreviewCss = <T extends CSSProperties>(css: T, canvasWidth: number, canvasHeight: number): T => {
  if (canvasWidth <= 0) return css;

  const scaled: Record<string, unknown> = {};

  for (const [property, value] of Object.entries(css)) {
    // A url() can contain anything, including something that looks like a length.
    scaled[property] = typeof value === 'string' && !value.includes('url(') ? scaleCssLength(value, canvasWidth, canvasHeight) : value;
  }

  return scaled as T;
};

/**
 * Measure an element and scale style values against it.
 *
 * Both the sidebar preview and the gallery thumbnails are scale models of a presentation
 * screen, so both need the same conversion — see {@link scaleCssLength}. Sharing the hook
 * keeps them from drifting into two slightly different miniatures.
 */
export const usePreviewScale = () => {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const observer = useRef<ResizeObserver | null>(null);

  const measureRef = useCallback((element: HTMLElement | null) => {
    observer.current?.disconnect();
    if (!element) return;

    const next = new ResizeObserver(([entry]) => {
      const box = entry.contentRect;
      setSize((current) =>
        current.width === box.width && current.height === box.height ? current : { width: box.width, height: box.height },
      );
    });
    next.observe(element);
    observer.current = next;
  }, []);

  useEffect(() => () => observer.current?.disconnect(), []);

  const scale = useCallback(<T extends CSSProperties>(css: T) => scalePreviewCss(css, size.width, size.height), [size.width, size.height]);
  const scaleLength = useCallback((value: string) => scaleCssLength(value, size.width, size.height), [size.width, size.height]);

  return { measureRef, scale, scaleLength, size };
};

/**
 * The slots a style actually draws, each with the CSS the presentation would give it.
 *
 * Two things this gets right that a plain `visibleSlots` map does not. The main slot is subject
 * to its own `visible` flag like any other — hiding it is how you show a translation on its own
 * — and every slot inherits the main slot's typography underneath its own overrides, exactly as
 * `resolveLineLangCss` does when presenting.
 *
 * A style with no entries has no opinion, so it draws the main slot rather than nothing.
 */
export const previewSlotStyles = (entries: LanguageStyleEntry[] | undefined): { slot: number; css: CSSProperties }[] => {
  const shown = entries?.length ? visibleSlots(entries) : [MAIN_LANGUAGE_SLOT];
  const baseline = languageEntryCss(entries, MAIN_LANGUAGE_SLOT);

  return shown.map((slot) => ({
    slot,
    css: slot === MAIN_LANGUAGE_SLOT ? baseline : { ...baseline, ...languageEntryCss(entries, slot) },
  }));
};

/** Split a language's sample at the `---` separator into the current block and the next one. */
export const splitSampleAtSeparator = (lines: string[]): { current: string[]; next: string[] } => {
  const at = lines.indexOf(SONG_BLOCK_SEPARATOR);

  return at < 0 ? { current: lines, next: [] } : { current: lines.slice(0, at), next: lines.slice(at + 1) };
};
