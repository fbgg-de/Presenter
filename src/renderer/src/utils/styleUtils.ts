import type { LanguageStyleEntry, StyleData, StyleEntity } from '@/api/styles.api';
import type { CSSProperties } from 'react';

/**
 * Resolved style data — every property has been evaluated through the cascade.
 * Only properties that are enabled at some level are present.
 */
export type ResolvedStyle = {
  backgroundImage?: string;
  backgroundVideo?: string;
  backgroundVideoAutoplay?: boolean;
  backgroundVideoVolume?: number;
  backgroundVideoSize?: string;
  backgroundVideoPosition?: string;
  backgroundVideoZoom?: number;
  backgroundVideoBlur?: number;
  backgroundColor?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundZoom?: number;
  backgroundBlur?: number;
  nextLinePreview?: boolean;
  nextLinePreviewColor?: string;
  nextLinePreviewOpacity?: number;
  fontFamily?: string;
  fontFallback?: string[];
  fontColor?: string;
  fontSize?: string;
  fontBold?: boolean;
  fontItalic?: boolean;
  fontUnderline?: boolean;
  lineHeight?: string;
  letterSpacing?: string;
  padding?: string;
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  verticalAlign?: 'top' | 'center' | 'bottom';
  textStroke?: string;
  textShadow?: string;
  textShadowColor?: string;
  opacity?: number;
  hideText?: boolean;
  hideBackground?: boolean;
  /** Per-language typography overrides */
  languageStyles?: LanguageStyleEntry[];
  /**
   * Ordered list of language tags to display (derived from languageStyles non-default entries).
   * When present and showAllLanguages is false, only these languages are shown in this order.
   */
  languageOrder?: string[];
  /** When true, show all language lines regardless of languageOrder */
  showAllLanguages?: boolean;
  /** Copyright section styles */
  copyrightFontFamily?: string;
  copyrightFontColor?: string;
  copyrightFontSize?: string;
  copyrightFontBold?: boolean;
  copyrightFontItalic?: boolean;
  copyrightFontUnderline?: boolean;
  copyrightTextAlign?: 'left' | 'center' | 'right';
  copyrightPadding?: string;
  copyrightOpacity?: number;
  /** Copyright title row settings */
  copyrightTitleFontSize?: string;
  copyrightTitleFontBold?: boolean;
  copyrightTitleFontItalic?: boolean;
  copyrightTitleFontUnderline?: boolean;
  copyrightTitleSpacing?: string;
  copyrightShowSongNumber?: boolean;
  /** Suppress background image/video inherited from parent levels */
  suppressBackgroundImage?: boolean;
  suppressBackgroundVideo?: boolean;
  /** Video ease in/out duration in seconds */
  backgroundVideoEaseIn?: number;
  backgroundVideoEaseOut?: number;
  css?: string;
};

/**
 * Extract the value of a style property if it is enabled.
 * Returns undefined if the property is missing or disabled.
 * Disabled properties are treated as "no opinion" — they do NOT
 * clear inherited values from parent levels.
 */
function extractEnabled<T>(prop: { enabled: boolean; value: T } | undefined): T | undefined {
  if (!prop) return undefined;
  if (!prop.enabled) return undefined; // disabled = no opinion, don't override parent
  return prop.value;
}

/**
 * Resolve a single StyleData into a flat ResolvedStyle,
 * only including properties that are enabled.
 * Disabled properties are omitted (undefined) so they don't
 * override inherited values in mergeStyles.
 */
export function resolveStyleData(data: StyleData | undefined): ResolvedStyle {
  if (!data) return {};

  const result: ResolvedStyle = {};

  const set = <K extends keyof ResolvedStyle>(key: K, val: ResolvedStyle[K] | undefined) => {
    if (val === undefined) return; // not present or disabled — leave unset
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (result as any)[key] = val;
  };

  set('backgroundImage', extractEnabled(data.backgroundImage));
  set('backgroundVideo', extractEnabled(data.backgroundVideo));
  set('backgroundVideoAutoplay', extractEnabled(data.backgroundVideoAutoplay));
  set('backgroundVideoVolume', extractEnabled(data.backgroundVideoVolume));
  set('backgroundVideoSize', extractEnabled(data.backgroundVideoSize));
  set('backgroundVideoPosition', extractEnabled(data.backgroundVideoPosition));
  set('backgroundVideoZoom', extractEnabled(data.backgroundVideoZoom));
  set('backgroundVideoBlur', extractEnabled(data.backgroundVideoBlur));
  set('backgroundColor', extractEnabled(data.backgroundColor));
  set('backgroundSize', extractEnabled(data.backgroundSize));
  set('backgroundPosition', extractEnabled(data.backgroundPosition));
  set('backgroundZoom', extractEnabled(data.backgroundZoom));
  set('backgroundBlur', extractEnabled(data.backgroundBlur));
  set('nextLinePreviewColor', extractEnabled(data.nextLinePreviewColor));
  set('nextLinePreview', extractEnabled(data.nextLinePreview));
  set('nextLinePreviewOpacity', extractEnabled(data.nextLinePreviewOpacity));
  set('fontFamily', extractEnabled(data.fontFamily));
  set('fontFallback', extractEnabled(data.fontFallback));
  set('fontColor', extractEnabled(data.fontColor));
  set('fontSize', extractEnabled(data.fontSize));
  set('fontBold', extractEnabled(data.fontBold));
  set('fontItalic', extractEnabled(data.fontItalic));
  set('fontUnderline', extractEnabled(data.fontUnderline));
  set('lineHeight', extractEnabled(data.lineHeight));
  set('letterSpacing', extractEnabled(data.letterSpacing));
  set('padding', extractEnabled(data.padding));
  set('textTransform', extractEnabled(data.textTransform));
  set('textAlign', extractEnabled(data.textAlign));
  set('verticalAlign', extractEnabled(data.verticalAlign));
  set('textStroke', extractEnabled(data.textStroke));
  set('textShadow', extractEnabled(data.textShadow));
  set('textShadowColor', extractEnabled(data.textShadowColor));
  set('opacity', extractEnabled(data.opacity));
  // nextLinePreviewColor and nextLinePreview handled in the background block above

  if (data.hideText !== undefined) result.hideText = data.hideText;
  if (data.hideBackground !== undefined) result.hideBackground = data.hideBackground;
  if (data.showAllLanguages !== undefined) result.showAllLanguages = data.showAllLanguages;
  set('copyrightFontFamily', extractEnabled(data.copyrightFontFamily));
  set('copyrightFontColor', extractEnabled(data.copyrightFontColor));
  set('copyrightFontSize', extractEnabled(data.copyrightFontSize));
  set('copyrightFontBold', extractEnabled(data.copyrightFontBold));
  set('copyrightFontItalic', extractEnabled(data.copyrightFontItalic));
  set('copyrightFontUnderline', extractEnabled(data.copyrightFontUnderline));
  set('copyrightTextAlign', extractEnabled(data.copyrightTextAlign));
  set('copyrightPadding', extractEnabled(data.copyrightPadding));
  set('copyrightOpacity', extractEnabled(data.copyrightOpacity));
  set('copyrightTitleFontSize', extractEnabled(data.copyrightTitleFontSize));
  set('copyrightTitleFontBold', extractEnabled(data.copyrightTitleFontBold));
  set('copyrightTitleFontItalic', extractEnabled(data.copyrightTitleFontItalic));
  set('copyrightTitleFontUnderline', extractEnabled(data.copyrightTitleFontUnderline));
  set('copyrightTitleSpacing', extractEnabled(data.copyrightTitleSpacing));
  set('copyrightShowSongNumber', extractEnabled(data.copyrightShowSongNumber));
  if (data.suppressBackgroundImage) result.suppressBackgroundImage = true;
  if (data.suppressBackgroundVideo) result.suppressBackgroundVideo = true;
  set('backgroundVideoEaseIn', extractEnabled(data.backgroundVideoEaseIn));
  set('backgroundVideoEaseOut', extractEnabled(data.backgroundVideoEaseOut));
  if (data.css) result.css = data.css;
  if (data.languageStyles?.enabled && data.languageStyles.value?.length) {
    result.languageStyles = data.languageStyles.value;
    // Build the full display order from the languageStyles array (including default '' entry).
    // '' represents the primary/untagged language line.
    if (data.languageStyles.value.length > 1) {
      result.languageOrder = data.languageStyles.value.map((e) => (e.language === '' ? '' : e.language.toUpperCase()));
    }
  }

  return result;
}

/**
 * Merge two resolved styles. Properties from `override` take precedence
 * over `base` when defined (not undefined).
 */
export function mergeStyles(base: ResolvedStyle, override: ResolvedStyle): ResolvedStyle {
  const result = { ...base };

  for (const key of Object.keys(override) as (keyof ResolvedStyle)[]) {
    const val = override[key];
    if (val !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (result as any)[key] = val;
    }
  }

  // If override suppresses background image/video, clear the inherited value
  if (override.suppressBackgroundImage) result.backgroundImage = undefined;
  if (override.suppressBackgroundVideo) result.backgroundVideo = undefined;

  // Merge CSS strings
  if (base.css && override.css) {
    result.css = `${base.css}\n${override.css}`;
  }

  return result;
}

/**
 * Three-level style cascade resolution:
 *   1. Global (account default)
 *   2. Show level
 *   3. Item level
 *
 * Each level overrides enabled properties from the previous level.
 * If a `windowName` is provided, window-specific overrides are applied
 * from each level's style.
 */
export function resolveStyleCascade(
  globalStyle: StyleEntity | undefined,
  showStyle: StyleEntity | undefined,
  itemStyle: StyleEntity | undefined,
  windowName?: string,
  allStyles?: StyleEntity[],
): ResolvedStyle {
  let result: ResolvedStyle = {};

  // Apply global style (skip if entity-level enabled is false)
  if (globalStyle && globalStyle.enabled) {
    result = mergeStyles(result, resolveStyleData(globalStyle.data));
    // Apply window override for global
    if (windowName && globalStyle.windowOverrides) {
      const windowOverride = globalStyle.windowOverrides.find((w) => w.window_name === windowName);
      if (windowOverride && allStyles) {
        const overrideStyle = allStyles.find((s) => s.id === windowOverride.override_style_id);
        if (overrideStyle) {
          result = mergeStyles(result, resolveStyleData(overrideStyle.data));
        }
      }
    }
  }

  // Apply show style (skip if entity-level enabled is false)
  if (showStyle && showStyle.enabled) {
    result = mergeStyles(result, resolveStyleData(showStyle.data));
    if (windowName && showStyle.windowOverrides) {
      const windowOverride = showStyle.windowOverrides.find((w) => w.window_name === windowName);
      if (windowOverride && allStyles) {
        const overrideStyle = allStyles.find((s) => s.id === windowOverride.override_style_id);
        if (overrideStyle) {
          result = mergeStyles(result, resolveStyleData(overrideStyle.data));
        }
      }
    }
  }

  // Apply item style (skip if entity-level enabled is false)
  if (itemStyle && itemStyle.enabled) {
    result = mergeStyles(result, resolveStyleData(itemStyle.data));
    if (windowName && itemStyle.windowOverrides) {
      const windowOverride = itemStyle.windowOverrides.find((w) => w.window_name === windowName);
      if (windowOverride && allStyles) {
        const overrideStyle = allStyles.find((s) => s.id === windowOverride.override_style_id);
        if (overrideStyle) {
          result = mergeStyles(result, resolveStyleData(overrideStyle.data));
        }
      }
    }
  }

  return result;
}

/**
 * Build a CSS font-family value from primary font + fallback list.
 */
export function buildFontFamily(fontFamily?: string, fontFallback?: string[]): string {
  const fonts: string[] = [];
  if (fontFamily) fonts.push(quoteFont(fontFamily));
  if (fontFallback) {
    fontFallback.forEach((f) => fonts.push(quoteFont(f)));
  }
  // Always end with a generic fallback
  if (!fonts.some((f) => f === 'sans-serif' || f === 'serif' || f === 'monospace')) {
    fonts.push('sans-serif');
  }
  return fonts.join(', ');
}

function quoteFont(name: string): string {
  // Don't quote generic families or already-quoted names
  const generics = ['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui'];
  if (generics.includes(name.toLowerCase()) || name.startsWith('"') || name.startsWith("'")) {
    return name;
  }
  return `"${name}"`;
}

/**
 * Build a text-shadow CSS value from textShadow (offset+blur) and textShadowColor.
 */
function buildTextShadow(textShadow?: string, textShadowColor?: string): string | undefined {
  if (!textShadow) return undefined;
  const color = textShadowColor || 'rgba(0,0,0,0.5)';
  return `${textShadow} ${color}`;
}

/**
 * Convert a ResolvedStyle into CSS properties for the presentation container.
 */
export function styleToContainerCss(style: ResolvedStyle): CSSProperties {
  const css: CSSProperties = {};

  if (style.backgroundColor && !style.hideBackground) {
    css.backgroundColor = style.backgroundColor;
  }

  // NOTE: backgroundImage is intentionally NOT applied here as CSS background-image.
  // It is rendered as an <img> element in Presentation.tsx so that zoom (transform: scale)
  // and objectFit can be applied consistently with background videos.

  if (style.padding) {
    css.padding = style.padding;
  }

  if (style.opacity !== undefined) {
    css.opacity = style.opacity;
  }

  return css;
}

/**
 * Convert a ResolvedStyle into CSS properties for text elements.
 */
export function styleToTextCss(style: ResolvedStyle): CSSProperties {
  const css: CSSProperties = {};

  if (style.fontFamily || style.fontFallback) {
    css.fontFamily = buildFontFamily(style.fontFamily, style.fontFallback);
  }

  if (style.fontColor) {
    css.color = style.fontColor;
  }

  if (style.fontSize) {
    css.fontSize = style.fontSize;
  }

  if (style.fontBold) {
    css.fontWeight = 'bold';
  }

  if (style.fontItalic) {
    css.fontStyle = 'italic';
  }

  if (style.fontUnderline) {
    css.textDecoration = 'underline';
  }

  if (style.lineHeight) {
    css.lineHeight = style.lineHeight;
  }

  if (style.letterSpacing) {
    css.letterSpacing = style.letterSpacing;
  }

  if (style.textTransform) {
    css.textTransform = style.textTransform;
  }

  if (style.textAlign) {
    css.textAlign = style.textAlign;
  }

  if (style.textStroke) {
    css.WebkitTextStroke = style.textStroke;
  }

  const textShadow = buildTextShadow(style.textShadow, style.textShadowColor);
  if (textShadow) {
    css.textShadow = textShadow;
  }

  return css;
}

/**
 * Default presentation style used when no styles are configured.
 */
export const DEFAULT_STYLE: ResolvedStyle = {
  backgroundColor: '#000000',
  fontFamily: 'Roboto',
  fontFallback: ['Arial'],
  fontColor: '#FFFFFF',
  fontSize: '4vw',
  fontBold: true,
  lineHeight: '120%',
  textAlign: 'center',
  padding: '0vw 0vh',
};

/**
 * Well-known web-safe fonts for the font picker.
 */
export const WEB_SAFE_FONTS = [
  'Arial',
  'Arial Black',
  'Verdana',
  'Tahoma',
  'Trebuchet MS',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'Lucida Console',
  'Palatino Linotype',
  'Book Antiqua',
  'Impact',
  'Comic Sans MS',
  'Segoe UI',
  'Roboto',
  'Helvetica',
  'Garamond',
  'Cambria',
  'Calibri',
  'Candara',
  'Optima',
  'Futura',
  'Century Gothic',
  'Gill Sans',
];
