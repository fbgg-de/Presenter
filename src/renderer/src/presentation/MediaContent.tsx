import { CSSProperties } from 'react';
import { PresentationContent } from '@/presentation/types';

/**
 * Renders a media item (image, video, or solid color).
 */
export const MediaContent = ({ content }: { content: PresentationContent }) => {
  const objectFit: CSSProperties['objectFit'] = content.mediaObjectFit ?? 'cover';
  const objectPosition = content.mediaObjectPosition ?? 'center';
  const zoomTransform = content.mediaZoom && content.mediaZoom !== 100 ? `scale(${content.mediaZoom / 100})` : undefined;
  const filterStyle = content.mediaBlur ? `blur(${content.mediaBlur}px)` : undefined;

  switch (content.mediaSubType) {
    case 'color':
      return (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: content.mediaColor || '#000000',
          }}
        />
      );
    case 'video':
      return content.mediaPath ? (
        <video
          src={content.mediaPath}
          autoPlay={content.mediaAutoplay !== false}
          loop={content.mediaLoop !== false}
          muted
          playsInline
          data-role="media-item"
          // Apply layout/object-fit/position via a ref callback so they update
          // even when React reuses the same <video> element across renders.
          // Some browsers don't repaint after a style.objectPosition diff on a
          // currently-playing <video>, so we also poke `style.objectPosition`
          // imperatively here. transformOrigin tracks position for the zoom
          // anchor as well.
          ref={(el) => {
            if (!el) return;
            el.style.position = 'absolute';
            el.style.inset = '0';
            el.style.width = '100%';
            el.style.height = '100%';
            el.style.objectFit = objectFit ?? 'cover';
            el.style.objectPosition = objectPosition;
            el.style.transform = zoomTransform || '';
            el.style.transformOrigin = objectPosition;
            el.style.filter = filterStyle || '';
          }}
        />
      ) : null;
    case 'image':
    default:
      return content.mediaPath ? (
        <img
          src={content.mediaPath}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit,
            objectPosition,
            ...(zoomTransform ? { transform: zoomTransform, transformOrigin: objectPosition } : {}),
            ...(filterStyle ? { filter: filterStyle } : {}),
          }}
        />
      ) : null;
  }
};
