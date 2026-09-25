/**
 * The operator view's layer bar: every output control in one place. Fixed rows, so buttons never
 * move — each with what is running and its transport:
 *
 * - **Background** — the background entries running, each on its screen groups, and Hide background.
 * - **Slides** — the item and section on screen, which groups show text and which do not.
 * - **Media** — the content entries running (images and videos from the agenda).
 * - **Audio** — every audio item playing or paused part-way, whichever entry is open, with Fade.
 * - **Overlays** — the stage cues running.
 *
 * Two idioms carry the whole bar, so nothing has to be learnt twice: an **eye** is "on screen or
 * not" (a layer's, or one entry's), and **Shift** means "now" — Shift on an eye blacks every
 * screen, Shift on an ending control skips the fade. Buttons say what they will do to the
 * screens, so Go names the entry it starts rather than leaving the operator to work it out.
 *
 * A status line closes the bar: window and connection chips (a window chip opens the Window
 * Manager) and Black all.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Box, Button, ButtonBase, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  Audiotrack as AudioLayerIcon,
  SkipNext as GoIcon,
  Repeat as LoopIcon,
  TrendingDown as FadeIcon,
  Pause as PauseIcon,
  PlayArrow as PlayIcon,
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
import { useStageStatus } from '@/hooks/useStageEngine';
import { normaliseScreenGroupData } from '@/screens/types';
import { BackgroundThumb } from '@/components/look/BackgroundThumb';
import { PlaybackButtons } from '@/components/media/PlaybackButtons';
import { MasterSpeedControl, SpeedControl } from '@/components/media/SpeedControl';
import { LiveTime, PLAYHEAD, Scrubber, Timecode, TRANSPORT_ACTIVE, TransportButton, TransportCluster } from '@/components/media/Transport';
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
import { useGetShow } from '@/store/showSlice';
import { DEFAULT_GROUP_ID } from '@/utils/showGroups';
import { sectionColor } from '@/utils/sectionColor';

const LayerRow = ({
  name,
  detail,
  layer,
  action,
  children,
}: {
  name: string;
  detail?: string;
  layer: keyof typeof LAYER_COLORS;
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
        sx={{ alignItems: 'center', px: 1.5, py: 0.25, minHeight: 40, borderTop: 1, borderColor: 'divider', minWidth: 0 }}
      >
        {children}
      </Stack>
    </>
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

/**
 * The live item's slides in their order, as chips drawn like a media entry's sections: the one on
 * screen filled, the rest outlined. A click puts that slide on screen, so jumping to the last
 * chorus is one click instead of a scroll through the slide grid. It reads the live slide itself,
 * so a slide change re-renders the strip and not the whole layer bar.
 */
const BlockStrip = ({
  slides,
}: {
  /** Each chip: the slide index it goes to, its name, and the mark before the name (number or ©). */
  slides: { index: number; name: string; mark: string }[];
}) => {
  const { LL } = useI18nContext();
  const { activeItemIndex, activeBlockIndex: active } = useGetPresentationSettings('activeItemIndex', 'activeBlockIndex');
  const { goLive } = useSlideSelect();
  const onJump = (index: number) => goLive(activeItemIndex, index);
  const currentRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', minWidth: 0, overflowX: 'auto', pb: 0.5 }}>
      {slides.map(({ index, name, mark }) => {
        const current = index === active;
        const tint = sectionColor(name) ?? LAYER_COLORS.slides;
        return (
          <Tooltip key={index} title={LL.OPERATOR.JUMP_TO_SLIDE({ name, index: index + 1 })}>
            <ButtonBase
              ref={current ? currentRef : undefined}
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
              <Box component="span" sx={{ fontFamily: 'monospace', fontSize: 10.5, color: current ? 'text.primary' : 'text.secondary' }}>
                {mark}
              </Box>
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

/** "Chorus · 2/4": the live section, beside the item's name. */
const LiveSectionLabel = ({ names }: { names: string[] }) => {
  const { LL } = useI18nContext();
  const { activeBlockIndex } = useGetPresentationSettings('activeBlockIndex');
  if (!names[activeBlockIndex]) return null;
  return (
    <Typography variant="caption" noWrap sx={{ fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums', color: 'text.secondary' }}>
      {LL.OPERATOR.SECTION_OF({ section: names[activeBlockIndex], index: activeBlockIndex + 1, total: names.length })}
    </Typography>
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
  const { isTextHidden, videoVisible, mediaVisible } = useGetPresentationSettings('isTextHidden', 'videoVisible', 'mediaVisible');
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
  // The slides the Slides row lists: a song's sections and its credits slide, a verse's pages.
  const slideNames = song
    ? blocks.map((block) => block.name)
    : item?.type === 'bible_verse'
      ? versePages(item).map((page) => page.name)
      : [];
  const stripSlides = [
    ...slideNames.map((name, index) => ({ index, name, mark: String(index + 1) })),
    ...(song && copyrightIndex !== undefined ? [{ index: copyrightIndex, name: O.COPYRIGHT_SLIDE(), mark: '©' }] : []),
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

  // Which groups show the text of the active item — and, just as importantly, which do not. A
  // group whose text layer is off is the one way an output can stay blank while every other one
  // is right, and until it was named here that looked like a broken screen rather than a setting.
  const textLayer = item?.type === 'bible_verse' ? 'bibleVerses' : 'slides';
  const enabledGroups = groups.filter((group) => group.enabled);
  const textGroups = enabledGroups
    .filter((group) => normaliseScreenGroupData(group.data).layers[textLayer])
    .map((group) => group.name)
    .join(' · ');
  const textlessGroups = enabledGroups
    .filter((group) => !normaliseScreenGroupData(group.data).layers[textLayer])
    .map((group) => group.name)
    .join(' · ');

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
        {shown('background') && (
          <LayerRow
            name={O.LAYER_BACKGROUND()}
            layer="background"
            action={
              <LayerHideButton
                shiftHeld={shiftHeld}
                hidden={!videoVisible}
                onToggle={() => dispatch(setVideoVisible(!videoVisible))}
                hint={videoVisible ? M.HIDE_BACKGROUND() : M.SHOW_BACKGROUND()}
                shortcut={hideBackgroundKey}
              />
            }
          >
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
            action={
              <LayerHideButton
                shiftHeld={shiftHeld}
                hidden={isTextHidden}
                onToggle={() => dispatch(toggleTextHidden())}
                hint={isTextHidden ? O.SHOW_TEXT() : O.HIDE_TEXT()}
                shortcut={textKey}
              />
            }
          >
            <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0, py: 0.5 }}>
              <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', minWidth: 0 }}>
                <Typography variant="body2" noWrap sx={{ fontWeight: 500, minWidth: 0 }}>
                  {item ? item.label || song?.title || item.bibleRef : O.NO_ITEM()}
                </Typography>
                {song && <LiveSectionLabel names={slideNames} />}
                {textGroups && (
                  <Typography variant="caption" noWrap sx={{ color: 'text.secondary', minWidth: 0 }}>
                    {textGroups}
                  </Typography>
                )}
                {textlessGroups && (
                  <Tooltip title={O.NO_TEXT_ON_HINT()}>
                    <Typography variant="caption" noWrap sx={{ color: 'warning.main', minWidth: 0, cursor: 'help' }}>
                      {O.NO_TEXT_ON({ groups: textlessGroups })}
                    </Typography>
                  </Tooltip>
                )}
              </Stack>
              {stripSlides.length > 1 && <BlockStrip slides={stripSlides} />}
            </Stack>
          </LayerRow>
        )}

        {shown('media') && (
          <LayerRow
            name={M.LAYER()}
            layer="media"
            action={
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
            }
          >
            {contents.length > 0 ? (
              <Stack spacing={0.25} sx={{ flex: 1, minWidth: 0, py: 0.25, opacity: mediaVisible ? 1 : 0.6 }}>
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
              {currentShow && groupContents.length > 0 && (
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
              )}
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

        {shown('audio') && (
          <LayerRow
            name={LL.AUDIO.LAYER()}
            layer="audio"
            action={
              <LayerHideButton
                shiftHeld={shiftHeld}
                hidden={audioMuted}
                onToggle={() => setAudioMuted(!audioMuted)}
                hint={audioMuted ? LL.AUDIO.UNMUTE_LAYER() : LL.AUDIO.MUTE_LAYER()}
              />
            }
          >
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

        {shown('overlays') && (
          <LayerRow
            name={O.LAYER_OVERLAYS()}
            layer="overlays"
            action={
              <>
                {/* The setup sits with the row's name, like every layer's own control — not at the far end. */}
                <Tooltip title={LL.STAGE.EDIT_LAYERS()}>
                  <IconButton size="small" onClick={() => setStagePanel({ open: true })} sx={{ p: 0.25 }}>
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
            }
          >
            {stage.statuses.some((s) => s.layer.enabled && s.cueCount > 0) ? (
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
      </Box>

      <StagePanel open={stagePanel.open} layerId={stagePanel.layerId} onClose={() => setStagePanel({ open: false })} />
    </Box>
  );
};
