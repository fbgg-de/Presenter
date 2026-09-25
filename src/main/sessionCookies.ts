import type { Cookie, Cookies } from 'electron';
import { existsSync, readFileSync, rmSync } from 'fs';

/** Import the old shutdown snapshot once. Chromium's current cookies always win. */
export async function migrateSessionCookies(cookies: Cookies, legacyFile: string, backendOrigin: string): Promise<void> {
  if (!existsSync(legacyFile)) return;
  const host = backendOrigin ? new URL(backendOrigin).hostname : '';
  const saved: Cookie[] = JSON.parse(readFileSync(legacyFile, 'utf-8'));
  const current = await cookies.get({});
  const key = (cookie: Cookie): string => `${cookie.domain?.replace(/^\./, '')}|${cookie.name}|${cookie.path ?? '/'}`;
  const hostOnly = (cookie: Cookie): boolean => cookie.hostOnly !== false && !cookie.domain?.startsWith('.');
  const existing = new Set(current.map(key));
  const candidates = new Map<string, Cookie>();
  const now = Date.now() / 1000;
  for (const cookie of saved) {
    // Old snapshots sometimes contain duplicate domain/host-only PHPSESSID entries.
    // Never import provider cookies, expired cookies, or cookies without a known expiry.
    if (!host || cookie.domain?.replace(/^\./, '') !== host || !cookie.expirationDate || cookie.expirationDate <= now) continue;
    const previous = candidates.get(key(cookie));
    if (!previous || (hostOnly(cookie) && !hostOnly(previous))) candidates.set(key(cookie), cookie);
  }
  for (const [id, cookie] of candidates) {
    if (existing.has(id)) continue;
    await cookies.set({
      url: `${cookie.secure ? 'https' : 'http'}://${host}${cookie.path ?? '/'}`,
      name: cookie.name,
      value: cookie.value,
      ...(hostOnly(cookie) ? {} : { domain: cookie.domain }),
      path: cookie.path,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      expirationDate: cookie.expirationDate,
      sameSite: cookie.sameSite,
    });
  }
  await cookies.flushStore();
  // A consumed snapshot must never resurrect a session after an explicit logout.
  rmSync(legacyFile, { force: true });
}

/** Persist login, rotation and logout without depending on a successful shutdown. */
export function persistCookieChanges(cookies: Cookies): () => Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending = Promise.resolve();
  const flush = (): Promise<void> => {
    clearTimeout(timer);
    timer = undefined;
    pending = pending.catch(() => {}).then(() => cookies.flushStore());
    return pending;
  };
  cookies.on('changed', () => {
    if (timer) return;
    timer = setTimeout(() => {
      void flush().catch(() => console.error('[Cookies] Failed to persist cookie changes'));
    }, 250);
  });
  return flush;
}
