import { Card, CardContent, CardMedia, Stack, Typography, useTheme } from '@mui/material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useAppSelector, useAppDispatch } from '@/store';
import { setActiveBlockIndex, setActiveLineIndex } from '@/store/presentationSlice';
import { selectCurrentSongOrder } from '@/store/songsSlice';

const ControlSong = () => {
  const { palette } = useTheme();
  const dispatch = useAppDispatch();
  const { LL } = useI18nContext();

  const verseClick = useAppSelector((state) => state.settings.verseClick);
  const activeItemIndex = useAppSelector((state) => state.presentation.activeItemIndex);
  const activeBlockIndex = useAppSelector((state) => state.presentation.activeBlockIndex);
  const activeLineIndex = useAppSelector((state) => state.presentation.activeLineIndex);

  const songsOrder = useAppSelector((state) => state.songs.songsOrder);
  const songs = useAppSelector((state) => state.songs.songs);

  const currentSongNumber = songsOrder[activeItemIndex];
  const currentSong = currentSongNumber ? songs[currentSongNumber] : undefined;
  const orderName = useAppSelector((state) => (currentSongNumber ? selectCurrentSongOrder(state, currentSongNumber) : 'Default'));

  if (!currentSong) {
    return null;
  }

  const handleBlockClick = (blockIndex: number) => {
    if (verseClick === 'click') {
      dispatch(setActiveBlockIndex(blockIndex));
    }
  };

  const handleBlockDoubleClick = (blockIndex: number) => {
    if (verseClick === 'double-click') {
      dispatch(setActiveBlockIndex(blockIndex));
    }
  };

  const handleLineClick = (blockIndex: number, lineIndex: number) => {
    dispatch(setActiveBlockIndex(blockIndex));
    dispatch(setActiveLineIndex(lineIndex));
  };

  return (
    <Stack
      direction="row"
      sx={{
        flexGrow: 1,
        flexWrap: 'wrap',
        gap: 2,
        padding: '0 25px 20px',
        alignContent: 'baseline',
        overflowY: 'auto',
        userSelect: 'none',
      }}
    >
      {currentSong.getBlocks(orderName).map(({ name, lines, copyright }, blockIndex) => {
        const selected = activeBlockIndex === blockIndex;
        const color = selected ? palette.secondary.main : palette.primary.main;

        return (
          <Card
            key={blockIndex}
            {...(selected && { ref: (e: HTMLDivElement) => e?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) })}
            sx={{ flexGrow: 1, border: `1px solid ${color}` }}
          >
            <CardMedia sx={{ background: color }}>
              <Typography
                variant="h6"
                sx={{ padding: '6px', textAlign: 'center', cursor: 'pointer' }}
                onClick={() => handleBlockClick(blockIndex)}
                onDoubleClick={() => handleBlockDoubleClick(blockIndex)}
              >
                {name}
              </Typography>
            </CardMedia>
            <CardContent sx={{ paddingX: 0 }}>
              {copyright ? (
                <Typography
                  variant="body1"
                  sx={{
                    paddingX: '14px',
                    background: selected ? color : 'none',
                    whiteSpace: 'pre-wrap',
                    cursor: 'pointer',
                  }}
                  onDoubleClick={() => dispatch(setActiveBlockIndex(blockIndex))}
                >
                  (#{currentSong.songNumber}) {currentSong.title ?? LL.COMMON.TITLE_UNKNOWN()}
                  {currentSong.authors && `\n${currentSong.authors}`}
                  {currentSong.copyright && `\n${currentSong.copyright}`}
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
                    onClick={() => handleLineClick(blockIndex, lineIndex)}
                  >
                    {line}
                  </Typography>
                ))
              )}
            </CardContent>
          </Card>
        );
      })}
    </Stack>
  );
};

export default ControlSong;
