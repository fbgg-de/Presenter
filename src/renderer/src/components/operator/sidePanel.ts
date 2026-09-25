/**
 * The operator view's side panel: the right-hand column holding the preview and the inspector.
 * One switch shows or hides the whole column; what it holds is chosen separately in the View menu.
 */
import type { SettingsState } from '@/store/settingsSlice';

type UpdateSetting = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;

export interface SidePanelState {
  open: boolean;
  inspector: boolean;
  preview: boolean;
}

/** Stored settings from before the switches existed read as shown. */
export const sidePanelState = (
  settings: Pick<SettingsState, 'operatorSidePanelOpen' | 'operatorInspectorOpen' | 'operatorPreviewOpen'>,
) => ({
  open: settings.operatorSidePanelOpen !== false,
  inspector: settings.operatorInspectorOpen !== false,
  preview: settings.operatorPreviewOpen !== false,
});

/** Whether the column is actually on screen: switched on and holding something. */
export const sidePanelVisible = (state: SidePanelState) => state.open && (state.inspector || state.preview);

/** Show or hide the whole column. Showing an empty one brings both parts back. */
export function toggleSidePanel(state: SidePanelState, updateSetting: UpdateSetting): void {
  if (sidePanelVisible(state)) {
    updateSetting('operatorSidePanelOpen', false);
    return;
  }
  updateSetting('operatorSidePanelOpen', true);
  if (!state.inspector && !state.preview) {
    updateSetting('operatorInspectorOpen', true);
    updateSetting('operatorPreviewOpen', true);
  }
}
