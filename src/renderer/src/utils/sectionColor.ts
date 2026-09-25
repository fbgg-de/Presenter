/**
 * Fixed colour per song section kind, so a song's shape reads at a glance (verse blue, chorus
 * violet…), the way ProPresenter colours its slide groups. Matched from the section NAME, English
 * and German, ignoring numbers and suffixes ("Verse 2", "Strophe 1a", "Refrain 2x").
 *
 * No red and no green: red means "on air" and green "healthy" everywhere else in the operator view.
 * Names that match nothing get no colour rather than a guessed one.
 */

export type SectionKind = 'verse' | 'prechorus' | 'chorus' | 'bridge' | 'intro' | 'outro' | 'interlude' | 'tag';

export const SECTION_COLORS: Record<SectionKind, string> = {
  verse: '#3b82f6',
  prechorus: '#06b6d4',
  chorus: '#a855f7',
  bridge: '#f97316',
  intro: '#64748b',
  outro: '#64748b',
  interlude: '#eab308',
  tag: '#ec4899',
};

// Order matters: "pre-chorus" before "chorus", "vorrefrain" before "refrain".
const PATTERNS: [RegExp, SectionKind][] = [
  [/^(pre[- ]?chorus|pre[- ]?refrain|vor[- ]?refrain|channel|lift)/, 'prechorus'],
  [/^(chorus|refrain|kehrvers)/, 'chorus'],
  [/^(verse|vers|strophe|stanza)/, 'verse'],
  [/^(bridge|br[üu]cke)/, 'bridge'],
  [/^(intro|einleitung|vorspiel)/, 'intro'],
  [/^(outro|ending|end|schluss|nachspiel|coda)/, 'outro'],
  [/^(interlude|instrumental|zwischenspiel|solo)/, 'interlude'],
  [/^(tag|vamp|misc)/, 'tag'],
];

export const sectionKind = (name: string | null | undefined): SectionKind | null => {
  const key = (name ?? '').trim().toLowerCase();
  if (!key) return null;
  for (const [pattern, kind] of PATTERNS) if (pattern.test(key)) return kind;
  return null;
};

export const sectionColor = (name: string | null | undefined): string | null => {
  const kind = sectionKind(name);
  return kind ? SECTION_COLORS[kind] : null;
};
