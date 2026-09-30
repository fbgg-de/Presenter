/**
 * A PDF or PowerPoint entry in the operator view: one card per page, clicked and stepped like song
 * slides. A page's click builds are steps of its own — the arrow keys go through them before the
 * next page — and the live card counts them.
 *
 * Opening the file here also reads how many builds each page has into the entry: navigation, the
 * remote and the screens count from the entry, not from the file.
 *
 * A page that turns to the next by itself has a timer chip in its card's footer, armed or not —
 * click to switch it, drawn and switched like a video's regions in the layer bar (the slides row
 * there has the same chips per step). Pages timed in PowerPoint have one from the start; any other
 * page gets one by arming it (the chip shows on hover), or all of them at once from the header.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AlertTitle, Box, Button, Chip, IconButton, Skeleton, Stack, Tooltip, Typography } from '@mui/material';
import { visuallyHidden } from '@mui/utils';
import {
  FontDownloadOff as MissingFontIcon,
  Refresh as RetryIcon,
  TimerOffOutlined as DisarmIcon,
  TimerOutlined as TimerIcon,
  Visibility as ShowPageIcon,
  VisibilityOff as HidePageIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import type { ShowItem } from '@/api/shows.api';
import { useAppDispatch } from '@/store';
import { updateShowItem } from '@/store/showSlice';
import { setActiveBlockIndex, useGetPresentationSettings } from '@/store/presentationSlice';
import { useGetSettings } from '@/store/settingsSlice';
import { useSlideSelect } from '@/hooks/useSlideSelect';
import { documentFileOf } from '@/presentation/itemContent';
import { probeMediaUrl, type MediaProbeStatus } from '@/utils/mediaUrl';
import { useMediaFolderConfigured } from '@/media/useMediaFolder';
import { MediaFolderNotice } from '@/components/media/MediaFolderNotice';
import {
  documentArmHint,
  documentArmingShown,
  documentBlockOfPage,
  documentPageMs,
  documentSteps,
  documentSummary,
} from '@/document/document';
import { takeDocument, type OpenedDocument } from '@/document/openDocument';
import { useAdvanceClock, useDocumentArming } from '@/document/autoAdvance';
import { SlideCard, SlideGrid } from '@/components/show/SlideCard';
import { useTick } from '@/components/media/Transport';
import { armableChipSx } from '@/media/armableChip';
import { LAYER_COLORS } from '@/components/operator/layerRows';

/**
 * The file opened off-screen, for its pages' pictures and builds — kept after use, so reopening the
 * entry is instant. A failed file is not kept, so `retry` opens it anew.
 */
function useOpenedDocument(item: ShowItem): { url?: string; doc?: OpenedDocument; error?: string; retry: () => void } {
  const file = documentFileOf(item);
  const kind = file?.kind;
  const url = file?.url;
  const [attempt, setAttempt] = useState(0);
  const key = `${url} ${attempt}`;
  // Kept with the file and attempt it belongs to, so another file (or a retry) reads as not opened yet.
  const [state, setState] = useState<{ key?: string; doc?: OpenedDocument; error?: string }>({});
  useEffect(() => {
    if (!kind || !url) return;
    let cancelled = false;
    const lease = takeDocument(kind, url);
    const opened = `${url} ${attempt}`;
    lease.opened
      .then((doc) => {
        if (!cancelled) setState({ key: opened, doc });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ key: opened, error: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      cancelled = true;
      lease.release();
    };
  }, [kind, url, attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return state.key === key ? { url, doc: state.doc, error: state.error, retry } : { url, retry };
}

/** Why a file could not be opened, asked of the server: nothing answers, the file is not there, or it is there but unreadable. */
function useFailureReason(url: string | undefined, failed: boolean): MediaProbeStatus | undefined {
  const [reason, setReason] = useState<{ url: string; status: MediaProbeStatus }>();
  useEffect(() => {
    if (!failed || !url) return;
    let cancelled = false;
    void probeMediaUrl(url).then((status) => {
      if (!cancelled) setReason({ url, status });
    });
    return () => {
      cancelled = true;
    };
  }, [url, failed]);
  return failed && reason && reason.url === url ? reason.status : undefined;
}

/** A file's name from its path or address, as people know it. */
const fileNameOf = (path: string | undefined): string => {
  const name = (path ?? '').split(/[\\/]/).pop()?.split('?')[0] ?? '';
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
};

/** Pages shown while nothing is known about the file yet — about a short deck's worth. */
const PLACEHOLDER_PAGES = 6;

/** A page not drawn yet: a slide's outline — a title and a few lines — shimmering in its place. */
const PageSkeleton = () => (
  <Stack sx={{ position: 'absolute', inset: 0, p: '9% 10%', gap: '7%', bgcolor: 'rgba(255,255,255,0.03)' }}>
    <Skeleton variant="rounded" animation="wave" sx={{ width: '58%', height: '15%', transform: 'none', flexShrink: 0 }} />
    {[86, 72, 78].map((width) => (
      <Skeleton
        key={width}
        variant="rounded"
        animation="wave"
        sx={{ width: `${width}%`, height: '7%', transform: 'none', flexShrink: 0 }}
      />
    ))}
  </Stack>
);

/** A page's picture, redrawn when the card changes size; its outline shimmers until the first drawing is done. */
const PageThumb = memo(function PageThumb({ doc, page }: { doc: OpenedDocument; page: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let width = 0;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      // A page that cannot be drawn stops shimmering too: it would never end otherwise.
      void doc
        .drawPage(page, el)
        .catch(() => {})
        .finally(() => setDrawn(true));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [doc, page]);
  return (
    <>
      {!drawn && <PageSkeleton />}
      <Box ref={ref} sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', pointerEvents: 'none' }} />
    </>
  );
});

/**
 * In place of the cards when the file could not be opened: which file, why in plain words (once the
 * server has been asked), the address and the error itself for whoever looks into it, and Try again.
 */
const OpenError = ({ name, url, message, onRetry }: { name: string; url?: string; message: string; onRetry: () => void }) => {
  const { LL } = useI18nContext();
  const D = LL.DOCUMENT;
  const reason = useFailureReason(url, true);
  const configured = useMediaFolderConfigured();
  const address = url ? new URL(url).host : '';
  // The media folder's fault — none set up, or its server silent — is said as such, with the way to fix it.
  const folder = !configured ? 'unset' : reason === 'server_down' ? 'unreachable' : undefined;
  if (folder) return <MediaFolderNotice issue={folder} address={address} onRetry={onRetry} sx={{ gridColumn: '1 / -1' }} />;
  const why =
    reason === 'not_found' ? D.OPEN_NOT_FOUND({ menu: LL.AGENDA_DROP.RELINK_MENU() }) : reason === 'ok' ? D.OPEN_UNREADABLE() : undefined;
  return (
    <Alert
      severity="error"
      variant="outlined"
      sx={{ gridColumn: '1 / -1', '& .MuiAlert-message': { minWidth: 0, flex: 1 } }}
      action={
        <Button color="inherit" size="small" startIcon={<RetryIcon />} onClick={onRetry} sx={{ whiteSpace: 'nowrap' }}>
          {D.RETRY()}
        </Button>
      }
    >
      <AlertTitle>{D.OPEN_FAILED({ name })}</AlertTitle>
      {why && (
        <Typography variant="body2" sx={{ mb: 1 }}>
          {why}
        </Typography>
      )}
      {/* The technical part, selectable to copy into a report. */}
      <Typography
        component="div"
        sx={{
          fontFamily: '"JetBrains Mono", ui-monospace, Consolas, monospace',
          fontSize: 11.5,
          color: 'text.secondary',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          userSelect: 'text',
        }}
      >
        {[url, message].filter(Boolean).join('\n')}
      </Typography>
    </Alert>
  );
};

/** Seconds until the live page turns, counting down; its full time while it is not counting. */
const Countdown = ({ itemIndex, seconds }: { itemIndex: number; seconds: number }) => {
  const clock = useAdvanceClock();
  const ours = clock?.itemIndex === itemIndex ? clock : undefined;
  const now = useTick(!!ours?.dueAt, 250);
  // The tick can be older than a step that just began.
  return <>{ours?.dueAt ? Math.max(0, Math.ceil((ours.dueAt - Math.max(now, ours.startedAt)) / 1000)) : seconds} s</>;
};

/**
 * A page's turn to the next one by itself, in its card's footer: its time, armed or not, in the
 * look of a video's region chips (`armableChipSx`). The live page counts down while its time runs.
 */
const AdvanceChip = ({
  itemIndex,
  seconds,
  hint,
  armed,
  live,
  hoverOnly,
  onToggle,
}: {
  itemIndex: number;
  seconds: number;
  hint: string;
  armed: boolean;
  live: boolean;
  /** Shown only while the card is hovered: nothing in the deck turns by itself yet. */
  hoverOnly: boolean;
  onToggle: () => void;
}) => (
  <Tooltip title={hint} slotProps={{ tooltip: { sx: { whiteSpace: 'pre-line' } } }}>
    <Chip
      size="small"
      variant="outlined"
      className={hoverOnly ? 'on-card-hover' : undefined}
      aria-pressed={armed}
      aria-label={hint}
      icon={<TimerIcon />}
      label={armed && live ? <Countdown itemIndex={itemIndex} seconds={seconds} /> : `${seconds} s`}
      onClick={onToggle}
      sx={{
        ...armableChipSx(LAYER_COLORS.slides, { off: !armed, held: armed && live }),
        // Smaller than in the layer bar: it shares the caption line under the card.
        height: 20,
        fontSize: 11,
        fontVariantNumeric: 'tabular-nums',
        transition: 'opacity 120ms',
        '& .MuiChip-icon': { fontSize: 13, ml: 0.5, color: armed ? LAYER_COLORS.slides : 'text.disabled' },
        '& .MuiChip-label': { px: 0.5 },
      }}
    />
  </Tooltip>
);

const ControlDocument = ({ item, index: itemIndex, isLive }: { item: ShowItem; index: number; isLive: boolean }) => {
  const { LL } = useI18nContext();
  const D = LL.DOCUMENT;
  const dispatch = useAppDispatch();
  const { songClick, operatorMode } = useGetSettings('songClick', 'operatorMode');
  // Leaving pages out edits the show, which Live keeps locked.
  const locked = operatorMode === 'live';
  const { activeBlockIndex } = useGetPresentationSettings('activeBlockIndex');
  const { select: selectSlide, previewTarget } = useSlideSelect();
  const { url, doc, error, retry } = useOpenedDocument(item);

  const known = item.documentBuilds;
  const knownTimings = item.documentTimings;
  const advance = item.documentAdvance;
  useEffect(() => {
    if (!doc) return;
    const update: Partial<ShowItem> = {};
    if (JSON.stringify(doc.builds) !== JSON.stringify(known)) update.documentBuilds = doc.builds;
    const timings = doc.timings.some((ms) => ms !== null) ? doc.timings : undefined;
    if (JSON.stringify(timings) !== JSON.stringify(knownTimings)) update.documentTimings = timings;
    // A deck set up in PowerPoint to run by itself (its timings used, looping) starts out that way
    // here: the pages timed there are armed.
    const runs = doc.usesTimings && !!timings;
    if (!advance && (runs || doc.loops)) {
      const armed = runs ? timings.flatMap((ms, page) => (ms === null ? [] : [page])) : undefined;
      update.documentAdvance = { armed, loop: doc.loops };
    }
    if (Object.keys(update).length) dispatch(updateShowItem({ index: itemIndex, item: update }));
  }, [doc, known, knownTimings, advance, dispatch, itemIndex]);

  const builds = useMemo(() => doc?.builds ?? known ?? [], [doc, known]);
  const hidden = useMemo(() => item.documentHidden ?? [], [item.documentHidden]);
  const steps = documentSteps(builds, hidden);
  const live = isLive ? steps[activeBlockIndex] : undefined;
  const previewed = previewTarget?.itemIndex === itemIndex ? steps[previewTarget.blockIndex] : undefined;

  const selectedRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
  }, [live?.page]);

  const go = useCallback(
    (page: number) => {
      const block = documentBlockOfPage(builds, page, hidden);
      if (block >= 0) selectSlide(itemIndex, block);
    },
    [selectSlide, itemIndex, builds, hidden],
  );
  const handleClick = useCallback((page: number) => songClick === 'click' && go(page), [songClick, go]);
  const handleDoubleClick = useCallback((page: number) => songClick === 'double-click' && go(page), [songClick, go]);

  const togglePage = (page: number) => {
    const next = hidden.includes(page) ? hidden.filter((p) => p !== page) : [...hidden, page].sort((a, b) => a - b);
    // A live entry keeps what is on screen: the same page and build, at its new place in the steps.
    if (live) dispatch(setActiveBlockIndex(documentSteps(builds, next).findIndex((s) => s.page === live.page && s.step === live.step)));
    dispatch(updateShowItem({ index: itemIndex, item: { documentHidden: next } }));
  };
  const shownCount = builds.length - hidden.filter((page) => page < builds.length).length;

  // Arming is running the show, not editing it, so Live leaves it open (as it does a video's regions).
  const arming = useDocumentArming(item, itemIndex);
  // Until a page turns by itself, the chips only show on hover: most decks are turned by hand.
  const quiet = !documentArmingShown(item);

  const fonts = doc?.missingFonts.length ? D.MISSING_FONTS({ fonts: doc.missingFonts.join(', ') }) : undefined;

  return (
    <SlideGrid
      title={item.label || D.DOCUMENT()}
      subtitle={documentSummary(LL, item)}
      pills={
        <>
          {fonts && (
            <Tooltip title={fonts}>
              <MissingFontIcon fontSize="small" color="warning" aria-label={fonts} />
            </Tooltip>
          )}
          {doc && (
            <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
              {arming.armedCount < arming.shownCount && (
                <Tooltip title={D.ARM_ALL_HINT()}>
                  <Chip size="small" variant="outlined" icon={<TimerIcon />} label={D.ARM_ALL()} onClick={arming.armAll} />
                </Tooltip>
              )}
              {arming.armedCount > 0 && (
                <Tooltip title={D.DISARM_ALL_HINT()}>
                  <Chip size="small" variant="outlined" icon={<DisarmIcon />} label={D.DISARM_ALL()} onClick={arming.disarmAll} />
                </Tooltip>
              )}
            </Stack>
          )}
        </>
      }
    >
      {error && <OpenError name={fileNameOf(item.mediaPath) || item.label || D.DOCUMENT()} url={url} message={error} onRetry={retry} />}
      {/* While the file opens: its pages as outlines — as many as the entry knows, live and picked
          ones marked, and clickable, so the service can go on — under a line saying so. */}
      {!doc && !error && (
        <>
          {/* The outlines say it on screen; this says it to a screen reader. */}
          <Box role="status" sx={visuallyHidden}>
            {D.LOADING()}
          </Box>
          {(known?.length ? known : Array<number>(PLACEHOLDER_PAGES).fill(0)).map((count, page) => {
            const selected = live?.page === page;
            const left = hidden.includes(page);
            return (
              <SlideCard
                key={page}
                blockIndex={page}
                name={known ? (left ? D.HIDDEN() : count ? D.BUILDS({ count }) : '') : ''}
                selected={selected}
                previewed={previewed?.page === page}
                label={String(page + 1)}
                onBlockClick={known && !left ? handleClick : undefined}
                onBlockDoubleClick={known && !left ? handleDoubleClick : undefined}
                forwardRef={selected ? selectedRef : undefined}
              >
                <Box sx={{ position: 'absolute', inset: 0, opacity: left ? 0.3 : 1 }}>
                  <PageSkeleton />
                </Box>
              </SlideCard>
            );
          })}
        </>
      )}
      {doc &&
        builds.map((count, page) => {
          const selected = live?.page === page;
          const left = hidden.includes(page);
          // The live page stays, and so does the last one shown.
          const canToggle = !locked && (left || (!selected && shownCount > 1));
          return (
            <SlideCard
              key={page}
              blockIndex={page}
              name={left ? D.HIDDEN() : count ? D.BUILDS({ count }) : ''}
              selected={selected}
              previewed={previewed?.page === page}
              label={selected && count ? D.BUILD({ page: page + 1, step: live.step, builds: count }) : String(page + 1)}
              onBlockClick={left ? undefined : handleClick}
              onBlockDoubleClick={left ? undefined : handleDoubleClick}
              forwardRef={selected ? selectedRef : undefined}
              aspectRatio={String(doc.aspect)}
              footerBadge={
                !left && (
                  <AdvanceChip
                    itemIndex={itemIndex}
                    seconds={Math.round(documentPageMs(item, page) / 1000)}
                    hint={documentArmHint(LL, item, page)}
                    armed={arming.armed.includes(page)}
                    live={selected}
                    hoverOnly={quiet}
                    onToggle={() => arming.toggle(page)}
                  />
                )
              }
            >
              <Box sx={{ position: 'absolute', inset: 0, '&:hover .page-toggle': { opacity: 1 } }}>
                <Box sx={{ position: 'absolute', inset: 0, opacity: left ? 0.3 : 1 }}>
                  <PageThumb doc={doc} page={page} />
                </Box>
                {canToggle && (
                  <Tooltip title={left ? D.SHOW_PAGE() : D.HIDE_PAGE()}>
                    <IconButton
                      className="page-toggle"
                      size="small"
                      aria-label={left ? D.SHOW_PAGE() : D.HIDE_PAGE()}
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePage(page);
                      }}
                      onDoubleClick={(e) => e.stopPropagation()}
                      sx={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        color: '#fff',
                        bgcolor: 'rgba(0,0,0,0.55)',
                        opacity: left ? 1 : 0,
                        '&:hover, &:focus-visible': { bgcolor: 'rgba(0,0,0,0.75)', opacity: 1 },
                      }}
                    >
                      {left ? <ShowPageIcon fontSize="small" /> : <HidePageIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            </SlideCard>
          );
        })}
    </SlideGrid>
  );
};

export default memo(ControlDocument);
