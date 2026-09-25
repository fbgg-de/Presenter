/**
 * A Bible verse in the operator view: one slide card per page, drawn in the item's look like song
 * slides. A line holding only `---` in the verse text starts a new page ("Edit text" in the set
 * list), and navigation steps through the pages like song sections.
 */
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { useI18nContext } from '@/i18n/i18n-react';
import type { ShowItem } from '@/api/shows.api';
import { useGetPresentationSettings } from '@/store/presentationSlice';
import { useGetSettings } from '@/store/settingsSlice';
import { useActiveLook } from '@/hooks/useActiveLook';
import { useSlideSelect } from '@/hooks/useSlideSelect';
import { resolveLook, themeSource } from '@/look/resolveLook';
import { versePages } from '@/utils/itemBlocks';
import { LookPill } from '@/components/operator/LookPill';
import { SlideCard, SlideGrid } from '@/components/show/SlideCard';

const ControlBibleVerse = ({ item, index: itemIndex, isLive }: { item: ShowItem; index: number; isLive: boolean }) => {
  const { LL } = useI18nContext();
  const { songClick } = useGetSettings('songClick');
  const { activeBlockIndex } = useGetPresentationSettings('activeBlockIndex');
  const { select: selectSlide, previewTarget } = useSlideSelect();
  const { input } = useActiveLook(itemIndex);
  const style = useMemo(() => resolveLook(input).style, [input]);
  const theme = themeSource(input);
  const pages = useMemo(() => versePages(item), [item]);

  const selectedRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
  }, [activeBlockIndex]);

  const handleClick = useCallback(
    (index: number) => {
      if (songClick === 'click') selectSlide(itemIndex, index);
    },
    [songClick, selectSlide, itemIndex],
  );
  const handleDoubleClick = useCallback(
    (index: number) => {
      if (songClick === 'double-click') selectSlide(itemIndex, index);
    },
    [songClick, selectSlide, itemIndex],
  );

  return (
    <SlideGrid
      title={item.bibleRef || LL.BIBLE.VERSE()}
      subtitle={item.bibleTranslation}
      pills={theme.name ? <LookPill kind="theme" label={theme.name} /> : undefined}
    >
      {pages.map((page, index) => {
        const selected = isLive && index === activeBlockIndex;
        return (
          <SlideCard
            key={index}
            blockIndex={index}
            name={page.name}
            lines={page.lines}
            style={style}
            selected={selected}
            previewed={previewTarget?.itemIndex === itemIndex && previewTarget.blockIndex === index}
            label={selected ? LL.OPERATOR.LIVE_SLIDE({ index: index + 1 }) : String(index + 1)}
            onBlockClick={handleClick}
            onBlockDoubleClick={handleDoubleClick}
            forwardRef={selected ? selectedRef : undefined}
          />
        );
      })}
    </SlideGrid>
  );
};

export default memo(ControlBibleVerse);
