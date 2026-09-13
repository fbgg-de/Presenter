/**
 * Local media server — Electron main process (§7.2).
 * Serves files from a configurable local directory via HTTP on localhost.
 */
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http';
import { join, extname, resolve, normalize, relative, isAbsolute, basename, parse as parsePath } from 'path';
import { createReadStream } from 'fs';
import { stat, readdir, copyFile, constants as fsConstants } from 'fs/promises';

/**
 * What the media browser can show, and so what an import accepts. `.ogg` is left out on
 * purpose: it is served as audio, so a copied `.ogg` would never appear under Videos.
 */
export const IMPORTABLE_EXTS = new Set([
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
]);

export interface MediaImportResult {
  /** Names as written into the folder — renamed to `name (2).ext` where the name was taken. */
  copied: string[];
  skipped: { name: string; reason: 'unsupported' | 'not-a-file' | 'exists' | 'error'; message?: string }[];
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
  '.pdf': 'application/pdf',
};

// Extensions included in folder listings (no PDFs in media browser)
const LISTABLE_EXTS = new Set([
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
]);

interface ListedFile {
  name: string;
  size: number;
  /** Last modification, ms since epoch. */
  mtime: number;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export class LocalMediaServer {
  private server: Server | null = null;
  private port: number = 0;
  private mediaPath: string;
  private listings = new Map<string, { at: number; value: Promise<{ dirs: string[]; files: ListedFile[] }> }>();
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
    const result: MediaImportResult = { copied: [], skipped: [] };
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
        continue;
      }
      const { name: stem, ext } = parsePath(name);
      for (let n = 1; ; n++) {
        const candidate = n === 1 ? name : `${stem} (${n})${ext}`;
        try {
          // COPYFILE_EXCL makes "is the name free?" and the copy one atomic step.
          await copyFile(source, join(targetDir, candidate), fsConstants.COPYFILE_EXCL);
          result.copied.push(candidate);
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
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length, Last-Modified');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    const isHead = req.method === 'HEAD';
    if (req.method !== 'GET' && !isHead) {
      res.writeHead(405);
      res.end('Method Not Allowed');
      return;
    }

    // Parse the URL and decode
    const url = new URL(req.url || '/', `http://localhost:${this.port}`);
    const requestedPath = decodeURIComponent(url.pathname);

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
          const mime = MIME_TYPES[extname(name).toLowerCase()] || '';
          return (!type || mime.startsWith(type + '/')) && name.toLocaleLowerCase().includes(query);
        });
        // Sorting has to happen before slicing, otherwise every page is only sorted within itself.
        const sort = url.searchParams.get('sort');
        const direction = url.searchParams.get('order') === 'desc' ? -1 : 1;
        if (sort === 'date' || sort === 'size' || direction < 0) {
          const key = sort === 'date' ? 'mtime' : sort === 'size' ? 'size' : null;
          files.sort((a, b) => direction * ((key ? a[key] - b[key] : 0) || collator.compare(a.name, b.name)));
        }
        const paginatedFiles = files.slice(offset, offset + limit);

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
        'Cache-Control': 'public, max-age=3600',
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
