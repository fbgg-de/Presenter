/**
 * Mock backend — stands in for the PHP API so the frontend can be run and inspected without
 * PHP, MySQL or a real account. Speaks the same shapes as `api/*.php` (plain JSON, no envelope)
 * on the same paths, so the Vite dev proxy forwards to it unchanged.
 *
 *   node test/mock-backend/server.mjs         # this alone, on :8000
 *   npm run dev:mock                          # same thing
 *   npm run dev:web:mock                      # mock backend + Vite dev server together
 *
 * It is a fixture server, not a simulator: reads return data from `fixtures.mjs`, writes are
 * acknowledged and kept in memory for the lifetime of the process (so a rename or delete
 * sticks until restart) but nothing is persisted or validated. Anything it does not know
 * answers `{}` — enough to keep the UI from erroring on endpoints a given screen ignores.
 *
 * Add an endpoint by extending `handlers` below; add data by editing `fixtures.mjs`.
 */
import { createServer } from 'node:http';
import * as fixtures from './fixtures.mjs';

const PORT = Number(process.env.MOCK_PORT ?? 8000);

/** Mutable copies, so writes within one run are visible to later reads. */
const state = {
  songs: structuredClone(fixtures.songs),
  songDetails: structuredClone(fixtures.songDetails),
  shows: structuredClone(fixtures.shows),
  setLists: structuredClone(fixtures.setLists),
  /** Viewer token, minted on POST /rest/AccountTokens. Null until one is generated. */
  viewerToken: null,
};

/** GET /rest/Session — an authenticated, non-admin session for account 1. */
const session = () => ({
  account: fixtures.account.license,
  mail: fixtures.account.mail,
  isAuthenticated: true,
  authType: 'oidc',
  // `viewerUrl` mirrors VIEWER_URL in config.php — a viewer deployed on its own
  // subdomain, which is the case the fallback (<app>/viewer/) gets wrong.
  // `viewerUrl` mirrors VIEWER_URL in config.php. Null by default (the viewer is then
  // assumed to sit under this app's origin); set MOCK_VIEWER_URL to exercise the common
  // real-world case of the viewer living on its own subdomain.
  settings: { bibleEnabled: true, churchToolsEnabled: true, wsHost: null, viewerUrl: process.env.MOCK_VIEWER_URL ?? null },
});

/** Admin session variant: run with MOCK_ADMIN=1 to reach the /admin routes. */
const isAdmin = process.env.MOCK_ADMIN === '1';

/**
 * Route table. Keys are matched as prefixes against the path, longest key first, so
 * `/rest/SongsAll` wins over `/rest/Song`. Each handler gets { path, method, body, query }.
 */
const handlers = {
  '/rest/Session': (req) =>
    req.method === 'DELETE' ? { message: 'logged out' } : { ...session(), authType: isAdmin ? 'oidc_admin' : 'oidc' },
  '/rest/Accounts': () => [{ license: fixtures.account.license, name: fixtures.account.name }],
  '/rest/AccountSettings': () => ({ defaultStyleId: null, showTitleTemplate: 'Show {dd}.{MM}.{yyyy}' }),
  // Viewer token. GET reports whether one exists; POST mints one and returns it in full
  // (the only time the server ever does), DELETE revokes. Kept in `state` so the reveal
  // dialog and the "token exists" chip behave like the real thing for the life of the run.
  '/rest/AccountTokens': (req) => {
    if (req.method === 'POST') {
      state.viewerToken = Array.from({ length: 64 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
      return { token: state.viewerToken, message: 'Token generated' };
    }
    if (req.method === 'DELETE') {
      state.viewerToken = null;
      return { message: 'Token revoked' };
    }
    return state.viewerToken
      ? { hasToken: true, tokenPrefix: `${state.viewerToken.slice(0, 8)}...` }
      : { hasToken: false, tokenPrefix: null };
  },

  '/rest/SongsAll': () => state.songs,
  '/rest/SongsSearch': (req) => filterSongs(req.query.q),
  '/rest/SongsRevision': () => ({
    songs: state.songs.map((s) => ({ songNumber: s.songNumber, updatedAt: '2026-08-01 10:00:00' })),
    count: state.songs.length,
  }),
  '/rest/SongExists': () => ({ exists: false }),
  '/rest/SongRenumber': () => ({ message: 'renumbered (mock)', showsUpdated: 0 }),
  '/rest/Song': (req) => {
    const number = Number(req.path.split('/')[3]);
    if (req.method === 'DELETE') return { message: 'deleted (mock)' };
    if (req.method === 'POST' || req.method === 'PUT') return { ...req.body, songNumber: req.body?.songNumber || 999999 };
    return state.songDetails[number] ?? fallbackSong(number);
  },

  '/rest/ShowsRevision': () => ({ shows: state.shows.map((s) => ({ title: s.title, date: s.date })), count: state.shows.length }),
  '/rest/Shows': (req) => {
    if (req.method === 'DELETE') {
      state.shows = state.shows.filter((s) => s.title !== req.body?.title);
      return { message: 'deleted (mock)' };
    }
    if (req.method === 'POST' || req.method === 'PUT') {
      const incoming = { ...req.body, date: new Date().toISOString().slice(0, 19).replace('T', ' ') };
      const index = state.shows.findIndex((s) => s.title === incoming.title);
      if (index >= 0) state.shows[index] = { ...state.shows[index], ...incoming };
      else state.shows.unshift(incoming);
      return { message: 'saved (mock)' };
    }
    // GET /rest/Shows/{limit}/{page}, optionally ?title=
    const [, , , limitRaw = '10', pageRaw = '0'] = req.path.split('/');
    const limit = Number(limitRaw) || 10;
    const page = Number(pageRaw) || 0;
    const matching = req.query.title ? state.shows.filter((s) => s.title === req.query.title) : state.shows;
    return { limit, offset: page * limit, shows: matching.slice(page * limit, page * limit + limit) };
  },

  '/rest/SetListEntries': (req) => (req.method === 'DELETE' ? { message: 'deleted (mock)' } : { message: 'saved (mock)' }),
  '/rest/SetLists': (req) => {
    if (req.method === 'GET') return state.setLists;
    if (req.method === 'DELETE') {
      state.setLists = state.setLists.filter((l) => l.id !== req.body?.id);
      return { message: 'deleted (mock)' };
    }
    if (req.method === 'POST') {
      const created = { id: Date.now() % 100000, name: req.body?.name ?? 'Neu', sortOrder: state.setLists.length, entries: [] };
      state.setLists.push(created);
      return created;
    }
    const target = state.setLists.find((l) => l.id === req.body?.id);
    if (target && req.body?.name) target.name = req.body.name;
    return { message: 'saved (mock)' };
  },

  '/rest/ShowItemTypes': () => [],
  '/rest/Styles': () => [],
  '/rest/PdfAnnotations': () => [],
  '/rest/PdfIcons': () => [],
  '/rest/Pdfs': () => [],
  '/rest/BibleTranslations': () => [],
  '/rest/BibleVerses': () => ({ verses: [] }),
  '/rest/LanguageTags': () => [],
  '/rest/Search': (req) => filterSongs(req.query.q ?? req.query.search),
  '/rest/Metrics': () => ({ message: 'recorded (mock)' }),
  '/rest/Log': () => ({ message: 'logged (mock)' }),
  '/rest/ValidateToken': () => ({ valid: true }),
  '/rest/ChurchToolsEvents': () => [],
  '/rest/ChurchToolsSongs': () => [],

  '/rest/AdminAccounts': () => fixtures.adminAccounts,
  '/rest/AdminProviders': () => [],
  '/rest/AdminMigrations': () => ({ currentVersion: 19, latestVersion: 19, pendingCount: 0, migrations: [] }),
  '/rest/AdminConfig': () => ({
    server: {},
    app: {},
    database: {},
    cors: { allowedOrigins: [] },
    oidc: { scopes: [] },
    bible: {},
    wsHost: null,
  }),
  '/rest/AdminSongs': (req) => {
    if (req.method !== 'POST') return fixtures.adminSongs;
    const { sourceNumber, targetNumber, dryRun } = req.body ?? {};
    return {
      message: dryRun
        ? `Preview of merging #${sourceNumber} into #${targetNumber}`
        : `Song #${sourceNumber} was replaced by #${targetNumber}`,
      dryRun: !!dryRun,
      license: req.body?.license ?? 1,
      sourceNumber,
      targetNumber,
      sourceTitle: 'Way  Maker!',
      targetTitle: 'Way Maker',
      setLists: { repointed: [], dropped: ['Sonntagsband'] },
      shows: { repointed: ['Probe 12.08.2026'], dropped: [] },
      clearedOrderNames: 1,
      deleted: { blocks: 4, pdfMappings: 0, pdfAnnotations: 0, pdfFiles: 0 },
    };
  },
};

const filterSongs = (query) => {
  const needle = String(query ?? '').toLowerCase();
  if (!needle) return state.songs;
  return state.songs.filter((s) => s.title.toLowerCase().includes(needle) || String(s.songNumber).includes(needle));
};

/** Any song number the fixtures do not cover still resolves, so the UI never dead-ends. */
const fallbackSong = (number) => ({
  account: 1,
  songNumber: number,
  title: state.songs.find((s) => s.songNumber === number)?.title ?? `Song #${number}`,
  authors: state.songs.find((s) => s.songNumber === number)?.authors ?? '',
  copyright: '',
  initialOrder: ['Verse 1'],
  order: { Default: ['Verse 1'] },
  blocks: { 'Verse 1': ['[placeholder]'] },
  styleId: null,
  ccliNumber: null,
  key: null,
  updatedAt: '2026-01-01 00:00:00',
});

const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve(null);
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(null);
      }
    });
  });

// Longest prefix first: '/rest/SongsAll' must be tested before '/rest/Song'.
const routes = Object.keys(handlers).sort((a, b) => b.length - a.length);

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const body = req.method === 'GET' ? null : await readBody(req);
  const query = Object.fromEntries(url.searchParams);

  const route = routes.find((prefix) => path === prefix || path.startsWith(prefix + '/') || path.startsWith(prefix + '?'));
  const handler = route ? handlers[route] : null;

  let payload = {};
  let status = 200;
  try {
    payload = handler ? handler({ path, method: req.method, body, query }) : {};
    if (!handler) status = 200; // unknown endpoints answer {} rather than 404 — see the header comment
  } catch (error) {
    status = 500;
    payload = { error: String(error) };
  }

  console.log(`${req.method} ${path} → ${status}${handler ? '' : ' (unmapped)'}`);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=UTF-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(payload));
}).listen(PORT, () => {
  console.log(`Mock backend listening on http://localhost:${PORT}${isAdmin ? ' (admin session)' : ''}`);
});
