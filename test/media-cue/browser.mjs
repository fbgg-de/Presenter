/** Real app smoke/regression checks against the isolated fixture API. */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { launchBrowser, sleep } from '../viewport/cdp.mjs';
import { startApp } from '../viewport/servers.mjs';
import * as dom from '../viewport/dom.mjs';

const app = await startApp({ verbose: true });
let browser, page;
try {
  browser = await launchBrowser();
  page = await browser.newPage({ device: { width: 1440, height: 1100, mobile: false } });
  const click = async (label, within) => {
    const sel = { label, within };
    await page.waitFor(dom.exists, {}, sel);
    await page.evaluate(dom.click, sel);
    await page.raf();
  };
  await page.goto(app.origin, { timeout: 120000 });
  await page.waitFor(dom.exists, { timeout: 30000 }, { text: 'Gottesdienst 14.08.2026' });
  await page.evaluate(dom.click, { text: 'Gottesdienst 14.08.2026' });
  await click('Confirm');
  await page.waitFor(dom.exists, { timeout: 20000 }, { label: 'Create cue' });
  await click('Create cue');
  await click('Cancel', '[role="dialog"]');
  await click('Save', '[role="dialog"]');
  await page.waitFor(dom.exists, {}, { css: '[data-testid=media-cue-timeline]' });
  assert.equal(
    await page.evaluate(async () => {
      const { store } = await import('/src/store/index.ts');
      return store.getState().show.currentShow.mediaCues.length;
    }),
    1,
  );
  console.log('PASS create and persist show-owned cue');
  await page.waitFor(() => !document.querySelector('[role=dialog]'));
  await sleep(400);
  // Draw in the real editor using native mouse events; type is selected after release.
  const rect = await page.evaluate(() => {
    const e = document.querySelector('[data-testid=media-cue-timeline]');
    e.scrollIntoView({ block: 'center' });
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width };
  });
  for (const [type, x] of [
    ['mousePressed', 0.1],
    ['mouseMoved', 0.25],
    ['mouseReleased', 0.25],
  ]) {
    await page.send('Input.dispatchMouseEvent', {
      type,
      x: rect.x + rect.w * x,
      y: rect.y + 40,
      button: 'left',
      buttons: type === 'mouseReleased' ? 0 : 1,
      clickCount: 1,
    });
    await sleep(80);
  }
  await page.waitFor(dom.exists, {}, { text: 'Use this region as' });
  await click('Pause', '[role="dialog"]');
  await click('Save', '[role="dialog"]');
  await page.waitFor(() => document.querySelectorAll('[data-region-id]').length === 1);
  const pauseWidth = await page.evaluate(() => document.querySelector('[data-region-id]').getBoundingClientRect().width);
  assert.equal(pauseWidth, 44);
  assert.equal(await page.evaluate(() => document.querySelectorAll('[data-testid="PauseIcon"]').length >= 3), true);
  console.log('PASS draw, classify and fixed-width pause marker plus quick control');
  // Add a lyric mapping through the same dialog. Names come from the block selection.
  await click('Add region');
  await click('Section', '[role="dialog"]');
  await page.evaluate(dom.click, { css: '[role="dialog"] [role="combobox"]' });
  await page.waitFor(dom.exists, {}, { css: '[role="option"]' });
  await page.evaluate(dom.click, { css: '[role="option"]', nth: 2 });
  await click('Save', '[role="dialog"]');
  await page.waitFor(() => document.querySelectorAll('[data-region-id]').length === 2);
  console.log('PASS mapping-first lyric section');
  // The same section can map a lyric block and loop.
  await page.evaluate(() => {
    const region = [...document.querySelectorAll('[data-region-id]')].find((e) => !e.querySelector('[data-testid=PauseIcon]'));
    region.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 600, clientY: 500 }));
  });
  await click('Edit region', '[role=menu]');
  await page.evaluate(() =>
    [...document.querySelectorAll('[role=dialog] label')]
      .find((e) => e.textContent.includes('Loop this section'))
      .querySelector('input')
      .click(),
  );
  await click('Save', '[role=dialog]');
  assert.ok(
    await page.evaluate(async () => {
      const { store } = await import('/src/store/index.ts');
      const show = store.getState().show.currentShow;
      return show.mediaCues[0].regions.some((r) => r.kind === 'section' && r.loop && show.order[0].mediaCue.lyrics[r.id]);
    }),
  );
  await click('Add region');
  await click('Section', '[role=dialog]');
  await page.evaluate(dom.type, { css: '[role=dialog] input[type=text]' }, 'Free loop');
  await page.evaluate(() =>
    [...document.querySelectorAll('[role=dialog] label')]
      .find((e) => e.textContent.includes('Loop this section'))
      .querySelector('input')
      .click(),
  );
  await click('Save', '[role=dialog]');
  assert.ok(
    await page.evaluate(async () => {
      const { store } = await import('/src/store/index.ts');
      const show = store.getState().show.currentShow,
        region = show.mediaCues[0].regions.find((r) => r.name === 'Free loop');
      return region?.loop && !show.order[0].mediaCue.lyrics[region.id];
    }),
  );
  console.log('PASS optionally mapped looping sections and standalone named loops');
  await click('Sources & screens');
  await click('Advanced · timing, sources & output roles', '[role="dialog"]');
  await click('Add output role', '[role="dialog"]');
  await click('Cancel', '[role="dialog"]');
  assert.equal(
    await page.evaluate(async () => {
      const { store } = await import('/src/store/index.ts');
      return store.getState().show.currentShow.mediaCues[0].assignments.length;
    }),
    0,
  );
  console.log('PASS cancel source/screen edits');
  await page.evaluate(async () => {
    const { store } = await import('/src/store/index.ts');
    const { saveMediaCue } = await import('/src/store/showSlice.ts');
    const state = store.getState(),
      cue = state.show.currentShow.mediaCues[0],
      binding = state.show.currentShow.order[state.presentation.activeItemIndex].mediaCue;
    store.dispatch(
      saveMediaCue({
        cue: {
          ...cue,
          duration: 10,
          regions: [
            { id: 'hold', kind: 'pause', name: 'Hold', start: 0.25, end: 1, enabled: true },
            { id: 'loop', kind: 'section', loop: true, name: 'Chorus loop', start: 1, end: 2, enabled: true },
          ],
        },
        binding,
        itemIndex: state.presentation.activeItemIndex,
      }),
    );
  });
  await click('Play / pause');
  await page.waitFor(async () => {
    const { getCuePacket } = await import('/src/media/runtime.ts');
    return getCuePacket()?.transport.pausedAt === 'hold';
  });
  await click('Play / pause');
  await page.waitFor(async () => {
    const { getCuePacket } = await import('/src/media/runtime.ts');
    return getCuePacket()?.transport.activeLoop === 'loop';
  });
  await click('Exit at end');
  await page.waitFor(async () => {
    const { getCuePacket } = await import('/src/media/runtime.ts');
    return getCuePacket()?.transport.time > 2.1;
  });
  await click('Stop');
  console.log('PASS live hold, resume, automatic loop entry and exit');
  await sleep(350);
  await page.reload();
  await page.waitFor(() => document.querySelectorAll('[data-region-id]').length === 2, { timeout: 20000 });
  console.log('PASS cue and regions survive reload');
  await page.evaluate(async () => {
    const { store } = await import('/src/store/index.ts');
    const { saveMediaCue } = await import('/src/store/showSlice.ts');
    const { lyricOccurrences } = await import('/src/media/engine.ts');
    const state = store.getState(),
      show = state.show.currentShow,
      item = show.order[state.presentation.activeItemIndex];
    const song = state.songs.songs[item.songNumber];
    const arrangement = lyricOccurrences(song.getBlocks('Default').filter((b) => !b.copyright));
    const cue = {
      ...show.mediaCues[0],
      duration: 10,
      regions: [
        { id: 'verse', kind: 'section', name: 'Verse 1', start: 0, end: 0.5 },
        { id: 'chorus', kind: 'section', name: 'Chorus', start: 2, end: 5 },
        { id: 'pause', kind: 'pause', name: 'Wait', start: 0.5, end: 0.501 },
      ],
    };
    store.dispatch(
      saveMediaCue({
        cue,
        itemIndex: state.presentation.activeItemIndex,
        binding: {
          cueId: cue.id,
          arrangement: arrangement.signature,
          followVideo: true,
          followLyrics: true,
          lyrics: { verse: arrangement.blocks[0].id, chorus: arrangement.blocks[1].id },
        },
      }),
    );
  });
  await click('Play / pause');
  await page.waitFor(async () => {
    const { getCuePacket } = await import('/src/media/runtime.ts');
    return getCuePacket()?.transport.pausedAt === 'pause';
  });
  await page.evaluate(async () => {
    const { store } = await import('/src/store/index.ts');
    const { setActiveBlockIndex } = await import('/src/store/presentationSlice.ts');
    store.dispatch(setActiveBlockIndex(1));
  });
  await page.waitFor(async () => {
    const { getCuePacket } = await import('/src/media/runtime.ts');
    const p = getCuePacket();
    return p.transport.playing && p.transport.time >= 2 && p.transport.time < 3;
  });
  await click('Play / pause');
  await page.evaluate(async () => {
    const { store } = await import('/src/store/index.ts');
    const { setActiveBlockIndex } = await import('/src/store/presentationSlice.ts');
    store.dispatch(setActiveBlockIndex(0));
  });
  await page.waitFor(async () => {
    const { getCuePacket } = await import('/src/media/runtime.ts');
    const p = getCuePacket();
    return !p.transport.playing && p.transport.time === 0;
  });
  await page.evaluate(async () => {
    const { sendCueCommand } = await import('/src/media/runtime.ts');
    sendCueCommand({ type: 'seek', time: 3 });
  });
  await page.waitFor(async () => {
    const { store } = await import('/src/store/index.ts');
    return store.getState().presentation.activeBlockIndex === 1;
  });
  console.log('PASS two-way lyric navigation, hold resume and manual-pause preservation');
  await page.evaluate(() => document.querySelector('[data-testid=media-cue-timeline]').focus());
  const key = async (key, modifiers = 0) => {
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key, modifiers });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key, modifiers });
  };
  const position = () => page.evaluate(async () => (await import('/src/media/runtime.ts')).getCuePacket().transport.time);
  await key('Home');
  assert.equal(await position(), 0);
  await key('ArrowRight');
  assert.equal(await position(), 0.01);
  await key('ArrowRight', 8);
  assert.equal(await position(), 1.01);
  await key('ArrowRight', 1);
  assert.equal(await position(), 2);
  await key('ArrowLeft', 1);
  assert.equal(await position(), 0.5);
  await key('End');
  assert.equal(await position(), 10);
  await key('Home');
  console.log('PASS focused timeline fine, one-second, boundary and Home/End keyboard seeking');
  writeFileSync('test/media-cue/editor.png', await page.screenshot());
  assert.deepEqual(page.pageErrors, []);
  console.log('PASS no browser exceptions');
} catch (error) {
  if (page) {
    writeFileSync('test/media-cue/error.png', await page.screenshot());
    console.error(await page.evaluate(() => document.body.innerText));
    console.error(page.pageErrors);
  }
  throw error;
} finally {
  await browser?.close();
  await app.stop();
}
