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
  Chip,
  IconButton,
  MenuItem,
  Select,
  Slider,
  Stack,
  Switch,
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
import { FrameEditor } from '@/media/FrameEditor';
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
import type { CuePacket, CueTransport, MediaFrame, MediaSource } from '@/media/types';
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
import { InspectorRow, InspectorSection, Segmented, ViewerFrame, type LampState } from '@/components/media/Viewer';
import { resolveMediaUrl } from '@/utils/mediaUrl';

/** The file menu's entry that opens the media browser. */
const OTHER_FILE = '__other__';

const ASPECT_RATIOS: Record<MediaPreviewAspect, string> = { '16:9': '16/9', '16:10': '16/10', '4:3': '4/3' };

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
  const [framing, setFraming] = useState<string | undefined>(undefined);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [volumeDraft, setVolumeDraft] = useState<number | null>(null);
  // The screen a file is being picked for ("Other file…").
  const [pickingFor, setPickingFor] = useState<string | null>(null);

  const saveData = useCallback(
    (next: MediaItemData) => dispatch(updateShowItem({ index: itemIndex, item: { media: next } })),
    [dispatch, itemIndex],
  );

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

  // The screen whose framing the viewer shows: the chosen one, else the first assignment.
  const assignment = version.assignments.find((a) => a.role === screenTab) ?? version.assignments[0];
  const source = version.sources.find((s) => s.id === assignment?.sourceId) ?? version.sources[0];
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

  // ── Viewer ──
  const picture = (
    <Box sx={{ position: 'relative', aspectRatio, maxHeight: '52vh', mx: 'auto', width: '100%' }}>
      {isSlideshow && assignment ? (
        <SlideshowSource packet={packet} frame={assignment.frame} />
      ) : (
        previewSource &&
        assignment && (
          <CueSource
            key={`${packet.transport.session}/${previewSource.id}`}
            packet={packet}
            source={previewSource}
            frame={assignment.frame}
          />
        )
      )}
      {/* Screens the viewer can show the framing of */}
      {version.assignments.length > 1 && (
        <Stack direction="row" spacing={0.5} sx={{ position: 'absolute', left: 8, bottom: 8, flexWrap: 'wrap' }}>
          {version.assignments.map((a) => (
            <Chip
              key={a.role}
              size="small"
              label={screenName(a.role)}
              onClick={() => setScreenTab(a.role)}
              sx={{
                height: 22,
                fontSize: 11,
                color: '#fff',
                bgcolor: a.role === assignment?.role ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.55)',
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
              <>
                <InspectorRow label={M.AUTOPLAY()}>
                  <Switch
                    size="small"
                    checked={item.mediaAutoplay !== false}
                    onChange={(e) => dispatch(updateShowItem({ index: itemIndex, item: { mediaAutoplay: e.target.checked } }))}
                  />
                </InspectorRow>
                <InspectorRow label={M.SOUND_HERE()}>
                  <Switch
                    size="small"
                    checked={!!version.audioEnabled}
                    onChange={(e) =>
                      saveVersion({
                        ...version,
                        audioEnabled: e.target.checked,
                        audioSourceId: version.audioSourceId ?? version.sources.find((s) => s.type === 'video')?.id,
                      })
                    }
                  />
                  {version.audioEnabled && (
                    <>
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
                    </>
                  )}
                </InspectorRow>
              </>
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
            <InspectorRow label={M.SHOW_ON()} align="start">
              {(groups.length === 0 || hasScreen(ALL_SCREENS)) && (
                <Chip
                  size="small"
                  label={M.ALL_SCREENS()}
                  color={hasScreen(ALL_SCREENS) ? 'primary' : 'default'}
                  variant={hasScreen(ALL_SCREENS) ? 'filled' : 'outlined'}
                  onClick={() => saveVersion(toggleScreen(version, ALL_SCREENS, !hasScreen(ALL_SCREENS)))}
                />
              )}
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
              {version.assignments.length === 0 && (
                <Typography variant="caption" sx={{ color: 'warning.main', width: '100%' }}>
                  {M.NO_SCREENS_HINT()}
                </Typography>
              )}
            </InspectorRow>
            {/* One row per screen: which file, how it fills the screen, crop and place. */}
            {version.assignments.map((a) => (
              <InspectorRow key={a.role} label={screenName(a.role)}>
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
                      sx={{ minWidth: 140, maxWidth: 220, height: 32 }}
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
                <Select
                  size="small"
                  value={a.frame.fit}
                  onChange={(e) => setFrame(a.role, { ...a.frame, fit: e.target.value as MediaFrame['fit'] })}
                  sx={{ minWidth: 120, height: 32 }}
                >
                  {(['cover', 'contain', 'fill'] as const).map((fit) => (
                    <MenuItem key={fit} value={fit}>
                      {l(fit)}
                    </MenuItem>
                  ))}
                </Select>
                <Button
                  size="small"
                  color="inherit"
                  startIcon={<FrameIcon />}
                  onClick={() => setFraming(a.role)}
                  sx={{ textTransform: 'none' }}
                >
                  {M.FRAME()}
                </Button>
                {a.role !== assignment?.role && version.assignments.length > 1 && (
                  <Button
                    size="small"
                    color="inherit"
                    onClick={() => setScreenTab(a.role)}
                    sx={{ textTransform: 'none', color: 'text.secondary' }}
                  >
                    {T.VIEWING()}
                  </Button>
                )}
              </InspectorRow>
            ))}
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
      <ViewerFrame
        lamp={lamp}
        // The card header names the entry; the viewer names the screen whose framing it shows.
        title={assignment ? screenName(assignment.role) : ''}
        headerRight={
          isSlideshow && playback ? (
            <LiveTime playback={playback} fast>
              {(now) =>
                slideOf(now) !== undefined && (
                  <Typography sx={{ fontFamily: 'monospace', fontSize: 11.5, color: 'rgba(233,236,239,0.7)' }}>
                    {slideOf(now)! + 1} / {version.sources.length}
                  </Typography>
                )
              }
            </LiveTime>
          ) : undefined
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
