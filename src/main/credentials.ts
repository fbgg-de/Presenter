/**
 * Secure credential storage.
 *
 * Strategy (in priority order):
 *  1. Electron safeStorage (DPAPI on Windows, Keychain on macOS, libsecret on Linux)
 *  2. AES-256-GCM with a key derived from machine-specific data via scrypt.
 *     This is the fallback for environments where safeStorage is unavailable (e.g.
 *     headless Linux, dev builds on some platforms). Not as strong as the OS keychain
 *     but machine-specific and far better than plaintext.
 *
 * The first byte of the stored file is a magic tag that identifies which scheme was used,
 * so the two paths are never confused even if the availability of safeStorage changes.
 */
import { safeStorage, app } from 'electron';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { hostname } from 'os';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';

export interface StoredCredentials {
  username: string;
  password: string;
}

// ── Magic bytes that identify the encryption scheme in the stored file ──
const MAGIC_SAFE_STORAGE = 0x01;
const MAGIC_FALLBACK = 0x02;

const FALLBACK_ALGO = 'aes-256-gcm';
const FALLBACK_SALT = 'presenter-credentials-v1'; // app-specific fixed salt

const getCredentialsFile = (): string => join(app.getPath('userData'), 'credentials.dat');

// ── Fallback: AES-256-GCM with a scrypt-derived machine key ──

/**
 * Derive a 32-byte key from machine-specific data.
 * Binding to hostname + appName + userData path makes the ciphertext
 * machine-specific (extracting the file to another machine won't decrypt it).
 */
const deriveFallbackKey = (): Buffer => scryptSync(`${hostname()}:${app.getName()}:${app.getPath('userData')}`, FALLBACK_SALT, 32);

const fallbackEncrypt = (plaintext: string): Buffer => {
  const key = deriveFallbackKey();
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv(FALLBACK_ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16 bytes
  // Layout: [magic:1][ivLen:4LE][iv:12][authTag:16][ciphertext:N]
  const header = Buffer.alloc(5);
  header.writeUInt8(MAGIC_FALLBACK, 0);
  header.writeUInt32LE(iv.length, 1);
  return Buffer.concat([header, iv, authTag, ciphertext]);
};

const fallbackDecrypt = (data: Buffer): string => {
  const key = deriveFallbackKey();
  const ivLen = data.readUInt32LE(1);
  const iv = data.subarray(5, 5 + ivLen);
  const authTag = data.subarray(5 + ivLen, 5 + ivLen + 16);
  const ciphertext = data.subarray(5 + ivLen + 16);
  const decipher = createDecipheriv(FALLBACK_ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
};

// ── Public API ──

/**
 * Always returns true: either safeStorage or the AES-256-GCM fallback is available.
 * Kept for API compatibility with existing IPC / UI code.
 */
export const isEncryptionAvailable = (): boolean => true;

/**
 * Encrypt and persist the given credentials.
 * Uses safeStorage when available, falls back to AES-256-GCM otherwise.
 * Returns true on success.
 */
export const storeCredentials = (username: string, password: string): boolean => {
  try {
    const plaintext = JSON.stringify({ username, password } as StoredCredentials);
    let encrypted: Buffer;

    if (safeStorage.isEncryptionAvailable()) {
      const raw = safeStorage.encryptString(plaintext);
      const header = Buffer.alloc(1);
      header.writeUInt8(MAGIC_SAFE_STORAGE, 0);
      encrypted = Buffer.concat([header, raw]);
    } else {
      console.warn('[Credentials] safeStorage unavailable — using AES-256-GCM fallback');
      encrypted = fallbackEncrypt(plaintext);
    }

    writeFileSync(getCredentialsFile(), encrypted);
    return true;
  } catch (err) {
    console.error('[Credentials] Failed to store credentials:', err);
    return false;
  }
};

/**
 * Decrypt and return stored credentials.
 * Returns null if nothing is stored or decryption fails.
 */
export const getCredentials = (): StoredCredentials | null => {
  try {
    const file = getCredentialsFile();
    if (!existsSync(file)) return null;

    const raw = readFileSync(file);
    if (raw.length < 1) return null;

    const magic = raw.readUInt8(0);
    let plaintext: string;

    if (magic === MAGIC_SAFE_STORAGE) {
      if (!safeStorage.isEncryptionAvailable()) {
        console.warn('[Credentials] safeStorage not available to decrypt stored data');
        return null;
      }
      plaintext = safeStorage.decryptString(raw.subarray(1));
    } else if (magic === MAGIC_FALLBACK) {
      plaintext = fallbackDecrypt(raw);
    } else {
      // Legacy: file stored before magic-byte scheme was introduced — try safeStorage directly
      if (!safeStorage.isEncryptionAvailable()) return null;
      plaintext = safeStorage.decryptString(raw);
    }

    return JSON.parse(plaintext) as StoredCredentials;
  } catch {
    return null;
  }
};

/** Delete the stored credentials file. */
export const deleteCredentials = (): void => {
  try {
    const file = getCredentialsFile();
    if (existsSync(file)) unlinkSync(file);
  } catch {}
};
