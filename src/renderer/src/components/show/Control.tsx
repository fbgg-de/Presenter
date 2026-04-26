import { useEffect, useMemo, useState } from 'react';
import { Stack, Typography } from '@mui/material';
import { useI18nContext } from '@/i18n/i18n-react';
import ControlSong from '@/components/show/ControlSong';
import ControlBibleVerse from '@/components/show/ControlBibleVerse';
import ControlMedia from '@/components/show/ControlMedia';
import { useGetStylesQuery } from '@/api/styles.api';
import { resolveStyleCascade, mergeStyles, DEFAULT_STYLE } from '@/utils/styleUtils';
import VideoControlBar from '@/components/media/VideoControlBar';
import { resolveMediaUrl } from '@/utils/mediaUrl';
import { getOpenWindows } from '@/utils/presentationBridge';
import { useGetSettings } from '@/store/settingsSlice';
import { useGetPresentationSettings } from '@/store/presentationSlice';
import { WindowConfig } from '@/store/windowSlice';
import { useGetShow } from '@/store/showSlice';

const Control = () => {
  const { LL } = useI18nContext();

  const { globalStyleId } = useGetSettings();
  const { activeItemIndex } = useGetPresentationSettings();
  const { currentShow } = useGetShow();

  const { data: allStyles } = useGetStylesQuery();

  // Get the active show item
  const activeItem = currentShow?.order?.[activeItemIndex];

  // Resolve style cascade to check for background video
  const backgroundVideoUrl = useMemo(() => {
    if (!allStyles) return undefined;
    const globalStyle = globalStyleId ? allStyles.find((s) => s.id === globalStyleId) : undefined;
    const showStyle = currentShow?.styleId ? allStyles.find((s) => s.id === currentShow.styleId) : undefined;
    const itemStyle = activeItem?.styleId ? allStyles.find((s) => s.id === activeItem.styleId) : undefined;
    const resolved = mergeStyles(DEFAULT_STYLE, resolveStyleCascade(globalStyle, showStyle, itemStyle, undefined, allStyles));
    return resolved.backgroundVideo ? resolveMediaUrl(resolved.backgroundVideo) : undefined;
  }, [allStyles, globalStyleId, currentShow?.styleId, activeItem?.styleId]);

  // Determine if current item is a video media item
  const mediaVideoUrl =
    activeItem?.type === 'media' && activeItem.mediaSubType === 'video' && activeItem.mediaPath
      ? resolveMediaUrl(activeItem.mediaPath)
      : undefined;

  // Collect all active video sources for the global control bar
  const videoSources = useMemo(() => {
    const sources: string[] = [];
    if (backgroundVideoUrl) sources.push(backgroundVideoUrl);
    if (mediaVideoUrl) sources.push(mediaVideoUrl);
    return sources;
  }, [backgroundVideoUrl, mediaVideoUrl]);

  const localHasVideos = videoSources.length > 0;

  // Track open presentation windows so we can render one compact control row
  // per window. Polled lazily — `getOpenWindows()` calls into the main process
  // (in Electron) so we throttle to once per second.
  const [openWindows, setOpenWindows] = useState<Array<{ id: string; config: WindowConfig }>>([]);
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      getOpenWindows()
        .then((list) => {
          if (cancelled) return;
          setOpenWindows(list.filter((w) => !w.closed).map(({ id, config }) => ({ id, config })));
        })
        .catch(() => {});
    };
    refresh();
    const t = setInterval(refresh, 1000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const perWindowRows = useMemo(() => openWindows.filter((w) => w.config.name), [openWindows]);

  // No show loaded or no items
  if (!currentShow || !currentShow.order || currentShow.order.length === 0) {
    return (
      <Stack sx={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Typography color="text.secondary">{LL.CONTROL.NO_ITEM()}</Typography>
      </Stack>
    );
  }

  // No active item selected
  if (!activeItem) {
    return (
      <Stack sx={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Typography color="text.secondary">{LL.CONTROL.NO_ITEM()}</Typography>
      </Stack>
    );
  }

  const renderControl = useMemo(() => {
    if (!activeItem) return null;
    switch (activeItem.type) {
      case 'song':
        return <ControlSong />;
      case 'bible_verse':
        return <ControlBibleVerse item={activeItem} />;
      case 'media':
        return <ControlMedia item={activeItem} />;
      default:
        return <ControlSong />;
    }
  }, [
    activeItemIndex,
    activeItem?.type,
    activeItem?.mediaSubType,
    activeItem?.mediaPath,
    activeItem?.styleId,
    // Media display props — must trigger re-render so the preview updates immediately
    activeItem?.mediaZoom,
    activeItem?.mediaBlur,
    activeItem?.mediaObjectFit,
    activeItem?.mediaObjectPosition,
    activeItem?.mediaAutoplay,
    activeItem?.mediaLoop,
    activeItem?.mediaColor,
  ]);

  return (
    <Stack sx={{ flexGrow: 1, overflow: 'hidden' }}>
      <Stack sx={{ flexGrow: 1, overflow: 'auto' }}>{renderControl}</Stack>
      {!mediaVideoUrl && <VideoControlBar variant="general" videoSources={videoSources} showIfNoLocalSources={!localHasVideos} />}
      {perWindowRows.map((w) => (
        <VideoControlBar
          key={w.id}
          variant="window"
          videoSources={[]}
          windowName={w.config.name}
          label={w.config.name}
          showIfNoLocalSources
          slim={!!mediaVideoUrl}
        />
      ))}
    </Stack>
  );
};

export default Control;
