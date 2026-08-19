import { useCallback } from 'react';
import { useUpdateSetting, type SettingsState } from '@/store/settingsSlice';
import { useMetrics } from '@/hooks/useMetrics';

/**
 * Update a setting and record the change, keeping the one rule that has to survive the
 * write: a metrics opt-out has to report itself before metrics stop being sent.
 */
export const useTrackedUpdateSetting = () => {
  const updateSetting = useUpdateSetting();
  const { trackEvent } = useMetrics();

  return useCallback(
    <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
      if (key === 'metricsEnabled' && value === false) {
        trackEvent('metrics_disabled');
      }
      updateSetting(key, value);
      trackEvent('setting_changed', 'setting', key, { value: String(value) });
    },
    [updateSetting, trackEvent],
  );
};
