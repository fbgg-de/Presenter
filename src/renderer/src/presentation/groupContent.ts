/**
 * How a screen group changes the content its windows receive: which layers show, stream or whole
 * slides, languages, the stage layout, and a look of its own.
 *
 * The presentation bridge applies this to every real window; the operator preview applies it to
 * draw a group without any window being open. Keeping it in one pure function is what makes the
 * preview show exactly what the group's windows would.
 */
import type { LanguageStyleEntry } from '@/api/styles.api';
import { languagesForStyle } from '@/utils/languageSlots';
import { groupForWindow, layersForGroup, normaliseScreenGroupData, stageLayoutForGroup, type ScreenGroupEntity } from '@/screens/types';
import type { ResolvedStyle } from '@/utils/styleUtils';
import type { PresentationContent } from './types';

/** What a screen group decides about how its windows lay out the text. A missing group is a plain audience output. */
export function groupDisplay(groups: ScreenGroupEntity[], groupId: number | undefined) {
  const group = groupForWindow(groups, groupId);
  const data = group ? normaliseScreenGroupData(group.data) : undefined;
  return {
    displayMode: data?.display.mode ?? ('normal' as const),
    streamLines: data?.display.lines,
    languages: data?.languages ?? [],
    transparent: data?.transparent ?? false,
  };
}

export function applyScreenGroup(
  content: PresentationContent,
  groups: ScreenGroupEntity[],
  groupId: number | undefined,
  extras: {
    /** The group's own complete look, when it differs from the broadcast one (a theme variant). */
    style?: ResolvedStyle;
    /** The media entries playing on the group (see `media/playback.ts`). */
    media?: PresentationContent['media'];
    windowName?: string;
  } = {},
): PresentationContent {
  // The window's screen group decides everything it shows; no group shows everything.
  const layers = layersForGroup(groups, groupId);
  const display = groupDisplay(groups, groupId);
  const hideBackground = !!(content.hideBackground || layers?.background === false);
  const hideText = !!(
    content.hideText ||
    layers?.slides === false ||
    (layers?.bibleVerses === false && content.contentType === 'bible_verse')
  );

  const merged: PresentationContent = {
    ...content,
    // A group without media items shows nothing while a colour entry is active, rather than the colour.
    contentType: layers?.media === false && content.contentType === 'media' ? 'empty' : content.contentType,
    displayMode: display.displayMode,
    streamLines: display.streamLines ?? content.streamLines,
    windowName: extras.windowName || content.windowName,
    hideText,
    hideBackground,
    // A Stage group's windows draw the stage screen instead of the audience theme.
    stageLayout: stageLayoutForGroup(groups, groupId),
  };

  // A group with a different look gets its own complete style. It replaces the broadcast style
  // rather than being merged over it, so a group variant can also take a background away.
  if (extras.style) merged.style = extras.style;

  // The presentation reads the background switch from the style only, so a hidden background
  // has to be stated there — `content.hideBackground` alone never reached the renderer.
  if (hideBackground) merged.style = { ...(merged.style || {}), hideBackground: true };

  // Media layers: a group that does not show backgrounds or media items gets none; a hidden
  // background keeps running invisibly, so showing it again does not restart it.
  const background = layers?.background === false ? undefined : extras.media?.background;
  const contents = layers?.media === false ? [] : (extras.media?.contents ?? []);
  merged.media =
    background || contents.length
      ? { background: background && hideBackground ? { ...background, visible: false } : background, contents }
      : undefined;

  // Which languages a window shows is the style's decision, but the style only names slots
  // — "the second language" — so it can only be turned into actual codes here, where the song's
  // own language order is also in hand. Languages set on the screen group win over both.
  if (display.languages.length > 0) {
    merged.languages = display.languages;
  } else {
    const style = merged.style as { showAllLanguages?: boolean; languageStyles?: LanguageStyleEntry[] } | undefined;
    merged.languages = languagesForStyle(style?.languageStyles, merged.songLanguages, style?.showAllLanguages);
  }

  return merged;
}
