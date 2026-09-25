import { useEffect, useRef, useState } from 'react';
import type { CuePacket, MediaFrame, MediaSource } from './types';
import { advanceCue, clamp, followClock, rateOf } from './engine';
import { frameGeometry } from './framing';
import { slideAt } from './mediaItem';

/** How far a paused element may be from the clock before it is moved there prior to playing. */
const SYNC_START_TOLERANCE = 0.05;

type Props = {
  packet: CuePacket;
  source: MediaSource;
  frame: MediaFrame;
  audible?: boolean;
  audioOnly?: boolean;
  /** 0–1 while audible. */
  volume?: number;
  /** Fading out: the volume reaches 0 at this time (Date.now()), over `fadeMs`. */
  fadeEndsAt?: number;
  fadeMs?: number;
  onStatus?: (status: string) => void;
};
export function CueSource({
  packet,
  source,
  frame,
  audible = false,
  audioOnly = false,
  volume = 1,
  fadeEndsAt,
  fadeMs = 0,
  onStatus,
}: Props) {
  const host = useRef<HTMLDivElement>(null),
    video = useRef<HTMLMediaElement | null>(null);
  const MediaElement = audioOnly ? 'audio' : 'video';
  const latest = useRef({ packet, source, audible, onStatus, volume, fadeEndsAt, fadeMs });
  latest.current = { packet, source, audible, onStatus, volume, fadeEndsAt, fadeMs };
  const [size, setSize] = useState({ w: 1920, h: 1080, sw: 1920, sh: 1080 });
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([entry]) => setSize((s) => ({ ...s, w: entry.contentRect.width, h: entry.contentRect.height })));
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    let pending = false,
      failedPlay = false,
      revision = -1,
      // How long this element's seeks take, learnt from each one — a playing seek aims that far ahead.
      seekLead = 0.15,
      seekStarted = 0;
    const onSeeked = () => {
      if (!seekStarted) return;
      const took = (performance.now() - seekStarted) / 1000;
      seekStarted = 0;
      seekLead = clamp(seekLead * 0.5 + took * 0.5, 0.02, 0.6);
    };
    v.addEventListener('seeked', onSeeked);
    const update = () => {
      const { packet: p, source: s, audible: audio, onStatus: report, volume: level, fadeEndsAt: fadeEnd, fadeMs: fade } = latest.current;
      if (revision !== p.transport.revision) {
        failedPlay = false;
        revision = p.transport.revision;
        if (v.error && p.transport.playing) v.load();
      }
      const t = advanceCue(p.cue, p.transport, Math.max(0, (Date.now() - p.at) / 1000));
      const sourceTime = t.time + s.offset;
      const duration = Number.isFinite(v.duration) ? v.duration : 0;
      v.style.visibility = sourceTime < 0 ? 'hidden' : 'visible';
      v.muted = !audio;
      if (audio) {
        const fading = fadeEnd !== undefined ? clamp(fade > 0 ? (fadeEnd - Date.now()) / fade : 0, 0, 1) : 1;
        v.volume = clamp(level * fading, 0, 1);
      }
      v.loop = false;
      if (!duration) return;
      const target = clamp(sourceTime, 0, Math.max(0, duration - 0.001));
      const play = t.playing && sourceTime >= 0 && sourceTime < duration;
      if (!play) {
        // Held or paused: sit exactly on the frame.
        if (!v.seeking && Math.abs(v.currentTime - target) > 0.002) v.currentTime = target;
        if (!v.paused) v.pause();
        return;
      }
      // Playing: follow the clock at its speed, nudging the rate for small drift (see followClock).
      if (!v.seeking && !v.paused) {
        const follow = followClock(target, v.currentTime, rateOf(t), seekLead);
        if (follow.seek !== undefined) {
          seekStarted = performance.now();
          v.currentTime = clamp(follow.seek, 0, Math.max(0, duration - 0.001));
        }
        // Only touch the element when it matters — every write can make the decoder resync.
        if (Math.abs(v.playbackRate - follow.playbackRate) > 0.002) v.playbackRate = follow.playbackRate;
      } else if (v.paused && !v.seeking) {
        // About to start: begin from the right frame and at the right speed, rather than catching up visibly.
        if (Math.abs(v.currentTime - target) > SYNC_START_TOLERANCE) v.currentTime = target;
        if (Math.abs(v.playbackRate - rateOf(t)) > 0.002) v.playbackRate = rateOf(t);
      }
      if (v.paused && !pending && !failedPlay) {
        pending = true;
        v.play()
          .catch((error) => {
            // Seeking or an intentional pause may abort an in-flight play request.
            if (error?.name === 'AbortError' || !latest.current.packet.transport.playing) return;
            failedPlay = true;
            report?.(error?.name === 'NotAllowedError' ? 'playback' : 'error');
          })
          .finally(() => {
            pending = false;
          });
      }
    };
    const ready = () => {
      if (v instanceof HTMLVideoElement) setSize((s) => ({ ...s, sw: v.videoWidth || 1920, sh: v.videoHeight || 1080 }));
      latest.current.onStatus?.(v.readyState >= 3 ? 'ready' : 'buffering');
      update();
    };
    v.addEventListener('loadedmetadata', ready);
    v.addEventListener('canplay', update);
    const timer = setInterval(update, 16);
    update();
    return () => {
      clearInterval(timer);
      v.removeEventListener('loadedmetadata', ready);
      v.removeEventListener('canplay', update);
      v.removeEventListener('seeked', onSeeked);
      v.pause();
    };
  }, [source.path, source.type]);
  const geometry = frameGeometry(frame, size.w, size.h, size.sw, size.sh);
  const style = { position: 'absolute' as const, maxWidth: 'none', ...geometry.source };
  return (
    <div ref={host} data-cue-session={packet.transport.session} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', ...geometry.placement, overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            ...geometry.crop,
            overflow: 'hidden',
            filter: geometry.blur ? `blur(${geometry.blur}px)` : undefined,
          }}
        >
          {source.type === 'video' ? (
            <MediaElement
              ref={(element) => {
                video.current = element;
              }}
              src={source.path}
              muted={!audible}
              playsInline
              preload="auto"
              data-role="media-cue"
              style={style}
              onLoadStart={() => onStatus?.('buffering')}
              onCanPlay={() => onStatus?.('ready')}
              onError={() => onStatus?.('error')}
              onWaiting={() => onStatus?.('buffering')}
              onPlaying={() => onStatus?.('ready')}
            />
          ) : (
            <img
              src={source.path}
              alt=""
              style={style}
              onLoad={(e) => {
                setSize((s) => ({ ...s, sw: e.currentTarget.naturalWidth, sh: e.currentTarget.naturalHeight }));
                onStatus?.('ready');
              }}
              onError={() => onStatus?.('error')}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function CueMedia({ packet, zIndex = 0 }: { packet: CuePacket; zIndex?: number }) {
  const latest = useRef(packet);
  latest.current = packet;
  const statuses = useRef<Record<string, string>>({});
  // Shown at 0 first, so a new entry fades in rather than cutting.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    // Source load events maintain readiness across cue session changes.
    const report = () => {
      const p = latest.current;
      if (!p.assignment) return;
      const ids = [p.assignment.sourceId].filter((id): id is string => !!id);
      const cue = {
        session: p.transport.session,
        revision: p.transport.revision,
        role: p.assignment.role,
        sources: Object.fromEntries(ids.map((id) => [id, statuses.current[id] ?? 'buffering'])),
      };
      if (window.presentationApi?.reportVideoStatus) window.presentationApi.reportVideoStatus({ hasVideo: false, cue });
      else window.opener?.postMessage({ type: 'MEDIA_CUE_STATUS', cue }, location.origin);
    };
    const timer = setInterval(report, 500);
    report();
    return () => clearInterval(timer);
  }, [packet.transport.session, packet.assignment?.sourceId, packet.cue.audioSourceId]);
  const assignment = packet.assignment;
  if (!assignment) return null;
  const source = packet.cue.sources.find((s) => s.id === assignment.sourceId);
  const visible = shown && packet.visible !== false;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        zIndex,
        opacity: visible ? 1 : 0,
        transition: `opacity ${packet.fadeMs ?? 0}ms ease-in-out`,
        pointerEvents: 'none',
      }}
    >
      {packet.cue.slideshow ? (
        <SlideshowSource packet={packet} frame={assignment.frame} />
      ) : (
        source && (
          <CueSource
            key={source.id}
            source={source}
            frame={assignment.frame}
            packet={packet}
            audible={false}
            onStatus={(status) => {
              statuses.current[source.id] = status;
            }}
          />
        )
      )}
    </div>
  );
}

/** How long a slideshow's fade between two images takes. */
const SLIDE_FADE_MS = 700;

/**
 * A slideshow: the image its clock is at, framed like any source. With a fade, the image before
 * stays underneath while the new one fades in.
 */
export function SlideshowSource({ packet, frame }: { packet: CuePacket; frame: MediaFrame }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, []);
  const time = advanceCue(packet.cue, packet.transport, Math.max(0, (now - packet.at) / 1000)).time;
  const { index } = slideAt(packet.cue, time);
  const [previous, setPrevious] = useState<{ index: number; shown: number } | null>(null);
  const [current, setCurrent] = useState(index);
  if (index !== current) {
    setPrevious({ index: current, shown: Date.now() });
    setCurrent(index);
  }
  const fade = packet.cue.slideshow?.transition === 'fade';
  useEffect(() => {
    if (!previous) return;
    const timer = setTimeout(() => setPrevious(null), SLIDE_FADE_MS + 50);
    return () => clearTimeout(timer);
  }, [previous]);
  const slide = (i: number, fadeIn: boolean) => {
    const source = packet.cue.sources[i];
    if (!source) return null;
    return (
      <div
        key={`${i}/${source.id}`}
        style={{ position: 'absolute', inset: 0, animation: fadeIn ? `presenter-slide-in ${SLIDE_FADE_MS}ms ease-in-out` : undefined }}
      >
        <CueSource source={source} frame={frame} packet={packet} />
      </div>
    );
  };
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <style>{'@keyframes presenter-slide-in { from { opacity: 0 } to { opacity: 1 } }'}</style>
      {fade && previous && previous.index !== current && slide(previous.index, false)}
      {slide(current, fade && !!previous)}
    </div>
  );
}

/**
 * The media layers of one role in a window, bottom to top. An entry that is no longer sent — it
 * was replaced or ended — fades out over the one arriving, then is removed.
 */
export function MediaStack({ packets, zIndex }: { packets: CuePacket[]; zIndex: number }) {
  const [leaving, setLeaving] = useState<CuePacket[]>([]);
  // The newest packet of every session on screen, handed over when that session disappears.
  const seen = useRef(new Map<string, CuePacket>());
  for (const packet of packets) seen.current.set(packet.transport.session, packet);
  const sessions = packets.map((packet) => packet.transport.session).join('|');
  useEffect(() => {
    const current = new Set(packets.map((packet) => packet.transport.session));
    const gone = [...seen.current.values()].filter((packet) => !current.has(packet.transport.session));
    if (!gone.length) return;
    for (const packet of gone) seen.current.delete(packet.transport.session);
    const fade = Math.max(0, ...packets.map((packet) => packet.fadeMs ?? 0), ...gone.map((packet) => packet.fadeMs ?? 0));
    if (fade <= 0) return;
    const fading = gone.map((packet) => ({ ...packet, visible: false, fadeMs: fade }));
    setLeaving((list) => [...list.filter((p) => !current.has(p.transport.session)), ...fading]);
    const timer = setTimeout(
      () => setLeaving((list) => list.filter((p) => !fading.some((f) => f.transport.session === p.transport.session))),
      fade + 50,
    );
    return () => clearTimeout(timer);
    // Only a change in which sessions are sent adds or removes layers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions]);
  return (
    <>
      {leaving
        .filter((packet) => !packets.some((p) => p.transport.session === packet.transport.session))
        .map((packet) => (
          <CueMedia key={packet.transport.session} packet={packet} zIndex={zIndex} />
        ))}
      {packets.map((packet) => (
        <CueMedia key={packet.transport.session} packet={packet} zIndex={zIndex} />
      ))}
    </>
  );
}
