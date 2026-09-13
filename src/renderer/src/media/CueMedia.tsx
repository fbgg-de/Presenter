import { useEffect, useRef, useState } from 'react';
import type { CuePacket, MediaFrame, MediaSource } from './types';
import { advanceCue, clamp } from './engine';
import { frameGeometry } from './framing';

type Props = {
  packet: CuePacket;
  source: MediaSource;
  frame: MediaFrame;
  audible?: boolean;
  audioOnly?: boolean;
  onStatus?: (status: string) => void;
};
export function CueSource({ packet, source, frame, audible = false, audioOnly = false, onStatus }: Props) {
  const host = useRef<HTMLDivElement>(null),
    video = useRef<HTMLMediaElement | null>(null);
  const MediaElement = audioOnly ? 'audio' : 'video';
  const latest = useRef({ packet, source, audible, onStatus });
  latest.current = { packet, source, audible, onStatus };
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
      revision = -1;
    const update = () => {
      const { packet: p, source: s, audible: audio, onStatus: report } = latest.current;
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
      v.loop = false;
      if (!duration) return;
      const target = clamp(sourceTime, 0, Math.max(0, duration - 0.001));
      if (!v.seeking && Math.abs(v.currentTime - target) > (t.playing ? 0.09 : 0.002)) v.currentTime = target;
      const play = t.playing && sourceTime >= 0 && sourceTime < duration;
      if (!play) {
        if (!v.paused) v.pause();
        return;
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

export function CueMedia({ packet }: { packet: CuePacket }) {
  const latest = useRef(packet);
  latest.current = packet;
  const statuses = useRef<Record<string, string>>({});
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
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: packet.visible === false ? 0 : 1 }}>
      {source && (
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
      )}
    </div>
  );
}
