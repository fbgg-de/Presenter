import { useMemo, useRef, useEffect, memo, useCallback } from 'react';
import { Card, CardContent, CardMedia, Stack, Typography, useTheme } from '@mui/material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useAppSelector, useAppDispatch } from '@/store';
import { setActiveBlockIndex, setActiveLineIndex, useGetPresentationSettings } from '@/store/presentationSlice';
import { selectCurrentSongOrder, useGetSongs } from '@/store/songsSlice';
import { SONG_TRANSLATION_LINE_REGEX } from '@/song';
import { useGetSettings } from '@/store/settingsSlice';

// Stable sx objects (module scope so identity never changes between renders)
const containerSx = {
  flexGrow: 1,
  flexWrap: 'wrap',
  gap: 2,
  padding: '0 25px 20px',
  alignContent: 'flex-start',
  justifyContent: 'flex-start',
  overflowY: 'auto',
  userSelect: 'none',
} as const;
const blockNameSx = { padding: '6px', textAlign: 'center', cursor: 'pointer' } as const;
const cardContentSx = { paddingX: 0 } as const;

/**
 * Parse a raw line into primary text and optional language tag.
 */
function parseLine(raw: string): { text: string; language?: string } {
  const match = raw.match(SONG_TRANSLATION_LINE_REGEX);
  if (match) return { text: match[2], language: match[1].toUpperCase() };
  return { text: raw };
}

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
 * Memoized block card. Re-renders only when its own props change.
 * Translation lines (tagged with [XX]) are shown italic/grey and non-selectable.
 * Only primary (untagged) lines count for activeLineIndex navigation.
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
  // Build display rows: each primary line may be followed by translation lines
  type Row = { primaryIdx: number; text: string; translations: string[] };
  const rows: Row[] = [];
  let primaryIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const parsed = parseLine(lines[i]);
    if (!parsed.language) {
      rows.push({ primaryIdx: primaryIdx++, text: parsed.text, translations: [] });
    } else if (rows.length > 0) {
      rows[rows.length - 1].translations.push(parsed.text);
    }
  }

  return (
    <Card ref={forwardRef} sx={{ flexGrow: 1, minWidth: '150px', border: `1px solid ${color}` }}>
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
          <Stack
            sx={{
              paddingX: '14px',
              background: selected ? color : 'none',
              cursor: 'pointer',
            }}
            onDoubleClick={() => onBlockDoubleClick(blockIndex)}
          >
            <Typography
              sx={{
                fontWeight: 'bold',
                whiteSpace: 'nowrap',
              }}
            >
              (#{songNumber}) {songTitle ?? unknownLabel}
            </Typography>
            {songAuthors && <Typography>{songAuthors}</Typography>}
            {songCopyright && <Typography sx={{ fontStyle: 'italic' }}>{songCopyright}</Typography>}
          </Stack>
        ) : (
          rows.map((row) => {
            const isActive = selected && row.primaryIdx === activeLineIndex;
            return (
              <div key={row.primaryIdx}>
                {/* Primary line — selectable */}
                <Typography
                  variant="body1"
                  sx={{
                    paddingX: '14px',
                    background: isActive ? color : 'none',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                  onClick={() => onLineClick(blockIndex, row.primaryIdx)}
                >
                  {row.text}
                </Typography>
                {/* Translation lines — italic, grey, non-selectable */}
                {row.translations.map((t, ti) => (
                  <Typography
                    key={ti}
                    variant="body2"
                    sx={{
                      paddingX: '14px',
                      fontStyle: 'italic',
                      color: 'text.disabled',
                      pointerEvents: 'none',
                      lineHeight: 1.2,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t}
                  </Typography>
                ))}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
});

const ControlSong = () => {
  const { palette } = useTheme();
  const dispatch = useAppDispatch();
  const { LL } = useI18nContext();

  const { verseClick } = useGetSettings();
  const { activeBlockIndex, activeLineIndex, activeItemIndex } = useGetPresentationSettings();
  const { songsOrder, songs } = useGetSongs();

  const currentSongNumber = songsOrder[activeItemIndex];
  const currentSong = currentSongNumber ? songs[currentSongNumber] : undefined;
  const orderName = useAppSelector((state) => (currentSongNumber ? selectCurrentSongOrder(state, currentSongNumber) : 'Default'));

  const selectedRef = useRef<HTMLDivElement | null>(null);

  // Scroll selected block into view only when activeBlockIndex changes.
  // Use 'auto' (not 'smooth') — smooth-scrolls stack up under fast key auto-repeat
  // and animations get cancelled mid-flight, making the controller appear to lag.
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

export default memo(ControlSong);
