import { useMemo, useState } from 'react';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Checkbox,
  FormControlLabel,
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  Add,
  Delete,
  Edit,
  Movie,
  ContentCopy,
  LinkOff,
  Crop,
  ExpandMore,
  Tune,
  DesktopWindows,
  VolumeUp,
  VolumeOff,
  AddToPhotos,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/store';
import { saveMediaCue, updateShowItem, useGetShow } from '@/store/showSlice';
import { useGetPresentationSettings } from '@/store/presentationSlice';
import { selectCurrentSongOrder, useGetSongs } from '@/store/songsSlice';
import { upsertWindowConfig, useGetWindows } from '@/store/windowSlice';
import { MediaBrowser } from '@/components/media/MediaBrowser';
import { resolveMediaUrl } from '@/utils/mediaUrl';
import { defaultFrame, mediaId, type MediaCue, type MediaCueBinding, type MediaSource } from './types';
import { initialTransport, lyricOccurrences, validateCue } from './engine';
import { useCuePacket, sendCueCommand } from './runtime';
import { useMediaLabels } from './labels';
import { CueTimeline } from './CueTimeline';
import { FrameEditor } from './FrameEditor';
import { useCueOutputStatus } from './outputStatus';
import { SourceDuration } from './SourceDuration';
import { CueSource } from './CueMedia';

export default function MediaCuePanel() {
  const l = useMediaLabels(),
    dispatch = useAppDispatch(),
    { currentShow } = useGetShow(),
    { activeItemIndex } = useGetPresentationSettings(),
    { windowConfigs } = useGetWindows(),
    { songs } = useGetSongs();
  const item = currentShow?.order[activeItemIndex],
    cue = currentShow?.mediaCues?.find((c) => c.id === item?.mediaCue?.cueId),
    binding = item?.mediaCue;
  const song = item?.songNumber !== undefined ? songs[item.songNumber] : undefined;
  const orderName = useAppSelector((s) => (song ? selectCurrentSongOrder(s, song.songNumber) : 'Default'));
  const arrangement = useMemo(
    () =>
      lyricOccurrences(
        song
          ?.getBlocks(orderName)
          .filter((b) => !b.copyright)
          .map((b) => ({ name: b.name, lines: b.lines })) ?? [],
      ),
    [song, orderName],
  );
  const packet = useCuePacket();
  const outputStatuses = useCueOutputStatus(packet?.transport.session);
  const [autoDurationSource, setAutoDurationSource] = useState<string>();
  const [roles, setRoles] = useState<Record<string, string>>({});
  const beginSetup = (value: MediaCue) => {
    setRoles(Object.fromEntries(windowConfigs.map((w) => [w.id, w.mediaRole ?? ''])));
    setError(false);
    setAutoDurationSource(undefined);
    setSetup(value);
  };
  const [setup, setSetup] = useState<MediaCue>(),
    [picking, setPicking] = useState(false),
    [frameIndex, setFrameIndex] = useState<number>();
  const [error, setError] = useState(false),
    [status, setStatus] = useState('ready'),
    [retry, setRetry] = useState(0);
  const activePacket = packet?.cue.id === cue?.id ? packet : undefined;
  const save = (value: MediaCue, map: MediaCueBinding) => {
    if (validateCue(value)) {
      setError(true);
      return;
    }
    setError(false);
    dispatch(saveMediaCue({ cue: value, itemIndex: activeItemIndex, binding: map }));
  };
  const newBinding = (id: string): MediaCueBinding => ({
    cueId: id,
    lyrics: {},
    arrangement: arrangement.signature,
    followVideo: true,
    followLyrics: true,
  });
  const create = () => {
    const id = mediaId(),
      sourceId = mediaId();
    beginSetup({
      id,
      name: item?.label || song?.title || l('cue'),
      duration: 120,
      regions: [],
      sources:
        item?.mediaPath && item.mediaSubType !== 'color'
          ? [
              {
                id: sourceId,
                name: item.label || item.mediaPath.split('/').pop() || l('source'),
                path: item.mediaPath,
                type: item.mediaSubType === 'video' ? 'video' : 'image',
                offset: 0,
              },
            ]
          : [],
      assignments: [],
      waveformSourceId: item?.mediaSubType === 'video' ? sourceId : undefined,
      audioSourceId: item?.mediaSubType === 'video' ? sourceId : undefined,
    });
    if (item?.mediaSubType === 'video' && item.mediaPath) setAutoDurationSource(sourceId);
    if (!item?.mediaPath || item.mediaSubType === 'color') setPicking(true);
  };
  const previewSource = cue?.sources.find((s) => s.id === cue.waveformSourceId) ?? cue?.sources[0];
  const selectedAssignment = setup?.assignments[frameIndex ?? -1],
    frameSource = setup?.sources.find((s) => s.id === selectedAssignment?.sourceId);
  const setupPacket = setup ? { cue: setup, transport: activePacket?.transport ?? initialTransport('preview'), at: Date.now() } : undefined;
  if (!item) return null;
  if (cue?.regions.some((s) => !['section', 'pause'].includes(s.kind)))
    return (
      <Alert
        severity="info"
        action={
          <Button onClick={() => dispatch(updateShowItem({ index: activeItemIndex, item: { mediaCue: undefined } }))}>{l('detach')}</Button>
        }
      >
        {l('recreateSections')}
      </Alert>
    );
  return (
    <Box
      sx={{
        m: 1,
        border: 1,
        borderColor: 'divider',
        borderRadius: 2,
        overflow: 'hidden',
        flexShrink: 0,
        bgcolor: (theme) => (theme.palette.mode === 'dark' ? '#1b1e23' : theme.palette.background.paper),
        '& .MuiButton-root': { textTransform: 'none' },
      }}
    >
      <Stack
        direction="row"
        sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 0.5, px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider' }}
      >
        <Movie />
        <Typography sx={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{cue?.name ?? l('cue')}</Typography>
        <Button startIcon={cue ? <Edit /> : <Add />} onClick={() => (cue ? beginSetup(structuredClone(cue)) : create())}>
          {l(cue ? 'edit' : 'create')}
        </Button>
        {cue && (
          <>
            <IconButton
              aria-label={l('duplicate')}
              onClick={() => {
                const copy = { ...structuredClone(cue), id: mediaId(), name: `${cue.name} (2)` };
                save(copy, { ...binding!, cueId: copy.id });
              }}
            >
              <ContentCopy />
            </IconButton>
            <IconButton
              aria-label={l('detach')}
              onClick={() => dispatch(updateShowItem({ index: activeItemIndex, item: { mediaCue: undefined } }))}
            >
              <LinkOff />
            </IconButton>
          </>
        )}
      </Stack>
      {!cue && !!currentShow?.mediaCues?.length && (
        <TextField
          sx={{ mx: 2, mb: 2 }}
          select
          label={l('attach')}
          value=""
          onChange={(e) => dispatch(updateShowItem({ index: activeItemIndex, item: { mediaCue: newBinding(e.target.value) } }))}
        >
          {currentShow.mediaCues
            .filter((c) => !validateCue(c))
            .map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
        </TextField>
      )}
      {error && <Alert severity="error">{l('invalid')}</Alert>}
      {cue && binding && (
        <>
          {currentShow!.order.filter((i) => i.mediaCue?.cueId === cue.id).length > 1 && <Alert severity="info">{l('shared')}</Alert>}
          {song && binding.arrangement !== arrangement.signature && (
            <Alert
              severity="warning"
              action={<Button onClick={() => save(cue, { ...binding, arrangement: arrangement.signature })}>{l('confirmMapping')}</Button>}
            >
              {l('mismatch')}
            </Alert>
          )}
          {!cue.assignments.length && (
            <Alert severity="info">
              {l('unassigned')} · {l('screens')}
            </Alert>
          )}
          {cue.assignments.some((a) => !windowConfigs.some((w) => w.mediaRole === a.role)) && (
            <Alert severity="warning">
              {l('unassigned')}:{' '}
              {cue.assignments
                .filter((a) => !windowConfigs.some((w) => w.mediaRole === a.role))
                .map((a) => a.role)
                .join(', ')}
            </Alert>
          )}
          {previewSource && activePacket && (
            <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5, p: 1.5 }}>
              <Box
                sx={{
                  position: 'relative',
                  aspectRatio: '16 / 9',
                  width: 176,
                  maxWidth: '45%',
                  borderRadius: 1,
                  overflow: 'hidden',
                  bgcolor: '#000',
                }}
              >
                <CueSource
                  key={`${previewSource.id}/${retry}`}
                  packet={activePacket}
                  source={{ ...previewSource, path: resolveMediaUrl(previewSource.path) || previewSource.path }}
                  frame={defaultFrame()}
                  audible={false}
                  onStatus={setStatus}
                />
              </Box>
              <Stack>
                <Typography variant="caption">{previewSource.name}</Typography>
                <Typography variant="caption">{l(status as 'ready' | 'error' | 'buffering' | 'playback')}</Typography>
                <Button
                  size="small"
                  startIcon={cue.audioEnabled === false ? <VolumeOff /> : <VolumeUp />}
                  color={cue.audioEnabled !== false ? 'warning' : 'inherit'}
                  onClick={() => save({ ...cue, audioEnabled: cue.audioEnabled === false }, binding)}
                  aria-pressed={cue.audioEnabled !== false}
                >
                  {l(cue.audioEnabled === false ? 'unmuteMain' : 'muteMain')}
                </Button>
                {(status === 'error' || status === 'playback') && (
                  <Button
                    onClick={() => {
                      setRetry((v) => v + 1);
                      sendCueCommand({ type: 'play' });
                    }}
                  >
                    {l('retry')}
                  </Button>
                )}
              </Stack>
            </Stack>
          )}
          {cue.assignments.map((a) => {
            const w = windowConfigs.find((w) => w.mediaRole === a.role);
            const report = outputStatuses[a.role];
            const states = report && Date.now() - report.received < 3000 ? Object.values(report.sources) : [];
            const issue = states.find((s) => s !== 'ready');
            return (
              <Typography key={a.role} variant="caption" sx={{ display: 'block', px: 2 }} color={issue ? 'warning.main' : 'text.secondary'}>
                {w?.name || a.role} ·{' '}
                {l(
                  !w?._runtimeId
                    ? 'outputClosed'
                    : !report || Date.now() - report.received >= 3000
                      ? 'awaitingOutput'
                      : ((issue as 'buffering' | 'error' | 'playback') ?? 'ready'),
                )}
              </Typography>
            );
          })}
          <CueTimeline key={cue.id} cue={cue} binding={binding} packet={activePacket} occurrences={arrangement.blocks} onChange={save} />
        </>
      )}
      <Dialog
        open={!!setup && !picking}
        onClose={() => setSetup(undefined)}
        fullWidth
        maxWidth="md"
        slotProps={{
          paper: {
            sx: { borderRadius: 2, bgcolor: (theme) => (theme.palette.mode === 'dark' ? '#1b1e23' : theme.palette.background.paper) },
          },
        }}
      >
        <DialogTitle>{l('edit')}</DialogTitle>
        <DialogContent>
          {setup && (
            <Stack spacing={2} sx={{ pt: 1, '& .MuiButton-root': { textTransform: 'none' } }}>
              <Typography variant="body2" color="text.secondary">
                {l('setupHint')}
              </Typography>
              {setup.sources.map((source) => (
                <Stack
                  key={source.id}
                  direction="row"
                  sx={{ alignItems: 'center', gap: 1, p: 1.5, border: 1, borderColor: 'divider', borderRadius: 2 }}
                >
                  <Movie color="action" />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography noWrap title={source.path} sx={{ fontWeight: 600, fontSize: 14 }}>
                      {source.name}
                    </Typography>
                    <SourceDuration
                      key={source.path}
                      source={source}
                      onUnavailable={() => setAutoDurationSource(undefined)}
                      autoUse={autoDurationSource === source.id}
                      onUse={(duration) => {
                        setSetup((current) =>
                          current && current.sources.some((s) => s.id === source.id && s.path === source.path)
                            ? { ...current, duration }
                            : current,
                        );
                        setAutoDurationSource(undefined);
                      }}
                    />
                  </Box>
                </Stack>
              ))}
              <Button startIcon={<AddToPhotos />} onClick={() => setPicking(true)} sx={{ alignSelf: 'flex-start' }}>
                {l('addSource')}
              </Button>
              <Typography variant="subtitle2">{l('chooseScreens')}</Typography>
              {!windowConfigs.length && <Alert severity="info">{l('noScreens')}</Alert>}
              {windowConfigs.map((w) => {
                const role = roles[w.id] || w.mediaRole || 'screen-' + w.id;
                const index = setup.assignments.findIndex((a) => a.role === role);
                const assignment = setup.assignments[index];
                return (
                  <Stack
                    key={w.id}
                    direction="row"
                    sx={{
                      gap: 1,
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      border: 1,
                      borderColor: assignment ? 'warning.main' : 'divider',
                      borderRadius: 2,
                      p: 1,
                    }}
                  >
                    <FormControlLabel
                      sx={{ flex: 1, m: 0 }}
                      control={
                        <Checkbox
                          checked={!!assignment}
                          slotProps={{ input: { 'aria-label': w.name || w.id } }}
                          onChange={(_, checked) => {
                            setRoles((previous) => ({ ...previous, [w.id]: role }));
                            setSetup(
                              (current) =>
                                current && {
                                  ...current,
                                  assignments: checked
                                    ? [...current.assignments, { role, sourceId: current.sources[0]?.id ?? null, frame: defaultFrame() }]
                                    : current.assignments.filter((a) => a.role !== role),
                                },
                            );
                          }}
                        />
                      }
                      label={
                        <Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}>
                          <DesktopWindows fontSize="small" color="action" />
                          <Typography sx={{ fontSize: 14 }}>{w.name || w.id}</Typography>
                        </Stack>
                      }
                    />
                    {assignment && setup.sources.length > 1 && (
                      <TextField
                        select
                        size="small"
                        label={l('source')}
                        sx={{ minWidth: 140, maxWidth: 240 }}
                        value={assignment.sourceId ?? ''}
                        onChange={(e) =>
                          setSetup({
                            ...setup,
                            assignments: setup.assignments.map((a, i) => (i === index ? { ...a, sourceId: e.target.value || null } : a)),
                          })
                        }
                      >
                        <MenuItem value="">{l('noMedia')}</MenuItem>
                        {setup.sources.map((source) => (
                          <MenuItem key={source.id} value={source.id}>
                            {source.name}
                          </MenuItem>
                        ))}
                      </TextField>
                    )}
                    <Button size="small" startIcon={<Crop />} disabled={!assignment?.sourceId} onClick={() => setFrameIndex(index)}>
                      {l('framing')}
                    </Button>
                  </Stack>
                );
              })}
              <FormControlLabel
                control={
                  <Checkbox
                    checked={setup.audioEnabled !== false && !!setup.audioSourceId}
                    disabled={!setup.sources.some((s) => s.type === 'video')}
                    onChange={(_, audioEnabled) =>
                      setSetup(
                        (current) =>
                          current && {
                            ...current,
                            audioEnabled,
                            audioSourceId: current.audioSourceId ?? current.sources.find((s) => s.type === 'video')?.id,
                          },
                      )
                    }
                  />
                }
                label={l('mainAudio')}
              />
              <Accordion
                disableGutters
                elevation={0}
                sx={{ border: 1, borderColor: 'divider', borderRadius: 1, '&:before': { display: 'none' } }}
              >
                <AccordionSummary expandIcon={<ExpandMore />}>
                  <Tune sx={{ mr: 1 }} />
                  <Typography variant="body2">{l('advancedMedia')}</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack spacing={2}>
                    <Stack direction="row" sx={{ gap: 1 }}>
                      <TextField
                        label={l('name')}
                        value={setup.name}
                        onChange={(e) => setSetup({ ...setup, name: e.target.value })}
                        fullWidth
                      />
                      <TextField
                        type="number"
                        label={l('duration')}
                        value={setup.duration}
                        onChange={(e) => setSetup({ ...setup, duration: Number(e.target.value) })}
                        slotProps={{ htmlInput: { min: 0.001, step: 0.001 } }}
                      />
                    </Stack>
                    <Typography variant="subtitle2">{l('sources')}</Typography>
                    {setup.sources.map((source, index) => (
                      <Stack key={source.id} sx={{ gap: 1, border: 1, borderColor: 'divider', p: 1, borderRadius: 1 }}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1 }}>
                          <TextField
                            label={l('name')}
                            value={source.name}
                            onChange={(e) =>
                              setSetup({
                                ...setup,
                                sources: setup.sources.map((s) => (s.id === source.id ? { ...s, name: e.target.value } : s)),
                              })
                            }
                          />
                          <TextField
                            label="URL"
                            value={source.path}
                            fullWidth
                            onChange={(e) =>
                              setSetup({
                                ...setup,
                                sources: setup.sources.map((s) => (s.id === source.id ? { ...s, path: e.target.value } : s)),
                              })
                            }
                          />
                          <TextField
                            select
                            label={l('source')}
                            value={source.type}
                            onChange={(e) =>
                              setSetup({
                                ...setup,
                                sources: setup.sources.map((s) =>
                                  s.id === source.id ? { ...s, type: e.target.value as MediaSource['type'] } : s,
                                ),
                                audioSourceId:
                                  e.target.value === 'image' && setup.audioSourceId === source.id ? undefined : setup.audioSourceId,
                                waveformSourceId:
                                  e.target.value === 'image' && setup.waveformSourceId === source.id ? undefined : setup.waveformSourceId,
                              })
                            }
                          >
                            <MenuItem value="video">Video</MenuItem>
                            <MenuItem value="image">{l('image')}</MenuItem>
                          </TextField>
                        </Stack>
                        <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
                          <TextField
                            type="number"
                            size="small"
                            label={l('offset')}
                            value={source.offset}
                            slotProps={{ htmlInput: { step: 0.001 } }}
                            onChange={(e) =>
                              setSetup({
                                ...setup,
                                sources: setup.sources.map((s) => (s.id === source.id ? { ...s, offset: Number(e.target.value) } : s)),
                              })
                            }
                          />
                          <IconButton
                            aria-label={l('remove')}
                            onClick={() =>
                              setSetup({
                                ...setup,
                                sources: setup.sources.filter((_, i) => i !== index),
                                assignments: setup.assignments.map((a) => (a.sourceId === source.id ? { ...a, sourceId: null } : a)),
                                audioSourceId: setup.audioSourceId === source.id ? undefined : setup.audioSourceId,
                                waveformSourceId: setup.waveformSourceId === source.id ? undefined : setup.waveformSourceId,
                              })
                            }
                          >
                            <Delete />
                          </IconButton>
                        </Stack>
                      </Stack>
                    ))}
                    <Button startIcon={<Add />} onClick={() => setPicking(true)}>
                      {l('addSource')}
                    </Button>
                    <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1 }}>
                      {(['waveformSourceId', 'audioSourceId'] as const).map((key) => (
                        <TextField
                          key={key}
                          select
                          fullWidth
                          label={l(key === 'audioSourceId' ? 'audio' : 'waveform')}
                          value={setup[key] ?? ''}
                          onChange={(e) => setSetup({ ...setup, [key]: e.target.value || undefined })}
                        >
                          <MenuItem value="">{l('silent')}</MenuItem>
                          {setup.sources
                            .filter((s) => s.type === 'video')
                            .map((s) => (
                              <MenuItem key={s.id} value={s.id}>
                                {s.name}
                              </MenuItem>
                            ))}
                        </TextField>
                      ))}
                    </Stack>
                    <Typography variant="subtitle2">{l('screens')}</Typography>
                    {setup.assignments.map((a, index) => (
                      <Stack direction={{ xs: 'column', sm: 'row' }} key={index} sx={{ gap: 1 }}>
                        <TextField
                          size="small"
                          label={l('role')}
                          value={a.role}
                          onChange={(e) => {
                            setRoles((previous) =>
                              Object.fromEntries(
                                Object.entries(previous).map(([id, role]) => [id, role === a.role ? e.target.value : role]),
                              ),
                            );
                            setSetup({
                              ...setup,
                              assignments: setup.assignments.map((x, i) => (i === index ? { ...x, role: e.target.value } : x)),
                            });
                          }}
                        />
                        <TextField
                          select
                          size="small"
                          label={l('source')}
                          value={a.sourceId ?? ''}
                          sx={{ minWidth: 150 }}
                          onChange={(e) =>
                            setSetup({
                              ...setup,
                              assignments: setup.assignments.map((x, i) => (i === index ? { ...x, sourceId: e.target.value || null } : x)),
                            })
                          }
                        >
                          <MenuItem value="">{l('noMedia')}</MenuItem>
                          {setup.sources.map((s) => (
                            <MenuItem key={s.id} value={s.id}>
                              {s.name}
                            </MenuItem>
                          ))}
                        </TextField>
                        <TextField
                          select
                          size="small"
                          label={l('screens')}
                          sx={{ minWidth: 150 }}
                          value={windowConfigs.find((w) => roles[w.id] === a.role)?.id ?? ''}
                          onChange={(e) =>
                            setRoles((previous) =>
                              Object.fromEntries(
                                windowConfigs.map((w) => [
                                  w.id,
                                  w.id === e.target.value ? a.role : previous[w.id] === a.role ? '' : previous[w.id],
                                ]),
                              ),
                            )
                          }
                        >
                          <MenuItem value="">{l('unassigned')}</MenuItem>
                          {windowConfigs.map((w) => (
                            <MenuItem key={w.id} value={w.id}>
                              {w.name || w.id}
                            </MenuItem>
                          ))}
                        </TextField>
                        <Button startIcon={<Crop />} disabled={!a.sourceId} onClick={() => setFrameIndex(index)}>
                          {l('framing')}
                        </Button>
                        <IconButton
                          aria-label={l('remove')}
                          onClick={() =>
                            setSetup({
                              ...setup,
                              assignments: setup.assignments.filter((_, i) => i !== index),
                            })
                          }
                        >
                          <Delete />
                        </IconButton>
                      </Stack>
                    ))}
                    <Button
                      startIcon={<Add />}
                      onClick={() =>
                        setSetup({
                          ...setup,
                          assignments: [
                            ...setup.assignments,
                            {
                              role: `${l('role')} ${setup.assignments.length + 1}`,
                              sourceId: setup.sources[0]?.id ?? null,
                              frame: defaultFrame(),
                            },
                          ],
                        })
                      }
                    >
                      {l('addScreen')}
                    </Button>
                  </Stack>
                </AccordionDetails>
              </Accordion>
              {error && <Alert severity="error">{l('invalid')}</Alert>}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setSetup(undefined);
              setError(false);
            }}
          >
            {l('cancel')}
          </Button>
          <Button
            disabled={!!autoDurationSource}
            variant="contained"
            color="warning"
            onClick={() => {
              if (!setup || validateCue(setup)) {
                setError(true);
                return;
              }
              for (const w of windowConfigs) {
                const role = roles[w.id] || undefined;
                if (role !== w.mediaRole) dispatch(upsertWindowConfig({ id: w.id, mediaRole: role }));
              }
              save(setup, binding?.cueId === setup.id ? binding : newBinding(setup.id));
              setSetup(undefined);
            }}
          >
            {l('save')}
          </Button>
        </DialogActions>
      </Dialog>
      <MediaBrowser
        open={picking}
        mode="pick"
        initialType="video"
        selectLabel={l('useFile')}
        onClose={() => setPicking(false)}
        onAdd={(type, path, _, name) => {
          if (!path || type === 'color' || !setup) return;
          const source: MediaSource = { id: mediaId(), type, path, name: name || path.split('/').pop() || l('source'), offset: 0 };
          if (!setup.sources.length && type === 'video') setAutoDurationSource(source.id);
          setSetup({
            ...setup,
            name: setup.name === l('cue') ? source.name.replace(/\.[^.]+$/, '') : setup.name,
            audioSourceId: setup.audioSourceId ?? (type === 'video' ? source.id : undefined),
            sources: [...setup.sources, source],
            waveformSourceId: setup.waveformSourceId ?? (type === 'video' ? source.id : undefined),
          });
          setPicking(false);
        }}
      />
      {frameSource && selectedAssignment && setup && setupPacket && (
        <FrameEditor
          key={`${setup.id}/${frameIndex}`}
          source={frameSource}
          aspectRatio={(() => {
            const w = windowConfigs.find((w) => roles[w.id] === selectedAssignment.role);
            return w?.width && w?.height ? w.width / w.height : 16 / 9;
          })()}
          packet={setupPacket}
          value={selectedAssignment.frame}
          onClose={() => setFrameIndex(undefined)}
          onApply={(frame) => {
            setSetup({ ...setup, assignments: setup.assignments.map((a, i) => (i === frameIndex ? { ...a, frame } : a)) });
            setFrameIndex(undefined);
          }}
        />
      )}
    </Box>
  );
}
