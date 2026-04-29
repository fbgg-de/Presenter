import { Box, Typography, Divider, Stack, Chip, Paper } from '@mui/material';
import { useI18nContext } from '@/i18n/i18n-react';
import { SONG_CUSTOM_NUMBER_LIMIT } from '@/song';
import { MusicianFooter } from './MusicianFooter';

interface LyricsViewProps {
  activeSongNumber?: number;
  activeKey?: string | null;
  lyricsBlocks: { name: string; lines: string[] }[];
  isSynced: boolean;
  operatorActiveBlockIndex: number;
  pageView: string;
  textSize: number;
  showFooter: boolean;
  activeSong?: any;
  setPdfUploadOpen: (open: boolean) => void;
}

export const LyricsView = ({
  activeSongNumber,
  activeKey,
  lyricsBlocks,
  isSynced,
  operatorActiveBlockIndex,
  pageView,
  textSize,
  showFooter,
  activeSong,
  setPdfUploadOpen,
}: LyricsViewProps) => {
  const { LL } = useI18nContext();

  return (
    <Paper
      elevation={0}
      sx={{
        flex: 1,
        overflowY: 'auto',
        p: 3,
        maxWidth: pageView === 'two-page' ? 1400 : 1100,
        width: '100%',
        mx: 'auto',
        bgcolor: 'background.paper',
      }}
    >
      <Stack
        direction="row"
        spacing={2}
        sx={{
          alignItems: 'center',
          mb: 2,
          flexWrap: 'wrap',
        }}
      >
        <Typography variant="h6" sx={{ fontSize: textSize * 1.4 }} noWrap>
          {activeSong?.title}
        </Typography>
        {activeSongNumber != null && activeSongNumber < SONG_CUSTOM_NUMBER_LIMIT && (
          <Chip
            label={LL.MUSICIAN.SONG_NUMBER({ number: activeSongNumber })}
            size="small"
            variant="outlined"
            sx={{ fontSize: textSize * 0.65 }}
          />
        )}
        {activeSongNumber != null && activeSongNumber >= SONG_CUSTOM_NUMBER_LIMIT && (
          <Chip
            label={LL.MUSICIAN.CCLI_NUMBER({ number: activeSongNumber })}
            size="small"
            variant="outlined"
            component="a"
            href={`https://songselect.ccli.com/songs/${activeSongNumber}/`}
            target="_blank"
            clickable
            sx={{ fontSize: textSize * 0.65, textDecoration: 'none' }}
          />
        )}
        {activeKey && (
          <Chip
            label={LL.MUSICIAN.KEY_LABEL({ key: activeKey })}
            size="small"
            sx={{ fontSize: textSize * 0.65, backgroundColor: 'primary.main', color: 'primary.contrastText' }}
          />
        )}
      </Stack>
      <Divider sx={{ mb: 2 }} />
      <Box
        sx={
          pageView === 'two-page' ? { columnCount: 2, columnGap: '2rem', columnRule: '1px solid', columnRuleColor: 'divider' } : undefined
        }
      >
        {lyricsBlocks.map((block: { name: string; lines: string[] }, blockIndex: number) => {
          const isActiveBlock = isSynced && blockIndex === operatorActiveBlockIndex;
          return (
            <Box
              key={blockIndex}
              sx={{
                mb: 2,
                breakInside: 'avoid',
                pl: 1.5,
                borderLeft: '4px solid',
                borderColor: isActiveBlock ? 'primary.main' : 'transparent',
                transition: 'border-color 0.2s',
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                  fontWeight: 600,
                  fontSize: textSize * 0.75,
                  display: 'block',
                }}
              >
                {block.name}
              </Typography>
              {block.lines.map((line: string, li: number) => (
                <Typography key={li} variant="body2" sx={{ whiteSpace: 'pre-wrap', fontSize: textSize }}>
                  {line}
                </Typography>
              ))}
            </Box>
          );
        })}
      </Box>
      {showFooter && <MusicianFooter variant="lyrics" copyright={activeSong?.copyright} onImportPdf={() => setPdfUploadOpen(true)} />}
    </Paper>
  );
};
