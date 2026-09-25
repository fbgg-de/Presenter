import { memo, type ComponentType } from 'react';

/**
 * A dialog or drawer that skips its parent's re-renders while it stays closed. They are mounted
 * all the time inside components that follow the live slide or the playing video (top bar, layer
 * bar, sidebar), and re-rendering a closed stage panel, style editor or media browser cost tens of
 * milliseconds on every slide change. Opening and closing always render; props received while
 * closed arrive with the render that opens it. Its own store subscriptions still apply.
 */
export const stillWhileClosed = <P extends { open: boolean }>(Component: ComponentType<P>) =>
  memo(Component, (previous, next) => !previous.open && !next.open);
