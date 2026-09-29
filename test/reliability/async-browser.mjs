/** Real hook/component integration with controlled network failures. node test/reliability/async-browser.mjs */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, sleep } from '../viewport/cdp.mjs';
import { startApp, REPO_ROOT } from '../viewport/servers.mjs';
import * as dom from '../viewport/dom.mjs';

const app = await startApp();
let browser;
const desktop = { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false };
async function pageForTest(device = desktop) {
  const page = await browser.newPage({ device });
  const { identifier } = await page.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear();' });
  await page.goto(`${app.origin}/@fs/${REPO_ROOT.replaceAll('\\', '/')}/test/reliability/async-harness.html`);
  try {
    await page.waitFor(() => window.harness?.ready, { timeout: 30000, label: 'isolated React harness' });
  } catch (error) {
    console.error(await page.evaluate(() => document.documentElement.outerHTML));
    console.error(page.pageErrors, page.consoleMessages);
    throw error;
  }
  await page.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
  await page.evaluate(() => {
    const original = window.fetch.bind(window);
    const song = (n) => ({
      songNumber: n,
      title: `Song ${n}`,
      authors: '',
      copyright: '',
      languages: ['EN'],
      initialOrder: ['Verse'],
      order: { Default: ['Verse'] },
      blocks: { Verse: ['Original line'] },
      updatedAt: 'old',
    });
    const state = (window.mock = {
      songs: Object.fromEntries(Array.from({ length: 24 }, (_, i) => [i + 1, song(i + 1)])),
      shows: { A: { title: 'A', date: 'new', order: [{ type: 'song', songNumber: 1 }] }, B: { title: 'B', date: 'new', order: [] } },
      songReads: 0,
      showReads: 0,
      activeSongs: 0,
      maxSongs: 0,
      failSongReads: 0,
      failShows: false,
      holdShows: {},
      readDelay: 0,
      writes: 0,
      failSave: true,
      mediaReads: 0,
      activeMedia: 0,
      maxMedia: 0,
      mediaStatus: 200,
      mediaDelay: 60,
    });
    window.fetch = async (input, options) => {
      const request = input instanceof Request ? input : new Request(new URL(input, location.href), options);
      const url = new URL(request.url);
      const path = url.pathname;
      if (path === '/rest/Session') return Response.json({ account: 1, mail: 'test@example.com', isAuthenticated: true, settings: {} });
      if (path === '/rest/SongsRevision')
        return Response.json({
          songs: Object.values(state.songs).map((song) => ({ songNumber: song.songNumber, date: 'new' })),
          count: 24,
        });
      if (path === '/rest/ShowsRevision')
        return Response.json({ shows: Object.values(state.shows).map(({ title, date }) => ({ title, date })), count: 2 });
      if (path.startsWith('/rest/Shows/')) {
        state.showReads++;
        const title = url.searchParams.get('title');
        const snapshot = structuredClone(state.shows[title]);
        if (state.holdShows[title])
          await new Promise((resolve) => {
            state.releaseShow = resolve;
          });
        return state.failShows
          ? new Response('{}', { status: 503 })
          : Response.json({ shows: snapshot ? [snapshot] : [], count: snapshot ? 1 : 0 });
      }
      if (/^\/rest\/Song\/\d+$/.test(path)) {
        state.songReads++;
        state.activeSongs++;
        state.maxSongs = Math.max(state.maxSongs, state.activeSongs);
        const snapshot = structuredClone(state.songs[Number(path.split('/').at(-1))]);
        await new Promise((resolve) => setTimeout(resolve, state.readDelay));
        state.activeSongs--;
        if (state.failSongReads > 0) {
          state.failSongReads--;
          return new Response('{}', { status: 503 });
        }
        return Response.json(snapshot);
      }
      if (path === '/rest/Song' && ['POST', 'PUT'].includes(request.method)) {
        state.writes++;
        await new Promise((resolve) => setTimeout(resolve, 250));
        return state.failSave ? new Response('{}', { status: 503 }) : Response.json({ songNumber: 1, message: 'Saved' });
      }
      if (path.startsWith('/probe/')) {
        state.mediaReads++;
        state.activeMedia++;
        state.maxMedia = Math.max(state.maxMedia, state.activeMedia);
        try {
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(resolve, state.mediaDelay);
            request.signal.addEventListener(
              'abort',
              () => {
                clearTimeout(timeout);
                reject(new DOMException('Aborted', 'AbortError'));
              },
              { once: true },
            );
          });
          return new Response(null, { status: state.mediaStatus });
        } finally {
          state.activeMedia--;
        }
      }
      return original(input, options);
    };
    window.harness.store.dispatch({ type: 'settings/updateSetting', payload: { key: 'lastSelectedAccount', value: 1 } });
  });
  return page;
}
async function test(name, run, device) {
  const page = await pageForTest(device);
  try {
    await run(page);
    assert.deepEqual(page.pageErrors, []);
    console.log(`ok   ${name}`);
  } catch (error) {
    console.error(name, await page.evaluate(() => document.body.innerText));
    console.error(page.pageErrors);
    throw error;
  } finally {
    await page.close();
  }
}
const click = async (page, selector) => {
  await page.waitFor(dom.exists, { label: JSON.stringify(selector) }, selector);
  await page.evaluate(dom.click, selector);
};

try {
  browser = await launchBrowser();
  await test('song refresh retries an unchanged revision; failed manual reload keeps the warning', async (page) => {
    await page.evaluate(() => {
      const h = window.harness,
        m = window.mock;
      h.addSong(m.songs[1]);
      m.songs[1].title = 'Changed remotely';
      m.failSongReads = 1;
      h.selectShow(m.shows.A);
      h.render({ mode: 'pollers', auto: false });
    });
    await page.waitFor(() => !!window.harness.song?.updatedSongNumbers[1], { timeout: 20000, label: 'retry of the same failed revision' });
    assert.equal(await page.evaluate(() => window.mock.songReads), 2);
    assert.equal(
      await page.evaluate(async () => {
        window.mock.failSongReads = 1;
        return window.harness.song.reloadSong(1);
      }),
      false,
    );
    assert.ok(await page.evaluate(() => window.harness.song.updatedSongNumbers[1]));
    assert.equal(
      await page.evaluate(async () => {
        const before = window.mock.songReads;
        const first = window.harness.song.reloadSong(1);
        const second = window.harness.song.reloadSong(1);
        if (first !== second) throw new Error('Manual reads did not coalesce');
        if (!(await first)) throw new Error('Reload failed');
        return window.mock.songReads - before;
      }),
      1,
    );
    await page.waitFor(() => !window.harness.song.updatedSongNumbers[1]);
    assert.equal(
      await page.evaluate(() => {
        const h = window.harness;
        const subscriptions = h.store.dispatch(h.presenterApi.internalActions.internal_getRTKQSubscriptions());
        return subscriptions.getSubscriptionCount('getSong({"songNumber":1})');
      }),
      0,
    );
  });

  await test('late show responses cannot replace a newly selected show; failed reload is reported', async (page) => {
    await page.evaluate(() => {
      const h = window.harness,
        m = window.mock;
      h.selectShow({ ...m.shows.A, order: [] });
      m.holdShows.A = true;
      h.render({ mode: 'pollers', auto: true });
    });
    await page.waitFor(() => !!window.mock.releaseShow);
    await page.evaluate(() => window.harness.selectShow(window.mock.shows.B));
    await sleep(150);
    await page.evaluate(() => window.mock.releaseShow());
    await sleep(200);
    assert.equal(await page.evaluate(() => window.harness.store.getState().show.currentShow.title), 'B');
    assert.equal(
      await page.evaluate(async () => {
        window.mock.failShows = true;
        return window.harness.show.reloadShow();
      }),
      false,
    );
    await page.waitFor(() => window.harness.show.reloadFailed);
    await page.evaluate(async () => {
      window.mock.failShows = false;
      await window.harness.show.reloadShow();
    });
    await page.waitFor(() => !window.harness.show.reloadFailed);
  });

  await test('show song loads use four slots, batch persistence, and ignore obsolete orders', async (page) => {
    const result = await page.evaluate(async () => {
      const h = window.harness,
        m = window.mock;
      m.readDelay = 40;
      const show = { title: 'Large', order: Array.from({ length: 20 }, (_, i) => ({ type: 'song', songNumber: i + 1 })) };
      h.selectShow(show);
      let writes = 0;
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'presenter_cache') writes++;
        return original.call(this, key, value);
      };
      await h.loadSongs(show);
      Storage.prototype.setItem = original;
      const loaded = h.store.getState().songs.songsOrder.length;
      m.readDelay = 300;
      const first = h.loadSongs({ show, forceRefetch: true });
      h.selectShow(m.shows.B);
      await h.loadSongs(m.shows.B);
      await first;
      return { max: m.maxSongs, writes, loaded, order: h.store.getState().songs.songsOrder };
    });
    assert.ok(result.max <= 4, JSON.stringify(result));
    assert.ok(result.writes <= 3, JSON.stringify(result));
    assert.equal(result.loaded, 20);
    assert.deepEqual(result.order, []);
  });

  await test('media probes coalesce, cap concurrency, distinguish HTTP failures, and time out', async (page) => {
    const result = await page.evaluate(async () => {
      const h = window.harness,
        m = window.mock;
      const urls = Array.from({ length: 12 }, (_, i) => `${location.origin}/probe/${i}`);
      const values = await Promise.all([...urls, urls[0], urls[0]].map(h.probeMediaUrl));
      const reads = m.mediaReads;
      m.mediaStatus = 503;
      const unavailable = await h.probeMediaUrl(`${location.origin}/probe/503`);
      m.mediaStatus = 404;
      const missing = await h.probeMediaUrl(`${location.origin}/probe/404`);
      m.mediaStatus = 401;
      const unauthorized = await h.probeMediaUrl(`${location.origin}/probe/401`);
      m.mediaDelay = 20000;
      const start = Date.now();
      const timeout = await h.probeMediaUrl(`${location.origin}/probe/timeout`);
      return { reads, max: m.maxMedia, values, unavailable, missing, unauthorized, timeout, elapsed: Date.now() - start };
    });
    assert.equal(result.reads, 12);
    assert.ok(result.max <= 4);
    assert.ok(result.values.every((value) => value === 'ok'));
    assert.equal(result.unavailable, 'server_down');
    assert.equal(result.unauthorized, 'server_down');
    assert.equal(result.missing, 'not_found');
    assert.equal(result.timeout, 'server_down');
    assert.ok(result.elapsed < 7000);
  });

  await test('readiness transitions through checking, unverified, missing, and ready', async (page) => {
    await page.evaluate(() => {
      const h = window.harness,
        m = window.mock;
      m.mediaStatus = 503;
      m.mediaDelay = 400;
      h.selectShow({ title: 'Media', order: [{ type: 'media', mediaSubType: 'video', mediaPath: `${location.origin}/probe/readiness` }] });
      h.render({ mode: 'readiness', generation: 0 });
    });
    await page.waitFor(() => window.harness.checks?.find((check) => check.id === 'media')?.status === 'checking');
    await page.waitFor(() => window.harness.checks?.find((check) => check.id === 'media')?.status === 'unverified');
    await page.evaluate(() => {
      window.mock.mediaStatus = 404;
      window.harness.invalidateMediaProbe();
    });
    await page.waitFor(() => window.harness.checks?.find((check) => check.id === 'media')?.status === 'missing');
    await page.evaluate(() => {
      window.mock.mediaStatus = 200;
      window.harness.invalidateMediaProbe();
    });
    await page.waitFor(() => window.harness.checks?.find((check) => check.id === 'media')?.status === 'ready');
    await page.waitFor(dom.exists, {}, { text: 'Ready' });
  });

  await test('draft survives a full page reload and stays isolated by account and backend', async (page) => {
    const song = await page.evaluate(() => window.mock.songs[1]);
    await page.evaluate((song) => window.harness.render({ mode: 'editor', open: true, song }), song);
    await page.waitFor(dom.exists, {}, { css: '.MuiDrawer-paper input' });
    await sleep(250);
    await page.evaluate(dom.type, { css: '.MuiDrawer-paper input' }, 'Draft after restart');
    await click(page, { label: 'Close', within: '.MuiDrawer-paper' });
    await sleep(300);
    await page.reload();
    await page.waitFor(() => window.harness?.ready);
    await page.evaluate((song) => window.harness.render({ mode: 'editor', open: true, song }), song);
    await click(page, { text: 'Restore draft' });
    assert.equal(await page.evaluate(() => document.querySelector('.MuiDrawer-paper input').value), 'Draft after restart');
    assert.equal(
      await page.evaluate(async () => {
        const { readSongDraft, songDraftKey } = await import('/src/song/editorDraft.ts');
        return readSongDraft(songDraftKey('', 2, 1)) === undefined && readSongDraft(songDraftKey('other-backend', 1, 1)) === undefined;
      }),
      true,
    );
  });

  for (const device of [desktop, { width: 375, height: 667, deviceScaleFactor: 1, mobile: true }]) {
    await test(
      `editor ${device.width}px: duplicate save protection, errors, draft recovery, successful cleanup`,
      async (page) => {
        await page.evaluate(() => window.harness.render({ mode: 'editor', open: true, song: window.mock.songs[1] }));
        await page.waitFor(dom.exists, {}, { css: '.MuiDrawer-paper input' });
        await sleep(250);
        await page.evaluate(dom.type, { css: '.MuiDrawer-paper input', nth: 0 }, 'Recovered title');
        await page.evaluate(() => {
          const button = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Apply');
          button.click();
          button.click();
        });
        await page.waitFor(dom.exists, {}, { text: 'The song could not be saved' });
        assert.equal(await page.evaluate(() => window.mock.writes), 1);
        await click(page, { label: 'Close', within: '.MuiDrawer-paper' });
        await sleep(300);
          await page.evaluate(() => window.harness.render({ mode: 'editor', open: true, song: window.mock.songs[1] }));
          await page.waitFor(() => [...document.querySelectorAll('button')].some((button) => button.textContent.trim().toLowerCase() === 'restore draft'));
          await page.waitFor(() => [...document.querySelectorAll('.MuiDrawer-paper .MuiAlert-root button')].every((button) => {
            const rect = button.getBoundingClientRect();
            return rect.left >= 0 && rect.right <= window.innerWidth;
          }), { label: 'Draft recovery actions fit the viewport after the drawer opens' });
          await click(page, { text: 'Restore draft' });
        assert.equal(await page.evaluate(() => document.querySelector('.MuiDrawer-paper input').value), 'Recovered title');
        // A parent switching songs before the debounce must still retain the old draft.
        await page.evaluate(dom.type, { css: '.MuiDrawer-paper input', nth: 0 }, 'Last instant edit');
        await page.evaluate(() => window.harness.render({ mode: 'editor', open: true, song: window.mock.songs[2] }));
        await sleep(100);
        await page.evaluate(() => window.harness.render({ mode: 'editor', open: true, song: window.mock.songs[1] }));
        await click(page, { text: 'Restore draft' });
        assert.equal(await page.evaluate(() => document.querySelector('.MuiDrawer-paper input').value), 'Last instant edit');
        const shots = new URL('../viewport/screenshots/', import.meta.url);
        mkdirSync(shots, { recursive: true });
        writeFileSync(new URL(`editor-recovery-${device.width}.png`, shots), await page.screenshot());
        await page.evaluate(() => {
          window.mock.failSave = false;
          [...document.querySelectorAll('button')].find((button) => button.textContent === 'Apply').click();
        });
        await page.waitFor(() => !document.querySelector('.MuiDrawer-paper'));
        assert.equal(
          await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('presenter_song_draft:')).length),
          0,
        );
      },
      device,
    );
  }
} finally {
  await browser?.close();
  await app.stop();
}
