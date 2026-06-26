<?php
/**
 * Presenter Live Viewer
 *
 * A standalone display page that connects to the WebSocket relay server and
 * shows the currently active presenter block text in real time.
 *
 * Usage: viewer.php?token=<viewer_token>
 *
 * This file is self-contained — no database connection needed.
 * The WebSocket relay server resolves the token to an account automatically.
 * Edit the CONFIGURATION block below before deploying.
 */

// ══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION — edit these values before deploying
// ══════════════════════════════════════════════════════════════════════════════

// WebSocket relay server
// Set 'wss' => true when the server is behind a TLS-terminating reverse proxy.
// 'path' is optional; use a sub-path (e.g. '/ws') when the WS server shares
// the same hostname as the PHP app and is routed by path in the reverse proxy.
const WS_HOST = [
    'wss'  => true,
    'host' => 'presenter.example.com',
    'port' => 443,
    'path' => '/ws',
];

// ══════════════════════════════════════════════════════════════════════════════

// ── Helper: render a minimal error page ───────────────────────────────────────
function renderError(string $title, string $message): void
{
    echo '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>' . htmlspecialchars($title) . '</title>';
    echo '<meta name="viewport" content="width=device-width,initial-scale=1">';
    echo '<style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0a0a0a;color:#fff;font-family:sans-serif;text-align:center;padding:2rem}';
    echo 'h1{font-size:1.4rem;margin-bottom:.75rem;color:#e05252}p{color:rgba(255,255,255,.55);font-size:.9rem}</style></head><body>';
    echo '<div><h1>' . htmlspecialchars($title) . '</h1><p>' . htmlspecialchars($message) . '</p></div></body></html>';
}

// ── Validate token format ─────────────────────────────────────────────────────

$token = trim($_GET['token'] ?? '');

if (empty($token)) {
    http_response_code(400);
    renderError('Missing Token', 'Please provide a viewer token via ?token=…');
    exit;
}

// Sanitise: only allow hex characters (tokens are 64 hex chars)
if (!preg_match('/^[0-9a-f]{64}$/', $token)) {
    http_response_code(400);
    renderError('Invalid Token', 'The provided token format is not valid.');
    exit;
}

// ── Build WS URL ──────────────────────────────────────────────────────────────

$wsUrl = '';
if (!empty(WS_HOST['host'])) {
    $scheme = !empty(WS_HOST['wss']) ? 'wss' : 'ws';
    $host   = WS_HOST['host'];
    $port   = (int) (WS_HOST['port'] ?? 443);
    $path   = WS_HOST['path'] ?? '';
    $path   = ($path && $path !== '/') ? $path : '';
    $wsUrl  = "{$scheme}://{$host}:{$port}{$path}";
}

if (empty($wsUrl)) {
    http_response_code(503);
    renderError('Not Configured', 'The WebSocket relay server is not configured on this instance.');
    exit;
}

// ── Render viewer page ────────────────────────────────────────────────────────

$tokenJson = json_encode($token);
$wsUrlJson = json_encode($wsUrl);

?><!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Presenter Live View</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #0a0a0a;
      --text: #ffffff;
      --meta: rgba(255,255,255,0.45);
      --accent: #4a90d9;
      --error: #e05252;
      --fade: 0.35s ease;
    }

    html, body {
      width: 100%;
      min-height: 100%;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      overflow-y: auto;
      overflow-x: hidden;
    }

    /* ── Status bar ──────────────────────────────────────────────────────────── */
    #status-bar {
      position: sticky;
      top: 0;
      width: 100%;
      height: 36px;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 16px;
      background: rgba(10,10,10,0.85);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      font-size: 12px;
      color: var(--meta);
      z-index: 100;
      transition: opacity var(--fade);
    }
    #status-bar.hide { opacity: 0; pointer-events: none; }

    #status-dot {
      width: 9px; height: 9px;
      border-radius: 50%;
      background: #555;
      flex-shrink: 0;
      transition: background 0.4s;
    }
    #status-dot.connecting { background: #f5a623; animation: pulse 1.2s ease-in-out infinite; }
    #status-dot.connected  { background: #4caf50; animation: none; }
    #status-dot.error      { background: var(--error); animation: none; }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.3; }
    }

    #show-title-bar { margin-left: auto; }

    /* ── Black-screen overlay ────────────────────────────────────────────────── */
    #black-overlay {
      position: fixed;
      inset: 0;
      background: #000;
      z-index: 50;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.4s ease;
    }
    #black-overlay.active { opacity: 1; pointer-events: auto; }

    /* ── Main content area ───────────────────────────────────────────────────── */
    #stage {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      min-height: calc(100vh - 36px);
      padding: 5vh 6%;
      text-align: center;
    }

    /* Meta info (show / song title) */
    #meta {
      font-size: clamp(12px, 1.8vw, 18px);
      color: var(--meta);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      margin-bottom: 0.8em;
      min-height: 1.4em;
      transition: opacity var(--fade);
    }

    /* Block name */
    #block-name {
      font-size: clamp(11px, 1.5vw, 16px);
      color: var(--accent);
      letter-spacing: 0.14em;
      text-transform: uppercase;
      margin-bottom: 1.2em;
      min-height: 1.2em;
    }

    /* Lyrics — large enough to read at a distance */
    #lyrics {
      font-size: clamp(28px, 6vw, 96px);
      line-height: 1.55;
      font-weight: 300;
      letter-spacing: 0.02em;
      max-width: 1400px;
      width: 100%;
      transition: opacity var(--fade);
    }

    #lyrics.fade-out { opacity: 0; }

    .line { display: block; }
    .line.translation {
      color: var(--meta);
      font-size: 0.65em;
      margin-top: 0.2em;
    }

    /* Waiting / empty state */
    #waiting {
      font-size: clamp(14px, 2vw, 22px);
      color: var(--meta);
      margin-top: 3em;
      display: none;
    }
    #waiting.visible { display: block; }
  </style>
</head>
<body>
  <div id="status-bar">
    <div id="status-dot"></div>
    <span id="status-text">Connecting…</span>
    <span id="show-title-bar"></span>
  </div>

  <div id="black-overlay"></div>

  <div id="stage">
    <div id="meta"></div>
    <div id="block-name"></div>
    <div id="lyrics"></div>
    <div id="waiting">Waiting for presenter…</div>
  </div>

  <script>
    (function () {
      'use strict';

      const TOKEN     = <?= $tokenJson ?>;
      const WS_URL    = <?= $wsUrlJson ?>;
      const RECONNECT = 3000;

      // ── DOM refs ────────────────────────────────────────────────────────────
      const dot         = document.getElementById('status-dot');
      const statusText  = document.getElementById('status-text');
      const showBar     = document.getElementById('show-title-bar');
      const metaEl      = document.getElementById('meta');
      const blockNameEl = document.getElementById('block-name');
      const lyricsEl    = document.getElementById('lyrics');
      const waitingEl   = document.getElementById('waiting');
      const blackOver   = document.getElementById('black-overlay');
      const statusBar   = document.getElementById('status-bar');

      let ws        = null;
      let stopped   = false;
      let hideTimer = null;

      // ── Status helpers ──────────────────────────────────────────────────────
      function setStatus(state, text) {
        dot.className          = state;
        statusText.textContent = text;
        clearTimeout(hideTimer);
        if (state === 'connected') {
          hideTimer = setTimeout(() => statusBar.classList.add('hide'), 5000);
        } else {
          statusBar.classList.remove('hide');
        }
      }

      // ── Render ──────────────────────────────────────────────────────────────
      function render(data) {
        blackOver.classList.toggle('active', !!data.isBlack);

        const lines     = Array.isArray(data.blockLines) ? data.blockLines : [];
        const blockName = data.blockName || '';
        const songTitle = data.songTitle || '';
        const showTitle = data.showTitle || '';
        const meta      = [showTitle, songTitle].filter(Boolean).join('  ·  ');

        showBar.textContent     = showTitle;
        metaEl.textContent      = meta;
        blockNameEl.textContent = blockName;

        lyricsEl.classList.add('fade-out');
        setTimeout(function () {
          lyricsEl.innerHTML = '';
          if (lines.length > 0) {
            lines.forEach(function (line) {
              const span       = document.createElement('span');
              span.className   = 'line' + (line.language ? ' translation' : '');
              span.textContent = line.text || '';
              lyricsEl.appendChild(span);
            });
            waitingEl.classList.remove('visible');
            lyricsEl.style.opacity = '';
          } else {
            waitingEl.classList.add('visible');
          }
          lyricsEl.classList.remove('fade-out');
        }, 200);
      }

      // ── WebSocket ───────────────────────────────────────────────────────────
      function connect() {
        if (stopped) return;
        setStatus('connecting', 'Connecting…');

        try {
          ws = new WebSocket(WS_URL);
        } catch (e) {
          setStatus('error', 'Connection failed.');
          setTimeout(connect, RECONNECT);
          return;
        }

        ws.onopen = function () {
          if (stopped) { ws.close(); return; }
          // Send token — the relay server resolves it to the account number
          ws.send(JSON.stringify({ action: 'auth', token: TOKEN }));
        };

        ws.onmessage = function (event) {
          var msg;
          try { msg = JSON.parse(event.data); } catch { return; }

          if (msg.type === 'auth_ok') {
            setStatus('connected', 'Connected');
            waitingEl.classList.add('visible');
            return;
          }

          if (msg.type === 'auth_error') {
            setStatus('error', msg.error || 'Authentication failed.');
            stopped = true;   // invalid token — do not reconnect
            ws.close();
            return;
          }

          if (msg.action === 'musician_sync' && msg.data) {
            render(msg.data);
          }
        };

        ws.onerror = function () {
          if (!stopped) setStatus('error', 'Connection error.');
        };

        ws.onclose = function () {
          if (stopped) return;
          setStatus('connecting', 'Reconnecting…');
          setTimeout(connect, RECONNECT);
        };
      }

      connect();

      // Reconnect when tab becomes visible again
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden && (!ws || ws.readyState > 1)) {
          stopped = false;
          connect();
        }
      });
    })();
  </script>
</body>
</html>
