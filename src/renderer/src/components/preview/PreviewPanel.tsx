/**
 * The operator's monitors, after an editing suite's Cut page and a vision mixer: **Program** on
 * top — what the screens of one screen group show now, black and hidden text included — and
 * **Preview** below, with what comes next. Both are drawn by the real renderer and nothing
 * reaches the screens until **Take**.
 *
 * What Preview holds, in this order: a slide waiting to go live ("preview before live"), the entry
 * opened in the agenda, else simply the next slide — so it always answers "what happens if I
 * press Take?". ◀ ▶ step through it without touching the screens. One group switch drives both
 * monitors; guides mark the title- and action-safe areas; the Program monitor can be folded away
 * on a small screen; the pop-out opens the preview in a window of its own.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Box, Button, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import {
  ChevronLeft as PrevIcon,
  ChevronRight as NextIcon,
  Close as DiscardIcon,
  CropFree as GuidesIcon,
  OpenInNew as PopOutIcon,
  Replay as BackIcon,
  ViewAgendaOutlined as DualIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useAppDispatch } from '@/store';
import { useGetSettings, useUpdateSetting } from '@/store/settingsSlice';
import { setOpenItemIndex, setPreviewTarget, useGetPresentationSettings, useOpenItem } from '@/store/presentationSlice';
import { useGetShow } from '@/store/showSlice';
import { useGetScreenGroupsQuery } from '@/api/screenGroups.api';
import { usePreviewContent } from '@/hooks/usePreviewContent';
import { usePresentationWindows } from '@/hooks/usePresentationWindows';
import { useSlideSelect } from '@/hooks/useSlideSelect';
import { useShortcut } from '@/hooks/useShortcut';
import { useEntryRunning } from '@/media/useMediaHost';
import { PLAYHEAD } from '@/components/media/Transport';
import { MonitorFrame, SafeAreaGuides, Segmented } from '@/components/media/Viewer';
import { PREVIEW_PAGE_URL, PresentationFrame } from './PresentationFrame';
import type { PresentationContent } from '@/presentation/types';

const DEFAULT_SIZE = { width: 1920, height: 1080 };
/** Preview's tally: green, as on a vision mixer (Program is red). */
const PREVIEW_TALLY = '#3fb950';

/** One monitor: the shared frame around the real renderer, or a line saying why there is nothing. */
const Monitor = ({
  tally,
  label,
  labelHint,
  info,
  badges,
  content,
  size,
  guides,
  title,
  empty,
}: {
  tally: string;
  label: string;
  labelHint?: string;
  info?: string;
  badges?: ReactNode;
  content: PresentationContent | undefined;
  size: { width: number; height: number };
  guides: boolean;
  title: string;
  empty: string;
}) => (
  <MonitorFrame tally={tally} label={label} labelHint={labelHint} info={info} badges={badges}>
    {content ? (
      <PresentationFrame content={content} width={size.width} height={size.height} title={title} />
    ) : (
      <Stack sx={{ aspectRatio: `${size.width} / ${size.height}`, alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="caption" sx={{ color: 'rgba(233,236,239,0.5)', px: 2, textAlign: 'center' }}>
          {empty}
        </Typography>
      </Stack>
    )}
    {guides && content && <SafeAreaGuides />}
  </MonitorFrame>
);

/** A small word on a tally strip: BLACK, TEXT HIDDEN. */
const Badge = ({ children }: { children: ReactNode }) => (
  <Box
    component="span"
    sx={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, px: 0.5, borderRadius: 0.5, bgcolor: PLAYHEAD, color: '#fff', flexShrink: 0 }}
  >
    {children}
  </Box>
);

export const PreviewPanel = () => {
  const { LL } = useI18nContext();
  const P = LL.PREVIEW;
  const dispatch = useAppDispatch();
  const { operatorPreviewGroupId, operatorPreviewProgram, operatorPreviewGuides } = useGetSettings(
    'operatorPreviewGroupId',
    'operatorPreviewProgram',
    'operatorPreviewGuides',
  );
  const updateSetting = useUpdateSetting();
  const { activeItemIndex, activeBlockIndex, previewTarget, isBlack, isTextHidden } = useGetPresentationSettings(
    'activeItemIndex',
    'activeBlockIndex',
    'previewTarget',
    'isBlack',
    'isTextHidden',
  );
  const open = useOpenItem();
  const { currentShow } = useGetShow();
  const openEntry = currentShow?.order?.[open.index];
  // An image or video started from its card is already on screen; audio never goes there.
  const running = useEntryRunning(openEntry, open.index) || openEntry?.mediaSubType === 'audio';
  const { sendPreviewLive, goLive } = useSlideSelect();
  const takeKey = useShortcut('send_preview_live');
  const { data: allGroups = [] } = useGetScreenGroupsQuery();
  const rig = usePresentationWindows();

  const groups = useMemo(() => allGroups.filter((g) => g.enabled).sort((a, b) => a.sort_order - b.sort_order), [allGroups]);
  const group = groups.find((g) => g.id === operatorPreviewGroupId) ?? groups[0];

  // Draw at the size of a real window of the group on this computer, so proportions match.
  const size = useMemo(() => {
    const win = rig.windows.find((w) => w.config.screenGroupId === group?.id && (w.bounds || (w.config.width && w.config.height)));
    const width = win?.bounds?.width ?? win?.config.width;
    const height = win?.bounds?.height ?? win?.config.height;
    return width && height ? { width, height } : DEFAULT_SIZE;
  }, [rig.windows, group?.id]);

  // ── Program: the live slide as the screens have it ──
  const liveState = useMemo(() => ({ isBlack, hideText: isTextHidden }), [isBlack, isTextHidden]);
  const program = usePreviewContent(activeItemIndex, activeBlockIndex, group?.id, liveState);

  // ── Preview: waiting slide → opened entry → the next slide ──
  const itemCount = currentShow?.order?.length ?? 0;
  const opened = !open.isLive && !running;
  const nextSlide =
    activeBlockIndex + 1 < program.slideCount
      ? { itemIndex: activeItemIndex, blockIndex: activeBlockIndex + 1 }
      : activeItemIndex + 1 < itemCount
        ? { itemIndex: activeItemIndex + 1, blockIndex: 0 }
        : undefined;
  const kind: 'waiting' | 'opened' | 'next' = previewTarget ? 'waiting' : opened ? 'opened' : 'next';
  const target = previewTarget ?? (opened ? { itemIndex: open.index, blockIndex: 0 } : nextSlide);
  const targetKey = target ? `${target.itemIndex}:${target.blockIndex}` : '';
  const [step, setStep] = useState<{ key: string; block: number } | null>(null);
  const block = target ? (step?.key === targetKey ? step.block : target.blockIndex) : 0;
  const preview = usePreviewContent(target?.itemIndex ?? -1, block, group?.id);
  const stepTo = (next: number) => setStep({ key: targetKey, block: Math.max(0, Math.min(preview.slideCount - 1, next)) });

  const take = () => {
    if (!target) return;
    if (previewTarget || opened) sendPreviewLive(block);
    else goLive(target.itemIndex, block);
    setStep(null);
  };
  const discard = () => dispatch(previewTarget ? setPreviewTarget(null) : setOpenItemIndex(null));

  const slideInfo = (content: { slideCount: number; slideName?: string }, index: number) =>
    content.slideCount > 0 && content.slideName !== undefined ? `${content.slideName} · ${index + 1}/${content.slideCount}` : undefined;

  // ── Pop-out: the Preview monitor in a window of its own ──
  const popupRef = useRef<Window | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const contentRef = useRef(preview.content);
  contentRef.current = preview.content;
  const postToPopup = (next = contentRef.current) => {
    const popup = popupRef.current;
    if (popup && !popup.closed && next) popup.postMessage({ type: 'UPDATE_PRESENTATION', props: { content: next } }, '*');
  };
  useEffect(() => {
    postToPopup(preview.content);
  }, [preview.content]);
  useEffect(() => {
    if (!popupOpen) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source === popupRef.current && event.data?.type === 'PREVIEW_READY') postToPopup();
    };
    window.addEventListener('message', onMessage);
    const poll = setInterval(() => {
      if (!popupRef.current || popupRef.current.closed) setPopupOpen(false);
    }, 1000);
    return () => {
      window.removeEventListener('message', onMessage);
      clearInterval(poll);
    };
  }, [popupOpen]);
  const openPopup = () => {
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.focus();
      return;
    }
    const popup = window.open(`${PREVIEW_PAGE_URL}&popout=1`, 'presenter-preview', 'width=960,height=560,resizable=yes');
    popupRef.current = popup;
    setPopupOpen(!!popup);
  };

  const toolIcon = { fontSize: 17 };
  const previewLabel = kind === 'waiting' ? P.WAITING() : kind === 'opened' ? P.OPENED() : P.NEXT();

  return (
    <Stack spacing={1} sx={{ p: 1.25, borderBottom: 1, borderColor: 'divider' }}>
      {/* Group switch and the monitor options */}
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', minHeight: 28 }}>
        {groups.length > 1 ? (
          <Tooltip title={P.SCREEN_GROUP()}>
            <Box sx={{ minWidth: 0, overflowX: 'auto' }}>
              <Segmented
                value={String(group?.id ?? '')}
                options={groups.map((g) => ({ value: String(g.id), label: g.name }))}
                onChange={(id) => updateSetting('operatorPreviewGroupId', Number(id))}
              />
            </Box>
          </Tooltip>
        ) : (
          <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary' }}>
            {group?.name ?? P.TITLE()}
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        <Tooltip title={P.GUIDES()}>
          <IconButton
            size="small"
            aria-pressed={operatorPreviewGuides}
            color={operatorPreviewGuides ? 'warning' : 'default'}
            onClick={() => updateSetting('operatorPreviewGuides', !operatorPreviewGuides)}
          >
            <GuidesIcon sx={toolIcon} />
          </IconButton>
        </Tooltip>
        <Tooltip title={P.SHOW_PROGRAM()}>
          <IconButton
            size="small"
            aria-pressed={operatorPreviewProgram}
            color={operatorPreviewProgram ? 'primary' : 'default'}
            onClick={() => updateSetting('operatorPreviewProgram', !operatorPreviewProgram)}
          >
            <DualIcon sx={toolIcon} />
          </IconButton>
        </Tooltip>
        <Tooltip title={P.POP_OUT()}>
          <IconButton size="small" color={popupOpen ? 'primary' : 'default'} onClick={openPopup} aria-label={P.POP_OUT()}>
            <PopOutIcon sx={toolIcon} />
          </IconButton>
        </Tooltip>
      </Stack>

      {operatorPreviewProgram && (
        <Monitor
          tally={PLAYHEAD}
          label={P.PROGRAM()}
          labelHint={P.PROGRAM_HINT()}
          info={slideInfo(program, activeBlockIndex)}
          badges={
            <>
              {isBlack && <Badge>{P.BLACK()}</Badge>}
              {isTextHidden && <Badge>{P.TEXT_HIDDEN()}</Badge>}
            </>
          }
          content={program.content}
          size={size}
          guides={operatorPreviewGuides}
          title={P.PROGRAM()}
          empty={P.NO_ITEM()}
        />
      )}

      <Monitor
        tally={PREVIEW_TALLY}
        label={previewLabel}
        info={target ? slideInfo(preview, block) : undefined}
        content={target ? preview.content : undefined}
        size={size}
        guides={operatorPreviewGuides}
        title={P.TITLE()}
        empty={itemCount === 0 ? P.NO_ITEM() : P.END_OF_SHOW()}
      />

      {/* Step through the preview, then Take */}
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
        <Tooltip title={P.PREV_SLIDE()}>
          <span>
            <IconButton size="small" disabled={!target || block <= 0} onClick={() => stepTo(block - 1)} aria-label={P.PREV_SLIDE()}>
              <PrevIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={P.NEXT_SLIDE()}>
          <span>
            <IconButton
              size="small"
              disabled={!target || block >= preview.slideCount - 1}
              onClick={() => stepTo(block + 1)}
              aria-label={P.NEXT_SLIDE()}
            >
              <NextIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        {target && block !== target.blockIndex && (
          <Tooltip title={P.BACK_TO_FOCUS()}>
            <IconButton size="small" onClick={() => setStep(null)} aria-label={P.BACK_TO_FOCUS()}>
              <BackIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {(kind === 'waiting' || kind === 'opened') && (
          <Tooltip title={P.DISCARD()}>
            <IconButton size="small" onClick={discard} aria-label={P.DISCARD()}>
              <DiscardIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <Box sx={{ flex: 1 }} />
        <Tooltip title={kind !== 'next' && takeKey ? `${P.TAKE_HINT()} (${takeKey})` : P.TAKE_HINT()}>
          <span>
            <Button
              size="small"
              variant="contained"
              disabled={!target || !preview.content}
              onClick={take}
              sx={{
                textTransform: 'uppercase',
                fontWeight: 700,
                letterSpacing: 1,
                minWidth: 96,
                bgcolor: PLAYHEAD,
                '&:hover': { bgcolor: '#c93a3f' },
              }}
            >
              {P.TAKE()}
            </Button>
          </span>
        </Tooltip>
      </Stack>
    </Stack>
  );
};
