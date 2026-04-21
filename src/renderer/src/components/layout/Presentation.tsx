import {
  openPresentationWindow,
  closePresentationWindow,
  closeAllPresentationWindows,
  getOpenWindows,
  identifyWindows,
  type WindowConfig,
} from '@/utils/presentationBridge';

export type { WindowConfig };

/**
 * Create a new presentation window using the bridge module.
 */
export const createPresentationWindow = async (config?: WindowConfig) => {
  const id = await openPresentationWindow(config);

  return {
    id,
    close: () => closePresentationWindow(id),
  };
};

export { closePresentationWindow, closeAllPresentationWindows, getOpenWindows, identifyWindows };
