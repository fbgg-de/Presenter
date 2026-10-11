/**
 * An image, video, slideshow or colour entry in the operator view, laid out like an editing
 * suite: a **viewer** that holds everything that plays — the picture framed for one screen group,
 * the scrubber with the entry's sections or slide changes, the transport, and a slideshow's
 * filmstrip — and an **inspector** below with everything that is set up, in folding sections
 * (playback, slideshow, screens, timeline). Changes apply live to a running entry.
 */
import { memo, useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  Divider,
  IconButton,
  MenuItem,
  Select,
  Slider,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  Crop as FrameIcon,
  DeleteOutlined as DeleteIcon,
  Edit as RenameIcon,
  Palette as PaletteIcon,
  PlayArrow as PlayIcon,
  Repeat as LoopIcon,
  Stop as StopIcon,
  VisibilityOff as HiddenIcon,
  Visibility as VisibleIcon,
  VolumeOff as MutedIcon,
  VolumeUp as VolumeIcon,
} from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { useI18nContext } from '@/i18n/i18n-react';
import type { ShowItem } from '@/api/shows.api';
import { useAppDispatch } from '@/store';
import { updateShowItem, useGetShow } from '@/store/showSlice';
import { useGetSettings, type MediaPreviewAspect } from '@/store/settingsSlice';
import { useGetScreenGroupsQuery } from '@/api/screenGroups.api';
import { SlideCard, SlideGrid } from '@/components/show/SlideCard';
import { CueSource, SlideshowSource } from '@/media/CueMedia';
import { SlideshowFilmstrip, SlideshowSettings } from '@/components/show/SlideshowEditor';
import { MediaTimelineSection } from '@/components/show/MediaTimelineSection';
import { useGetScreenSetsQuery } from '@/api/screenSets.api';
import { FrameEditor, FrameMap, useFrameSummary } from '@/media/FrameEditor';
import { advanceCue, initialTransport } from '@/media/engine';
import { useMediaLabels } from '@/media/labels';
import {
  ALL_SCREENS,
  activeVersionOf,
  duplicateVersion,
  hasClock,
  slideAt,
  slideStarts,
  armedRegions,
  groupIdOfRole,
  mediaItemDataOf,
  mediaItemLabel,
  screenRole,
  toggleScreen,
  type MediaItemData,
  type MediaRole,
  type MediaVersion,
} from '@/media/mediaItem';
import { commandPlayback, endPlayback, setPlaybackFollowsMaster, setPlaybackHidden, usePlaybacks } from '@/media/playback';
import { playbackKeyOf, startItem } from '@/media/useMediaHost';
import { defaultFrame, type CuePacket, type CueTransport, type MediaFrame, type MediaSource } from '@/media/types';
import { mediaKindOf, mediaLabelOf } from '@/media/mediaFiles';
import { newId } from '@/utils/ids';
import { MediaBrowser } from '@/components/media/MediaBrowser';
import { PlaybackButtons } from '@/components/media/PlaybackButtons';
import { SpeedControl } from '@/components/media/SpeedControl';
import {
  Scrubber,
  Timecode,
  TransportButton,
  TransportCluster,
  TransportDivider,
  formatTimecode,
  LiveTime,
  PLAYHEAD,
} from '@/components/media/Transport';
import {
  InspectorRow,
  InspectorSection,
  OptionList,
  OptionSwitch,
  Segmented,
  ViewerFrame,
  type LampState,
} from '@/components/media/Viewer';
import { resolveMediaUrl } from '@/utils/mediaUrl';
import { useMediaFolderIssue } from '@/media/useMediaFolder';
import { MediaFolderNotice } from '@/components/media/MediaFolderNotice';

/** The file menu's entry that opens the media browser. */
const OTHER_FILE = '__other__';

const ASPECT_RATIOS: Record<MediaPreviewAspect, string> = { '16:9': '16/9', '16:10': '16/10', '4:3': '4/3' };

/** The viewer's overview: the whole file, letterboxed, as no screen frames it. */
const ORIGINAL_FRAME = defaultFrame();

/** How tall the viewer's picture may be (vh); remembered on this device. Off keeps the transport. */
const VIEWER_SIZES = { off: 0, s: 22, m: 36, l: 52 } as const;
type ViewerSize = keyof typeof VIEWER_SIZES;
const VIEWER_SIZE_KEY = 'presenter_media_viewer_size';
const VIEWER_SIZE_LABEL = { off: 'viewerOff', s: 'viewerS', m: 'viewerM', l: 'viewerL' } as const;
const storedViewerSize = (): ViewerSize => {
  try {
    const stored = localStorage.getItem(VIEWER_SIZE_KEY);
    return stored && stored in VIEWER_SIZES ? (stored as ViewerSize) : 'm';
  } catch {
    return 'm';
  }
};

const ColorCard = ({ item, aspectRatio }: { item: ShowItem; aspectRatio: string }) => {
  const { LL } = useI18nContext();
  return (
    <SlideGrid title={item.label || item.mediaColor || ''}>
      <SlideCard blockIndex={0} name="" selected label={LL.OPERATOR.LIVE_SLIDE({ index: 1 })} aspectRatio={aspectRatio}>
        <Stack
          spacing={0.5}
          sx={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', bgcolor: item.mediaColor || '#000000' }}
        >
          <PaletteIcon sx={{ fontSize: 32, filter: 'drop-shadow(0 0 4px rgba(0,0,0,.6))', color: '#fff' }} />
          <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#fff', textShadow: '0 1px 3px #000' }}>
            {item.mediaColor || '#000000'}
          </Typography>
        </Stack>
      </SlideCard>
    </SlideGrid>
  );
};

const ControlMedia = ({ item, index: itemIndex }: { item: ShowItem; index: number }) => {
  const { LL } = useI18nContext();
  const M = LL.MEDIA_ITEM;
  const T = LL.TRANSPORT;
  const l = useMediaLabels();
  const frameSummary = useFrameSummary();
  const dispatch = useAppDispatch();
  const { currentShow } = useGetShow();
  const { mediaPreviewAspect, hideTransitionMode, hideTransitionDuration } = useGetSettings(
    'mediaPreviewAspect',
    'hideTransitionMode',
    'hideTransitionDuration',
  );
  const fadeMs = hideTransitionMode === 'fade' ? hideTransitionDuration : 0;
  const { data: screenGroups = [] } = useGetScreenGroupsQuery();
  const { data: screenSets = [] } = useGetScreenSetsQuery();
  const groups = useMemo(() => screenGroups.filter((group) => group.enabled), [screenGroups]);
  const aspectRatio = ASPECT_RATIOS[mediaPreviewAspect] ?? ASPECT_RATIOS['16:9'];

  const data = mediaItemDataOf(item);
  const version = data ? activeVersionOf(data) : undefined;
  const key = playbackKeyOf(item, itemIndex);
  const playback = usePlaybacks().find((p) => p.key === key && p.endsAt === undefined);

  const [screenTab, setScreenTab] = useState<string | undefined>(undefined);
  const [viewerSize, setViewerSize] = useState(storedViewerSize);
  // The file's own shape, so the overview is not letterboxed into the screen's.
  const [clipSize, setClipSize] = useState<{ w: number; h: number }>();
  const [framing, setFraming] = useState<string | undefined>(undefined);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [volumeDraft, setVolumeDraft] = useState<number | null>(null);
  // The screen a file is being picked for ("Other file…").
  const [pickingFor, setPickingFor] = useState<string | null>(null);

  const saveData = useCallback(
    (next: MediaItemData) => dispatch(updateShowItem({ index: itemIndex, item: { media: next } })),
    [dispatch, itemIndex],
  );

  // When the media folder is the problem (none set up, its server silent), said above the viewer.
  const folderIssue = useMediaFolderIssue(version?.sources[0]?.path);

  if (item.mediaSubType === 'color') return <ColorCard item={item} aspectRatio={aspectRatio} />;
  if (!data || !version) {
    return (
      <SlideGrid title={item.label || ''}>
        <Alert severity="warning" sx={{ m: 1.5 }}>
          {M.NO_FILE()}
        </Alert>
      </SlideGrid>
    );
  }

  const saveVersion = (next: MediaVersion) => saveData({ ...data, versions: data.versions.map((v) => (v.id === next.id ? next : v)) });
  const isVideo = version.sources.some((source) => source.type === 'video');
  const isSlideshow = !!version.slideshow;
  // Videos and slideshows run on a clock: they play, pause, seek and end.
  const clock = hasClock(version);
  const label = mediaItemLabel(item);

  // The viewer shows the file as it is — the overview — and one screen's framing only when picked.
  const viewed = version.assignments.find((a) => a.role === screenTab);
  const source = version.sources.find((s) => s.id === (viewed ?? version.assignments[0])?.sourceId) ?? version.sources[0];
  const viewFrame = viewed?.frame ?? ORIGINAL_FRAME;
  const previewSource = source ? { ...source, path: resolveMediaUrl(source.path) || source.path } : undefined;
  const packet: CuePacket = playback
    ? { cue: playback.cue, transport: playback.transport, at: playback.at }
    : {
        cue: {
          ...version,
          sources: version.sources.map((s) => ({ ...s, path: resolveMediaUrl(s.path) || s.path })),
          duration: version.duration || 1,
        },
        transport: initialTransport(`still/${key}`),
        at: Date.now(),
      };
  const transport = playback ? advanceCue(playback.cue, playback.transport, Math.max(0, (Date.now() - playback.at) / 1000)) : undefined;
  const cue = playback?.cue ?? version;
  const duration = cue.duration;

  const lamp: LampState = !playback ? 'off' : playback.hidden ? 'cleared' : clock && !transport?.playing ? 'paused' : 'live';

  const screenName = (role: string) => {
    if (role === ALL_SCREENS) return M.ALL_SCREENS();
    const id = groupIdOfRole(role);
    return screenGroups.find((group) => group.id === id)?.name ?? M.UNKNOWN_SCREEN();
  };
  const hasScreen = (role: string) => version.assignments.some((a) => a.role === role && a.sourceId !== null);

  const setRole = (role: MediaRole) => saveData({ ...data, role });
  const setFrame = (role: string, frame: MediaFrame) =>
    saveVersion({ ...version, assignments: version.assignments.map((a) => (a.role === role ? { ...a, frame } : a)) });
  const setScreenSource = (role: string, sourceId: string) =>
    saveVersion({ ...version, assignments: version.assignments.map((a) => (a.role === role ? { ...a, sourceId } : a)) });
  // A picked file joins the version's files and shows on that screen.
  const addScreenSource = (role: string, path: string) => {
    const type = mediaKindOf(path) === 'video' ? 'video' : 'image';
    const added: MediaSource = { id: newId('m'), name: mediaLabelOf(path), path, type, offset: 0 };
    saveVersion({
      ...version,
      sources: [...version.sources, added],
      assignments: version.assignments.map((a) => (a.role === role ? { ...a, sourceId: added.id } : a)),
    });
  };

  const start = () => {
    if (currentShow) void startItem(currentShow, itemIndex, screenGroups, fadeMs);
  };

  const framingAssignment = version.assignments.find((a) => a.role === framing);
  const framingSource = version.sources.find((s) => s.id === framingAssignment?.sourceId);
  const shownOn = version.assignments.filter((a) => a.sourceId !== null).map((a) => screenName(a.role));
  const slideOf = (now?: CueTransport) => (playback && now && isSlideshow ? slideAt(playback.cue, now.time).index : undefined);

  const chooseViewerSize = (size: ViewerSize) => {
    setViewerSize(size);
    try {
      localStorage.setItem(VIEWER_SIZE_KEY, size);
    } catch {
      /* not remembered */
    }
  };

  // ── Viewer ──
  // The overview takes the file's shape (a 32:9 clip is a wide strip), a screen's framing the
  // screen's. The width follows the height limit, so the shape holds at every size.
  const pictureAspect = !viewed && !isSlideshow && clipSize ? clipSize.w / clipSize.h : aspectRatio;
  const picture = viewerSize !== 'off' && (
    <Box
      sx={{
        position: 'relative',
        aspectRatio: pictureAspect,
        mx: 'auto',
        width: `min(100%, calc(${VIEWER_SIZES[viewerSize]}vh * ${pictureAspect}))`,
      }}
    >
      {isSlideshow ? (
        <SlideshowSource packet={packet} frame={viewFrame} />
      ) : (
        previewSource && (
          <CueSource
            key={`${packet.transport.session}/${previewSource.id}`}
            packet={packet}
            source={previewSource}
            frame={viewFrame}
            onSize={(w, h) => setClipSize((size) => (size?.w === w && size.h === h ? size : { w, h }))}
          />
        )
      )}
      {/* The original, or one screen's framing */}
      {version.assignments.length > 0 && (
        <Stack direction="row" spacing={0.5} useFlexGap sx={{ position: 'absolute', left: 8, bottom: 8, right: 8, flexWrap: 'wrap' }}>
          {[undefined, ...version.assignments.map((a) => a.role)].map((role) => (
            <Chip
              key={role ?? 'original'}
              size="small"
              label={role ? screenName(role) : l('original')}
              onClick={() => setScreenTab(role)}
              sx={{
                height: 22,
                fontSize: 11,
                color: '#fff',
                bgcolor: role === viewed?.role ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.55)',
                backdropFilter: 'blur(4px)',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.35)' },
              }}
            />
          ))}
        </Stack>
      )}
    </Box>
  );

  const showOnScreens = (
    <Button
      variant="contained"
      color="error"
      size="small"
      startIcon={<PlayIcon />}
      onClick={start}
      sx={{ textTransform: 'none', fontWeight: 600, height: 32, mx: 0.25, bgcolor: PLAYHEAD, '&:hover': { bgcolor: '#c93a3f' } }}
    >
      {T.SHOW_ON_SCREENS()}
    </Button>
  );

  const transportRow = (
    <>
      {clock ? (
        <LiveTime playback={playback} fast>
          {(now) => <Timecode size="large" time={now?.time ?? 0} duration={duration} />}
        </LiveTime>
      ) : (
        <Box sx={{ minWidth: 92 }} />
      )}
      <Box sx={{ flex: 1 }} />
      {clock ? (
        <PlaybackButtons
          cue={cue}
          transport={transport}
          size="large"
          onCommand={(command) => commandPlayback(key, command)}
          playSlot={playback ? undefined : showOnScreens}
        >
          <TransportDivider />
          {isVideo && (
            <SpeedControl
              size="large"
              transport={playback ? transport : undefined}
              onCommand={(command) => commandPlayback(key, command)}
              followsMaster={playback?.followsMaster}
              onFollowMaster={(follow) => setPlaybackFollowsMaster(key, follow)}
            />
          )}
          <TransportButton
            label={T.LOOP()}
            size="large"
            active={!!version.loop}
            onClick={() => saveVersion({ ...version, loop: !version.loop })}
          >
            <LoopIcon />
          </TransportButton>
          {isVideo && (
            <TransportButton
              label={T.SOUND()}
              size="large"
              active={!!version.audioEnabled}
              onClick={() =>
                saveVersion({
                  ...version,
                  audioEnabled: !version.audioEnabled,
                  audioSourceId: version.audioSourceId ?? version.sources.find((s) => s.type === 'video')?.id,
                })
              }
            >
              {version.audioEnabled ? <VolumeIcon /> : <MutedIcon />}
            </TransportButton>
          )}
        </PlaybackButtons>
      ) : (
        // An image does not play: it is on the screens or not.
        !playback && <TransportCluster>{showOnScreens}</TransportCluster>
      )}
      <Box sx={{ flex: 1 }} />
      {playback && (
        <TransportCluster>
          <TransportButton
            label={playback.hidden ? M.SHOW_HINT() : M.CLEAR_HINT()}
            size="large"
            active={playback.hidden}
            onClick={() => setPlaybackHidden(key, !playback.hidden)}
          >
            {playback.hidden ? <HiddenIcon /> : <VisibleIcon />}
          </TransportButton>
          <TransportButton
            label={
              <>
                {T.END()}
                <br />
                {T.END_SHIFT()}
              </>
            }
            size="large"
            danger
            onClick={(event) => endPlayback(key, event.shiftKey ? 0 : fadeMs)}
          >
            <StopIcon />
          </TransportButton>
        </TransportCluster>
      )}
      {clock && (
        <Typography sx={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(233,236,239,0.5)', minWidth: 64, textAlign: 'right' }}>
          {formatTimecode(duration)}
        </Typography>
      )}
    </>
  );

  return (
    <SlideGrid
      single
      title={label}
      subtitle={data.versions.length > 1 ? version.name : undefined}
      pills={<Chip size="small" variant="outlined" label={data.role === 'background' ? M.ROLE_BACKGROUND() : M.ROLE_CONTENT()} />}
      footer={
        <Box sx={{ maxWidth: 1040 }}>
          {/* ── Playback ── */}
          <InspectorSection
            id="playback"
            title={T.PLAYBACK()}
            summary={`${data.role === 'background' ? M.ROLE_BACKGROUND() : M.ROLE_CONTENT()} · ${version.name}`}
          >
            <InspectorRow label={M.ROLE()}>
              <Segmented
                value={data.role}
                options={[
                  { value: 'content', label: M.ROLE_CONTENT() },
                  { value: 'background', label: M.ROLE_BACKGROUND() },
                ]}
                onChange={setRole}
              />
            </InspectorRow>
            <InspectorRow label={M.VERSION()}>
              {renaming !== null ? (
                <TextField
                  size="small"
                  autoFocus
                  value={renaming}
                  onChange={(e) => setRenaming(e.target.value)}
                  onBlur={() => {
                    if (renaming.trim()) saveVersion({ ...version, name: renaming.trim() });
                    setRenaming(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                  sx={{ width: 200 }}
                />
              ) : (
                <Select
                  size="small"
                  value={version.id}
                  onChange={(e) => saveData({ ...data, versionId: e.target.value })}
                  sx={{ minWidth: 180, height: 32 }}
                >
                  {data.versions.map((v) => (
                    <MenuItem key={v.id} value={v.id}>
                      {v.name}
                    </MenuItem>
                  ))}
                </Select>
              )}
              <Tooltip title={M.RENAME_VERSION()}>
                <IconButton size="small" onClick={() => setRenaming(version.name)}>
                  <RenameIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={M.NEW_VERSION()}>
                <IconButton
                  size="small"
                  onClick={() => {
                    const copy = duplicateVersion(version, M.VERSION_NAME({ number: data.versions.length + 1 }));
                    saveData({ ...data, versions: [...data.versions, copy], versionId: copy.id });
                  }}
                >
                  <AddIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              {data.versions.length > 1 && (
                <Tooltip title={M.DELETE_VERSION()}>
                  <IconButton
                    size="small"
                    onClick={() => {
                      const versions = data.versions.filter((v) => v.id !== version.id);
                      saveData({ ...data, versions, versionId: versions[0].id });
                    }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </InspectorRow>
            {isVideo && (
              <OptionList>
                <OptionSwitch
                  label={M.AUTOPLAY()}
                  description={M.AUTOPLAY_HINT()}
                  checked={item.mediaAutoplay !== false}
                  onChange={(mediaAutoplay) => dispatch(updateShowItem({ index: itemIndex, item: { mediaAutoplay } }))}
                />
                <OptionSwitch
                  label={M.SOUND_HERE()}
                  description={M.SOUND_HERE_HINT()}
                  checked={!!version.audioEnabled}
                  onChange={(audioEnabled) =>
                    saveVersion({
                      ...version,
                      audioEnabled,
                      audioSourceId: version.audioSourceId ?? version.sources.find((s) => s.type === 'video')?.id,
                    })
                  }
                >
                  <VolumeIcon fontSize="small" color="action" />
                  <Slider
                    size="small"
                    min={0}
                    max={1}
                    step={0.05}
                    value={volumeDraft ?? version.volume ?? 1}
                    aria-label={LL.AUDIO.VOLUME()}
                    onChange={(_, v) => setVolumeDraft(v as number)}
                    onChangeCommitted={(_, v) => {
                      setVolumeDraft(null);
                      saveVersion({ ...version, volume: v as number });
                    }}
                    sx={{ flex: '1 1 140px', maxWidth: 240, mx: 1 }}
                  />
                  <Typography sx={{ fontSize: 12.5, fontFamily: 'monospace', minWidth: 40 }}>
                    {Math.round((volumeDraft ?? version.volume ?? 1) * 100)}%
                  </Typography>
                </OptionSwitch>
              </OptionList>
            )}
          </InspectorSection>

          {/* ── Slideshow ── */}
          {isSlideshow && (
            <InspectorSection
              id="slideshow"
              title={T.SLIDESHOW()}
              summary={`${M.IMAGES({ count: version.sources.length })} · ${version.slideshow?.seconds ?? 0} s`}
            >
              <SlideshowSettings version={version} onChange={saveVersion} />
            </InspectorSection>
          )}

          {/* ── Screens ── */}
          <InspectorSection id="screens" title={T.SCREENS()} summary={shownOn.join(' · ') || M.NO_SCREENS_HINT()}>
            {/* "All screens" is the default; picking screens turns it into a filter. */}
            <InspectorRow label={M.SHOW_ON()} align="start">
              <Chip
                size="small"
                label={M.ALL_SCREENS()}
                color={hasScreen(ALL_SCREENS) ? 'primary' : 'default'}
                variant={hasScreen(ALL_SCREENS) ? 'filled' : 'outlined'}
                onClick={() => saveVersion(toggleScreen(version, ALL_SCREENS, true))}
              />
              {(screenSets.length > 0 || groups.length > 0) && <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />}
              {screenSets.map((set) => {
                const members = groups.filter((group) => set.screenGroupIds.includes(group.id));
                if (members.length === 0) return null;
                const on = members.every((group) => hasScreen(screenRole(group.id)));
                return (
                  <Tooltip key={`set-${set.id}`} title={members.map((group) => group.name).join(' + ')}>
                    <Chip
                      size="small"
                      label={set.name}
                      color={on ? 'secondary' : 'default'}
                      variant={on ? 'filled' : 'outlined'}
                      onClick={() => saveVersion(members.reduce((next, group) => toggleScreen(next, screenRole(group.id), !on), version))}
                    />
                  </Tooltip>
                );
              })}
              {groups.map((group) => {
                const role = screenRole(group.id);
                const on = hasScreen(role);
                return (
                  <Chip
                    key={group.id}
                    size="small"
                    label={group.name}
                    color={on ? 'primary' : 'default'}
                    variant={on ? 'filled' : 'outlined'}
                    onClick={() => saveVersion(toggleScreen(version, role, !on))}
                  />
                );
              })}
              {/* Screens still assigned but no longer offered above — a deleted or disabled group.
                  Without a chip here they could not be taken off. */}
              {version.assignments
                .filter((a) => a.role !== ALL_SCREENS && !groups.some((group) => screenRole(group.id) === a.role))
                .map((a) => (
                  <Chip
                    key={a.role}
                    size="small"
                    label={screenName(a.role)}
                    color="warning"
                    variant="outlined"
                    onDelete={() => saveVersion(toggleScreen(version, a.role, false))}
                  />
                ))}
              <Typography
                variant="caption"
                sx={{ color: version.assignments.length === 0 ? 'warning.main' : 'text.secondary', width: '100%' }}
              >
                {version.assignments.length === 0
                  ? M.NO_SCREENS_HINT()
                  : hasScreen(ALL_SCREENS)
                    ? l('allScreensHint')
                    : l('pickedScreensHint')}
              </Typography>
            </InspectorRow>
            {/* One card per screen: where the picture sits, which file, how it fills, crop and place.
                Clicking the name shows that screen in the viewer. */}
            {version.assignments.length > 0 && (
              <InspectorRow label={M.FRAMING()} align="start">
                <Stack spacing={0.75} sx={{ width: '100%' }}>
                  {version.assignments.map((a) => {
                    const viewing = a.role === viewed?.role;
                    return (
                      <Stack
                        key={a.role}
                        direction="row"
                        spacing={1.25}
                        useFlexGap
                        sx={(theme) => ({
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          p: 0.75,
                          borderRadius: 1,
                          border: 1,
                          borderColor: viewing ? 'primary.main' : 'divider',
                          bgcolor: viewing ? alpha(theme.palette.primary.main, 0.06) : 'transparent',
                        })}
                      >
                        <Tooltip title={M.FRAME()}>
                          <ButtonBase aria-label={M.FRAME()} onClick={() => setFraming(a.role)} sx={{ borderRadius: 0.5 }}>
                            <FrameMap frame={a.frame} />
                          </ButtonBase>
                        </Tooltip>
                        <ButtonBase
                          title={viewing ? l('showOriginal') : l('showInViewer')}
                          onClick={() => setScreenTab(viewing ? undefined : a.role)}
                          sx={{ flex: '1 1 140px', minWidth: 0, flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left' }}
                        >
                          <Typography noWrap sx={{ fontSize: 13, fontWeight: 600, maxWidth: '100%' }}>
                            {screenName(a.role)}
                          </Typography>
                          <Typography noWrap sx={{ fontSize: 11.5, color: 'text.secondary', maxWidth: '100%' }}>
                            {frameSummary(a.frame)}
                          </Typography>
                        </ButtonBase>
                        {!isSlideshow && (
                          <Tooltip title={M.OTHER_FILE_HINT()} placement="top">
                            <Select
                              size="small"
                              value={a.sourceId ?? ''}
                              aria-label={M.SCREEN_FILE()}
                              onChange={(e) => {
                                if (e.target.value === OTHER_FILE) setPickingFor(a.role);
                                else setScreenSource(a.role, e.target.value);
                              }}
                              sx={{ minWidth: 130, maxWidth: 200, height: 30, fontSize: 13 }}
                            >
                              {version.sources.map((s) => (
                                <MenuItem key={s.id} value={s.id}>
                                  {s.name}
                                </MenuItem>
                              ))}
                              <MenuItem value={OTHER_FILE}>{M.OTHER_FILE()}</MenuItem>
                            </Select>
                          </Tooltip>
                        )}
                        <Segmented
                          size="small"
                          value={a.frame.fit}
                          options={(['cover', 'contain', 'fill'] as const).map((fit) => ({
                            value: fit,
                            label: <span title={l(fit)}>{l(`${fit}Short`)}</span>,
                          }))}
                          onChange={(fit) => setFrame(a.role, { ...a.frame, fit })}
                        />
                        <Tooltip title={M.FRAME()}>
                          <IconButton
                            size="small"
                            aria-label={M.FRAME()}
                            onClick={() => setFraming(a.role)}
                            sx={{ border: 1, borderColor: 'divider', borderRadius: 1, width: 30, height: 30 }}
                          >
                            <FrameIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    );
                  })}
                </Stack>
              </InspectorRow>
            )}
          </InspectorSection>

          {/* ── Timeline and the song it follows ── */}
          {isVideo && currentShow && (
            <InspectorSection
              id="timeline"
              title={T.TIMELINE()}
              defaultOpen={false}
              summary={version.regions.length ? LL.MEDIA_TIMELINE.SECTIONS({ count: version.regions.length }) : undefined}
            >
              <MediaTimelineSection
                embedded
                show={currentShow}
                itemIndex={itemIndex}
                version={version}
                playback={playback}
                onChange={saveVersion}
              />
            </InspectorSection>
          )}

          <MediaBrowser
            open={pickingFor !== null}
            mode="pick"
            pickType={isVideo ? 'video' : 'image'}
            initialType={isVideo ? 'video' : 'image'}
            selectLabel={M.OTHER_FILE()}
            onClose={() => setPickingFor(null)}
            onAdd={() => {}}
            onPick={(path) => {
              if (pickingFor !== null) addScreenSource(pickingFor, path);
              setPickingFor(null);
            }}
          />

          {framingAssignment && framingSource && (
            <FrameEditor
              value={framingAssignment.frame}
              screenName={screenName(framingAssignment.role)}
              source={framingSource}
              packet={packet}
              onClose={() => setFraming(undefined)}
              onApply={(frame) => {
                setFrame(framingAssignment.role, frame);
                setFraming(undefined);
              }}
            />
          )}
        </Box>
      }
    >
      {folderIssue && <MediaFolderNotice issue={folderIssue} sx={{ mb: 1.5 }} />}
      <ViewerFrame
        lamp={lamp}
        // The card header names the entry; the viewer names the screen whose framing it shows.
        title={viewed ? screenName(viewed.role) : l('original')}
        headerRight={
          <>
            {isSlideshow && playback && (
              <LiveTime playback={playback} fast>
                {(now) =>
                  slideOf(now) !== undefined && (
                    <Typography sx={{ fontFamily: 'monospace', fontSize: 11.5, color: 'rgba(233,236,239,0.7)' }}>
                      {slideOf(now)! + 1} / {version.sources.length}
                    </Typography>
                  )
                }
              </LiveTime>
            )}
            <Stack
              direction="row"
              sx={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 0.75, overflow: 'hidden', flexShrink: 0 }}
            >
              {(Object.keys(VIEWER_SIZES) as ViewerSize[]).map((size) => (
                <Tooltip key={size} title={l(VIEWER_SIZE_LABEL[size])}>
                  <ButtonBase
                    aria-label={l(VIEWER_SIZE_LABEL[size])}
                    aria-pressed={size === viewerSize}
                    onClick={() => chooseViewerSize(size)}
                    sx={{
                      minWidth: 24,
                      height: 22,
                      px: 0.6,
                      fontSize: 11,
                      fontWeight: 700,
                      color: size === viewerSize ? '#fff' : 'rgba(233,236,239,0.5)',
                      bgcolor: size === viewerSize ? 'rgba(255,255,255,0.16)' : 'transparent',
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
                    }}
                  >
                    {size === 'off' ? <HiddenIcon sx={{ fontSize: 14 }} /> : size.toUpperCase()}
                  </ButtonBase>
                </Tooltip>
              ))}
            </Stack>
          </>
        }
        scrubber={
          clock ? (
            <LiveTime playback={playback} fast>
              {(now) => (
                <Scrubber
                  variant="full"
                  time={now?.time ?? 0}
                  duration={duration}
                  disabled={!playback}
                  regions={armedRegions(cue, transport?.enabled)}
                  ticks={isSlideshow ? slideStarts(cue) : undefined}
                  onSeek={(time) => commandPlayback(key, { type: 'seek', time })}
                />
              )}
            </LiveTime>
          ) : undefined
        }
        transport={transportRow}
        below={
          isSlideshow ? (
            <LiveTime playback={playback} fast>
              {(now) => (
                <SlideshowFilmstrip
                  version={version}
                  currentIndex={slideOf(now)}
                  onChange={saveVersion}
                  onJump={
                    playback
                      ? (index) => commandPlayback(key, { type: 'seek', time: index * Math.max(0.5, playback.cue.slideshow?.seconds ?? 1) })
                      : undefined
                  }
                />
              )}
            </LiveTime>
          ) : undefined
        }
      >
        {picture}
      </ViewerFrame>
    </SlideGrid>
  );
};

export default memo(ControlMedia);
