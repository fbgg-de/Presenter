import { isElectronApp } from '@/utils';

/** A place in Settings: a category, optionally one of its sections to scroll to. */
export interface SettingsTarget {
  category: string;
  section?: string;
}

/** Where the desktop app's media folder is set (Settings → Library → Media). */
export const MEDIA_FOLDER_SETTING: SettingsTarget = { category: 'library', section: 'media' };

/** Where the web version connects its Nextcloud and chooses the media folder there. */
export const NEXTCLOUD_SETTING: SettingsTarget = { category: 'connections', section: 'nextcloud' };

/** Where media is set up in this app: the folder on this computer, or — in the browser — Nextcloud. */
export const mediaSourceSetting = (): SettingsTarget => (isElectronApp() ? MEDIA_FOLDER_SETTING : NEXTCLOUD_SETTING);

export const OPEN_SETTINGS_EVENT = 'presenter:open-settings';

/** Open Settings from anywhere in the operator view, optionally at `target`. The sidebar hosts it. */
export const openSettings = (target?: SettingsTarget) => window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT, { detail: target }));
