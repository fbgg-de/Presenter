import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * Text that would not fit the screen is shrunk until it does — never grown. Before this, a long
 * bilingual block (or a theme made for 16:9 on a 4:3 projector) silently lost its last lines under
 * `overflow: hidden`. ProPresenter and FreeShow both scale text to its box; the stage screen here
 * already did (StageScreen's FitText).
 *
 * Text inside sizes itself with `fitFont(size)`, i.e. `calc(size * var(--fit, 1))`, so the theme's
 * own units (vw, px, …) and per-language sizes all shrink together. The scale is found by a short
 * binary search over forced layouts and written to the element directly — no re-render per step.
 */
const MIN_SCALE = 0.35;

export const fitFont = (size: CSSProperties['fontSize']): string | undefined =>
  size === undefined || size === '' ? undefined : `calc(${typeof size === 'number' ? `${size}px` : size} * var(--fit, 1))`;

export const ShrinkToFit = ({
  children,
  measureKey,
  onScale,
}: {
  children: ReactNode;
  /** Anything that changes what is shown; a change measures again. */
  measureKey: unknown;
  onScale?: (scale: number) => void;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [resized, setResized] = useState(0);
  const onScaleRef = useRef(onScale);
  onScaleRef.current = onScale;

  // The window changing size, or a web font arriving late, changes what fits.
  useLayoutEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(() => setResized((n) => n + 1));
    observer.observe(parent);
    void document.fonts?.ready.then(() => setResized((n) => n + 1));
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const css = getComputedStyle(parent);
    let available = parent.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom);
    // Anything else in the flow next to the text takes its share.
    for (const sibling of Array.from(parent.children)) {
      if (sibling === el) continue;
      const position = getComputedStyle(sibling).position;
      if (position !== 'absolute' && position !== 'fixed') available -= (sibling as HTMLElement).offsetHeight;
    }
    const fits = (scale: number) => {
      el.style.setProperty('--fit', String(scale));
      return el.scrollHeight <= available + 1;
    };
    let scale = 1;
    if (available > 0 && !fits(1)) {
      let low = MIN_SCALE;
      let high = 1;
      for (let i = 0; i < 9; i++) {
        const mid = (low + high) / 2;
        if (fits(mid)) low = mid;
        else high = mid;
      }
      scale = low;
      fits(scale);
    }
    onScaleRef.current?.(scale);
  }, [measureKey, resized]);

  return (
    <div ref={ref} style={{ width: '100%', flexShrink: 0 }}>
      {children}
    </div>
  );
};
