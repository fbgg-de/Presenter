import { useMemo, useRef, useEffect, memo, useCallback } from 'react';
import { Card, CardContent, CardMedia, Stack, Typography, useTheme } from '@mui/material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useAppSelector, useAppDispatch } from '@/store';
import { setActiveBlockIndex, setActiveLineIndex } from '@/store/presentationSlice';
import { selectCurrentSongOrder } from '@/store/songsSlice';

// Stable sx objects (module scope so identity never changes between renders)
const containerSx = {
  flexGrow: 1,
  flexWrap: 'wrap',
  gap: 2,
  padding: '0 25px 20px',
  alignContent: 'baseline',
  overflowY: 'auto',
  userSelect: 'none',
} as const;
const blockNameSx = { padding: '6px', textAlign: 'center', cursor: 'pointer' } as const;
const cardContentSx = { paddingX: 0 } as const;

interface BlockCardProps {
  blockIndex: number;
  name: string;
  lines: string[];
  copyright?: boolean;
  selected: boolean;
  activeLineIndex: number;
  color: string;
  songNumber?: number;
  songTitle?: string;
  songAuthors?: string;
  songCopyright?: string;
  unknownLabel: string;
  onBlockClick: (i: number) => void;
  onBlockDoubleClick: (i: number) => void;
  onLineClick: (b: number, l: number) => void;
  forwardRef?: React.Ref<HTMLDivElement>;
}

/**
 * Memoized block card. Re-renders only when its own props change, so navigating
 * between lines/blocks no longer re-renders every block in the song.
 */
const BlockCard = memo(function BlockCard({
  blockIndex,
  name,
  lines,
  copyright,
  selected,
  activeLineIndex,
  color,
  songNumber,
  songTitle,
  songAuthors,
  songCopyright,
  unknownLabel,
  onBlockClick,
  onBlockDoubleClick,
  onLineClick,
  forwardRef,
}: BlockCardProps) {
  return (
    <Card ref={forwardRef} sx={{ flexGrow: 1, border: `1px solid ${color}` }}>
      <CardMedia sx={{ background: color }}>
        <Typography
          variant="h6"
          sx={blockNameSx}
          onClick={() => onBlockClick(blockIndex)}
          onDoubleClick={() => onBlockDoubleClick(blockIndex)}
        >
          {name}
        </Typography>
      </CardMedia>
      <CardContent sx={cardContentSx}>
        {copyright ? (
          <Typography
            variant="body1"
            sx={{
              paddingX: '14px',
              background: selected ? color : 'none',
              whiteSpace: 'pre-wrap',
              cursor: 'pointer',
            }}
            onDoubleClick={() => onBlockDoubleClick(blockIndex)}
          >
            (#{songNumber}) {songTitle ?? unknownLabel}
            {songAuthors && `\n${songAuthors}`}
            {songCopyright && `\n${songCopyright}`}
          </Typography>
        ) : (
          lines.map((line, lineIndex) => (
            <Typography
              key={lineIndex}
              variant="body1"
              sx={{
                paddingX: '14px',
                background: selected && lineIndex === activeLineIndex ? color : 'none',
                cursor: 'pointer',
              }}
              onClick={() => onLineClick(blockIndex, lineIndex)}
            >
              {line}
            </Typography>
          ))
        )}
      </CardContent>
    </Card>
  );
});

const ControlSong = () => {
  const { palette } = useTheme();
  const dispatch = useAppDispatch();
  const { LL } = useI18nContext();

  const verseClick = useAppSelector((state) => state.settings.verseClick);
  const activeBlockIndex = useAppSelector((state) => state.presentation.activeBlockIndex);
  const activeLineIndex = useAppSelector((state) => state.presentation.activeLineIndex);

  const currentSongNumber = useAppSelector((state) => state.songs.songsOrder[state.presentation.activeItemIndex]);
  const currentSong = useAppSelector((state) => (currentSongNumber ? state.songs.songs[currentSongNumber] : undefined));
  const orderName = useAppSelector((state) => (currentSongNumber ? selectCurrentSongOrder(state, currentSongNumber) : 'Default'));

  const selectedRef = useRef<HTMLDivElement | null>(null);

  // Scroll selected block into view only when activeBlockIndex changes
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeBlockIndex]);

  // Memoize blocks so getBlocks isn't called on every line-index change
  const songBlocks = useMemo(() => {
    if (!currentSong) return [];
    return currentSong.getBlocks(orderName);
  }, [currentSong, orderName]);

  const handleBlockClick = useCallback(
    (blockIndex: number) => {
      if (verseClick === 'click') {
        dispatch(setActiveBlockIndex(blockIndex));
      }
    },
    [verseClick, dispatch],
  );

  const handleBlockDoubleClick = useCallback(
    (blockIndex: number) => {
      if (verseClick === 'double-click') {
        dispatch(setActiveBlockIndex(blockIndex));
      }
    },
    [verseClick, dispatch],
  );

  const handleLineClick = useCallback(
    (blockIndex: number, lineIndex: number) => {
      dispatch(setActiveBlockIndex(blockIndex));
      dispatch(setActiveLineIndex(lineIndex));
    },
    [dispatch],
  );

  if (!currentSong) {
    return null;
  }

  const unknownLabel = LL.COMMON.TITLE_UNKNOWN();

  return (
    <Stack direction="row" sx={containerSx}>
      {songBlocks.map(({ name, lines, copyright }, blockIndex) => {
        const selected = activeBlockIndex === blockIndex;
        const color = selected ? palette.secondary.main : palette.primary.main;
        return (
          <BlockCard
            key={blockIndex}
            blockIndex={blockIndex}
            name={name}
            lines={lines}
            copyright={copyright}
            selected={selected}
            // Pass activeLineIndex only when this block is selected so non-selected
            // blocks do not re-render when the active line moves within the active block.
            activeLineIndex={selected ? activeLineIndex : -1}
            color={color}
            songNumber={currentSong.songNumber}
            songTitle={currentSong.title}
            songAuthors={currentSong.authors}
            songCopyright={currentSong.copyright}
            unknownLabel={unknownLabel}
            onBlockClick={handleBlockClick}
            onBlockDoubleClick={handleBlockDoubleClick}
            onLineClick={handleLineClick}
            forwardRef={selected ? selectedRef : undefined}
          />
        );
      })}
    </Stack>
  );
};

export default ControlSong;
