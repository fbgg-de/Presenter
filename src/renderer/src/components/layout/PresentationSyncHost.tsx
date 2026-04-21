import { usePresentationSync } from '@/hooks/usePresentationSync';

/**
 * Tiny null-rendering component that hosts the heavy `usePresentationSync`
 * hook. Mounting it as a sibling (rather than calling the hook directly in
 * MainPage) means selector subscriptions inside the hook only re-render this
 * component — NOT MainPage and its expensive children (Sidebar, Control,
 * Footer with their MUI Drawer/Menu/Chip subtrees).
 *
 * This is a low-risk perf fix for the controller-lag issue: the hook's
 * many `useAppSelector` calls were forcing MainPage to re-render on every
 * navigation index / song / style change, even though MainPage's JSX never
 * actually depends on any of those values.
 */
const PresentationSyncHost = () => {
  usePresentationSync();
  return null;
};

export default PresentationSyncHost;

