/**
 * The slides of the active song, as the operator view shows them: slide cards drawn in the theme
 * of the song's agenda group.
 *
 * Primary lines stay clickable inside a card, so line navigation (stream windows) keeps working;
 * translations are left out of the picture to keep it readable.
 */
import { memo, useCallback, useEffect, useMemo, useRef, type ReactNode, type Ref } from 'react';
import { Stack, Typography } from '@mui/material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useAppSelector, useAppDispatch } from '@/store';
import { setActiveBlockIndex, setActiveLineIndex, useGetPresentationSettings } from '@/store/presentationSlice';
import { selectCurrentSongOrder, useGetSongs } from '@/store/songsSlice';
import { useGetShow } from '@/store/showSlice';
import { isPrimaryLine, parseTaggedLine, resolvePrimaryLanguage } from '@/song';
import { useGetSettings } from '@/store/settingsSlice';
import { useActiveLook } from '@/hooks/useActiveLook';
import { useSlideSelect } from '@/hooks/useSlideSelect';
import { resolveLook, themeSource } from '@/look/resolveLook';
import { LookPill } from '@/components/operator/LookPill';
import { SlideCard, SlideGrid } from '@/components/show/SlideCard';

/** The song's credits slide, shown after the lyrics. */
const CopyrightCard = ({
  selected,
  label,
  lines,
  onClick,
  onDoubleClick,
  forwardRef,
}: {
  selected: boolean;
  label: string;
  lines: string[];
  onClick: () => void;
  onDoubleClick: () => void;
  forwardRef?: Ref<HTMLDivElement>;
}) => (
  <Stack spacing={0.5} ref={forwardRef} sx={{ minWidth: 0 }}>
    <Stack
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      sx={{
        aspectRatio: '16/9',
        borderRadius: 1,
        border: 2,
        borderColor: selected ? 'error.main' : 'divider',
        bgcolor: 'action.hover',
        cursor: 'pointer',
        px: 1.5,
        pb: 1.25,
        pt: 1,
        gap: 0.25,
        justifyContent: 'flex-end',
        alignItems: 'center',
        overflow: 'hidden',
      }}
    >
      {/* Like the screen: the credits sit at the bottom, centred, and wrap instead of being cut. */}
      {lines.map((line, index) => (
        <Typography
          key={index}
          sx={{
            fontWeight: index === 0 ? 600 : 400,
            fontSize: 'clamp(0.68rem, 1.05vw, 0.95rem)',
            lineHeight: 1.25,
            textAlign: 'center',
            overflowWrap: 'anywhere',
          }}
        >
          {line}
        </Typography>
      ))}
    </Stack>
    <Typography variant="caption" sx={{ color: selected ? 'error.main' : 'text.secondary' }}>
      {label}
    </Typography>
  </Stack>
);

const ControlSong = ({ index: itemIndex, isLive }: { index: number; isLive: boolean }) => {
  const dispatch = useAppDispatch();
  const { LL } = useI18nContext();
  const O = LL.OPERATOR;

  const { songClick, showLicenseNumber } = useGetSettings('songClick', 'showLicenseNumber');
  const { activeBlockIndex, activeLineIndex } = useGetPresentationSettings('activeBlockIndex', 'activeLineIndex');
  const { songsOrder, songs } = useGetSongs();
  const { currentShow } = useGetShow();

  // Resolve the current song from the SHOW order (not songsOrder — that array only
  // contains songs, so its indices diverge from item indices once non-song items exist).
  const activeShowItem = currentShow?.order?.[itemIndex];
  const currentSongNumber = activeShowItem
    ? activeShowItem.type === 'song'
      ? activeShowItem.songNumber
      : undefined
    : songsOrder[itemIndex];
  const currentSong = currentSongNumber ? songs[currentSongNumber] : undefined;
  const orderName = useAppSelector((state) => (currentSongNumber ? selectCurrentSongOrder(state, currentSongNumber) : 'Default'));

  const selectedRef = useRef<HTMLDivElement | null>(null);

  // Scroll selected slide into view only when activeBlockIndex changes.
  // Use 'auto' (not 'smooth') — smooth-scrolls stack up under fast key auto-repeat
  // and animations get cancelled mid-flight, making the controller appear to lag.
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
  }, [activeBlockIndex]);

  // Memoize blocks so getBlocks isn't called on every line-index change
  const songBlocks = useMemo(() => (currentSong ? currentSong.getBlocks(orderName) : []), [currentSong, orderName]);

  // Primary lines per block — the rows line navigation counts.
  const primaryLines = useMemo(
    () =>
      songBlocks.map(({ lines, copyright }) => {
        if (copyright) return [];
        const anchor = resolvePrimaryLanguage(lines, currentSong?.languages?.[0]);
        return lines.filter((line) => isPrimaryLine(line, anchor)).map((line) => parseTaggedLine(line).text);
      }),
    [songBlocks, currentSong],
  );

  // One theme for every slide: the agenda group's.
  const { input } = useActiveLook(itemIndex);
  const style = useMemo(() => resolveLook(input).style, [input]);
  const theme = themeSource(input);

  const { select: selectSlide, previewTarget } = useSlideSelect();
  const handleBlockClick = useCallback(
    (blockIndex: number) => {
      if (songClick === 'click') selectSlide(itemIndex, blockIndex);
    },
    [songClick, selectSlide, itemIndex],
  );

  const handleBlockDoubleClick = useCallback(
    (blockIndex: number) => {
      if (songClick === 'double-click') selectSlide(itemIndex, blockIndex);
    },
    [songClick, selectSlide, itemIndex],
  );

  const handleLineClick = useCallback(
    (blockIndex: number, lineIndex: number) => {
      // A line of a song that is not on screen yet sends its slide, like a slide click.
      if (!isLive) {
        selectSlide(itemIndex, blockIndex);
        return;
      }
      dispatch(setActiveBlockIndex(blockIndex));
      dispatch(setActiveLineIndex(lineIndex));
    },
    [dispatch, isLive, selectSlide, itemIndex],
  );

  if (!currentSong) {
    return null;
  }

  return (
    <SlideGrid title={currentSong.title} subtitle={orderName} pills={theme.name ? <LookPill kind="theme" label={theme.name} /> : undefined}>
      {songBlocks.flatMap(({ name, copyright }, blockIndex) => {
        const selected = isLive && activeBlockIndex === blockIndex;
        const nodes: ReactNode[] = [];

        if (copyright) {
          const credits = [
            `#${currentSong.songNumber} ${currentSong.title ?? LL.COMMON.TITLE_UNKNOWN()}`,
            currentSong.authors,
            currentSong.copyright,
            showLicenseNumber && currentSong.account ? `${LL.AUTH.LICENSE_NUMBER()}: ${currentSong.account}` : undefined,
          ].filter((line): line is string => !!line);
          nodes.push(
            <CopyrightCard
              key={blockIndex}
              selected={selected}
              label="©"
              lines={credits}
              onClick={() => handleBlockClick(blockIndex)}
              onDoubleClick={() => handleBlockDoubleClick(blockIndex)}
              forwardRef={selected ? selectedRef : undefined}
            />,
          );
          return nodes;
        }

        nodes.push(
          <SlideCard
            key={blockIndex}
            blockIndex={blockIndex}
            name={name}
            lines={primaryLines[blockIndex]}
            style={style}
            selected={selected}
            previewed={previewTarget?.itemIndex === itemIndex && previewTarget.blockIndex === blockIndex}
            // Only the selected slide follows the active line, so the others do not re-render.
            activeLineIndex={selected ? activeLineIndex : -1}
            label={selected ? O.LIVE_SLIDE({ index: blockIndex + 1 }) : String(blockIndex + 1)}
            onBlockClick={handleBlockClick}
            onBlockDoubleClick={handleBlockDoubleClick}
            onLineClick={handleLineClick}
            forwardRef={selected ? selectedRef : undefined}
          />,
        );
        return nodes;
      })}
    </SlideGrid>
  );
};

export default memo(ControlSong);
