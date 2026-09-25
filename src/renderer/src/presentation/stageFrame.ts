/**
 * What a stage screen needs from the content, in a shape both the presentation window and the
 * operator's preview tile can build: title, key, the arrangement, and the current and next
 * section as plain primary-language lines.
 */
import type { PresentationContent, PresentationLine } from './types';

export interface StageFrame {
  kind: PresentationContent['contentType'];
  title?: string;
  songKey?: string;
  /** Section (or verse page) names in play order. */
  sections: string[];
  activeIndex: number;
  /** Primary-language lines of the section on screen. */
  current: string[];
  next?: { name: string; lines: string[] };
  /** Text cleared by the operator: the frame stays, the lyrics go. */
  textHidden: boolean;
}

/** Lines of the song's own language — translations would only crowd a stage screen. */
const primaryLines = (lines: PresentationLine[], anchor?: string): string[] => {
  const main = anchor?.toUpperCase();
  const kept = lines.filter((line) => !line.language || (!!main && line.language.toUpperCase() === main));
  return (kept.length ? kept : lines).map((line) => line.text).filter((text) => text.trim());
};

export function stageFrameFromContent(content: PresentationContent): StageFrame {
  const blocks = content.contentType === 'song' || content.contentType === 'bible_verse' ? content.blocks : [];
  const anchor = content.songLanguages?.[0];
  const current = blocks[content.activeBlockIndex];
  const next = blocks[content.activeBlockIndex + 1];
  return {
    kind: content.contentType,
    title: content.contentType === 'bible_verse' ? content.bibleRef || content.title : content.title,
    songKey: content.contentType === 'song' ? content.songKey : undefined,
    sections: blocks.map((block) => block.name),
    activeIndex: content.activeBlockIndex,
    current: current ? primaryLines(current.lines, anchor) : [],
    next: next ? { name: next.name, lines: primaryLines(next.lines, anchor) } : undefined,
    textHidden: !!(content.hideText || content.showCopyright),
  };
}
