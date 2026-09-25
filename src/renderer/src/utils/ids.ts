/**
 * A unique id, with the fallback every one of these needs: `crypto.randomUUID` requires a secure
 * context, which an HTTP deployment on a local network and iOS Safari before 15.4 do not give.
 *
 * Deliberately import-free — the pure modules that node tests bundle (`media/types`, `stage/types`)
 * use it, and `utils/index` pulls in the store.
 */
export const newId = (prefix: string): string =>
  globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
