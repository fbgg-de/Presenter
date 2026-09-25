/**
 * The timeline of a video version, in its entry card: sections, loops and pauses drawn on the
 * waveform (the existing timeline editor), and the song in the same agenda group whose slides the
 * sections are mapped to.
 *
 * The editor drives the running entry when it is on screen; otherwise it plays on a clock of its
 * own, so preparing a timeline never reaches the screens.
 */
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Collapse, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Timeline as TimelineIcon } from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import type { Show } from '@/api/shows.api';
import { useAppDispatch, useAppSelector } from '@/store';
import { updateShowItem } from '@/store/showSlice';
import { selectCurrentSongOrder, useGetSongs } from '@/store/songsSlice';
import { resolveMediaUrl } from '@/utils/mediaUrl';
import { DEFAULT_GROUP_ID, genItemId } from '@/utils/showGroups';
import { CueTimeline } from '@/media/CueTimeline';
import { SourceDuration } from '@/media/SourceDuration';
import { advanceCue, commandCue, initialTransport, lyricOccurrences, validateCue } from '@/media/engine';
import { emptyLyricBinding, mappingMatches, timelineBinding, withTimelineBinding } from '@/media/lyricFollow';
import type { MediaVersion } from '@/media/mediaItem';
import { commandPlayback, type Playback } from '@/media/playback';
import type { CueCommand, CuePacket, CueTransport } from '@/media/types';
import { SectionLabel } from '@/components/operator/SectionLabel';

const OPEN_KEY = 'presenter_media_timeline_open';

export const MediaTimelineSection = ({
  show,
  itemIndex,
  version,
  playback,
  onChange,
  embedded,
}: {
  /** Inside a folding inspector section: always open, no toggle of its own. */
  embedded?: boolean;
  show: Show;
  itemIndex: number;
  version: MediaVersion;
  /** The entry on screen, if it runs. */
  playback?: Playback;
  onChange: (version: MediaVersion) => void;
}) => {
  const { LL } = useI18nContext();
  const T = LL.MEDIA_TIMELINE;
  const dispatch = useAppDispatch();
  const { songs } = useGetSongs();
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(OPEN_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [invalid, setInvalid] = useState(false);
  const shown = embedded || open;

  const item = show.order[itemIndex];
  const agendaGroupId = item?.groupId ?? DEFAULT_GROUP_ID;
  // The songs a version can follow: the song entries of its own agenda group.
  const songEntries = show.order
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.type === 'song' && entry.songNumber != null && (entry.groupId ?? DEFAULT_GROUP_ID) === agendaGroupId);
  const boundIndex = songEntries.find(({ entry }) => entry.id && entry.id === version.lyrics?.songItemId)?.index;
  const boundSong = boundIndex !== undefined ? songs[show.order[boundIndex].songNumber!] : undefined;
  const songsState = useAppSelector((state) => state.songs);
  const slidesOf = (songNumber: number) => {
    const song = songs[songNumber];
    if (!song) return [];
    return song
      .getBlocks(selectCurrentSongOrder({ songs: songsState }, songNumber))
      .filter((block) => !block.copyright)
      .map((b) => ({ name: b.name, lines: b.lines }));
  };
  const orderName = boundSong ? selectCurrentSongOrder({ songs: songsState }, boundSong.songNumber) : 'Default';
  // eslint-disable-next-line react-hooks/exhaustive-deps -- slidesOf reads the same songs and orders
  const blocks = useMemo(() => (boundSong ? slidesOf(boundSong.songNumber) : []), [boundSong, songsState]);
  const occurrences = useMemo(() => lyricOccurrences(blocks), [blocks]);

  // Without a playing entry the editor has a clock of its own.
  const [local, setLocal] = useState<{ transport: CueTransport; at: number }>(() => ({
    transport: initialTransport(`timeline/${version.id}`),
    at: Date.now(),
  }));
  const [now, setNow] = useState(() => Date.now());
  const ticking = playback ? playback.transport.playing : local.transport.playing;
  useEffect(() => {
    if (!shown || !ticking) return;
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [shown, ticking]);

  const resolved: MediaVersion = useMemo(
    () => ({ ...version, sources: version.sources.map((s) => ({ ...s, path: resolveMediaUrl(s.path) || s.path })) }),
    [version],
  );
  const packet: CuePacket | undefined =
    version.duration > 0
      ? playback
        ? {
            cue: playback.cue,
            transport: advanceCue(playback.cue, playback.transport, Math.max(0, (now - playback.at) / 1000)),
            at: now,
          }
        : { cue: resolved, transport: advanceCue(resolved, local.transport, Math.max(0, (now - local.at) / 1000)), at: now }
      : undefined;

  const command = (next: CueCommand) => {
    if (playback) {
      commandPlayback(playback.key, next);
      setNow(Date.now());
      return;
    }
    setLocal((current) => {
      const at = Date.now();
      const advanced = advanceCue(resolved, current.transport, Math.max(0, (at - current.at) / 1000));
      return { transport: commandCue(resolved, advanced, next), at };
    });
    setNow(Date.now());
  };

  const toggleOpen = () =>
    setOpen((value) => {
      try {
        localStorage.setItem(OPEN_KEY, value ? '0' : '1');
      } catch {
        /* not remembered */
      }
      return !value;
    });

  const followSong = (index: number | '') => {
    if (index === '') {
      onChange({ ...version, lyrics: undefined });
      return;
    }
    const entry = show.order[index];
    // A song is followed by its entry id; entries saved before ids get one now.
    let id = entry.id;
    if (!id) {
      id = genItemId();
      dispatch(updateShowItem({ index, item: { id } }));
    }
    const songBlocks = slidesOf(entry.songNumber!);
    onChange({
      ...version,
      lyrics: { ...emptyLyricBinding(id, songBlocks), map: version.lyrics?.songItemId === id ? version.lyrics.map : {} },
    });
  };

  const video = version.sources.find((source) => source.type === 'video');

  return (
    <Stack spacing={1}>
      {!embedded && (
        <Button
          size="small"
          color="inherit"
          startIcon={<TimelineIcon />}
          onClick={toggleOpen}
          sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
        >
          {open ? T.HIDE() : T.SHOW()}
          {version.regions.length > 0 && ` · ${T.SECTIONS({ count: version.regions.length })}`}
          {version.lyrics && boundSong && ` · ${boundSong.title}`}
        </Button>
      )}
      <Collapse in={shown} unmountOnExit>
        <Stack spacing={1}>
          <Stack direction="row" spacing={1.5} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Stack spacing={0.25} sx={{ minWidth: 220 }}>
              <SectionLabel>{T.FOLLOWS_SONG()}</SectionLabel>
              <TextField
                select
                size="small"
                value={boundIndex ?? ''}
                onChange={(e) => followSong(e.target.value === '' ? '' : Number(e.target.value))}
                disabled={songEntries.length === 0}
                helperText={songEntries.length === 0 ? T.NO_SONGS_IN_GROUP() : undefined}
              >
                <MenuItem value="">{T.NO_SONG()}</MenuItem>
                {songEntries.map(({ entry, index }) => (
                  <MenuItem key={index} value={index}>
                    {songs[entry.songNumber!]?.title ?? `#${entry.songNumber}`}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
            {version.duration <= 0 && video && (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <SourceDuration source={video} autoUse onUse={(duration) => onChange({ ...version, duration })} />
              </Stack>
            )}
          </Stack>

          {version.lyrics && boundSong && !mappingMatches(version.lyrics, blocks) && (
            <Alert
              severity="warning"
              action={
                <Button
                  color="inherit"
                  onClick={() => onChange({ ...version, lyrics: { ...version.lyrics!, arrangement: occurrences.signature } })}
                >
                  {T.CONFIRM_ARRANGEMENT()}
                </Button>
              }
            >
              {T.ARRANGEMENT_CHANGED({ order: orderName })}
            </Alert>
          )}
          {version.lyrics && boundIndex === undefined && <Alert severity="info">{T.SONG_GONE()}</Alert>}
          {invalid && <Alert severity="error">{T.INVALID()}</Alert>}

          {packet ? (
            <CueTimeline
              key={version.id}
              cue={version}
              binding={timelineBinding(version)}
              packet={packet}
              occurrences={occurrences.blocks}
              onCommand={command}
              onChange={(cue, binding) => {
                const next = withTimelineBinding(cue as MediaVersion, binding);
                if (validateCue(next)) {
                  setInvalid(true);
                  return;
                }
                setInvalid(false);
                onChange(next);
              }}
            />
          ) : (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {T.NEEDS_DURATION()}
            </Typography>
          )}
        </Stack>
      </Collapse>
    </Stack>
  );
};
