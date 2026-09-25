/** Size helpers for the operator view's resizable tiles; the button lives in SizeControl.tsx. */
import { useEffect, useRef, useState } from 'react';

export interface SizeRange {
  min: number;
  max: number;
  step: number;
}

/** Screen preview tile width in the operator view's top bar. */
export const MONITOR_RANGE: SizeRange = { min: 90, max: 360, step: 10 };
export const MONITOR_DEFAULT = 140;
/** Minimum slide card width in the operator view. */
export const SLIDE_RANGE: SizeRange = { min: 160, max: 720, step: 20 };
export const SLIDE_DEFAULT = 280;
/** Set list and look inspector column widths in the operator view. */
export const SET_LIST_RANGE: SizeRange = { min: 240, max: 560, step: 10 };
export const SET_LIST_DEFAULT = 320;
export const INSPECTOR_RANGE: SizeRange = { min: 240, max: 520, step: 10 };
export const INSPECTOR_DEFAULT = 290;

export const clampSize = (value: number | undefined, range: SizeRange, fallback: number) =>
  Math.min(range.max, Math.max(range.min, value || fallback));

/**
 * Ctrl + wheel over the returned ref's element steps the size. Registered as a non-passive native
 * listener: React's `onWheel` is passive, so it could not keep the browser from zooming the page.
 */
export const useCtrlWheelSize = (value: number, range: SizeRange, onChange: (value: number) => void) => {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const latest = useRef({ value, onChange });
  useEffect(() => {
    latest.current = { value, onChange };
  }, [value, onChange]);

  useEffect(() => {
    if (!node) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const { value: current, onChange: change } = latest.current;
      const next = Math.min(range.max, Math.max(range.min, current + (e.deltaY < 0 ? range.step : -range.step)));
      if (next !== current) change(next);
    };
    node.addEventListener('wheel', handler, { passive: false });
    return () => node.removeEventListener('wheel', handler);
  }, [node, range.min, range.max, range.step]);

  return setNode;
};
