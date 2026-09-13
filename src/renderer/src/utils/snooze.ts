/**
 * "Not now" for notices that keep coming back: dismissing one hides it on this device for a
 * while, across reloads. Stored per notice key, optionally tied to a scope (e.g. a show title)
 * so a different situation is still reported.
 */
export const SNOOZE_MS = 60 * 60 * 1000;

export const snooze = (key: string, scope = '', ms = SNOOZE_MS): void => {
  try {
    localStorage.setItem(key, JSON.stringify({ until: Date.now() + ms, scope }));
  } catch {
    // Storage unavailable or full — the notice may simply come back sooner.
  }
};

export const isSnoozed = (key: string, scope = ''): boolean => {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null') as { until?: number; scope?: string } | null;
    return !!value && value.scope === scope && typeof value.until === 'number' && value.until > Date.now();
  } catch {
    return false;
  }
};

export const clearSnooze = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing stored that could be removed.
  }
};
