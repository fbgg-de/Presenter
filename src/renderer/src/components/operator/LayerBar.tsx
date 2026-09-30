/**
 * The operator view's layer bar: every output control in one place. Fixed rows, so buttons never
 * move — each with what is running and its transport:
 *
 * - **Background** — the background entries running, each on its screen groups, and Hide background.
 * - **Slides** — the item and section on screen, which groups show text and which do not.
 * - **Media** — the content entries running (images and videos from the agenda), and the live PDF or
 *   PowerPoint with its pages turning by themselves or by hand.
 * - **Audio** — every audio item playing or paused part-way, whichever entry is open, with Fade.
 * - **Overlays** — the stage cues running.
 *
 * Two idioms carry the whole bar, so nothing has to be learnt twice: an **eye** is "on screen or
 * not" (a layer's, or one entry's), and **Shift** means "now" — Shift on an eye blacks every
 * screen, Shift on an ending control skips the fade. Buttons say what they will do to the
 * screens, so Go names the entry it starts rather than leaving the operator to work it out.
 *
 * On a short screen (a 768/800/864-pixel laptop) the layers with nothing running fold into one
 * line at the bottom — name, eye and their one action each — so the slides above keep the room.
 * A layer gets its full row back the moment something runs on it.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Box,
  Button,
  ButtonBase,
  Chip,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  Audiotrack as AudioLayerIcon,
  SkipNext as GoIcon,
  Repeat as LoopIcon,
  TrendingDown as FadeIcon,
  Pause as PauseIcon,
  PlayArrow as PlayIcon,
  Slideshow as DocumentIcon,
  TimerOffOutlined as DisarmIcon,
  TimerOutlined as TimerIcon,
  Stop as StopIcon,
  Tune as SetupIcon,
  VisibilityOff as HiddenIcon,
  Visibility as VisibleIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useAppDispatch } from '@/store';
import { setMediaVisible, setVideoVisible, toggleBlack, toggleTextHidden, useGetPresentationSettings } from '@/store/presentationSlice';
import { toggleStageAllHidden } from '@/store/stageSlice';
import { useGetSettings } from '@/store/settingsSlice';
import { useGetScreenGroupsQuery } from '@/api/screenGroups.api';
import { useActiveLook } from '@/hooks/useActiveLook';
import { useSlideSelect } from '@/hooks/useSlideSelect';
import { versePages } from '@/utils/itemBlocks';
import {
  documentAdvanceOf,
  documentArmHint,
  documentArmingShown,
  documentStepDurations,
  documentStepName,
  documentSteps,
} from '@/document/document';
import { useAdvanceClock, useDocumentArming } from '@/document/autoAdvance';
import { armableChipSx } from '@/media/armableChip';
import { useStageStatus } from '@/hooks/useStageEngine';
import { normaliseScreenGroupData } from '@/screens/types';
import { BackgroundThumb } from '@/components/look/BackgroundThumb';
import { PlaybackButtons } from '@/components/media/PlaybackButtons';
import { MasterSpeedControl, SpeedControl } from '@/components/media/SpeedControl';
import {
  LiveTime,
  PLAYHEAD,
  Scrubber,
  Timecode,
  TRANSPORT_ACTIVE,
  TransportButton,
  TransportCluster,
  useTick,
} from '@/components/media/Transport';
import { StageTransport } from '@/components/stage/StageTransport';
import { StagePanel } from '@/components/stage/StagePanel';
import { useShortcut, withShortcut } from '@/hooks/useShortcut';
import { SectionLabel } from './SectionLabel';
import { LAYER_COLORS, LAYER_ICONS, useLayerRowShown } from './layerRows';
import {
  activeAudioTracks,
  fadeOutAllAudio,
  fadeOutAudio,
  seekAudio,
  stopAllAudio,
  stopAudio,
  toggleAudio,
  useAudioTracks,
  type AudioTrackState,
  setAudioMuted,
  useAudioMuted,
} from '@/media/audioPlayers';
import {
  commandPlayback,
  endAllPlaybacks,
  endPlayback,
  setPlaybackFollowsMaster,
  setPlaybackHidden,
  usePlaybacks,
  type Playback,
} from '@/media/playback';
import { CueRegionStrip } from '@/media/CueRegions';
import type { CueTransport } from '@/media/types';
import {
  activeVersionOf,
  hasClock,
  hasVideo,
  mediaItemDataOf,
  mediaItemLabel,
  slideAt,
  slideStarts,
  armedRegions,
} from '@/media/mediaItem';
import { goMedia, groupBackgroundIndexes, groupContentIndexes, nextMediaIndexes, playbackKeyOf, startItem } from '@/media/useMediaHost';
import { updateShowItem, useGetShow } from '@/store/showSlice';
import type { ShowItem } from '@/api/shows.api';
import { DEFAULT_GROUP_ID } from '@/utils/showGroups';
import { sectionColor } from '@/utils/sectionColor';

const LayerRow = ({
  name,
  detail,
  layer,
  action,
  compact,
  children,
}: {
  name: string;
  detail?: string;
  layer: keyof typeof LAYER_COLORS;
  /** Tighter rows on a short screen. */
  compact?: boolean;
  /** The layer's show/hide eye, at the right end of the name column. */
  action?: ReactNode;
  children: ReactNode;
}) => {
  const Icon = LAYER_ICONS[layer];
  return (
    <>
      <Stack
        direction="row"
        spacing={0.75}
        sx={{ alignItems: 'center', pl: 1.5, pr: 0.75, py: 0.5, borderRight: 1, borderTop: 1, borderColor: 'divider', minWidth: 0 }}
      >
        <Icon sx={{ fontSize: 16, color: LAYER_COLORS[layer], flexShrink: 0 }} />
        <SectionLabel sx={{ flexShrink: 0 }}>{name}</SectionLabel>
        {detail && (
          <Typography variant="caption" noWrap sx={{ color: 'warning.main', minWidth: 0 }}>
            {detail}
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        {action}
      </Stack>
      <Stack
        direction="row"
        spacing={1.25}
        sx={{ alignItems: 'center', px: 1.5, py: 0.25, minHeight: compact ? 34 : 40, borderTop: 1, borderColor: 'divider', minWidth: 0 }}
      >
        {children}
      </Stack>
    </>
  );
};

/** A folded layer in the short-screen idle line: its name (the idle hint as tooltip) and its controls. */
const FoldedLayer = ({
  layer,
  name,
  hint,
  action,
}: {
  layer: keyof typeof LAYER_COLORS;
  name: string;
  hint: string;
  action: ReactNode;
}) => {
  const Icon = LAYER_ICONS[layer];
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexShrink: 0 }}>
      <Tooltip title={hint}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', cursor: 'help' }}>
          <Icon sx={{ fontSize: 16, color: LAYER_COLORS[layer] }} />
          <SectionLabel>{name}</SectionLabel>
        </Stack>
      </Tooltip>
      {action}
    </Stack>
  );
};

/**
 * The same button at the end of every layer row: Hide / Show that layer. Shift+click blacks out (or
 * brings back) all screens at once; while they are black every row's button says so and a click
 * shows them again.
 */
const LayerHideButton = ({
  hidden,
  onToggle,
  hint,
  shortcut,
  shiftHeld,
}: {
  hidden: boolean;
  onToggle: () => void;
  /** What a plain click does, for the tooltip. */
  hint: string;
  shortcut?: string;
  /** While Shift is down the keys are spelled out, and a click blacks every screen. */
  shiftHeld: boolean;
}) => {
  const { LL } = useI18nContext();
  const O = LL.OPERATOR;
  const dispatch = useAppDispatch();
  const { isBlack } = useGetPresentationSettings('isBlack');
  const blackKey = useShortcut('toggle_black');
  const tooltip = isBlack ? (
    withShortcut(O.BLACK_ACTIVE_HINT(), blackKey)
  ) : (
    <Box sx={{ whiteSpace: 'pre-line' }}>{`${withShortcut(hint, shortcut)}\n${withShortcut(O.SHIFT_BLACK_ALL(), blackKey)}`}</Box>
  );
  // Shift is the "black everything" modifier, so while it is held every eye says so.
  const keyLabel = shiftHeld ? (isBlack ? blackKey : (shortcut ?? blackKey)) : undefined;

  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexShrink: 0 }}>
      {keyLabel && (
        <Box
          component="kbd"
          sx={{
            fontFamily: 'monospace',
            fontSize: '0.65rem',
            px: 0.5,
            border: 1,
            borderColor: 'divider',
            borderRadius: 0.5,
            color: 'text.secondary',
            whiteSpace: 'nowrap',
          }}
        >
          {keyLabel}
        </Box>
      )}
      <Tooltip title={tooltip} placement="right">
        <IconButton
          size="small"
          aria-label={isBlack ? O.BLACK() : hint}
          aria-pressed={isBlack || hidden}
          color={isBlack ? 'error' : hidden ? 'warning' : 'default'}
          onClick={(e) => (e.shiftKey || isBlack ? dispatch(toggleBlack()) : onToggle())}
          sx={{ flexShrink: 0, p: 0.5, ...(!isBlack && !hidden && { color: 'text.secondary' }) }}
        >
          {isBlack || hidden ? <HiddenIcon fontSize="small" /> : <VisibleIcon fontSize="small" />}
        </IconButton>
      </Tooltip>
    </Stack>
  );
};

/** Name over a second line (screens, "ending", loop), fixed width so the transports line up. */
const EntryName = ({ name, detail, tone }: { name: string; detail: string; tone?: string }) => (
  <Stack sx={{ minWidth: 0, width: 150, flexShrink: 0 }}>
    <Typography variant="body2" noWrap sx={{ fontWeight: 600, lineHeight: 1.3 }}>
      {name}
    </Typography>
    <Typography noWrap sx={{ fontSize: 11, color: tone ?? 'text.secondary', lineHeight: 1.3 }}>
      {detail}
    </Typography>
  </Stack>
);

/** The End button of a row: fades out, Shift ends at once — "now" throughout the bar. */
const EndButton = ({ onEnd, disabled }: { onEnd: (now: boolean) => void; disabled?: boolean }) => {
  const { LL } = useI18nContext();
  const T = LL.TRANSPORT;
  return (
    <TransportCluster>
      <TransportButton
        danger
        disabled={disabled}
        label={
          <>
            {T.END()}
            <br />
            {T.END_SHIFT()}
          </>
        }
        onClick={(event) => onEnd(event.shiftKey)}
      >
        <StopIcon />
      </TransportButton>
    </TransportCluster>
  );
};

/**
 * One running media entry, as a strip: picture (its eye on top), name and screens, the transport,
 * the scrubber with its sections or slide changes, the clock and End. The entry's sections follow
 * as chips on a second line.
 */
const PlaybackLine = ({
  playback,
  screensLabel,
  fadeMs,
  hideLabel,
}: {
  playback: Playback;
  screensLabel: string;
  fadeMs: number;
  /** Backgrounds are hidden all together with Hide background; content entries one by one. */
  hideLabel?: boolean;
}) => {
  const { LL } = useI18nContext();
  const M = LL.MEDIA_ITEM;
  const T = LL.TRANSPORT;
  const source = playback.cue.sources[0];
  const clock = hasClock(playback.cue);
  // Its state (playing, loops, speed) for the buttons; only `LiveTime` readouts follow the clock.
  const transport = playback.transport;
  const ending = playback.endsAt !== undefined;
  const slideshow = playback.cue.slideshow;
  const detailOf = (now?: CueTransport) =>
    ending
      ? M.ENDING()
      : slideshow && now
        ? `${screensLabel} · ${slideAt(playback.cue, now.time).index + 1}/${playback.cue.sources.length}`
        : screensLabel;
  return (
    <Stack spacing={0.5} sx={{ minWidth: 0, flex: 1, py: 0.5, opacity: ending ? 0.5 : 1 }}>
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', minWidth: 0 }}>
        {/* The entry's eye lies over its preview: the picture is what it acts on. Hidden until the
            pointer is on it, except while the entry is cleared, when the crossed eye is the only
            sign of it. */}
        <Box
          sx={{
            width: 56,
            flexShrink: 0,
            position: 'relative',
            borderRadius: 0.75,
            overflow: 'hidden',
            outline: 1,
            outlineColor: playback.hidden || ending ? 'divider' : alpha(PLAYHEAD, 0.7),
            '&:hover .entry-eye': { opacity: 1 },
          }}
        >
          <BackgroundThumb data={source ? { [source.type]: { path: source.path, fit: 'cover' } } : undefined} />
          {!hideLabel && (
            <Tooltip title={playback.hidden ? M.SHOW_HINT() : M.CLEAR_HINT()}>
              <IconButton
                className="entry-eye"
                aria-label={playback.hidden ? M.SHOW() : M.CLEAR()}
                aria-pressed={playback.hidden}
                disabled={ending}
                onClick={() => setPlaybackHidden(playback.key, !playback.hidden)}
                sx={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 0,
                  opacity: playback.hidden ? 1 : 0,
                  transition: 'opacity 120ms',
                  color: playback.hidden ? TRANSPORT_ACTIVE : 'common.white',
                  bgcolor: 'rgba(0,0,0,0.5)',
                  '&:hover, &:focus-visible': { opacity: 1, bgcolor: 'rgba(0,0,0,0.65)' },
                }}
              >
                {playback.hidden ? <HiddenIcon fontSize="small" /> : <VisibleIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          )}
        </Box>
        {slideshow && !ending ? (
          <LiveTime playback={playback}>{(now) => <EntryName name={playback.label} detail={detailOf(now)} />}</LiveTime>
        ) : (
          <EntryName name={playback.label} detail={detailOf()} tone={ending ? TRANSPORT_ACTIVE : undefined} />
        )}
        {clock ? (
          <>
            <PlaybackButtons
              cue={playback.cue}
              transport={transport}
              toStart={false}
              disabled={ending}
              onCommand={(command) => commandPlayback(playback.key, command)}
            />
            <LiveTime playback={playback}>
              {(now) => (
                <>
                  <Scrubber
                    time={now?.time ?? 0}
                    duration={playback.cue.duration}
                    disabled={ending}
                    regions={armedRegions(playback.cue, transport.enabled)}
                    ticks={slideshow ? slideStarts(playback.cue) : undefined}
                    onSeek={(time) => commandPlayback(playback.key, { type: 'seek', time })}
                  />
                  <Timecode time={now?.time ?? 0} duration={playback.cue.duration} />
                </>
              )}
            </LiveTime>
            {hasVideo(playback.cue) && (
              <SpeedControl
                transport={transport}
                disabled={ending}
                onCommand={(command) => commandPlayback(playback.key, command)}
                followsMaster={playback.followsMaster}
                onFollowMaster={(follow) => setPlaybackFollowsMaster(playback.key, follow)}
              />
            )}
            {playback.cue.loop && (
              <Tooltip title={T.LOOP()}>
                <LoopIcon sx={{ fontSize: 16, color: TRANSPORT_ACTIVE, flexShrink: 0 }} />
              </Tooltip>
            )}
          </>
        ) : (
          <Box sx={{ flex: 1 }} />
        )}
        <EndButton disabled={ending} onEnd={(now) => endPlayback(playback.key, now ? 0 : fadeMs)} />
      </Stack>
      {/* Second row: the entry's sections, pauses and lyric mapping, indented under its name.
          Its own row because a video worth mapping has more sections than fit beside a slider. */}
      <LiveTime playback={playback}>{(now) => <CueRegionStrip playback={playback} transport={now ?? transport} />}</LiveTime>
    </Stack>
  );
};

/** One audio player in the Audio row, shaped like a media line: name, play, scrubber, clock, Fade, Stop. */
const AudioTrackLine = ({ track, fadeSeconds }: { track: AudioTrackState; fadeSeconds: number }) => {
  const { LL } = useI18nContext();
  const A = LL.AUDIO;
  const T = LL.TRANSPORT;
  const fading = track.fade !== undefined;
  const playing = track.playing && !fading;
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', minWidth: 0, py: 0.25 }}>
      <Stack
        sx={{
          width: 56,
          aspectRatio: '16/9',
          flexShrink: 0,
          borderRadius: 0.75,
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: alpha(LAYER_COLORS.audio, playing ? 0.22 : 0.08),
          outline: 1,
          outlineColor: playing ? alpha(LAYER_COLORS.audio, 0.7) : 'divider',
        }}
      >
        <AudioLayerIcon sx={{ fontSize: 18, color: LAYER_COLORS.audio }} />
      </Stack>
      <EntryName
        name={track.label}
        detail={fading ? A.FADING() : track.loop ? A.LOOP_ON() : A.OPERATOR_ONLY()}
        tone={fading ? TRANSPORT_ACTIVE : undefined}
      />
      <TransportCluster>
        <TransportButton primary label={playing ? T.PAUSE() : T.PLAY()} onClick={() => toggleAudio(track.key)}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </TransportButton>
      </TransportCluster>
      <Scrubber time={track.currentTime} duration={track.duration} onSeek={(time) => seekAudio(track.key, time)} />
      <Timecode time={track.currentTime} duration={track.duration} tone={fading ? TRANSPORT_ACTIVE : undefined} />
      <TransportCluster>
        <TransportButton
          label={A.FADE_OUT_HINT({ seconds: fadeSeconds })}
          disabled={!track.playing || fading}
          onClick={() => fadeOutAudio(track.key, fadeSeconds)}
        >
          <FadeIcon />
        </TransportButton>
        <TransportButton danger label={A.STOP()} onClick={() => stopAudio(track.key)}>
          <StopIcon />
        </TransportButton>
      </TransportCluster>
    </Stack>
  );
};

/** Seconds per page offered for a document turning by itself. */
const PAGE_SECONDS = [3, 5, 8, 10, 15, 20, 30, 45, 60];

/**
 * The live PDF or PowerPoint, drawn like a slideshow. The pages armed in its cards turn by
 * themselves; play and pause let them run or hold them all (with nothing armed, play arms every
 * page). The line says when the next turn comes, the strip is the deck — a stretch per step, the
 * armed ones tinted — to jump in, and the seconds per page and loop are one click away. Pages
 * timed in PowerPoint keep their own time. It edits the entry itself, so a deck set to run by
 * itself does so again the next time it is live.
 */
const DocumentLine = ({ item, itemIndex }: { item: ShowItem; itemIndex: number }) => {
  const { LL } = useI18nContext();
  const D = LL.DOCUMENT;
  const dispatch = useAppDispatch();
  const { goLive } = useSlideSelect();
  const { activeBlockIndex } = useGetPresentationSettings('activeBlockIndex');
  const clock = useAdvanceClock();
  const now = useTick(!!clock?.dueAt, 250);
  const [secondsMenu, setSecondsMenu] = useState<HTMLElement | null>(null);
  const { running, armed, seconds, loop } = documentAdvanceOf(item);
  const steps = documentSteps(item.documentBuilds, item.documentHidden);
  const durations = documentStepDurations(item);
  const ours = clock?.itemIndex === itemIndex ? clock : undefined;
  const block = ours?.block ?? activeBlockIndex;
  const ms = durations[block];
  // The strip counts steps, not seconds: a page waiting for the operator has no length in time.
  // The tick can be older than a step that just began.
  const at = Math.max(now, ours?.startedAt ?? 0);
  const position = block + (ours?.dueAt && ms ? Math.min(1, (at - ours.startedAt) / ms) : 0);
  const name = steps[block] ? documentStepName(steps[block]) : '';
  const turning = running && armed.length > 0;
  const detail =
    armed.length && !running
      ? D.AUTO_HELD({ name })
      : ours?.dueAt
        ? D.AUTO_NEXT({ name, seconds: Math.max(0, Math.ceil((ours.dueAt - at) / 1000)) })
        : ms != null
          ? D.AUTO_END({ name })
          : D.AUTO_OFF({ name });
  const set = (advance: NonNullable<ShowItem['documentAdvance']>) =>
    dispatch(updateShowItem({ index: itemIndex, item: { documentAdvance: { ...item.documentAdvance, ...advance } } }));
  const play = () =>
    armed.length ? set({ paused: running }) : set({ paused: false, armed: (item.documentBuilds ?? [0]).map((_, page) => page) });
  const armedSteps = durations.flatMap((duration, index) =>
    duration == null
      ? []
      : [{ id: String(index), kind: 'section' as const, name: documentStepName(steps[index]), start: index, end: index + 1 }],
  );

  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', minWidth: 0, py: 0.5 }}>
      <Stack
        sx={{
          width: 56,
          aspectRatio: '16/9',
          flexShrink: 0,
          borderRadius: 0.75,
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: alpha(LAYER_COLORS.media, turning ? 0.22 : 0.08),
          outline: 1,
          outlineColor: turning ? alpha(PLAYHEAD, 0.7) : 'divider',
        }}
      >
        <DocumentIcon sx={{ fontSize: 18, color: LAYER_COLORS.media }} />
      </Stack>
      <EntryName name={item.label || D.DOCUMENT()} detail={detail} tone={ours?.dueAt ? TRANSPORT_ACTIVE : undefined} />
      <TransportCluster>
        <TransportButton primary label={turning ? D.AUTO_STOP() : armed.length ? D.AUTO_START() : D.AUTO_START_ALL()} onClick={play}>
          {turning ? <PauseIcon /> : <PlayIcon />}
        </TransportButton>
      </TransportCluster>
      <Scrubber
        time={position}
        duration={steps.length}
        regions={armedSteps}
        ticks={steps.map((_, index) => index)}
        onSeek={(at) => goLive(itemIndex, Math.min(steps.length - 1, Math.floor(at)))}
      />
      <TransportCluster>
        <TransportButton
          autoWidth
          label={item.documentTimings ? `${D.PER_PAGE_HINT({ seconds })} · ${D.FILE_TIMINGS()}` : D.PER_PAGE_HINT({ seconds })}
          onClick={(event) => setSecondsMenu(event.currentTarget)}
        >
          <Typography component="span" sx={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {seconds} s
          </Typography>
        </TransportButton>
        <TransportButton active={loop} label={D.LOOP_HINT()} onClick={() => set({ loop: !loop })}>
          <LoopIcon />
        </TransportButton>
      </TransportCluster>
      <Menu anchorEl={secondsMenu} open={!!secondsMenu} onClose={() => setSecondsMenu(null)}>
        {PAGE_SECONDS.map((value) => (
          <MenuItem
            key={value}
            dense
            selected={value === seconds}
            onClick={() => {
              set({ seconds: value });
              setSecondsMenu(null);
            }}
          >
            {D.PER_PAGE({ seconds: value })}
          </MenuItem>
        ))}
      </Menu>
    </Stack>
  );
};

/**
 * The live item's slides in their order, as chips drawn like a media entry's sections: the one on
 * screen filled, the rest outlined. A click puts that slide on screen, so jumping to the last
 * chorus is one click instead of a scroll through the slide grid. It reads the live slide itself,
 * so a slide change re-renders the strip and not the whole layer bar.
 */
const BlockStrip = ({
  slides,
}: {
  /**
   * Each chip: the slide index it goes to, its name, and the mark before the name (number or ©;
   * none for a document's steps, whose name is their number). A document step that can turn by
   * itself carries `arm`: the chip is drawn armed or not like a video's regions, and the timer at
   * its end switches it — a click on the chip still jumps, as on every other slide.
   */
  slides: { index: number; name: string; mark: string; arm?: { armed: boolean; hint: string; onToggle: () => void } }[];
}) => {
  const { LL } = useI18nContext();
  const { activeItemIndex, activeBlockIndex: active } = useGetPresentationSettings('activeItemIndex', 'activeBlockIndex');
  const { goLive } = useSlideSelect();
  const onJump = (index: number) => goLive(activeItemIndex, index);
  const stripRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    stripRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);
  return (
    <Stack ref={stripRef} direction="row" spacing={0.5} sx={{ alignItems: 'center', minWidth: 0, overflowX: 'auto', pb: 0.5 }}>
      {slides.map(({ index, name, mark, arm }) => {
        const current = index === active;
        const tint = sectionColor(name) ?? LAYER_COLORS.slides;
        const jumpHint = LL.OPERATOR.JUMP_TO_SLIDE({ name, index: index + 1 });
        if (arm)
          return (
            <Tooltip key={index} title={jumpHint}>
              <Chip
                size="small"
                variant="outlined"
                aria-current={current ? 'true' : undefined}
                label={name}
                onClick={() => onJump(index)}
                onDelete={arm.onToggle}
                deleteIcon={
                  <Tooltip title={arm.hint} slotProps={{ tooltip: { sx: { whiteSpace: 'pre-line' } } }}>
                    <TimerIcon aria-label={arm.hint} aria-pressed={arm.armed} />
                  </Tooltip>
                }
                sx={{ ...armableChipSx(tint, { off: !arm.armed, held: current }), fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}
              />
            </Tooltip>
          );
        return (
          <Tooltip key={index} title={jumpHint}>
            <ButtonBase
              aria-current={current ? 'true' : undefined}
              onClick={() => onJump(index)}
              sx={{
                flexShrink: 0,
                height: 26,
                maxWidth: 180,
                gap: 0.6,
                px: 0.9,
                borderRadius: 1,
                border: current ? 2 : 1,
                borderStyle: 'solid',
                borderColor: current ? tint : alpha(tint, 0.55),
                bgcolor: alpha(tint, current ? 0.45 : 0.14),
                color: 'text.primary',
                fontSize: 12.5,
                fontWeight: current ? 600 : 400,
                '&:hover': { bgcolor: alpha(tint, current ? 0.55 : 0.28) },
              }}
            >
              {mark && (
                <Box component="span" sx={{ fontFamily: 'monospace', fontSize: 10.5, color: current ? 'text.primary' : 'text.secondary' }}>
                  {mark}
                </Box>
              )}
              <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {name}
              </Box>
            </ButtonBase>
          </Tooltip>
        );
      })}
    </Stack>
  );
};

/**
 * By the slides row's name while a PDF or PowerPoint is live, as the media row has its speed: how
 * many of its pages turn by themselves, and arming or disarming all of them at once.
 */
const DocumentArmButton = ({ item, itemIndex }: { item: ShowItem; itemIndex: number }) => {
  const { LL } = useI18nContext();
  const D = LL.DOCUMENT;
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const { armedCount, shownCount, armAll, disarmAll } = useDocumentArming(item, itemIndex);
  const pick = (action: () => void) => () => {
    action();
    setAnchor(null);
  };
  return (
    <>
      <TransportButton
        label={D.ARMED_COUNT({ armed: armedCount, pages: shownCount })}
        active={armedCount > 0}
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        {armedCount > 0 ? <TimerIcon /> : <DisarmIcon />}
      </TransportButton>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        <MenuItem dense disabled={armedCount === shownCount} onClick={pick(armAll)}>
          <ListItemIcon>
            <TimerIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={D.ARM_ALL()} secondary={D.ARM_ALL_HINT()} />
        </MenuItem>
        <MenuItem dense disabled={armedCount === 0} onClick={pick(disarmAll)}>
          <ListItemIcon>
            <DisarmIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={D.DISARM_ALL()} secondary={D.DISARM_ALL_HINT()} />
        </MenuItem>
      </Menu>
    </>
  );
};

/** Whether Shift is held right now — the layer eyes spell out their keys while it is. */
const useShiftHeld = (): boolean => {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    // Shift while typing is just a capital letter — the hints stay out of the way then.
    const typing = () => {
      const active = document.activeElement as HTMLElement | null;
      return !!active && (active.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName));
    };
    const update = (event: KeyboardEvent) => setHeld(event.shiftKey && !typing());
    const clear = () => setHeld(false);
    window.addEventListener('keydown', update);
    window.addEventListener('keyup', update);
    // Alt-tabbing away with Shift down would otherwise leave the labels on.
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', update);
      window.removeEventListener('keyup', update);
      window.removeEventListener('blur', clear);
    };
  }, []);
  return held;
};

export const LayerBar = () => {
  const { LL } = useI18nContext();
  const O = LL.OPERATOR;
  const M = LL.MEDIA_ITEM;
  const dispatch = useAppDispatch();
  const { isTextHidden, videoVisible, mediaVisible, activeItemIndex } = useGetPresentationSettings(
    'isTextHidden',
    'videoVisible',
    'mediaVisible',
    'activeItemIndex',
  );
  const audioMuted = useAudioMuted();
  const shiftHeld = useShiftHeld();
  const { hideTransitionMode, hideTransitionDuration, audioFadeOutSeconds } = useGetSettings(
    'hideTransitionMode',
    'hideTransitionDuration',
    'audioFadeOutSeconds',
  );
  const fadeMs = hideTransitionMode === 'fade' ? hideTransitionDuration : 0;
  const audioTracks = activeAudioTracks(useAudioTracks());
  const playbacks = usePlaybacks();
  const { data: groups = [] } = useGetScreenGroupsQuery();
  const stage = useStageStatus();
  const { item, song, blocks, copyrightIndex } = useActiveLook();
  // Rows switched off in Settings → Presentation.
  const shown = useLayerRowShown();
  // The slides the Slides row lists: a song's sections and its credits slide, a verse's pages, a
  // document's pages and their builds ("3", "3.1").
  const isDocument = item?.type === 'document';
  const arming = useDocumentArming(isDocument ? item : undefined, activeItemIndex);
  const slideNames = song
    ? blocks.map((block) => block.name)
    : item?.type === 'bible_verse'
      ? versePages(item).map((page) => page.name)
      : [];
  const stripSlides: Parameters<typeof BlockStrip>[0]['slides'] = [
    ...slideNames.map((name, index) => ({ index, name, mark: String(index + 1) })),
    ...(song && copyrightIndex !== undefined ? [{ index: copyrightIndex, name: O.COPYRIGHT_SLIDE(), mark: '©' }] : []),
    // A document's steps ("3", "3.1"), with their auto-turn once the deck uses it.
    ...(isDocument
      ? documentSteps(item.documentBuilds, item.documentHidden).map((step, index) => ({
          index,
          name: documentStepName(step),
          mark: '',
          arm: documentArmingShown(item)
            ? {
                armed: arming.armed.includes(step.page),
                hint: documentArmHint(LL, item, step.page),
                onToggle: () => arming.toggle(step.page),
              }
            : undefined,
        }))
      : []),
  ];
  // The stage overlay setup, opened on one layer (a click on its name) or on the list.
  const [stagePanel, setStagePanel] = useState<{ open: boolean; layerId?: number }>({ open: false });
  // Keys shown in tooltips, from the operator's own keyboard mapping.
  const textKey = useShortcut('toggle_text_hidden');
  const hideBackgroundKey = useShortcut('toggle_video_visible');
  const goKey = useShortcut('media_go');
  const { currentShow } = useGetShow();
  const agendaGroupId = item?.groupId ?? DEFAULT_GROUP_ID;
  // The media entries of the active item's agenda group: backgrounds to switch to, content for Go.
  const groupBackgrounds = currentShow ? groupBackgroundIndexes(currentShow, agendaGroupId) : [];
  const groupContents = currentShow ? groupContentIndexes(currentShow, agendaGroupId) : [];
  // What Go would start, so the button can name it (see `nextMediaIndexes`).
  const goNext = currentShow ? nextMediaIndexes(currentShow, agendaGroupId) : [];
  const runningKeys = new Set(playbacks.filter((p) => p.endsAt === undefined).map((p) => p.key));

  /** Where an entry shows right now, in the names the operator gave the screen groups. */
  const screensLabel = (playback: Playback) => {
    const shown = playback.screens.filter((screen) => !playback.covered.includes(screen));
    const named = shown
      .map((screen) => (screen === 'none' ? undefined : groups.find((group) => String(group.id) === screen)?.name))
      .filter((name): name is string => !!name);
    if (groups.length === 0 || (named.length > 0 && named.length === groups.filter((group) => group.enabled).length))
      return M.ALL_SCREENS();
    return named.join(' · ') || M.NO_SCREENS();
  };

  const backgrounds = playbacks.filter((p) => p.role === 'background').reverse();
  const contents = playbacks.filter((p) => p.role === 'content').reverse();

  // Which groups do not show the text of the active item. A group whose text layer is off is the one way an output can stay blank while every other one
  // is right, and until it was named here that looked like a broken screen rather than a setting.
  const textLayer = item?.type === 'bible_verse' ? 'bibleVerses' : 'slides';
  const textlessGroups = groups
    .filter((group) => group.enabled)
    .filter((group) => !normaliseScreenGroupData(group.data).layers[textLayer])
    .map((group) => group.name)
    .join(' · ');

  // A short screen folds the layers with nothing running into one line (see the header).
  // ponytail: height threshold only; make it a setting if someone wants it on a tall screen too.
  const compact = useMediaQuery('(max-height: 860px)');
  const stageRunning = stage.statuses.some((s) => s.layer.enabled && s.cueCount > 0);
  const folded = {
    background: compact && backgrounds.length === 0 && groupBackgrounds.length === 0,
    media: compact && contents.length === 0 && !isDocument,
    audio: compact && audioTracks.length === 0,
    overlays: compact && !stageRunning,
  };

  // Controls a layer keeps whether it has its own row or sits folded in the idle line.
  const backgroundEye = (
    <LayerHideButton
      shiftHeld={shiftHeld}
      hidden={!videoVisible}
      onToggle={() => dispatch(setVideoVisible(!videoVisible))}
      hint={videoVisible ? M.HIDE_BACKGROUND() : M.SHOW_BACKGROUND()}
      shortcut={hideBackgroundKey}
    />
  );
  const mediaActions = (
    <>
      {/* The show-wide speed every following video plays at — backgrounds included. */}
      <MasterSpeedControl />
      <LayerHideButton
        shiftHeld={shiftHeld}
        hidden={!mediaVisible}
        onToggle={() => dispatch(setMediaVisible(!mediaVisible))}
        hint={mediaVisible ? M.HIDE_LAYER() : M.SHOW_LAYER()}
      />
    </>
  );
  const audioEye = (
    <LayerHideButton
      shiftHeld={shiftHeld}
      hidden={audioMuted}
      onToggle={() => setAudioMuted(!audioMuted)}
      hint={audioMuted ? LL.AUDIO.UNMUTE_LAYER() : LL.AUDIO.MUTE_LAYER()}
    />
  );
  const overlayActions = (
    <>
      {/* The setup sits with the row's name, like every layer's own control — not at the far end. */}
      <Tooltip title={LL.STAGE.EDIT_LAYERS()}>
        <IconButton size="small" aria-label={LL.STAGE.EDIT_LAYERS()} onClick={() => setStagePanel({ open: true })} sx={{ p: 0.25 }}>
          <SetupIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
      <LayerHideButton
        shiftHeld={shiftHeld}
        hidden={stage.allHidden}
        onToggle={() => dispatch(toggleStageAllHidden())}
        hint={stage.allHidden ? LL.STAGE.SHOW_ALL() : LL.STAGE.HIDE_ALL()}
      />
    </>
  );
  const goButton = currentShow && groupContents.length > 0 && (
    // Go says what it starts. With nothing left it stays in place but disabled, so the
    // end of a group's media reads as "that was the last one" rather than as a button
    // that quietly stopped working.
    <Tooltip title={goNext.length === 0 ? M.GO_NOTHING() : withShortcut(M.GO_HINT(), goKey)}>
      <span>
        <Button
          size="small"
          variant="contained"
          startIcon={<GoIcon />}
          disabled={goNext.length === 0}
          onClick={() => void goMedia(currentShow, agendaGroupId, groups, fadeMs)}
          sx={{ textTransform: 'none', maxWidth: 220 }}
        >
          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {goNext.length === 0
              ? M.GO()
              : goNext.length === 1
                ? M.GO_NEXT({ name: mediaItemLabel(currentShow.order[goNext[0]]) })
                : M.GO_COUNT({ count: goNext.length })}
          </Box>
        </Button>
      </span>
    </Tooltip>
  );
  const foldedLayers = [
    shown('background') && folded.background && (
      <FoldedLayer key="background" layer="background" name={O.LAYER_BACKGROUND()} hint={M.THEME_COLOUR_ONLY()} action={backgroundEye} />
    ),
    shown('media') && folded.media && (
      <FoldedLayer key="media" layer="media" name={M.LAYER()} hint={M.NOTHING_ON_SCREEN()} action={mediaActions} />
    ),
    shown('audio') && folded.audio && (
      <FoldedLayer key="audio" layer="audio" name={LL.AUDIO.LAYER()} hint={LL.AUDIO.NOTHING_PLAYING()} action={audioEye} />
    ),
    shown('overlays') && folded.overlays && (
      <FoldedLayer key="overlays" layer="overlays" name={O.LAYER_OVERLAYS()} hint={O.NO_STAGE_LAYERS()} action={overlayActions} />
    ),
  ].filter(Boolean);

  return (
    <Box sx={{ bgcolor: 'background.paper' }}>
      {/* The name column makes room for the key labels while Shift is held. */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: shiftHeld ? '250px minmax(0, 1fr)' : '170px minmax(0, 1fr)',
          transition: (theme) => theme.transitions.create('grid-template-columns', { duration: 120 }),
        }}
      >
        {shown('background') && !folded.background && (
          <LayerRow name={O.LAYER_BACKGROUND()} layer="background" compact={compact} action={backgroundEye}>
            {backgrounds.length > 0 || groupBackgrounds.length > 0 ? (
              <Stack spacing={0.25} sx={{ flex: 1, minWidth: 0, py: 0.25, opacity: videoVisible ? 1 : 0.6 }}>
                {backgrounds.map((playback) => (
                  <PlaybackLine key={playback.key} playback={playback} screensLabel={screensLabel(playback)} fadeMs={fadeMs} hideLabel />
                ))}
                {currentShow && groupBackgrounds.length > 1 && (
                  // The group's backgrounds as numbered tiles: click (or Alt+number) to switch.
                  <Stack direction="row" spacing={0.75} sx={{ overflowX: 'auto', py: 0.25 }}>
                    {groupBackgrounds.map((index, position) => {
                      const entry = currentShow.order[index];
                      const source = activeVersionOf(mediaItemDataOf(entry)!).sources[0];
                      const live = runningKeys.has(playbackKeyOf(entry, index));
                      return (
                        <Tooltip key={index} title={`${mediaItemLabel(entry)} · Alt+${position + 1}`}>
                          <Button
                            size="small"
                            variant={live ? 'contained' : 'outlined'}
                            color={live ? 'error' : 'inherit'}
                            onClick={() => void startItem(currentShow, index, groups, fadeMs)}
                            sx={{ textTransform: 'none', flexShrink: 0, gap: 0.75, px: 0.75, py: 0.25, minWidth: 0 }}
                          >
                            {position < 9 && (
                              <Typography component="span" variant="caption" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                {position + 1}
                              </Typography>
                            )}
                            <Box sx={{ width: 28 }}>
                              <BackgroundThumb data={source ? { [source.type]: { path: source.path, fit: 'cover' } } : undefined} />
                            </Box>
                            <Typography component="span" variant="caption" noWrap sx={{ maxWidth: 110 }}>
                              {mediaItemLabel(entry)}
                            </Typography>
                          </Button>
                        </Tooltip>
                      );
                    })}
                  </Stack>
                )}
              </Stack>
            ) : (
              <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1 }}>
                {M.THEME_COLOUR_ONLY()}
              </Typography>
            )}
          </LayerRow>
        )}

        {shown('slides') && (
          <LayerRow
            name={O.LAYER_SLIDES()}
            layer="slides"
            compact={compact}
            action={
              <>
                {isDocument && <DocumentArmButton item={item} itemIndex={activeItemIndex} />}
                <LayerHideButton
                  shiftHeld={shiftHeld}
                  hidden={isTextHidden}
                  onToggle={() => dispatch(toggleTextHidden())}
                  hint={isTextHidden ? O.SHOW_TEXT() : O.HIDE_TEXT()}
                  shortcut={textKey}
                />
              </>
            }
          >
            {/* Just the jump buttons: title and section are already on the slide grid above. */}
            <Stack direction="row" spacing={1.25} sx={{ flex: 1, minWidth: 0, py: 0.5, alignItems: 'center' }}>
              {stripSlides.length > 1 ? (
                <BlockStrip slides={stripSlides} />
              ) : (
                <Typography variant="body2" noWrap sx={{ fontWeight: 500, minWidth: 0 }}>
                  {item ? item.label || song?.title || item.bibleRef : O.NO_ITEM()}
                </Typography>
              )}
              {textlessGroups && (
                <Tooltip title={O.NO_TEXT_ON_HINT()}>
                  <Typography variant="caption" noWrap sx={{ color: 'warning.main', minWidth: 0, flexShrink: 0, cursor: 'help' }}>
                    {O.NO_TEXT_ON({ groups: textlessGroups })}
                  </Typography>
                </Tooltip>
              )}
            </Stack>
          </LayerRow>
        )}

        {shown('media') && !folded.media && (
          <LayerRow name={M.LAYER()} layer="media" compact={compact} action={mediaActions}>
            {contents.length > 0 || isDocument ? (
              <Stack spacing={0.25} sx={{ flex: 1, minWidth: 0, py: 0.25, opacity: mediaVisible ? 1 : 0.6 }}>
                {isDocument && item && <DocumentLine item={item} itemIndex={activeItemIndex} />}
                {contents.map((playback) => (
                  <PlaybackLine key={playback.key} playback={playback} screensLabel={screensLabel(playback)} fadeMs={fadeMs} />
                ))}
              </Stack>
            ) : (
              <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1 }}>
                {M.NOTHING_ON_SCREEN()}
              </Typography>
            )}
            <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0, alignItems: 'center' }}>
              {goButton}
              {contents.length > 0 && (
                // One ending control instead of "Fade all" beside "Stop all": the difference
                // between them is only *when*, which is what Shift means everywhere else here.
                <Tooltip title={M.END_ALL_HINT()}>
                  <Button
                    size="small"
                    variant="outlined"
                    color="inherit"
                    onClick={(event) => endAllPlaybacks(event.shiftKey ? 0 : fadeMs > 0 ? fadeMs : 500, 'content')}
                    sx={{ textTransform: 'none' }}
                  >
                    {M.STOP_ALL()}
                  </Button>
                </Tooltip>
              )}
            </Stack>
          </LayerRow>
        )}

        {shown('audio') && !folded.audio && (
          <LayerRow name={LL.AUDIO.LAYER()} layer="audio" compact={compact} action={audioEye}>
            {audioTracks.length > 0 ? (
              <Stack spacing={0.25} sx={{ flex: 1, minWidth: 0, py: 0.25, opacity: audioMuted ? 0.6 : 1 }}>
                {audioTracks.map((track) => (
                  <AudioTrackLine key={track.key} track={track} fadeSeconds={audioFadeOutSeconds} />
                ))}
              </Stack>
            ) : (
              <>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {LL.AUDIO.NOTHING_PLAYING()}
                </Typography>
                <Box sx={{ flex: 1 }} />
              </>
            )}
            {audioTracks.length > 1 && (
              <Stack spacing={0.5} sx={{ flexShrink: 0 }}>
                <Button
                  size="small"
                  variant="outlined"
                  color="inherit"
                  onClick={() => fadeOutAllAudio(audioFadeOutSeconds)}
                  sx={{ textTransform: 'none' }}
                >
                  {LL.AUDIO.FADE_ALL()}
                </Button>
                <Button size="small" color="inherit" onClick={stopAllAudio} sx={{ textTransform: 'none' }}>
                  {LL.AUDIO.STOP_ALL()}
                </Button>
              </Stack>
            )}
          </LayerRow>
        )}

        {shown('overlays') && !folded.overlays && (
          <LayerRow name={O.LAYER_OVERLAYS()} layer="overlays" compact={compact} action={overlayActions}>
            {stageRunning ? (
              <StageTransport
                statuses={stage.statuses}
                allHidden={stage.allHidden}
                onOpenPanel={() => setStagePanel({ open: true })}
                onOpenLayer={(layerId) => setStagePanel({ open: true, layerId })}
                showPanelButton={false}
              />
            ) : (
              <Button
                size="small"
                color="inherit"
                startIcon={<SetupIcon />}
                onClick={() => setStagePanel({ open: true })}
                sx={{ textTransform: 'none', color: 'text.secondary' }}
              >
                {O.NO_STAGE_LAYERS()}
              </Button>
            )}
          </LayerRow>
        )}

        {foldedLayers.length > 0 && (
          <Stack
            direction="row"
            sx={{
              gridColumn: '1 / -1',
              alignItems: 'center',
              columnGap: 3,
              px: 1.5,
              py: 0.25,
              minHeight: 34,
              borderTop: 1,
              borderColor: 'divider',
            }}
          >
            {foldedLayers}
            <Box sx={{ flex: 1 }} />
            {folded.media && goButton}
          </Stack>
        )}
      </Box>

      <StagePanel open={stagePanel.open} layerId={stagePanel.layerId} onClose={() => setStagePanel({ open: false })} />
    </Box>
  );
};
