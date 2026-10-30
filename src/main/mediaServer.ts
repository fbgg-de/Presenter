/**
 * Local media server — Electron main process (§7.2).
 * Serves files from a configurable local directory via HTTP on localhost.
 */
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http';
import { join, extname, resolve, normalize, relative, isAbsolute, basename, parse as parsePath } from 'path';
import { createReadStream } from 'fs';
import { createHash } from 'crypto';
import { stat, readdir, copyFile, mkdir, open, readFile, writeFile, unlink, constants as fsConstants } from 'fs/promises';

/**
 * Pages that may read the media folder across origins: the presenter's own backend (the web
 * build on this computer can use this server as its media path) and the dev renderer. The
 * desktop app's own file:// pages send no Origin and need no CORS. Never `*` — that let any
 * website list and read the media folder.
 */
let corsOrigins: () => string[] = () => [];
export const setMediaCorsOrigins = (origins: () => string[]): void => {
  corsOrigins = origins;
};

/**
 * What the media browser can show, and so what an import accepts — PDFs and PowerPoints included,
 * which become document entries. `.ogg` is left out on purpose: it is served as audio, so a
 * copied `.ogg` would never appear under Videos.
 */
export const IMPORTABLE_EXTS = new Set([
  '.pdf',
  '.pptx',
  '.ppsx',
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.svg',
  '.bmp',
  '.ico',
  '.mp4',
  '.webm',
  '.mov',
  '.avi',
  '.mkv',
  '.mp3',
  '.wav',
  '.m4a',
  '.aac',
  '.flac',
  '.ogg',
]);

export interface MediaImportResult {
  /** Names as written into the folder — renamed to `name (2).ext` where the name was taken. */
  copied: string[];
  skipped: { name: string; reason: 'unsupported' | 'not-a-file' | 'exists' | 'error'; message?: string }[];
  /**
   * Where each source ended up, by its name inside the target folder: freshly copied, or an
   * identical file (same name and size) that was already there and is reused instead of copied.
   */
  placed: { source: string; name: string; reused: boolean }[];
}

/** One file found by name anywhere in the media folder. */
export interface MediaFindResult {
  /** Relative to the media folder, with forward slashes. */
  path: string;
  size: number;
}

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.pdf': 'application/pdf',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.ppsx': 'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
};

/** PDFs and PowerPoints: listed under `type=document`, their MIME types being `application/…`. */
const DOCUMENT_EXTS = new Set(['.pdf', '.pptx', '.ppsx']);

// Extensions included in folder listings
const LISTABLE_EXTS = new Set([
  ...DOCUMENT_EXTS,
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.svg',
  '.bmp',
  '.ico',
  '.mp4',
  '.webm',
  '.mov',
  '.avi',
  '.mkv',
  '.mp3',
  '.wav',
  '.ogg',
  '.m4a',
  '.aac',
  '.flac',
]);

interface ListedFile {
  name: string;
  size: number;
  /** Last modification, ms since epoch. */
  mtime: number;
}

// ── Thumbnail cache ───────────────────────────────────────────────────────────

/**
 * Small pictures for the media browser, kept on disk so they survive restarts (FreeShow keeps the
 * same kind of cache). Images are made by the main process (`setMediaThumbnailer`, Electron's
 * nativeImage); video frames are grabbed by the renderer once and stored here with their duration
 * and size, so it does not decode every video again each session. Keys include the file's mtime and
 * size: an overwritten file gets a new picture (ProPresenter had to fix exactly that in 21.3).
 * Without a thumbnailer (plain node, tests) image thumbs answer 404 and the browser loads the file.
 */
export type MediaThumbnailer = (file: string, width: number) => Promise<{ data: Buffer; type: 'jpeg' | 'png' } | null>;
let thumbnailer: MediaThumbnailer | null = null;
let thumbDir = '';
export const setMediaThumbnailer = (make: MediaThumbnailer | null, cacheDir: string): void => {
  thumbnailer = make;
  thumbDir = cacheDir;
};
const THUMB_WIDTHS = [160, 320, 640];
const MAX_THUMB_FILES = 6000;

/** Read a request body up to `limit` bytes; null when it is larger. */
function readBody(req: IncomingMessage, limit: number): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        resolve(null);
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => resolve(null));
  });
}

/**
 * Pixel size from an image's first bytes — PNG, GIF, BMP, WebP and JPEG — so the list view can show
 * a resolution without the browser decoding the full image just for that.
 */
export function imageSizeFromHeader(b: Buffer): { width: number; height: number } | null {
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b.length >= 10 && b.toString('latin1', 0, 4) === 'GIF8') return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
  if (b.length >= 26 && b.toString('latin1', 0, 2) === 'BM') return { width: b.readInt32LE(18), height: Math.abs(b.readInt32LE(22)) };
  if (b.length >= 30 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
    const chunk = b.toString('latin1', 12, 16);
    if (chunk === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L') {
      const [b0, b1, b2, b3] = [b[21], b[22], b[23], b[24]];
      return { width: 1 + (b0 | ((b1 & 0x3f) << 8)), height: 1 + ((b1 >> 6) | (b2 << 2) | ((b3 & 0x0f) << 10)) };
    }
    if (chunk === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    return null;
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      // SOF0..SOF15 carry the size; C4 (DHT), C8 (JPG) and CC (DAC) are not frames.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
      }
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export class LocalMediaServer {
  private server: Server | null = null;
  private port: number = 0;
  private mediaPath: string;
  private listings = new Map<string, { at: number; value: Promise<{ dirs: string[]; files: ListedFile[] }> }>();
  /** Image sizes read from file headers, by path + mtime. */
  private imageSizes = new Map<string, { width: number; height: number } | null>();
  /** Thumbnails being made, so two tiles asking for the same one share the work. */
  private thumbJobs = new Map<string, Promise<{ data: Buffer; type: 'jpeg' | 'png' } | null>>();
  private thumbWrites = 0;
  private contains(path: string): boolean {
    const rel = relative(this.mediaPath, path);
    return rel !== '..' && !rel.startsWith('..\\') && !rel.startsWith('../') && !isAbsolute(rel);
  }

  constructor(mediaPath: string) {
    this.mediaPath = resolve(mediaPath);
  }

  /**
   * Get the resolved media path currently served.
   */
  getMediaPath(): string {
    return this.mediaPath;
  }

  /**
   * Start the media server. Returns the port it's listening on.
   * If the preferred port is taken (EADDRINUSE), automatically tries up to 10
   * consecutive fallback ports so a port conflict never silently prevents the
   * server from starting.
   */
  start(preferredPort: number = 0): Promise<number> {
    const tryPort = (port: number, remaining: number): Promise<number> =>
      new Promise((resolvePromise, reject) => {
        const srv = createServer((req, res) => {
          void this.handleRequest(req, res).catch(() => {
            if (!res.headersSent) res.writeHead(500);
            res.end();
          });
        });

        srv.once('error', (err: NodeJS.ErrnoException) => {
          srv.close();
          if (err.code === 'EADDRINUSE' && remaining > 0 && port > 0) {
            // Port is taken — try the next one.
            console.warn(`[Media Server] Port ${port} in use, trying ${port + 1}`);
            tryPort(port + 1, remaining - 1)
              .then(resolvePromise)
              .catch(reject);
          } else {
            console.error('[Media Server] Error:', err.message);
            reject(err);
          }
        });

        srv.listen(port, '127.0.0.1', () => {
          this.server = srv;
          const address = srv.address();
          if (address && typeof address !== 'string') {
            this.port = address.port;
            console.log(`[Media Server] Serving ${this.mediaPath} on http://127.0.0.1:${this.port}`);
            resolvePromise(this.port);
          }
        });
      });

    return tryPort(preferredPort, 10);
  }

  /**
   * Stop the media server.
   */
  stop(): Promise<void> {
    return new Promise((resolvePromise) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          this.port = 0;
          console.log('[Media Server] Stopped');
          resolvePromise();
        });
      } else {
        resolvePromise();
      }
    });
  }

  /**
   * Update the media path and restart if running.
   */
  async updatePath(newPath: string): Promise<void> {
    this.mediaPath = resolve(newPath);
    this.listings.clear();
    if (this.server) {
      const currentPort = this.port;
      await this.stop();
      await this.start(currentPort);
    }
  }

  /**
   * Copy files from anywhere on this computer into a folder of the media root — the media
   * browser's upload. Never overwrites: a taken name becomes `name (2).ext`. Only images and
   * videos are accepted, and the target must lie inside the media root.
   */
  async importFiles(sources: string[], subPath: string): Promise<MediaImportResult> {
    const targetDir = subPath ? normalize(join(this.mediaPath, subPath)) : this.mediaPath;
    if (!this.contains(targetDir)) throw new Error('The target folder is outside the media folder');
    if (!(await stat(targetDir).catch(() => null))?.isDirectory()) throw new Error('The target folder does not exist');

    const same = (a: string, b: string) =>
      process.platform === 'win32' ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b);
    const result: MediaImportResult = { copied: [], skipped: [], placed: [] };
    for (const source of sources) {
      const name = basename(source);
      if (!IMPORTABLE_EXTS.has(extname(name).toLowerCase())) {
        result.skipped.push({ name, reason: 'unsupported' });
        continue;
      }
      if (!(await stat(source).catch(() => null))?.isFile()) {
        result.skipped.push({ name, reason: 'not-a-file' });
        continue;
      }
      // Dropped from this very folder: copying would only produce a duplicate.
      if (same(source, join(targetDir, name))) {
        result.skipped.push({ name, reason: 'exists' });
        result.placed.push({ source, name, reused: true });
        continue;
      }
      // The same file was copied here before (same name and size): reuse it rather than make a copy.
      const existing = await stat(join(targetDir, name)).catch(() => null);
      if (existing?.isFile() && existing.size === (await stat(source)).size) {
        result.placed.push({ source, name, reused: true });
        continue;
      }
      const { name: stem, ext } = parsePath(name);
      for (let n = 1; ; n++) {
        const candidate = n === 1 ? name : `${stem} (${n})${ext}`;
        try {
          // COPYFILE_EXCL makes "is the name free?" and the copy one atomic step.
          await copyFile(source, join(targetDir, candidate), fsConstants.COPYFILE_EXCL);
          result.copied.push(candidate);
          result.placed.push({ source, name: candidate, reused: false });
          break;
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'EEXIST' && n < 1000) continue;
          result.skipped.push({ name, reason: 'error', message: (err as Error).message });
          break;
        }
      }
    }
    // The listing is cached for a few seconds; the browser reloads right after an upload.
    this.listings.delete(targetDir);
    return result;
  }

  /** Create a folder inside the media folder (or inside one of its folders). Returns its relative path. */
  async createFolder(subPath: string, name: string): Promise<string> {
    const clean = name.trim();
    if (!clean || /[\\/:*?"<>|]/.test(clean) || clean === '.' || clean === '..') throw new Error('Invalid folder name');
    const parent = subPath ? normalize(join(this.mediaPath, subPath)) : this.mediaPath;
    const target = join(parent, clean);
    if (!this.contains(parent) || !this.contains(target)) throw new Error('The folder is outside the media folder');
    await mkdir(target, { recursive: true });
    this.listings.delete(parent);
    return relative(this.mediaPath, target).split(/[\\/]/).join('/');
  }

  /**
   * Find media files by file name anywhere in the media folder, case-insensitively. Bounded, so a
   * huge folder cannot stall the server: it stops after `limit` matches or 50 000 entries.
   */
  async findByName(name: string, limit = 20): Promise<MediaFindResult[]> {
    const wanted = name.trim().toLocaleLowerCase();
    if (!wanted) return [];
    const found: MediaFindResult[] = [];
    let visited = 0;
    const queue: string[] = [this.mediaPath];
    while (queue.length > 0 && found.length < limit && visited < 50000) {
      const dir = queue.shift()!;
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        visited++;
        if (entry.name.startsWith('.')) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) queue.push(full);
        else if (entry.isFile() && entry.name.toLocaleLowerCase() === wanted) {
          const info = await stat(full).catch(() => null);
          found.push({ path: relative(this.mediaPath, full).split(/[\\/]/).join('/'), size: info?.size ?? 0 });
          if (found.length >= limit) break;
        }
      }
    }
    return found;
  }

  /**
   * Get the base URL for the media server.
   */
  getBaseUrl(): string {
    if (this.port === 0) return '';
    return `http://127.0.0.1:${this.port}`;
  }

  /**
   * Get the port number.
   */
  getPort(): number {
    return this.port;
  }

  /**
   * Handle an incoming HTTP request.
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const origin = req.headers.origin;
    if (origin && corsOrigins().includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, PUT, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length, Last-Modified');
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    const isHead = req.method === 'HEAD';
    // Parse the URL and decode
    const url = new URL(req.url || '/', `http://localhost:${this.port}`);
    const requestedPath = decodeURIComponent(url.pathname);

    // ── /thumb, /meta — the thumbnail cache (PUT only stores a video's grabbed frame and facts) ──
    if (requestedPath === '/thumb' || requestedPath === '/meta') {
      await this.handleThumb(req, res, url, requestedPath === '/meta');
      return;
    }

    if (req.method !== 'GET' && !isHead) {
      res.writeHead(405);
      res.end('Method Not Allowed');
      return;
    }

    // ── /find — files with this exact name anywhere in the media folder ──
    if (requestedPath === '/find') {
      const name = url.searchParams.get('name') || '';
      const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get('limit') || '20', 10) || 20));
      try {
        const results = await this.findByName(name, limit);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ results }));
      } catch {
        res.writeHead(500);
        res.end('Error searching files');
      }
      return;
    }

    // ── /list — non-recursive directory listing with pagination ──
    if (requestedPath === '/list') {
      // If no media path is configured (or it doesn't exist on disk), return
      // 503 so the renderer can show a precise "configure media path" message
      // instead of an empty list / spinner forever.
      if (!this.mediaPath || !(await stat(this.mediaPath).catch(() => null))?.isDirectory()) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'media_path_unset', mediaPath: this.mediaPath }));
        return;
      }
      try {
        const subPath = url.searchParams.get('path') || '';
        const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
        const limit = Math.max(1, Math.min(200, parseInt(url.searchParams.get('limit') || '50', 10) || 50));

        // Resolve and validate target directory
        const targetDir = subPath ? normalize(join(this.mediaPath, subPath)) : this.mediaPath;

        if (!this.contains(targetDir)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }

        if (!(await stat(targetDir).catch(() => null))?.isDirectory()) {
          res.writeHead(404);
          res.end('Not Found');
          return;
        }

        const listing = await this.listDir(targetDir);
        const type = url.searchParams.get('type');
        const query = (url.searchParams.get('q') || '').toLocaleLowerCase();
        const files = listing.files.filter(({ name }) => {
          const ext = extname(name).toLowerCase();
          const kind = DOCUMENT_EXTS.has(ext) ? 'document' : (MIME_TYPES[ext] || '').split('/')[0];
          return (!type || kind === type) && name.toLocaleLowerCase().includes(query);
        });
        // Sorting has to happen before slicing, otherwise every page is only sorted within itself.
        const sort = url.searchParams.get('sort');
        const direction = url.searchParams.get('order') === 'desc' ? -1 : 1;
        if (sort === 'date' || sort === 'size' || direction < 0) {
          const key = sort === 'date' ? 'mtime' : sort === 'size' ? 'size' : null;
          files.sort((a, b) => direction * ((key ? a[key] - b[key] : 0) || collator.compare(a.name, b.name)));
        }
        // Images carry their pixel size, read from the header — the list view shows it without
        // decoding every picture at full size.
        const paginatedFiles = await Promise.all(
          files.slice(offset, offset + limit).map(async (f) => {
            const ext = extname(f.name).toLowerCase();
            if (!(MIME_TYPES[ext] || '').startsWith('image/') || ext === '.svg') return f;
            const size = await this.imageSize(join(targetDir, f.name), f.mtime);
            return size ? { ...f, ...size } : f;
          }),
        );

        const result = {
          dirs: listing.dirs,
          files: paginatedFiles.map((f) => f.name),
          // Older renderers only read `files`; newer ones use the metadata for list view & sorting.
          items: paginatedFiles,
          totalFiles: files.length,
          nextOffset: offset + paginatedFiles.length,
          offset,
          limit,
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch {
        res.writeHead(500);
        res.end('Error listing files');
      }
      return;
    }

    // Resolve and validate the path — prevent directory traversal
    const fullPath = normalize(join(this.mediaPath, requestedPath));
    if (!this.contains(fullPath)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    const fileStat = await stat(fullPath).catch(() => null);
    if (!fileStat?.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(isHead ? '' : 'file_not_found');
      return;
    }
    res.setHeader('Last-Modified', fileStat.mtime.toUTCString());
    // Determine MIME type
    const ext = extname(fullPath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

    // HEAD requests return headers only — used by renderer to probe existence.
    if (isHead) {
      res.writeHead(200, {
        'Content-Length': fileStat.size,
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
      });
      res.end();
      return;
    }

    // Handle range requests for video streaming
    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      const start = match?.[1] ? Number(match[1]) : Math.max(0, fileStat.size - Number(match?.[2]));
      const end = match?.[1] && match[2] ? Math.min(Number(match[2]), fileStat.size - 1) : fileStat.size - 1;
      if (
        !match ||
        (!match[1] && !match[2]) ||
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= fileStat.size
      ) {
        res.writeHead(416, { 'Content-Range': 'bytes */' + fileStat.size });
        res.end();
        return;
      }
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileStat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': mimeType,
      });

      this.stream(fullPath, res, { start, end });
    } else {
      res.writeHead(200, {
        'Content-Length': fileStat.size,
        'Content-Type': mimeType,
        // A PDF or PowerPoint is edited and saved again during the week; an hour-old copy
        // from the browser's cache would be the previous version.
        'Cache-Control': DOCUMENT_EXTS.has(ext) ? 'no-cache' : 'public, max-age=3600',
        'Accept-Ranges': 'bytes',
      });

      this.stream(fullPath, res);
    }
  }

  /**
   * List immediate contents of a directory (non-recursive).
   * Returns subdirectory names and media file names (no PDFs).
   */
  private stream(path: string, res: ServerResponse, range?: { start: number; end: number }): void {
    const stream = createReadStream(path, range);
    res.on('close', () => stream.destroy());
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }

  private async imageSize(path: string, mtime: number): Promise<{ width: number; height: number } | null> {
    const key = `${path}|${mtime}`;
    if (this.imageSizes.has(key)) return this.imageSizes.get(key)!;
    let size: { width: number; height: number } | null = null;
    try {
      const handle = await open(path, 'r');
      try {
        // JPEG's EXIF block can come before the size; 256 KB covers real-world files.
        const { buffer, bytesRead } = await handle.read(Buffer.alloc(256 * 1024), 0, 256 * 1024, 0);
        size = imageSizeFromHeader(buffer.subarray(0, bytesRead));
      } finally {
        await handle.close();
      }
    } catch {
      // unreadable: no size
    }
    this.imageSizes.set(key, size);
    if (this.imageSizes.size > 4000) this.imageSizes.delete(this.imageSizes.keys().next().value!);
    return size;
  }

  private thumbKey(path: string, s: { mtimeMs: number; size: number }, suffix: string): string {
    return createHash('sha1').update(`${path}|${s.mtimeMs}|${s.size}|${suffix}`).digest('hex');
  }

  private async handleThumb(req: IncomingMessage, res: ServerResponse, url: URL, meta: boolean): Promise<void> {
    const rel = url.searchParams.get('path') || '';
    const full = normalize(join(this.mediaPath, rel));
    const fileStat = rel && thumbDir && this.contains(full) ? await stat(full).catch(() => null) : null;
    if (!fileStat?.isFile()) {
      res.writeHead(404);
      res.end();
      return;
    }
    const isVideo = (MIME_TYPES[extname(full).toLowerCase()] || '').startsWith('video/');
    const put = req.method === 'PUT';
    if ((put && !isVideo) || (!put && req.method !== 'GET' && req.method !== 'HEAD')) {
      res.writeHead(405);
      res.end();
      return;
    }

    if (meta) {
      const file = join(thumbDir, this.thumbKey(full, fileStat, 'meta') + '.json');
      if (put) {
        const body = await readBody(req, 4096);
        let facts: Record<string, unknown> | null = null;
        try {
          facts = body ? (JSON.parse(body.toString('utf8')) as Record<string, unknown>) : null;
        } catch {
          facts = null;
        }
        const clean = Object.fromEntries(
          ['duration', 'width', 'height', 'thumb'].filter((k) => typeof facts?.[k] === 'number').map((k) => [k, facts![k]]),
        );
        if (Object.keys(clean).length === 0) {
          res.writeHead(400);
          res.end();
          return;
        }
        await this.storeThumbFile(file, Buffer.from(JSON.stringify(clean)));
        res.writeHead(204);
        res.end();
        return;
      }
      const cached = await readFile(file).catch(() => null);
      if (!cached) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      res.end(cached);
      return;
    }

    const requested = parseInt(url.searchParams.get('w') || '320', 10) || 320;
    const width = THUMB_WIDTHS.find((w) => w >= requested) ?? THUMB_WIDTHS[THUMB_WIDTHS.length - 1];
    const key = this.thumbKey(full, fileStat, String(width));
    const send = (data: Buffer, type: 'jpeg' | 'png') => {
      res.writeHead(200, { 'Content-Type': `image/${type}`, 'Content-Length': data.length, 'Cache-Control': 'max-age=86400' });
      res.end(req.method === 'HEAD' ? undefined : data);
    };

    if (put) {
      const body = await readBody(req, 2 * 1024 * 1024);
      if (!body || body[0] !== 0xff || body[1] !== 0xd8) {
        res.writeHead(400);
        res.end();
        return;
      }
      await this.storeThumbFile(join(thumbDir, key + '.jpeg'), body);
      res.writeHead(204);
      res.end();
      return;
    }

    // One job per key covers reading the cache AND making + storing a missing one, so tiles asking
    // at the same moment never make the same thumbnail twice.
    let job = this.thumbJobs.get(key);
    if (!job) {
      const make = isVideo ? null : thumbnailer;
      job = (async () => {
        for (const type of ['jpeg', 'png'] as const) {
          const cached = await readFile(join(thumbDir, `${key}.${type}`)).catch(() => null);
          if (cached) return { data: cached, type };
        }
        const made = make ? await make(full, width).catch(() => null) : null;
        if (made) await this.storeThumbFile(join(thumbDir, `${key}.${made.type}`), made.data);
        return made;
      })();
      this.thumbJobs.set(key, job);
      void job.finally(() => this.thumbJobs.delete(key));
    }
    const result = await job;
    if (!result) {
      res.writeHead(404);
      res.end();
      return;
    }
    send(result.data, result.type);
  }

  /** Write into the cache, now and then trimming it to the newest files. */
  private async storeThumbFile(file: string, data: Buffer): Promise<void> {
    try {
      await mkdir(thumbDir, { recursive: true });
      await writeFile(file, data);
    } catch {
      return;
    }
    if (++this.thumbWrites % 100 !== 1) return;
    try {
      const names = await readdir(thumbDir);
      if (names.length <= MAX_THUMB_FILES) return;
      const dated = await Promise.all(
        names.map(async (name) => ({ name, at: (await stat(join(thumbDir, name)).catch(() => null))?.mtimeMs ?? 0 })),
      );
      dated.sort((a, b) => a.at - b.at);
      for (const { name } of dated.slice(0, names.length - Math.floor(MAX_THUMB_FILES * 0.8)))
        await unlink(join(thumbDir, name)).catch(() => undefined);
    } catch {
      /* the cache is only a cache */
    }
  }

  private listDir(dir: string): Promise<{ dirs: string[]; files: ListedFile[] }> {
    const cached = this.listings.get(dir);
    if (cached && Date.now() - cached.at < 5000) return cached.value;
    const value = readdir(dir, { withFileTypes: true }).then(async (entries) => ({
      dirs: entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort(collator.compare),
      files: (
        await Promise.all(
          entries
            .filter((e) => e.isFile() && LISTABLE_EXTS.has(extname(e.name).toLowerCase()))
            .map(async (e) => {
              // A file removed between readdir and stat simply drops out of the listing.
              const s = await stat(join(dir, e.name)).catch(() => null);
              return s ? { name: e.name, size: s.size, mtime: s.mtimeMs } : null;
            }),
        )
      )
        .filter((f): f is ListedFile => !!f)
        .sort((a, b) => collator.compare(a.name, b.name)),
    }));
    this.listings.set(dir, { at: Date.now(), value });
    if (this.listings.size > 32) this.listings.delete(this.listings.keys().next().value!);
    void value.catch(() => {
      if (this.listings.get(dir)?.value === value) this.listings.delete(dir);
    });
    return value;
  }
}
