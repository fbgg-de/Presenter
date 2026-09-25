import { useMemo } from 'react';
import { Button, Stack, Typography, IconButton, Tooltip } from '@mui/material';
import {
  PlayArrow as GoLiveIcon,
  Lyrics as MusicNoteIcon,
  Image as ImageIcon,
  Videocam as VideocamIcon,
  MenuBook as MenuBookIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import ControlSong from '@/components/show/ControlSong';
import ControlBibleVerse from '@/components/show/ControlBibleVerse';
import ControlMedia from '@/components/show/ControlMedia';
import ControlAudio from '@/components/show/ControlAudio';
import { useGetSessionQuery } from '@/api/session.api';
import { setOpenItemIndex, useGetPresentationSettings, useOpenItem } from '@/store/presentationSlice';
import { useGetSongs } from '@/store/songsSlice';
import { useAppDispatch } from '@/store';
import { useSlideSelect } from '@/hooks/useSlideSelect';
import { useShortcut, withShortcut } from '@/hooks/useShortcut';
import { mediaItemLabel } from '@/media/mediaItem';
import { useEntryRunning } from '@/media/useMediaHost';
import type { ShowItem } from '@/api/shows.api';
import { useGetShow } from '@/store/showSlice';
import { DEFAULT_SONG_ITEM_COLOR, DEFAULT_MEDIA_ITEM_COLOR, DEFAULT_BIBLE_ITEM_COLOR } from '@/theme';

/**
 * Above an entry opened in the agenda that is not on screen: says so, names what is on screen,
 * and sends the opened entry live or goes back to the live one.
 */
const OpenedBar = ({
  liveItem,
  goLiveKey,
  onGoLive,
  onBack,
}: {
  liveItem: ShowItem | undefined;
  goLiveKey: string | undefined;
  onGoLive: () => void;
  onBack: () => void;
}) => {
  const { LL } = useI18nContext();
  const { songs } = useGetSongs();
  const liveName = !liveItem
    ? ''
    : liveItem.type === 'song'
      ? ((liveItem.songNumber != null ? songs[liveItem.songNumber]?.title : undefined) ?? '')
      : liveItem.type === 'bible_verse'
        ? liveItem.bibleRef || LL.BIBLE.VERSE()
        : mediaItemLabel(liveItem);
  return (
    <Stack
      direction="row"
      spacing={1}
      useFlexGap
      sx={{ alignItems: 'center', flexWrap: 'wrap', px: 1.5, py: 0.75, bgcolor: 'action.hover', borderBottom: 1, borderColor: 'divider' }}
    >
      <Tooltip title={LL.CONTROL.OPENED_HINT()}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {LL.CONTROL.OPENED()}
        </Typography>
      </Tooltip>
      {liveName && (
        <Typography variant="caption" noWrap sx={{ color: 'text.secondary', minWidth: 0, flex: '1 1 120px' }}>
          {LL.CONTROL.LIVE_NOW({ name: liveName })}
        </Typography>
      )}
      <Stack direction="row" spacing={1} sx={{ ml: 'auto' }}>
        <Button size="small" color="inherit" onClick={onBack} sx={{ textTransform: 'none' }}>
          {LL.CONTROL.BACK_TO_LIVE()}
        </Button>
        <Tooltip title={withShortcut(LL.CONTROL.GO_LIVE(), goLiveKey)}>
          <Button
            size="small"
            variant="contained"
            color="error"
            startIcon={<GoLiveIcon />}
            onClick={onGoLive}
            sx={{ textTransform: 'none' }}
          >
            {LL.CONTROL.GO_LIVE()}
          </Button>
        </Tooltip>
      </Stack>
    </Stack>
  );
};

const Control = ({
  onOpenSearch,
  onOpenMediaBrowser,
  onOpenBiblePicker,
}: {
  onOpenSearch?: () => void;
  onOpenMediaBrowser?: (subType?: 'image' | 'video') => void;
  onOpenBiblePicker?: () => void;
} = {}) => {
  const { LL } = useI18nContext();

  const { data: session } = useGetSessionQuery();
  const bibleEnabled = session?.settings?.bibleEnabled ?? false;

  const dispatch = useAppDispatch();
  // The entry opened in the agenda, else the live one.
  const { index: activeItemIndex, isLive } = useOpenItem();
  const { activeItemIndex: liveIndex } = useGetPresentationSettings('activeItemIndex');
  const { currentShow } = useGetShow();
  const { sendPreviewLive } = useSlideSelect();
  const goLiveKey = useShortcut('send_preview_live');

  const activeItem = currentShow?.order?.[activeItemIndex];
  // An image or video started from its card is on the screens without being the live entry.
  // Audio is heard here only, so it never waits to go "live" on the screens.
  const running = useEntryRunning(activeItem, activeItemIndex) || activeItem?.mediaSubType === 'audio';

  const renderControl = useMemo(() => {
    if (!activeItem) return null;
    switch (activeItem.type) {
      case 'bible_verse':
        return <ControlBibleVerse item={activeItem} index={activeItemIndex} isLive={isLive} />;
      case 'media':
        return activeItem.mediaSubType === 'audio' ? (
          <ControlAudio item={activeItem} index={activeItemIndex} />
        ) : (
          <ControlMedia item={activeItem} index={activeItemIndex} />
        );
      default:
        return <ControlSong index={activeItemIndex} isLive={isLive} />;
    }
  }, [
    activeItemIndex,
    isLive,
    activeItem?.type,
    activeItem?.mediaSubType,
    activeItem?.mediaPath,
    // Media display props — must trigger re-render so the preview updates immediately
    activeItem?.mediaZoom,
    activeItem?.mediaBlur,
    activeItem?.mediaObjectFit,
    activeItem?.mediaObjectPosition,
    activeItem?.mediaAutoplay,
    activeItem?.mediaLoop,
    activeItem?.mediaVolume,
    activeItem?.media,
    activeItem?.mediaColor,
    activeItem?.label,
  ]);

  // No show loaded or no items
  if (!currentShow || !currentShow.order || currentShow.order.length === 0) {
    return (
      <Stack sx={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 2, p: 3 }}>
        <Typography color="text.secondary">{LL.CONTROL.NO_ITEM()}</Typography>
        <Typography variant="body2" color="text.disabled" sx={{ textAlign: 'center', maxWidth: 320 }}>
          {LL.CONTROL.EMPTY_HINT()}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          <Tooltip title={LL.SONGS.SEARCH()}>
            <IconButton onClick={() => onOpenSearch?.()} sx={{ color: DEFAULT_SONG_ITEM_COLOR }}>
              <MusicNoteIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title={LL.MEDIA.IMAGE()}>
            <IconButton onClick={() => onOpenMediaBrowser?.('image')} sx={{ color: DEFAULT_MEDIA_ITEM_COLOR }}>
              <ImageIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title={LL.MEDIA.VIDEO()}>
            <IconButton onClick={() => onOpenMediaBrowser?.('video')} sx={{ color: DEFAULT_MEDIA_ITEM_COLOR }}>
              <VideocamIcon />
            </IconButton>
          </Tooltip>
          {bibleEnabled && (
            <Tooltip title={LL.BIBLE.VERSE()}>
              <IconButton onClick={() => onOpenBiblePicker?.()} sx={{ color: DEFAULT_BIBLE_ITEM_COLOR }}>
                <MenuBookIcon />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Stack>
    );
  }

  // No active item selected
  if (!activeItem) {
    return (
      <Stack sx={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Typography
          sx={{
            color: 'text.secondary',
          }}
        >
          {LL.CONTROL.NO_ITEM()}
        </Typography>
      </Stack>
    );
  }

  return (
    <Stack sx={{ flexGrow: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      {!isLive && !running && (
        <OpenedBar
          liveItem={currentShow.order[liveIndex]}
          goLiveKey={goLiveKey}
          onGoLive={() => sendPreviewLive()}
          onBack={() => dispatch(setOpenItemIndex(null))}
        />
      )}
      {renderControl}
    </Stack>
  );
};

export default Control;
