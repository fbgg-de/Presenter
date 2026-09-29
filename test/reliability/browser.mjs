/** Real-browser keyboard, library recovery and large-list checks against isolated mock servers. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, sleep } from '../viewport/cdp.mjs';
import { startApp } from '../viewport/servers.mjs';
import { DEVICES } from '../viewport/devices.mjs';
import * as dom from '../viewport/dom.mjs';

const app = await startApp();
let browser;
try {
  browser = await launchBrowser();
  for (const device of [DEVICES['iphone-se'], { id: 'desktop', width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }]) {
    const page = await browser.newPage({ device });
    const click = async (selector) => {
      await page.waitFor(dom.exists, { timeout: 20000, label: JSON.stringify(selector) }, selector);
      await page.evaluate(dom.click, selector);
    };
    try {
      await page.goto(app.origin);
      await page.evaluate(() => {
        localStorage.clear();
      });
      await page.reload();
      await click({ text: 'Gottesdienst 14.08.2026' });
      await click({ label: 'Confirm' });
      await page.waitFor(dom.exists, { timeout: 20000 }, { css: '.MuiBottomNavigation-root, [data-testid="SettingsIcon"]' });
      await sleep(800);
      if (device.mobile) await click({ label: 'Shows', within: '.MuiBottomNavigation-root' });

      // Exercise real DOM ancestry and composition, including nested SVG button icons.
      const keyboardCases = await page.evaluate(async () => {
        const { shouldIgnorePresentationKey } = await import('/src/utils/keyboard.ts');
        const cases = [
          ['<button><svg><path /></svg></button>', 'path', 'Enter', {}, true],
          ['<button>Black</button>', 'button', ' ', {}, true],
          ['<button>Black</button>', 'button', 'b', {}, false],
          ['<input />', 'input', 'ArrowRight', {}, true],
          ['<div role="slider"><span /></div>', 'span', 'ArrowRight', {}, true],
          ['<div role="dialog"><span /></div>', 'span', 'b', {}, true],
          ['<div contenteditable="true"><span /></div>', 'span', 'Enter', {}, true],
          ['<div />', 'div', 'Enter', { isComposing: true }, true],
          ['<div />', 'div', 'b', {}, false],
        ];
        for (const [html, selector, key, extra, expected] of cases) {
          const container = document.createElement('div');
          container.innerHTML = html;
          const target = container.querySelector(selector);
          let result;
          target.addEventListener('keydown', (event) => {
            result = shouldIgnorePresentationKey(event);
          });
          target.dispatchEvent(new KeyboardEvent('keydown', { key, ...extra }));
          if (result !== expected) throw new Error(`Keyboard guard failed: ${html}, ${key}`);
        }
        return cases.length;
      });
      assert.equal(keyboardCases, 9);

      await page.evaluate(async () => {
        const { store } = await import('/src/store/index.ts');
        store.dispatch({ type: 'settings/updateSetting', payload: { key: 'showDeleteFromDb', value: true } });
        const originalFetch = window.fetch.bind(window);
        window.libraryTest = { failLoad: true, failDelete: true };
        window.fetch = (input, options) => {
          const url = typeof input === 'string' ? input : input.url;
          if (url.includes('/rest/SongsAll')) {
            if (window.libraryTest.failLoad) return Promise.resolve(new Response('{}', { status: 503 }));
            const songs = Array.from({ length: 230 }, (_, i) => ({
              songNumber: 100000 + i,
              title: i === 229 ? 'Über alle Grenzen' : `Library song ${String(i).padStart(3, '0')}`,
              authors: i === 229 ? 'Zoë Müller' : 'Test author',
            }));
            return Promise.resolve(Response.json(songs));
          }
          if (url.endsWith('/rest/Song') && (options?.method ?? input.method) === 'DELETE' && window.libraryTest.failDelete) {
            return Promise.resolve(new Response('{}', { status: 503 }));
          }
          return originalFetch(input, options);
        };
      });
      await click({ label: 'Search Songs' });
      await click({ text: 'Open song library' });
      await page.waitFor(dom.exists, {}, { text: 'Could not load the song library' });
      assert.equal(await page.evaluate(dom.exists, { text: 'No songs found' }), false);
      await page.evaluate(() => {
        window.libraryTest.failLoad = false;
      });
      await click({ label: 'Retry', within: '[aria-labelledby="song-library-title"]' });
      const rows = () => document.querySelectorAll('[aria-labelledby="song-library-title"] .MuiListItemButton-root').length;
      await page.waitFor(() => document.querySelectorAll('[aria-labelledby="song-library-title"] .MuiListItemButton-root').length === 100);
      assert.equal(await page.evaluate(rows), 100);
      const input = { label: 'Filter songs...' };
      await page.evaluate(dom.type, input, '  uber  muller ');
      await page.waitFor(() => document.querySelectorAll('[aria-labelledby="song-library-title"] .MuiListItemButton-root').length === 1);
      await click({ label: 'Clear search', within: '[aria-labelledby="song-library-title"]' });
      await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('[aria-labelledby="song-library-title"] button')];
        const more = buttons.find((button) => button.textContent.includes('Load more'));
        more.scrollIntoView();
        more.click();
      });
      await page.waitFor(() => document.querySelectorAll('[aria-labelledby="song-library-title"] .MuiListItemButton-root').length === 200);
      await page.evaluate(dom.type, input, 'uber');
      await page.waitFor(() => document.querySelectorAll('[aria-labelledby="song-library-title"] .MuiListItemButton-root').length === 1);
      await sleep(250);
      if (device.mobile) {
        await click({ label: 'More actions', within: '[aria-labelledby="song-library-title"]' });
        await click({ text: 'Delete', within: '[role="menu"]' });
      } else {
        await click({ label: 'Delete', within: '[aria-labelledby="song-library-title"]' });
      }
      await click({ text: 'Delete', within: '[role="dialog"]:last-of-type .MuiDialogActions-root' });
      await page.waitFor(dom.exists, {}, { text: 'The song could not be deleted' });
      await click({ text: 'Cancel', within: '[role="dialog"]:last-of-type .MuiDialogActions-root' });
      await sleep(300);
      const geometry = await page.evaluate(() => {
        const dialog = document.querySelector('[aria-labelledby="song-library-title"]');
        const rect = dialog.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: innerWidth };
      });
      assert.ok(geometry.left >= -1 && geometry.right <= geometry.width + 1, JSON.stringify(geometry));
      assert.deepEqual(page.pageErrors, []);
      const shots = new URL('../viewport/screenshots/', import.meta.url);
      mkdirSync(shots, { recursive: true });
      writeFileSync(new URL(`reliability-${device.id}.png`, shots), await page.screenshot());
      console.log(`ok   ${device.id}: keyboard guards, failed load/retry, 230-song search/paging, delete failure, dialog fit`);
    } catch (error) {
      console.error(await page.evaluate(() => document.body.innerText));
      throw error;
    } finally {
      await page.close();
    }
  }
} finally {
  await browser?.close();
  await app.stop();
}
