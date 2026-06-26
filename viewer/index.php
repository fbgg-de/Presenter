<?php
/**
 * Presenter Live Viewer
 *
 * Connects to the WebSocket relay server and shows the currently active
 * presenter block text in real time.
 *
 * This file is self-contained — no database connection needed.
 * Edit the CONFIGURATION block below before deploying.
 */

// ══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION — edit these values before deploying
// ══════════════════════════════════════════════════════════════════════════════

// Viewer token — copy it from the account settings in the presenter admin panel
const TOKEN = '14b368400c7105bb83e01bdc0c73bf6e89418a559b5be994f35d7d532cc0932e';

// WebSocket relay server
// Set 'wss' => true when the server is behind a TLS-terminating reverse proxy.
// 'path' is optional; use a sub-path (e.g. '/ws') when the WS server shares
// the same hostname as the PHP app and is routed by path in the reverse proxy.
const WS_HOST = [
    'wss'  => true,
    'host' => 'presenter.intranet.efsh.de',
    'port' => 443,
    'path' => '/',
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

if (!preg_match('/^[0-9a-f]{64}$/', TOKEN)) {
    http_response_code(503);
    renderError('Not Configured', 'Please set a valid viewer token in the configuration section of this file.');
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
    renderError('Not Configured', 'The WebSocket relay server is not configured in this file.');
    exit;
}

// ── Render viewer page ────────────────────────────────────────────────────────

$tokenJson  = json_encode(TOKEN);
$wsUrlJson  = json_encode($wsUrl);
$debugMode  = isset($_GET['debug']);

?><!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Presenter Live View</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@700&display=swap" rel="stylesheet">
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
      font-family: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      overflow-y: auto;
      overflow-x: hidden;
    }

    /* ── Status bar (connection indicator only, top) ─────────────────────────── */
    #status-bar {
      position: absolute;
      bottom: 0;
      width: 100%;
      height: 32px;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 16px;
      background: rgba(10,10,10,0.85);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      font-size: 11px;
      color: var(--meta);
      z-index: 100;
      transition: opacity var(--fade);
    }
    #status-bar.hide { opacity: 0; pointer-events: none; }

    #status-dot {
      width: 8px; height: 8px;
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
      justify-content: center;
      min-height: calc(100vh - 32px - 28px); /* viewport minus status-bar minus info-bar */
      padding: 3vh 0;
      text-align: center;
    }

    /* Lyrics — large, bold, tight */
    #lyrics {
      font-size: clamp(28px, 4.5vw, 96px);
      line-height: 1.25;
      font-weight: 700;
      letter-spacing: 0.01em;
      max-width: 1400px;
      width: 100%;
      transition: opacity var(--fade);
    }

    #lyrics.fade-out { opacity: 0; }

    .line { display: block; }
    .line.translation {
      color: var(--meta);
      font-size: 0.6em;
      font-weight: 400;
      margin-top: 0.15em;
    }

    /* Waiting / empty state */
    #waiting {
      font-size: clamp(14px, 2vw, 20px);
      font-weight: 400;
      color: var(--meta);
      display: none;
    }
    #waiting.visible { display: block; }

    /* ── Info bar — one slim row at the bottom ───────────────────────────────── */
    #info-bar {
      position: sticky;
      bottom: 0;
      width: 100%;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 0 16px;
      background: rgba(10,10,10,0.85);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      font-size: 11px;
      color: var(--meta);
      letter-spacing: 0.05em;
      text-transform: uppercase;
      z-index: 100;
    }
    #info-bar .separator { opacity: 0.3; }
    #info-bar #block-name { color: var(--accent); }

    /* Debug log */
    #debug-log {
      position: fixed;
      bottom: 28px; left: 0; right: 0;
      max-height: 180px;
      overflow-y: auto;
      background: rgba(0,0,0,0.82);
      backdrop-filter: blur(6px);
      font-family: 'Courier New', monospace;
      font-size: 11px;
      color: rgba(255,255,255,0.65);
      padding: 6px 12px;
      z-index: 200;
      display: none;
    }
    #debug-log.visible { display: block; }
    #debug-log .entry { padding: 1px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
    #debug-log .entry.warn  { color: #f5a623; }
    #debug-log .entry.error { color: #e05252; }
    #debug-log .entry.ok    { color: #4caf50; }
    #debug-toggle {
      position: fixed;
      bottom: 32px; right: 12px;
      font-size: 10px;
      color: rgba(255,255,255,0.2);
      cursor: pointer;
      z-index: 201;
      user-select: none;
    }
    #debug-toggle:hover { color: rgba(255,255,255,0.5); }
  </style>
</head>
<body>
  <div id="status-bar">
    <div id="status-dot"></div>
    <span id="status-text">Connecting…</span>
  </div>

  <div id="black-overlay"></div>

  <div id="stage">
    <div id="lyrics"></div>
    <div id="waiting">Waiting for presenter…</div>
  </div>

  <!-- Info bar: show · song · block — one slim row at the bottom -->
  <div id="info-bar">
    <span id="meta-show"></span>
    <span class="separator" id="sep-show" style="display:none">·</span>
    <span id="meta-song"></span>
    <span class="separator" id="sep-block" style="display:none">·</span>
    <span id="block-name"></span>
  </div>

  <div id="debug-log"></div>
  <?php if ($debugMode): ?>
  <span id="debug-toggle">debug</span>
  <?php endif; ?>

  <script>
    (function () {
      'use strict';

      const TOKEN     = <?= $tokenJson ?>;
      const WS_URL    = <?= $wsUrlJson ?>;
      const RECONNECT = 3000;

      // ── DOM refs ────────────────────────────────────────────────────────────
      const dot         = document.getElementById('status-dot');
      const statusText  = document.getElementById('status-text');
      const metaShow    = document.getElementById('meta-show');
      const metaSong    = document.getElementById('meta-song');
      const sepShow     = document.getElementById('sep-show');
      const sepBlock    = document.getElementById('sep-block');
      const blockNameEl = document.getElementById('block-name');
      const lyricsEl    = document.getElementById('lyrics');
      const waitingEl   = document.getElementById('waiting');
      const blackOver   = document.getElementById('black-overlay');
      const statusBar   = document.getElementById('status-bar');
      const debugLog    = document.getElementById('debug-log');
      const debugToggle = document.getElementById('debug-toggle');

      const DEBUG = <?= $debugMode ? 'true' : 'false' ?>;

      // Auto-show debug panel when ?debug is present
      if (DEBUG) debugLog.classList.add('visible');

      let ws             = null;
      let stopped        = false;  // transient stop (reconnects after visibility change)
      let permanentStop  = false;  // permanent stop (invalid token — never reconnect)
      let hideTimer      = null;
      let reconnectCount = 0;

      // ── Debug log ───────────────────────────────────────────────────────────
      if (debugToggle) {
        debugToggle.addEventListener('click', () => debugLog.classList.toggle('visible'));
      }

      function dbg(msg, level) {
        if (!DEBUG) return;
        const ts  = new Date().toISOString().slice(11, 23);
        const el  = document.createElement('div');
        el.className = 'entry' + (level ? ' ' + level : '');
        el.textContent = '[' + ts + '] ' + msg;
        debugLog.prepend(el);
        // keep at most 80 entries
        while (debugLog.children.length > 80) debugLog.lastChild.remove();
        console.log('[Viewer]', msg);
      }

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

        // Info bar — show · song · block
        metaShow.textContent    = showTitle;
        metaSong.textContent    = songTitle;
        blockNameEl.textContent = blockName;
        sepShow.style.display   = (showTitle && songTitle)  ? '' : 'none';
        sepBlock.style.display  = ((showTitle || songTitle) && blockName) ? '' : 'none';

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
        if (permanentStop || stopped) return;
        reconnectCount++;
        dbg('Connecting to ' + WS_URL + ' (attempt #' + reconnectCount + ')');
        setStatus('connecting', 'Connecting…');

        try {
          ws = new WebSocket(WS_URL);
        } catch (e) {
          dbg('WebSocket constructor threw: ' + e.message, 'error');
          setStatus('error', 'Connection failed: ' + e.message);
          setTimeout(connect, RECONNECT);
          return;
        }

        ws.onopen = function () {
          if (permanentStop || stopped) { ws.close(); return; }
          dbg('Socket open — sending auth token');
          ws.send(JSON.stringify({ action: 'auth', token: TOKEN }));
        };

        ws.onmessage = function (event) {
          var msg;
          try { msg = JSON.parse(event.data); } catch (e) {
            dbg('Non-JSON message: ' + event.data.slice(0, 100), 'warn');
            return;
          }

          dbg('← ' + JSON.stringify(msg).slice(0, 120));

          if (msg.type === 'auth_ok') {
            dbg('Authenticated — account ' + msg.account, 'ok');
            setStatus('connected', 'Connected');
            waitingEl.classList.add('visible');
            return;
          }

          if (msg.type === 'auth_error') {
            const errText = msg.error || 'Authentication failed.';
            dbg('Auth error (permanent): ' + errText, 'error');
            setStatus('error', errText);
            permanentStop = true;   // invalid token — never reconnect
            ws.close();
            return;
          }

          if (msg.type === 'error') {
            dbg('Server error: ' + (msg.error || '(no message)'), 'warn');
            setStatus('error', msg.error || 'Server error');
            return;
          }

          if (msg.action === 'musician_sync' && msg.data) {
            dbg('Sync received — block: ' + (msg.data.blockName || '(empty)'), 'ok');
            render(msg.data);
          }
        };

        ws.onerror = function (e) {
          dbg('Socket error event fired', 'error');
          if (!permanentStop) setStatus('error', 'Connection error — retrying…');
        };

        ws.onclose = function (e) {
          dbg('Socket closed — code ' + e.code + ' reason: ' + (e.reason || '(none)'),
              e.code === 4003 || e.code === 4002 ? 'error' : 'warn');
          if (permanentStop) return;
          if (stopped) return;
          setStatus('connecting', 'Reconnecting… (#' + reconnectCount + ')');
          setTimeout(connect, RECONNECT);
        };
      }

      dbg('Page loaded — WS_URL: ' + WS_URL);
      dbg('Token prefix: ' + TOKEN.slice(0, 8) + '…');
      connect();

      // Reconnect when tab becomes visible again
      document.addEventListener('visibilitychange', function () {
        if (permanentStop) return;
        if (!document.hidden && (!ws || ws.readyState > 1)) {
          stopped = false;
          dbg('Tab visible — reconnecting');
          connect();
        }
      });

      // Double-click anywhere → toggle fullscreen
      document.addEventListener('dblclick', function () {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(function (err) {
            dbg('Fullscreen request failed: ' + err.message, 'warn');
          });
        } else {
          document.exitFullscreen();
        }
      });
    })();
  </script>
</body>
</html>
