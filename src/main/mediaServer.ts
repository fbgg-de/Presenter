/**
 * Local media server — Electron main process (§7.2).
 * Serves files from a configurable local directory via HTTP on localhost.
 */
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http';
import { join, extname, resolve, normalize } from 'path';
import { createReadStream, existsSync, statSync } from 'fs';

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

export class LocalMediaServer {
  private server: Server | null = null;
  private port: number = 0;
  private mediaPath: string;

  constructor(mediaPath: string) {
    this.mediaPath = resolve(mediaPath);
  }

  /**
   * Start the media server. Returns the port it's listening on.
   */
  start(preferredPort: number = 0): Promise<number> {
    return new Promise((resolvePromise, reject) => {
      this.server = createServer((req, res) => this.handleRequest(req, res));

      this.server.on('error', (err) => {
        console.error('[Media Server] Error:', err.message);
        reject(err);
      });

      this.server.listen(preferredPort, '127.0.0.1', () => {
        const address = this.server!.address();
        if (address && typeof address !== 'string') {
          this.port = address.port;
          console.log(`[Media Server] Serving ${this.mediaPath} on http://127.0.0.1:${this.port}`);
          resolvePromise(this.port);
        }
      });
    });
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
    // Only allow GET requests
    if (req.method !== 'GET') {
      res.writeHead(405);
      res.end('Method Not Allowed');
      return;
    }

    // CORS headers for local use
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    // Parse the URL and decode
    const url = new URL(req.url || '/', `http://127.0.0.1:${this.port}`);
    const requestedPath = decodeURIComponent(url.pathname);

    // Resolve and validate the path — prevent directory traversal
    const fullPath = normalize(join(this.mediaPath, requestedPath));
    if (!fullPath.startsWith(this.mediaPath)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    // Check if file exists
    if (!existsSync(fullPath)) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    // Get file stats
    const stat = statSync(fullPath);
    if (!stat.isFile()) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    // Determine MIME type
    const ext = extname(fullPath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

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
      });

      createReadStream(fullPath).pipe(res);
    }
  }
}
