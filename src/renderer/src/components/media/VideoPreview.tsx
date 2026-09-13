import { useEffect, useRef, useState } from 'react';
import { Box, CardMedia } from '@mui/material';
import { Videocam } from '@mui/icons-material';

/** Keep the cached frame underneath the hover player until a decoded frame is available. */
export function VideoPreview({
  src,
  thumbnail,
  name,
  hovered,
}: {
  src: string;
  thumbnail?: string | null;
  name: string;
  hovered: boolean;
}) {
  return (
    // Fills whatever box the caller sizes, so grid tiles can keep a fixed aspect ratio.
    <Box sx={{ height: '100%', position: 'relative', bgcolor: '#111' }}>
      {thumbnail ? (
        <CardMedia component="img" image={thumbnail} alt={name} sx={{ height: '100%', objectFit: 'contain' }} />
      ) : (
        <Box sx={{ height: '100%', display: 'grid', placeItems: 'center' }}>
          <Videocam sx={{ fontSize: 36, color: 'text.secondary' }} />
        </Box>
      )}
      {hovered && <HoverPlayer key={src} src={src} />}
    </Box>
  );
}

function HoverPlayer({ src }: { src: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const element = video.current!;
    element.src = src;
    // A rejected autoplay request should simply leave the thumbnail visible.
    void element.play().catch(() => {});
    return () => {
      element.pause();
      element.removeAttribute('src');
      element.load();
    };
  }, [src]);
  return (
    <video
      ref={video}
      loop
      muted
      playsInline
      aria-hidden="true"
      onLoadedData={() => setReady(true)}
      onError={() => setReady(false)}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: ready ? 1 : 0 }}
    />
  );
}
