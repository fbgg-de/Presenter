import { useRef, useEffect, useMemo } from 'react';
import { Box, Typography, Divider, Stack, Chip, Paper, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { LooksOne as OneIcon, LooksTwo as TwoIcon, Looks3 as ThreeIcon } from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { SONG_CUSTOM_NUMBER_LIMIT, readerLines, songLanguageOrder } from '@/song';
import { useGetMusicianSettings, useUpdateMusicianSetting, type MusicianLyricsView } from '@/store/musicianSlice';
import { MusicianFooter } from './MusicianFooter';

const COLUMN_ICONS = { 1: OneIcon, 2: TwoIcon, 3: ThreeIcon } as const;

/** Tracks the intended smooth-scroll destination per container. */
const lyricsScrollTargets = new WeakMap<HTMLElement, number>();

interface LyricsViewProps {
  activeSongNumber?: number;
  activeKey?: string | null;
  lyricsBlocks: { name: string; lines: string[]; copyright?: boolean }[];
  isSynced: boolean;
  operatorActiveBlockIndex: number;
  /** The operator's lyric line in the active block, once they step lines; otherwise undefined. */
  operatorLine?: number;
  textSize: number;
  showFooter: boolean;
  activeSong?: any;
  setPdfUploadOpen: (open: boolean) => void;
  /** The song's PDF versions when it has some, for the footer's switcher back to them. */
  pdfVersions?: string[];
  onSelectPdf?: (filename: string) => void;
}

export const LyricsView = ({
  activeSongNumber,
  activeKey,
  lyricsBlocks,
  isSynced,
  operatorActiveBlockIndex,
  operatorLine,
  textSize,
  showFooter,
  activeSong,
  setPdfUploadOpen,
  pdfVersions,
  onSelectPdf,
}: LyricsViewProps) => {
  const { LL } = useI18nContext();
  const blockRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Columns and languages are remembered per song on this device.
  const { musicianLyricsBySong: bySong, musicianPageView } = useGetMusicianSettings();
  const updateMusicianSetting = useUpdateMusicianSetting();
  const songKey = String(activeSongNumber);
  const view: MusicianLyricsView = bySong[songKey] ?? {};
  const updateView = (patch: MusicianLyricsView) =>
    updateMusicianSetting('musicianLyricsBySong', { ...bySong, [songKey]: { ...view, ...patch } });
  const columns = view.columns ?? (musicianPageView === 'two-page' ? 2 : 1);
  const languages = useMemo(
    () => (activeSong ? songLanguageOrder(Object.values(activeSong.blocks as Record<string, string[]>).flat(), activeSong.languages) : []),
    [activeSong],
  );
  // A song edited since could have lost every language left on; then show them all again.
  const stored = view.hiddenLanguages ?? [];
  const hidden = languages.some((code) => !stored.includes(code)) ? stored : [];
  const shownCount = languages.filter((code) => !hidden.includes(code)).length;

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
        maxWidth: [1100, 1400, 1800][columns - 1],
        width: '100%',
        mx: 'auto',
        bgcolor: 'background.paper',
      }}
    >
      <Stack
        direction="row"
        spacing={2}
        useFlexGap
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
        {/* Beside the title rather than at the far right, where the floating toolbar sits — and on
            a phone on a row of their own, since the toolbar covers the right of the title row.
            Untagged lyrics ('') have no code to switch, they follow the song's main language. */}
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', width: { xs: languages.length > 1 ? '100%' : 'auto', sm: 'auto' } }}>
          {languages.length > 1 &&
            languages.filter(Boolean).map((code) => {
              const shown = !hidden.includes(code);
              return (
                <Chip
                  key={code}
                  size="small"
                  label={code}
                  variant={shown ? 'filled' : 'outlined'}
                  color={shown ? 'primary' : 'default'}
                  // Switching off the last shown language would leave an empty sheet.
                  onClick={() =>
                    (!shown || shownCount > 1) &&
                    updateView({ hiddenLanguages: shown ? [...hidden, code] : hidden.filter((entry) => entry !== code) })
                  }
                  sx={{ fontFamily: 'monospace' }}
                />
              );
            })}
          {/* Phones in portrait always get one column (below), so the switch would do nothing there. */}
          <ToggleButtonGroup
            size="small"
            exclusive
            sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
            value={columns}
            onChange={(_, value: 1 | 2 | 3 | null) => value && updateView({ columns: value })}
          >
            {([1, 2, 3] as const).map((count) => {
              const Icon = COLUMN_ICONS[count];
              return (
                <ToggleButton key={count} value={count} title={LL.MUSICIAN.LYRICS_COLUMNS({ count })} sx={{ py: 0.25 }}>
                  <Icon fontSize="small" />
                </ToggleButton>
              );
            })}
          </ToggleButtonGroup>
        </Stack>
      </Stack>
      <Divider sx={{ mb: 2 }} />
      <Box
        sx={
          columns > 1
            ? { columnCount: { xs: 1, sm: columns }, columnGap: '2rem', columnRule: (theme) => `1px solid ${theme.palette.divider}` }
            : undefined
        }
      >
        {lyricsBlocks.map((block, blockIndex) => {
          // The credits slide has nothing to read here (the footer carries the copyright), but it
          // keeps its index so the operator's block numbers still line up.
          if (block.copyright) return null;
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
              {readerLines(block.lines, languages, hidden).map((line, li) => (
                <Typography
                  key={li}
                  variant="body2"
                  sx={{
                    whiteSpace: 'pre-wrap',
                    fontSize: textSize,
                    color: isNextBlock ? 'text.disabled' : undefined,
                    // Other languages stay readable but step back, so the eye keeps to the main one.
                    opacity: line.muted ? 0.5 : undefined,
                    // The line the operator has stepped to, with its translations.
                    ...(isActiveBlock &&
                      line.line === operatorLine && { bgcolor: 'action.selected', borderRadius: 0.5, mx: -0.5, px: 0.5 }),
                  }}
                >
                  {line.text}
                </Typography>
              ))}
            </Box>
          );
        })}
      </Box>
      {showFooter && (
        <MusicianFooter
          variant="lyrics"
          copyright={activeSong?.copyright}
          onImportPdf={() => setPdfUploadOpen(true)}
          pdfVersions={pdfVersions}
          onSelectPdf={onSelectPdf}
        />
      )}
    </Paper>
  );
};
