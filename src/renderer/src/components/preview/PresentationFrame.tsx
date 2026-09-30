/**
 * The real presentation page, drawn small.
 *
 * Themes size text in viewport units and the renderer fills `100vw × 100vh`, so a preview that
 * re-implemented the drawing would never quite match. Instead the actual `presentation.html` runs
 * in an iframe at the output's full resolution, scaled down to the box — exactly what a window of
 * that size shows. `?preview=1` keeps it silent and stops it from announcing itself as an output.
 *
 * Stage overlays (messages, timers, the clock) travel apart from the slide, as they do to the
 * windows; given `overlayGroupId`, the frame gets what a window of that group gets.
 */
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Box } from '@mui/material';
import type { PresentationContent } from '@/presentation/types';
import type { RigWindow } from '@/hooks/usePresentationWindows';
import { getBroadcastStage, stagePayloadForGroup, subscribeStage } from '@/utils/presentationBridge';

export const PREVIEW_PAGE_URL = './presentation.html?preview=1';

/** The size a group's windows draw at on this computer, so a picture of them keeps their proportions. */
export const outputSize = (windows: RigWindow[], groupId: number | undefined): { width: number; height: number } => {
  const win = windows.find((w) => w.config.screenGroupId === groupId && (w.bounds || (w.config.width && w.config.height)));
  const width = win?.bounds?.width ?? win?.config.width;
  const height = win?.bounds?.height ?? win?.config.height;
  return width && height ? { width, height } : { width: 1920, height: 1080 };
};

export const PresentationFrame = memo(function PresentationFrame({
  content,
  width = 1920,
  height = 1080,
  title,
  overlayGroupId,
}: {
  content: PresentationContent | undefined;
  /** The screen group whose stage overlays the picture shows, as its windows do; none when omitted. */
  overlayGroupId?: number;
  /** The output's resolution; text and layout are drawn at this size, then scaled. */
  width?: number;
  height?: number;
  title: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [boxWidth, setBoxWidth] = useState(0);
  // Counts page loads, so content is sent again whenever the page (re)loads.
  const [loads, setLoads] = useState(0);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => setBoxWidth(entry.contentRect.width));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (loads === 0 || !content) return;
    frameRef.current?.contentWindow?.postMessage({ type: 'UPDATE_PRESENTATION', props: { content } }, '*');
  }, [loads, content]);

  const stage = useSyncExternalStore(subscribeStage, getBroadcastStage);
  const overlay = useMemo(
    () => (overlayGroupId === undefined ? undefined : stagePayloadForGroup(stage, overlayGroupId)),
    [stage, overlayGroupId],
  );
  useEffect(() => {
    if (loads === 0 || !overlay) return;
    frameRef.current?.contentWindow?.postMessage({ type: 'UPDATE_STAGE', payload: overlay }, '*');
  }, [loads, overlay]);

  const scale = boxWidth > 0 ? boxWidth / width : 0;

  return (
    <Box
      ref={boxRef}
      sx={{
        position: 'relative',
        width: '100%',
        maxWidth: '100%',
        aspectRatio: `${width} / ${height}`,
        overflow: 'hidden',
        bgcolor: '#000',
      }}
    >
      <iframe
        ref={frameRef}
        src={PREVIEW_PAGE_URL}
        title={title}
        tabIndex={-1}
        onLoad={() => setLoads((count) => count + 1)}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width,
          height,
          border: 0,
          transform: `scale(${scale})`,
          transformOrigin: '0 0',
          pointerEvents: 'none',
          visibility: scale > 0 ? 'visible' : 'hidden',
        }}
      />
    </Box>
  );
});
