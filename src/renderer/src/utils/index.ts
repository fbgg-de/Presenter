import { MEDIA_SERVER_BASE } from '@/utils/mediaUrl';

export const redirectToLogin = (next?: string) => {
  window.location.replace('/login?next=' + encodeURIComponent(next ?? '/'));
};

/** Returns true when running inside the Electron shell (window.api is injected by the preload). */
export const isElectronApp = (): boolean => typeof window !== 'undefined' && !!(window as { api?: unknown }).api;

export type DetectedOs = 'windows' | 'macos' | 'linux' | 'unknown';

/** Detect the user's OS to offer the right installer. */
export const detectOs = (): DetectedOs => {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('windows') || ua.includes('win32') || ua.includes('win64')) return 'windows';
  if (ua.includes('mac os') || ua.includes('macintosh')) return 'macos';
  if (ua.includes('linux')) return 'linux';
  return 'unknown';
};

export const getMediaBaseUrl = (mediaPath: string): string | null => {
  if (isElectronApp()) {
    return MEDIA_SERVER_BASE;
  }
  if (mediaPath) {
    return mediaPath.replace(/\/+$/, '');
  }

  return null;
};

export const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

/** Format seconds as mm:ss */
export const formatTime = (seconds: number): string => {
  if (!isFinite(seconds) || seconds < 0) {
    return '0:00';
  }

  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export const formatDateTime = (ts: number): string => {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const normalizeHex = (s: string): string => {
  if (!s) return '#000000';
  const v = s.trim().toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(v)) return v;
  if (/^[0-9A-F]{6}$/.test(v)) return `#${v}`;
  return s;
};
