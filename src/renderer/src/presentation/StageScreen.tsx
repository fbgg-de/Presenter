/**
 * The stage screen: what the people on stage see, drawn in one of four designed layouts.
 *
 * - **Band** — current section large, the next section beside it, the arrangement roadmap below.
 * - **Speaker** — current and next slide side by side as cards.
 * - **Countdown** — one huge number (the clock until timers arrive) with the item title.
 * - **Lyrics** — only the words, as large as they fit, under a slim header.
 *
 * The palette is fixed and high-contrast rather than the audience theme, digits are monospace so
 * they never jitter, and lyrics are fitted to their box instead of sized by a theme. Every size is
 * a fraction of the component's own measured height, so the same component draws a full stage
 * monitor and the operator's small preview tile. Custom overlays (stage layers) sit on top, kept
 * clear of the header and roadmap; mirror flips everything for a teleprompter glass.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { StageLayoutSettings } from '@/screens/types';
import { STAGE_MONO_FONT, type StageOverlayPayload } from '@/stage/types';
import { StageOverlay } from './StageOverlay';
import type { StageFrame } from './stageFrame';

const PALETTE = {
  ground: '#050607',
  band: '#111418',
  bandLine: 'rgba(240, 169, 74, 0.3)',
  panel: '#14181D',
  accent: '#F0A94A',
  text: '#FFFFFF',
  dim: 'rgba(255, 255, 255, 0.66)',
  faint: 'rgba(255, 255, 255, 0.38)',
  live: '#E0464D',
};
const MONO = STAGE_MONO_FONT;
const SANS = '"Segoe UI", Roboto, "Helvetica Neue", Arial, system-ui, sans-serif';
const TEXT_SCALE: Record<StageLayoutSettings['textSize'], number> = { normal: 0.82, large: 1, huge: 1.22 };

/** Header and roadmap heights as fractions of the screen height. */
const HEADER = 0.11;
const ROADMAP = 0.1;

/** The component's own height, which every size is a fraction of. */
const useMeasuredHeight = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(() => (typeof window !== 'undefined' ? window.innerHeight : 1080));
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setHeight(el.clientHeight || window.innerHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, height };
};

/** Wall clock, HH:mm, in monospace digits. */
const Clock = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</>;
};

/** "Vers 1" → "V1", "Chorus" → "C", "Vers 1 (2)" → "V1". Short enough for a row of chips. */
const abbreviate = (name: string) => {
  const clean = name.replace(/\(\d+\)\s*$/, '').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 0) return name;
  const number = words.find((word) => /^\d+$/.test(word));
  return `${words[0].charAt(0).toUpperCase()}${number ?? ''}`;
};

/**
 * Lines fitted to their box: the largest size up to `max` px at which every line fits. Written to
 * the element directly (binary search over forced layouts), so fitting never re-renders.
 */
const FitText = ({
  lines,
  max,
  min,
  align = 'left',
  color = PALETTE.text,
  weight = 700,
}: {
  lines: string[];
  max: number;
  min: number;
  align?: 'left' | 'center';
  color?: string;
  weight?: number;
}) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setBox((current) =>
        current.width === entry.contentRect.width && current.height === entry.contentRect.height
          ? current
          : { width: entry.contentRect.width, height: entry.contentRect.height },
      ),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const outer = boxRef.current;
    const inner = innerRef.current;
    if (!outer || !inner || box.height === 0) return;
    const fitsAt = (size: number) => {
      inner.style.fontSize = `${size}px`;
      return inner.scrollHeight <= outer.clientHeight && inner.scrollWidth <= outer.clientWidth + 1;
    };
    const search = () => {
      let high = Math.max(min, max);
      let low = min;
      if (fitsAt(high)) return high;
      for (let i = 0; i < 12 && high - low > 0.5; i++) {
        const mid = (low + high) / 2;
        if (fitsAt(mid)) low = mid;
        else high = mid;
      }
      return low;
    };
    // Keep every lyric line on one row (musicians read by line) unless that costs a lot of size,
    // as long prose lines (Bible verses) would; then wrap.
    inner.style.whiteSpace = 'normal';
    const wrapped = search();
    inner.style.whiteSpace = 'nowrap';
    const single = search();
    if (single >= wrapped * 0.75 && fitsAt(single)) return;
    inner.style.whiteSpace = 'normal';
    fitsAt(wrapped);
  }, [lines, max, min, box.width, box.height]);

  return (
    <div
      ref={boxRef}
      style={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: align === 'center' ? 'center' : 'flex-start',
      }}
    >
      <div
        ref={innerRef}
        style={{ width: '100%', textAlign: align, color, fontWeight: weight, fontFamily: SANS, lineHeight: 1.2, overflowWrap: 'anywhere' }}
      >
        {lines.map((line, index) => (
          <div key={index}>{line}</div>
        ))}
      </div>
    </div>
  );
};

export const StageScreen = ({
  frame,
  settings,
  overlays,
  isBlack = false,
}: {
  frame: StageFrame;
  settings: StageLayoutSettings;
  /** Custom overlays (stage layers) for this window. */
  overlays?: StageOverlayPayload;
  isBlack?: boolean;
}) => {
  const { ref, height } = useMeasuredHeight();
  const px = (fraction: number) => height * fraction;
  const u = (fraction: number) => `${px(fraction)}px`;
  const scale = TEXT_SCALE[settings.textSize] ?? 1;
  const lyrics = frame.textHidden ? [] : frame.current;
  const current = frame.sections[frame.activeIndex];
  const position = current ? `${current} · ${frame.activeIndex + 1}/${frame.sections.length}` : undefined;

  const sectionLabel = (text: ReactNode, color = PALETTE.accent): ReactNode => (
    <div
      style={{
        fontFamily: MONO,
        fontWeight: 700,
        fontSize: u(0.03),
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        flexShrink: 0,
      }}
    >
      {text}
    </div>
  );

  const header = (
    <div
      style={{
        height: u(HEADER),
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: u(0.03),
        padding: `0 ${u(0.045)}`,
        background: PALETTE.band,
        borderBottom: `${u(0.004)} solid ${PALETTE.bandLine}`,
      }}
    >
      <span
        style={{
          fontFamily: MONO,
          fontWeight: 700,
          fontSize: u(0.058),
          color: PALETTE.accent,
          minWidth: u(0.2),
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {settings.clock ? <Clock /> : null}
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: 'center',
          fontFamily: SANS,
          fontWeight: 700,
          fontSize: u(0.05),
          color: PALETTE.text,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {frame.title}
      </span>
      <span style={{ minWidth: u(0.2), display: 'flex', justifyContent: 'flex-end' }}>
        {settings.key && frame.songKey ? (
          <span
            style={{
              fontFamily: MONO,
              fontWeight: 700,
              fontSize: u(0.045),
              color: '#111',
              background: PALETTE.accent,
              borderRadius: u(0.01),
              padding: `${u(0.008)} ${u(0.02)}`,
            }}
          >
            {frame.songKey}
          </span>
        ) : null}
      </span>
    </div>
  );

  const showRoadmap = settings.roadmap && frame.sections.length > 1;
  const roadmap = showRoadmap ? (
    <div
      style={{
        height: u(ROADMAP),
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: u(0.012),
        padding: `0 ${u(0.045)}`,
        background: PALETTE.band,
        borderTop: `${u(0.004)} solid ${PALETTE.bandLine}`,
        overflow: 'hidden',
      }}
    >
      {frame.sections.map((name, index) => {
        const chip: CSSProperties =
          index === frame.activeIndex
            ? { background: PALETTE.accent, color: '#111' }
            : index < frame.activeIndex
              ? { background: 'rgba(255, 255, 255, 0.06)', color: PALETTE.faint }
              : { color: PALETTE.dim, boxShadow: `inset 0 0 0 ${u(0.002)} rgba(255, 255, 255, 0.24)` };
        return (
          <span
            key={index}
            style={{
              fontFamily: MONO,
              fontWeight: 700,
              fontSize: u(0.032),
              padding: `${u(0.014)} ${u(0.02)}`,
              borderRadius: u(0.01),
              whiteSpace: 'nowrap',
              flexShrink: 0,
              ...chip,
            }}
          >
            {abbreviate(name)}
          </span>
        );
      })}
    </div>
  ) : null;

  let body: ReactNode;
  let reserve = { top: HEADER, bottom: 0 };

  switch (settings.layout) {
    case 'speaker': {
      const card = (label: string, lines: string[], live: boolean) => (
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: u(0.02),
            padding: u(0.03),
            borderRadius: u(0.018),
            background: PALETTE.panel,
            boxShadow: live ? `inset 0 0 0 ${u(0.006)} ${PALETTE.live}` : 'none',
          }}
        >
          {sectionLabel(label, live ? '#FF8A8E' : PALETTE.faint)}
          <FitText lines={lines} max={px(0.085 * scale)} min={px(0.02)} align="center" color={live ? PALETTE.text : PALETTE.dim} />
        </div>
      );
      body = (
        <>
          {header}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: u(0.03), padding: u(0.04) }}>
            {card(position ?? '', lyrics, true)}
            {settings.next && card(frame.next ? `▸ ${frame.next.name}` : '—', frame.textHidden ? [] : (frame.next?.lines ?? []), false)}
          </div>
        </>
      );
      break;
    }

    case 'countdown':
      reserve = { top: 0, bottom: 0 };
      body = (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: u(0.03) }}>
          <div
            style={{
              fontFamily: MONO,
              fontWeight: 700,
              fontSize: u(0.3),
              lineHeight: 1,
              letterSpacing: '-0.02em',
              fontVariantNumeric: 'tabular-nums',
              color: PALETTE.text,
            }}
          >
            <Clock />
          </div>
          {frame.title && (
            <div
              style={{
                fontFamily: SANS,
                fontWeight: 700,
                fontSize: u(0.055),
                color: PALETTE.accent,
                textAlign: 'center',
                padding: `0 ${u(0.06)}`,
              }}
            >
              {frame.title}
            </div>
          )}
        </div>
      );
      break;

    case 'lyrics':
      body = (
        <>
          {header}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', padding: `${u(0.04)} ${u(0.06)}` }}>
            <FitText lines={lyrics} max={px(0.15 * scale)} min={px(0.03)} align="center" />
          </div>
        </>
      );
      break;

    case 'band':
    default:
      reserve = { top: HEADER, bottom: showRoadmap ? ROADMAP : 0 };
      body = (
        <>
          {header}
          <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: u(0.02),
                padding: `${u(0.04)} ${u(0.06)}`,
              }}
            >
              {position && sectionLabel(position)}
              <FitText lines={lyrics} max={px(0.11 * scale)} min={px(0.025)} />
            </div>
            {settings.next && (
              <div
                style={{
                  width: '34%',
                  flexShrink: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: u(0.02),
                  padding: `${u(0.04)} ${u(0.035)}`,
                  background: '#0B0D10',
                  borderLeft: `${u(0.003)} solid rgba(255, 255, 255, 0.12)`,
                }}
              >
                {sectionLabel(frame.next ? `▸ ${frame.next.name}` : '▸ —')}
                <FitText
                  lines={frame.textHidden ? [] : (frame.next?.lines ?? [])}
                  max={px(0.06 * scale)}
                  min={px(0.02)}
                  color={PALETTE.dim}
                  weight={600}
                />
              </div>
            )}
          </div>
          {roadmap}
        </>
      );
  }

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        background: PALETTE.ground,
        color: PALETTE.text,
        transform: settings.mirror ? 'scaleX(-1)' : undefined,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          opacity: isBlack ? 0 : 1,
          transition: 'opacity 300ms ease-in-out',
        }}
      >
        {body}
      </div>
      {overlays && overlays.layers.length > 0 && !isBlack && <StageOverlay payload={overlays} reserve={reserve} />}
    </div>
  );
};
