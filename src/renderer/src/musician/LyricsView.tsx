import { useRef, useEffect } from 'react';
import { Box, Typography, Divider, Stack, Chip, Paper } from '@mui/material';
import { useI18nContext } from '@/i18n/i18n-react';
import { SONG_CUSTOM_NUMBER_LIMIT } from '@/song';
import { MusicianFooter } from './MusicianFooter';

/** Tracks the intended smooth-scroll destination per container. */
const lyricsScrollTargets = new WeakMap<HTMLElement, number>();

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
  const blockRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Scroll active block into view only when it's not fully visible.
  useEffect(() => {
    if (!isSynced || operatorActiveBlockIndex < 0 || operatorActiveBlockIndex >= lyricsBlocks.length) return;

    let raf2: number;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const el = blockRefs.current[operatorActiveBlockIndex];
        if (!el) return;
        const scrollParent = el.closest('[data-lyrics-scroll]') as HTMLElement | null;
        if (!scrollParent) return;
        if (el.offsetHeight === 0) return;

        // Compute the element's position in scroll-space via offsetParent chain.
        // This is stable regardless of any in-progress smooth scroll animation,
        // unlike getBoundingClientRect() which returns mid-animation viewport coords.
        let elOffsetTop = 0;
        let node: HTMLElement | null = el;
        while (node && node !== scrollParent) {
          elOffsetTop += node.offsetTop;
          node = node.offsetParent as HTMLElement | null;
        }
        const elOffsetBottom = elOffsetTop + el.offsetHeight;

        const pending = lyricsScrollTargets.get(scrollParent);
        const effectiveTop = pending ?? scrollParent.scrollTop;
        const fullyVisible = elOffsetTop >= effectiveTop && elOffsetBottom <= effectiveTop + scrollParent.clientHeight;

        if (!fullyVisible) {
          const targetScroll = Math.max(0, elOffsetTop - scrollParent.clientHeight / 2 + el.offsetHeight / 2);
          lyricsScrollTargets.set(scrollParent, targetScroll);
          scrollParent.scrollTo({ top: targetScroll, behavior: 'smooth' });
          scrollParent.addEventListener('scrollend', function onScrollEnd() {
            scrollParent.removeEventListener('scrollend', onScrollEnd);
            if (lyricsScrollTargets.get(scrollParent) === targetScroll) lyricsScrollTargets.delete(scrollParent);
          });
        }
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [isSynced, operatorActiveBlockIndex, lyricsBlocks.length]);

  return (
    <Paper
      data-lyrics-scroll=""
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
          const activeBlockName = lyricsBlocks[operatorActiveBlockIndex]?.name;
          const isNextBlock = isSynced && blockIndex === operatorActiveBlockIndex + 1 && block.name !== activeBlockName;
          return (
            <Box
              key={blockIndex}
              ref={(el: HTMLDivElement | null) => {
                blockRefs.current[blockIndex] = el;
              }}
              sx={{
                mb: 2,
                breakInside: 'avoid',
                pl: 1.5,
                borderLeft: '4px solid',
                borderColor: isActiveBlock ? 'primary.main' : isNextBlock ? 'action.disabled' : 'transparent',
                transition: 'border-color 0.2s, opacity 0.2s',
                opacity: isActiveBlock ? 1 : isNextBlock ? 0.6 : 1,
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  color: isActiveBlock ? 'primary.main' : isNextBlock ? 'text.disabled' : 'text.secondary',
                  fontWeight: 600,
                  fontSize: textSize * 0.75,
                  display: 'block',
                }}
              >
                {block.name}
              </Typography>
              {block.lines.map((line: string, li: number) => (
                <Typography
                  key={li}
                  variant="body2"
                  sx={{ whiteSpace: 'pre-wrap', fontSize: textSize, color: isNextBlock ? 'text.disabled' : undefined }}
                >
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
