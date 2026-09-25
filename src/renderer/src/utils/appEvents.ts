/**
 * Requests between parts of the operator view that do not own each other's dialogs: the side panel
 * asks the agenda (which owns the theme editor and the group settings) to open one. Plain window
 * events, like `presenter:open-window-manager`.
 */
import { useEffect, useRef } from 'react';

type AppEvents = {
  /** Open the theme editor, on one theme when given. */
  'presenter:edit-style': { styleId?: number };
  /** Open an agenda group's settings, on one of its tabs when given. */
  'presenter:group-settings': { groupId: string; tab?: 'general' | 'theme' | 'playback' };
};

export const emitAppEvent = <K extends keyof AppEvents>(name: K, detail: AppEvents[K]) =>
  window.dispatchEvent(new CustomEvent(name, { detail }));

export function useAppEvent<K extends keyof AppEvents>(name: K, handler: (detail: AppEvents[K]) => void): void {
  // The latest handler, without subscribing again on every render.
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const listener = (event: Event) => latest.current((event as CustomEvent<AppEvents[K]>).detail);
    window.addEventListener(name, listener);
    return () => window.removeEventListener(name, listener);
  }, [name]);
}
