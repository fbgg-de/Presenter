/**
 * A running entry's sections and pauses, inline in the layer bar.
 *
 * One chip per region, always visible: what it is (section / loop / pause), whether it is armed,
 * what it maps to in the song, and which one the clock is in. Click arms or disarms it; the ▶ on
 * a loop chip enters or queues that loop, and leaves it once it is running.
 *
 * The timeline editor (`CueTimeline`) owns the same controls, but it lives in the item's panel —
 * open it and the agenda, the slides and the other layers are gone. During a service the operator
 * is on a song, not on the video.
 *
 * Read-only about the cue itself: nothing here edits a region. Arming, entering and leaving a loop
 * are runtime state on the transport (`CueTransport.enabled` / `activeLoop` / `nextLoop` /
 * `exitLoop`), so they end with the playback and never touch the saved cue.
 */
import { useMemo } from 'react';
import { Chip, Stack, Tooltip } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { keyframes } from '@emotion/react';
import { Logout, MusicNote, Pause, PlayArrow, Repeat } from '@mui/icons-material';
import { useAppSelector } from '@/store';
import { useGetShow } from '@/store/showSlice';
import { selectCurrentSongOrder, useGetSongs } from '@/store/songsSlice';
import { contains, isEnabled, isLoop, lyricOccurrences } from './engine';
import { mappingMatches } from './lyricFollow';
import { useMediaLabels } from './labels';
import { commandPlayback, type Playback } from './playback';
import { REGION_INK, type CueTransport, type MediaCue, type MediaRegion } from './types';
import { formatTime } from '@/utils';

/** Where each of a cue's regions points in the song, by region id; `clear` blanks the slide. */
function useLyricMap(cue: MediaCue): { names: Record<string, string | 'clear'>; stale: boolean } {
  const { currentShow } = useGetShow();
  const { songs } = useGetSongs();
  const songsState = useAppSelector((state) => state.songs);

  return useMemo(() => {
    const lyrics = cue.lyrics;
    const entry = lyrics?.songItemId ? currentShow?.order?.find((item) => item.id === lyrics.songItemId) : undefined;
    const song = entry?.songNumber != null ? songs[entry.songNumber] : undefined;
    if (!lyrics || !song) return { names: {}, stale: false };

    const blocks = song
      .getBlocks(selectCurrentSongOrder({ songs: songsState }, song.songNumber))
      .filter((block) => !block.copyright)
      .map((block) => ({ name: block.name, lines: block.lines }));
    const byId = new Map(lyricOccurrences(blocks).blocks.map((block) => [block.id, block.name]));

    const names: Record<string, string | 'clear'> = {};
    for (const [regionId, target] of Object.entries(lyrics.map)) {
      if (target === 'clear') names[regionId] = 'clear';
      else {
        const name = byId.get(target);
        if (name) names[regionId] = name;
      }
    }
    return { names, stale: !mappingMatches(lyrics, blocks) };
  }, [cue.lyrics, currentShow, songs, songsState]);
}

/** What the transport says about one region right now. */
const regionState = (region: MediaRegion, transport: CueTransport, time: number) =>
  region.id === transport.pausedAt
    ? ('paused' as const)
    : region.id === transport.activeLoop
      ? ('active' as const)
      : region.id === transport.nextLoop
        ? ('next' as const)
        : !isEnabled(region, transport)
          ? ('off' as const)
          : region.kind === 'section' && contains(region, time)
            ? ('playing' as const)
            : ('enabled' as const);

/** Section, looping section or pause — the three the timeline draws in its own colours. */
const lookOf = (region: MediaRegion) => (region.kind === 'pause' ? 'pause' : isLoop(region) ? 'loop' : 'section');

/**
 * A chip in its kind's colour, as the waveform editor draws the same region. Armed is filled, with
 * a solid border and its icon lit; disarmed is empty, dashed and grey, so the difference reads at
 * a glance for every kind. What holds the clock right now gets a heavier fill and a 2px border of
 * the *same* hue.
 */
/**
 * A hold that is holding the video, or a loop that is repeating, changes what the video does next —
 * so its chip pulses between its fill and a brighter one until it lets go.
 */
const pulse = (tint: string) => keyframes`
  0%, 100% { background-color: ${alpha(tint, 0.45)}; box-shadow: 0 0 0 0 ${alpha(tint, 0)}; }
  50% { background-color: ${alpha(tint, 0.85)}; box-shadow: 0 0 8px 1px ${alpha(tint, 0.65)}; }
`;

const chipSx = (region: MediaRegion, state: ReturnType<typeof regionState>) => {
  const held = state === 'playing' || state === 'active' || state === 'paused';
  const off = state === 'off';
  const tint = REGION_INK[lookOf(region)];
  const fill = held ? 0.45 : off ? 0 : 0.26;
  return {
    // Square with a small radius, like the buttons beside it — not a pill.
    borderRadius: 1,
    height: 26,
    flexShrink: 0,
    maxWidth: 200,
    border: held || state === 'next' ? 2 : 1,
    borderColor: off ? alpha(tint, 0.55) : tint,
    // Dashed = disarmed (as in the editor), dotted = queued to run after the current loop.
    borderStyle: off ? 'dashed' : state === 'next' ? 'dotted' : 'solid',
    bgcolor: alpha(tint, fill),
    color: off ? 'text.disabled' : 'text.primary',
    fontWeight: held ? 600 : 400,
    '& .MuiChip-icon, & .MuiChip-deleteIcon': { color: off ? 'text.disabled' : tint },
    '&:hover': { bgcolor: alpha(tint, fill + 0.12) },
    ...(state === 'paused' || state === 'active'
      ? {
          animation: `${pulse(tint)} 1.1s ease-in-out infinite`,
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        }
      : {}),
  } as const;
};

/**
 * Every region of a running entry, as chips. Disarmed ones are dimmed rather than hidden, so how
 * many are armed is a glance rather than a menu to open.
 */
export const CueRegionStrip = ({ playback, transport }: { playback: Playback; transport: CueTransport }) => {
  const l = useMediaLabels();
  const { names, stale } = useLyricMap(playback.cue);
  const regions = useMemo(() => [...playback.cue.regions].sort((a, b) => a.start - b.start), [playback.cue.regions]);
  if (regions.length === 0) return null;

  const command = (next: Parameters<typeof commandPlayback>[1]) => commandPlayback(playback.key, next);

  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', minWidth: 0, overflowX: 'auto', pl: 7, pb: 0.5 }}>
      {regions.map((region) => {
        const state = regionState(region, transport, transport.time);
        const armed = state !== 'off';
        const loop = isLoop(region);
        const isActiveLoop = region.id === transport.activeLoop;
        const mapped = names[region.id];
        // A click arms or disarms any region (a disarmed section's lyric mapping is ignored); a
        // double click jumps to it.
        const clickLabel = `${l(armed ? 'enabled' : 'off')} · ${l(armed ? 'disarm' : 'arm')}\n${l('jumpSection')}`;
        const loopLabel = isActiveLoop ? (transport.exitLoop ? l('keep') : l('exit')) : transport.activeLoop ? l('queue') : l('enter');
        const where = region.kind === 'pause' ? formatTime(region.start) : `${formatTime(region.start)}–${formatTime(region.end)}`;
        const mapping = mapped === undefined ? '' : `\n♪ ${mapped === 'clear' ? l('clear') : mapped}${stale ? ` · ${l('mismatch')}` : ''}`;

        return (
          <Tooltip
            key={region.id}
            title={`${region.name} · ${where}${mapping}\n${clickLabel}`}
            slotProps={{ tooltip: { sx: { whiteSpace: 'pre-line' } } }}
          >
            <Chip
              size="small"
              variant="outlined"
              icon={region.kind === 'pause' ? <Pause /> : loop ? <Repeat /> : <MusicNote />}
              label={mapped === undefined ? region.name : `${region.name} · ${mapped === 'clear' ? l('clear') : mapped}`}
              onClick={() => command({ type: 'enable', id: region.id, enabled: !armed })}
              onDoubleClick={() => command({ type: 'seek', time: region.start, navigate: true })}
              // The chip's delete slot is the loop's own action: enter it, queue it behind the
              // running one, or stop repeating. Only loops have one, so nothing else grows a button.
              onDelete={
                loop
                  ? () =>
                      command(
                        isActiveLoop
                          ? { type: transport.exitLoop ? 'cancel' : 'exit' }
                          : transport.activeLoop
                            ? { type: 'queue', id: region.id }
                            : { type: 'enter', id: region.id },
                      )
                  : undefined
              }
              deleteIcon={
                loop ? (
                  <Tooltip title={loopLabel}>
                    {isActiveLoop ? <Logout aria-label={loopLabel} /> : <PlayArrow aria-label={loopLabel} />}
                  </Tooltip>
                ) : undefined
              }
              sx={chipSx(region, state)}
            />
          </Tooltip>
        );
      })}
    </Stack>
  );
};
