import { isElectronApp } from '@/utils/index';
/**
 * Settings export/import utilities for browser mode (§7.5).
 * In Electron mode, these are handled by IPC to main process.
 * In browser mode, these provide download/upload fallbacks.
 */

export interface SettingsDiff {
  added: Record<string, string>;
  changed: Record<string, { old: string; new: string }>;
  removed: string[];
}

/**
 * Collect all presenter_* settings from localStorage.
 */
export function getAllPresenterSettings(): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('presenter_')) {
      const value = localStorage.getItem(key);
      if (value !== null) {
        result[key] = value;
      }
    }
  }
  return result;
}

/**
 * Compute the diff between imported settings and current settings.
 */
export const diffSettings = (imported: Record<string, string>, current: Record<string, string>): SettingsDiff => {
  const diff: SettingsDiff = {
    added: {},
    changed: {},
    removed: [],
  };

  for (const [key, value] of Object.entries(imported)) {
    if (!(key in current)) {
      diff.added[key] = value;
    } else if (current[key] !== value) {
      diff.changed[key] = { old: current[key], new: value };
    }
  }

  for (const key of Object.keys(current)) {
    if (!(key in imported)) {
      diff.removed.push(key);
    }
  }

  return diff;
};

/**
 * Apply a settings diff to localStorage.
 */
export const applySettings = (diff: SettingsDiff): void => {
  for (const [key, value] of Object.entries(diff.added)) {
    localStorage.setItem(key, value);
  }
  for (const [key, entry] of Object.entries(diff.changed)) {
    localStorage.setItem(key, entry.new);
  }
  // Note: We don't remove settings during import for safety
};

/**
 * Export settings as a JSON file download (browser mode).
 */
export const exportSettingsBrowser = (): void => {
  const settings = getAllPresenterSettings();
  const json = JSON.stringify(settings, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'presenter-settings.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Import settings from a JSON file (browser mode).
 * Returns a promise that resolves with the diff.
 */
export const importSettingsBrowser = (): Promise<SettingsDiff | null> => {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }

      try {
        const text = await file.text();
        const imported = JSON.parse(text) as Record<string, string>;
        const current = getAllPresenterSettings();
        const diff = diffSettings(imported, current);
        resolve(diff);
      } catch {
        resolve(null);
      }
    };
    input.click();
  });
};

/**
 * Export settings — uses Electron IPC if available, otherwise browser download.
 */
export async function exportSettings(): Promise<string | null> {
  if (isElectronApp()) {
    return window.api.exportSettings();
  }
  exportSettingsBrowser();
  return 'downloaded';
}

/**
 * Import settings — uses Electron IPC if available, otherwise browser file picker.
 */
export async function importSettings(): Promise<SettingsDiff | null> {
  if (isElectronApp()) {
    return window.api.importSettings();
  }
  return importSettingsBrowser();
}

/**
 * Apply imported settings diff.
 */
export async function applyImportedSettings(diff: SettingsDiff): Promise<void> {
  if (isElectronApp()) {
    await window.api.applyImportedSettings(diff);
    return;
  }
  applySettings(diff);
  // Reload to apply
  window.location.reload();
}
