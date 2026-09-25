import { useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { resolveMediaUrl } from '@/utils/mediaUrl';
import type { BackgroundData, BackgroundFit } from '@/look/types';

const objectFit = (fit?: BackgroundFit) => (fit === 'contain' ? 'contain' : 'cover');

/**
 * A 16:9 picture of a background: colour, image and video stacked as the presentation draws
 * them. `null` draws "no background" (a struck-through black frame); a video plays on hover.
 */
export const BackgroundThumb = ({
  data,
  width = '100%',
  autoPlay = false,
}: {
  data?: BackgroundData | null;
  width?: number | string;
  /** Play a video right away instead of on hover (a hover preview is already hovered). */
  autoPlay?: boolean;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (hovered || autoPlay) video.play().catch(() => {});
    else {
      video.pause();
      video.currentTime = 0;
    }
  }, [hovered, autoPlay]);

  const image = data?.image?.path ? resolveMediaUrl(data.image.path) : undefined;
  const video = data?.video?.path ? resolveMediaUrl(data.video.path) : undefined;
  const transparent = data?.color === 'transparent';

  return (
    <Box
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      sx={{
        position: 'relative',
        width,
        aspectRatio: '16/9',
        overflow: 'hidden',
        borderRadius: 0.5,
        border: 1,
        borderColor: 'divider',
        bgcolor: data?.color && !transparent ? data.color : '#000',
        ...(transparent ? { backgroundImage: 'repeating-conic-gradient(#555 0% 25%, #333 0% 50%)', backgroundSize: '10px 10px' } : {}),
        ...(data === null
          ? {
              backgroundImage:
                'linear-gradient(to top right, transparent calc(50% - 1px), rgba(255,255,255,0.4) 50%, transparent calc(50% + 1px))',
            }
          : {}),
      }}
    >
      {image && (
        <Box
          component="img"
          src={image}
          alt=""
          sx={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: objectFit(data?.image?.fit),
            objectPosition: data?.image?.position || 'center',
            ...(data?.image?.blur ? { filter: `blur(${data.image.blur}px)` } : {}),
          }}
        />
      )}
      {video && (
        <Box
          component="video"
          ref={videoRef}
          src={video}
          muted
          loop
          playsInline
          preload="metadata"
          sx={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: objectFit(data?.video?.fit),
            objectPosition: data?.video?.position || 'center',
            ...(data?.video?.blur ? { filter: `blur(${data.video.blur}px)` } : {}),
          }}
        />
      )}
    </Box>
  );
};
