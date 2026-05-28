/**
 * Local media server — Electron main process (§7.2).
 * Serves files from a configurable local directory via HTTP on localhost.
 */
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http';
import { join, extname, resolve, normalize } from 'path';
import { createReadStream, existsSync, statSync, readdirSync } from 'fs';

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

export class LocalMediaServer {
  private server: Server | null = null;
  private port: number = 0;
  private mediaPath: string;

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
        const srv = createServer((req, res) => this.handleRequest(req, res));

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
    if (this.server) {
      const currentPort = this.port;
      await this.stop();
      await this.start(currentPort);
    }
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
  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const isHead = req.method === 'HEAD';
    if (req.method !== 'GET' && !isHead) {
      res.writeHead(405);
      res.end('Method Not Allowed');
      return;
    }

    // CORS headers for local use
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD');

    // Parse the URL and decode
    const url = new URL(req.url || '/', `http://localhost:${this.port}`);
    const requestedPath = decodeURIComponent(url.pathname);

    // ── /list — non-recursive directory listing with pagination ──
    if (requestedPath === '/list') {
      // If no media path is configured (or it doesn't exist on disk), return
      // 503 so the renderer can show a precise "configure media path" message
      // instead of an empty list / spinner forever.
      if (!this.mediaPath || !existsSync(this.mediaPath)) {
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

        if (!targetDir.startsWith(this.mediaPath)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }

        if (!existsSync(targetDir)) {
          res.writeHead(404);
          res.end('Not Found');
          return;
        }

        const listing = this.listDir(targetDir);
        const paginatedFiles = listing.files.slice(offset, offset + limit);

        const result = {
          dirs: listing.dirs,
          files: paginatedFiles,
          totalFiles: listing.files.length,
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
    if (!fullPath.startsWith(this.mediaPath)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    // Check if file exists
    if (!existsSync(fullPath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(isHead ? '' : 'file_not_found');
      return;
    }

    // Get file stats
    const stat = statSync(fullPath);
    if (!stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(isHead ? '' : 'not_a_file');
      return;
    }

    // Determine MIME type
    const ext = extname(fullPath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

    // HEAD requests return headers only — used by renderer to probe existence.
    if (isHead) {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
      });
      res.end();
      return;
    }

    // Handle range requests for video streaming
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': mimeType,
      });

      createReadStream(fullPath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=3600',
        'Accept-Ranges': 'bytes',
      });

      createReadStream(fullPath).pipe(res);
    }
  }

  /**
   * List immediate contents of a directory (non-recursive).
   * Returns subdirectory names and media file names (no PDFs).
   */
  private listDir(dir: string): { dirs: string[]; files: string[] } {
    const dirs: string[] = [];
    const files: string[] = [];
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          dirs.push(entry.name);
        } else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase();
          if (LISTABLE_EXTS.has(ext)) {
            files.push(entry.name);
          }
        }
      }
    } catch {
      /* skip unreadable dirs */
    }
    dirs.sort((a, b) => a.localeCompare(b));
    files.sort((a, b) => a.localeCompare(b));
    return { dirs, files };
  }
}
