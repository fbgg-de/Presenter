import type { ResolvedStyle } from '@/utils/styleUtils';

/**
 * Display mode for a presentation window.
 * - normal: full block display (all lines visible)
 * - stream: two-line scrolling display (current + next line)
 */
export type DisplayMode = 'normal' | 'stream';

/**
 * Type of content being displayed.
 */
export type ContentType = 'song' | 'bible_verse' | 'media' | 'empty';

/**
 * A single line with optional language tag.
 */
export interface PresentationLine {
  text: string;
  language?: string;
  bold?: boolean;
}

/**
 * A block of lines for display.
 */
export interface PresentationBlock {
  name: string;
  lines: PresentationLine[];
}

/**
 * Content payload sent from the control window to presentation windows.
 */
export interface PresentationContent {
  /** What type of content is active */
  contentType: ContentType;

  /** Display mode */
  displayMode: DisplayMode;

  /** Active block index */
  activeBlockIndex: number;

  /** Active line index within the block */
  activeLineIndex: number;

  /** All blocks for the current item (songs / paginated bible) */
  blocks: PresentationBlock[];

  /** Resolved style (pre-merged through the cascade) */
  style: ResolvedStyle;

  /** Whether the screen should be black */
  isBlack: boolean;

  /** Song / item title (for reference display) */
  title?: string;

  /** Song copyright text */
  copyright?: string;

  /** Song author */
  authors?: string;

  // ── Media fields ──

  /** Media sub-type */
  mediaSubType?: 'image' | 'video' | 'color';

  /** Media path (image / video URL) */
  mediaPath?: string;

  /** Solid color value */
  mediaColor?: string;

  // ── Bible fields ──

  /** Bible verse reference */
  bibleRef?: string;

  /** Bible translation name */
  bibleTranslation?: string;

  /** Bible API copyright notice */
  bibleCopyright?: string;

  // ── Next-line preview ──

  /** Lines for the next-block preview (shown at bottom of presentation) */
  nextBlockPreviewLines?: PresentationLine[];

  /** Color for the next-block preview text */
  nextLinePreviewColor?: string;

  // ── Window config ──

  /** Languages to display (filter). Empty = all languages. */
  languages?: string[];

  /** Number of lines for stream mode */
  streamLines?: number;

  /** Whether text should be hidden */
  hideText?: boolean;

  /** Whether background should be hidden */
  hideBackground?: boolean;

  /** Window name (for identification overlay) */
  windowName?: string;

  /** Whether to show identification overlay */
  showIdentify?: boolean;

  /** Whether to show copyright overlay at the bottom */
  showCopyright?: boolean;

  /** Duration in ms before copyright auto-hides (default 3000) */
  copyrightDisplayDuration?: number;

  /** Style name to display during identification */
  identifyStyleName?: string;

  /** Window number (for identification overlay) */
  windowNumber?: number;

  /** Transition mode: 'cut' (instant) or 'fade' (cross-fade) */
  transitionMode?: 'cut' | 'fade';

  /** Transition duration in milliseconds */
  transitionDuration?: number;
}

/**
 * Default / empty presentation content.
 */
export const EMPTY_CONTENT: PresentationContent = {
  contentType: 'empty',
  displayMode: 'normal',
  activeBlockIndex: 0,
  activeLineIndex: 0,
  blocks: [],
  style: {},
  isBlack: false,
};
