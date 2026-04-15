import type { StyleData, StyleEntity } from '@/api/styles.api';
import type { CSSProperties } from 'react';

/**
 * Resolved style data — every property has been evaluated through the cascade.
 * Only properties that are enabled at some level are present.
 */
export type ResolvedStyle = {
  backgroundImage?: string;
  backgroundVideo?: string;
  backgroundColor?: string;
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
  textStroke?: string;
  textShadow?: string;
  textShadowColor?: string;
  opacity?: number;
  hideText?: boolean;
  hideBackground?: boolean;
  nextLinePreviewColor?: string;
  css?: string;
};

/**
 * Extract the value of a style property if it is enabled.
 * Returns undefined if the property is missing or disabled.
 */
function extractEnabled<T>(prop: { enabled: boolean; value: T } | undefined): T | undefined {
  if (!prop || !prop.enabled) return undefined;
  return prop.value;
}

/**
 * Resolve a single StyleData into a flat ResolvedStyle,
 * only including properties that are enabled.
 */
export function resolveStyleData(data: StyleData | undefined): ResolvedStyle {
  if (!data) return {};

  const result: ResolvedStyle = {};

  if (extractEnabled(data.backgroundImage) !== undefined) result.backgroundImage = extractEnabled(data.backgroundImage);
  if (extractEnabled(data.backgroundVideo) !== undefined) result.backgroundVideo = extractEnabled(data.backgroundVideo);
  if (extractEnabled(data.backgroundColor) !== undefined) result.backgroundColor = extractEnabled(data.backgroundColor);
  if (extractEnabled(data.fontFamily) !== undefined) result.fontFamily = extractEnabled(data.fontFamily);
  if (extractEnabled(data.fontFallback) !== undefined) result.fontFallback = extractEnabled(data.fontFallback);
  if (extractEnabled(data.fontColor) !== undefined) result.fontColor = extractEnabled(data.fontColor);
  if (extractEnabled(data.fontSize) !== undefined) result.fontSize = extractEnabled(data.fontSize);
  if (extractEnabled(data.fontBold) !== undefined) result.fontBold = extractEnabled(data.fontBold);
  if (extractEnabled(data.fontItalic) !== undefined) result.fontItalic = extractEnabled(data.fontItalic);
  if (extractEnabled(data.fontUnderline) !== undefined) result.fontUnderline = extractEnabled(data.fontUnderline);
  if (extractEnabled(data.lineHeight) !== undefined) result.lineHeight = extractEnabled(data.lineHeight);
  if (extractEnabled(data.letterSpacing) !== undefined) result.letterSpacing = extractEnabled(data.letterSpacing);
  if (extractEnabled(data.padding) !== undefined) result.padding = extractEnabled(data.padding);
  if (extractEnabled(data.textTransform) !== undefined) result.textTransform = extractEnabled(data.textTransform);
  if (extractEnabled(data.textAlign) !== undefined) result.textAlign = extractEnabled(data.textAlign);
  if (extractEnabled(data.textStroke) !== undefined) result.textStroke = extractEnabled(data.textStroke);
  if (extractEnabled(data.textShadow) !== undefined) result.textShadow = extractEnabled(data.textShadow);
  if (extractEnabled(data.textShadowColor) !== undefined) result.textShadowColor = extractEnabled(data.textShadowColor);
  if (extractEnabled(data.opacity) !== undefined) result.opacity = extractEnabled(data.opacity);
  if (extractEnabled(data.nextLinePreviewColor) !== undefined) result.nextLinePreviewColor = extractEnabled(data.nextLinePreviewColor);
  if (data.hideText !== undefined) result.hideText = data.hideText;
  if (data.hideBackground !== undefined) result.hideBackground = data.hideBackground;
  if (data.css) result.css = data.css;

  return result;
}

/**
 * Merge two resolved styles. Properties from `override` take precedence
 * over `base` when defined (not undefined).
 */
export function mergeStyles(base: ResolvedStyle, override: ResolvedStyle): ResolvedStyle {
  const result = { ...base };

  for (const key of Object.keys(override) as (keyof ResolvedStyle)[]) {
    if (override[key] !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (result as any)[key] = override[key];
    }
  }

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

  // Apply global style
  if (globalStyle) {
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

  // Apply show style
  if (showStyle) {
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

  // Apply item style
  if (itemStyle) {
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

  if (style.backgroundImage && !style.hideBackground) {
    css.backgroundImage = `url("${style.backgroundImage}")`;
    css.backgroundSize = 'cover';
    css.backgroundPosition = 'center';
    css.backgroundRepeat = 'no-repeat';
  }

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
  fontFamily: 'Arial',
  fontColor: '#FFFFFF',
  fontSize: '4vh',
  lineHeight: '1.4',
  textAlign: 'center',
  padding: '5% 10%',
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
