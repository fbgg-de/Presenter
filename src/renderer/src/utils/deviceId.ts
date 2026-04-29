import { SETTINGS_KEY } from '@/store/settingsSlice';

/**
 * Returns the stable device ID for this browser/app instance.
 * The ID is stored inside the presenter_settings key rather than its own key.
 * Falls back to reading the settings directly so it can be called outside React.
 */
export const getDeviceId = (): string => {
  try {
    const settings = localStorage.getItem(SETTINGS_KEY);
    if (settings) {
      const parsed = JSON.parse(settings);
      if (parsed.deviceId) {
        return parsed.deviceId as string;
      }
    }
  } catch {
    // ignore
  }

  return 'unknown';
};
