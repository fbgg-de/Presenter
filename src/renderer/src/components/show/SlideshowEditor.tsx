/**
 * A slideshow version's images and how they change.
 *
 * - **SlideshowFilmstrip** — the images as a strip under the viewer, like an editing suite's
 *   thumbnail timeline: the one on screen is outlined red, a click jumps to it while the slideshow
 *   runs, dragging reorders, the last tile adds images from the media folder.
 * - **SlideshowSettings** — seconds per image, cut or fade, repeat, as inspector rows.
 */
import { useState } from 'react';
import { Box, ButtonBase, IconButton, Slider, Stack, Switch, Tooltip, Typography } from '@mui/material';
import { AddPhotoAlternateOutlined as AddIcon, Close as RemoveIcon } from '@mui/icons-material';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useI18nContext } from '@/i18n/i18n-react';
import { MediaBrowser } from '@/components/media/MediaBrowser';
import { InspectorRow, Segmented } from '@/components/media/Viewer';
import { PLAYHEAD } from '@/components/media/Transport';
import { resolveMediaUrl } from '@/utils/mediaUrl';
import { DEFAULT_SLIDE_SECONDS, type MediaVersion } from '@/media/mediaItem';
import type { MediaSource } from '@/media/types';
import { newId } from '@/utils/ids';

const THUMB_WIDTH = 112;

const SlideThumb = ({
  source,
  index,
  current,
  onJump,
  onRemove,
}: {
  source: MediaSource;
  index: number;
  current: boolean;
  onJump?: () => void;
  onRemove?: () => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: source.id });
  return (
    <Box
      ref={setNodeRef}
      title={source.name}
      sx={{
        position: 'relative',
        width: THUMB_WIDTH,
        flexShrink: 0,
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 1 : 0,
        '&:hover .thumb-remove': { opacity: 1 },
      }}
    >
      <Box
        {...attributes}
        {...listeners}
        onClick={onJump}
        sx={{
          position: 'relative',
          aspectRatio: '16/9',
          borderRadius: 0.75,
          overflow: 'hidden',
          outline: current ? 2 : 1,
          outlineColor: current ? PLAYHEAD : 'rgba(255,255,255,0.12)',
          outlineOffset: current ? 1 : 0,
          bgcolor: '#000',
          cursor: onJump ? 'pointer' : 'grab',
          touchAction: 'none',
        }}
      >
        <Box
          component="img"
          src={resolveMediaUrl(source.path)}
          alt=""
          draggable={false}
          sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
        <Typography
          component="span"
          sx={{
            position: 'absolute',
            left: 4,
            top: 3,
            px: 0.5,
            borderRadius: 0.5,
            fontSize: 10,
            fontWeight: 700,
            fontFamily: 'monospace',
            color: '#fff',
            bgcolor: current ? PLAYHEAD : 'rgba(0,0,0,0.65)',
          }}
        >
          {index + 1}
        </Typography>
      </Box>
      <Typography noWrap sx={{ fontSize: 10.5, color: 'rgba(233,236,239,0.6)', mt: 0.35 }}>
        {source.name}
      </Typography>
      {onRemove && (
        <IconButton
          className="thumb-remove"
          size="small"
          onClick={onRemove}
          sx={{
            position: 'absolute',
            right: 3,
            top: 3,
            p: 0.25,
            opacity: 0,
            transition: 'opacity 120ms',
            color: '#fff',
            bgcolor: 'rgba(0,0,0,0.65)',
            '&:hover': { bgcolor: 'rgba(0,0,0,0.85)' },
          }}
        >
          <RemoveIcon sx={{ fontSize: 13 }} />
        </IconButton>
      )}
    </Box>
  );
};

/** Screens show whichever image the clock is at; the assignments only need a valid source. */
const withSources = (version: MediaVersion, sources: MediaSource[]): MediaVersion => ({
  ...version,
  sources,
  // A screen switched off stays off — except in a slideshow that had no image yet, whose screens
  // could not point at one.
  assignments: version.assignments.map((a) => ({
    ...a,
    sourceId:
      a.sourceId === null && version.sources.length > 0
        ? null
        : sources.some((s) => s.id === a.sourceId)
          ? a.sourceId
          : (sources[0]?.id ?? null),
  })),
});

export const SlideshowFilmstrip = ({
  version,
  currentIndex,
  onChange,
  onJump,
}: {
  version: MediaVersion;
  /** The image on screen right now, if the slideshow runs. */
  currentIndex?: number;
  onChange: (version: MediaVersion) => void;
  /** Jump the running slideshow to an image; absent while it is not running. */
  onJump?: (index: number) => void;
}) => {
  const { LL } = useI18nContext();
  const S = LL.SLIDESHOW;
  const [browserOpen, setBrowserOpen] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = version.sources.findIndex((s) => s.id === active.id);
    const to = version.sources.findIndex((s) => s.id === over.id);
    if (from < 0 || to < 0) return;
    onChange(withSources(version, arrayMove(version.sources, from, to)));
  };

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={version.sources.map((s) => s.id)} strategy={horizontalListSortingStrategy}>
          <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', pb: 0.5, pt: 0.5, px: 0.5 }}>
            {version.sources.map((source, index) => (
              <SlideThumb
                key={source.id}
                source={source}
                index={index}
                current={index === currentIndex}
                onJump={onJump ? () => onJump(index) : undefined}
                onRemove={
                  version.sources.length > 1
                    ? () =>
                        onChange(
                          withSources(
                            version,
                            version.sources.filter((s) => s.id !== source.id),
                          ),
                        )
                    : undefined
                }
              />
            ))}
            <Tooltip title={S.ADD_IMAGES()}>
              <ButtonBase
                onClick={() => setBrowserOpen(true)}
                sx={{
                  width: THUMB_WIDTH,
                  flexShrink: 0,
                  aspectRatio: '16/9',
                  borderRadius: 0.75,
                  border: '1px dashed rgba(255,255,255,0.25)',
                  color: 'rgba(233,236,239,0.6)',
                  gap: 0.5,
                  flexDirection: 'column',
                  '&:hover': { borderColor: 'rgba(255,255,255,0.5)', color: '#fff' },
                }}
              >
                <AddIcon fontSize="small" />
                <Typography sx={{ fontSize: 10.5 }}>{S.ADD_IMAGES()}</Typography>
              </ButtonBase>
            </Tooltip>
          </Stack>
        </SortableContext>
      </DndContext>

      <MediaBrowser
        open={browserOpen}
        mode="pick"
        pickType="image"
        initialType="image"
        selectLabel={S.ADD_IMAGE()}
        onClose={() => setBrowserOpen(false)}
        onAdd={() => {}}
        onPick={(path) => {
          const name = (path.split(/[\\/]/).pop() ?? path).replace(/\.[^.]+$/, '');
          onChange(withSources(version, [...version.sources, { id: newId('s'), name, path, type: 'image', offset: 0 }]));
          setBrowserOpen(false);
        }}
      />
    </>
  );
};

export const SlideshowSettings = ({ version, onChange }: { version: MediaVersion; onChange: (version: MediaVersion) => void }) => {
  const { LL } = useI18nContext();
  const S = LL.SLIDESHOW;
  const T = LL.TRANSPORT;
  const [secondsDraft, setSecondsDraft] = useState<number | null>(null);
  const slideshow = version.slideshow ?? { seconds: DEFAULT_SLIDE_SECONDS, transition: 'fade' as const };
  const seconds = secondsDraft ?? slideshow.seconds;
  return (
    <>
      <InspectorRow label={T.SECONDS_PER_IMAGE()}>
        <Slider
          size="small"
          min={2}
          max={60}
          step={1}
          value={seconds}
          onChange={(_, v) => setSecondsDraft(v as number)}
          onChangeCommitted={(_, v) => {
            setSecondsDraft(null);
            onChange({ ...version, slideshow: { ...slideshow, seconds: v as number } });
          }}
          sx={{ flex: '1 1 160px', maxWidth: 280, mr: 1 }}
        />
        <Typography sx={{ fontSize: 12.5, fontFamily: 'monospace', minWidth: 36 }}>{seconds} s</Typography>
      </InspectorRow>
      <InspectorRow label={T.TRANSITION()}>
        <Segmented
          value={slideshow.transition}
          options={[
            { value: 'cut', label: S.CUT() },
            { value: 'fade', label: S.FADE() },
          ]}
          onChange={(transition) => onChange({ ...version, slideshow: { ...slideshow, transition } })}
        />
      </InspectorRow>
      <InspectorRow label={S.REPEAT()}>
        <Switch size="small" checked={!!version.loop} onChange={(e) => onChange({ ...version, loop: e.target.checked })} />
      </InspectorRow>
    </>
  );
};
