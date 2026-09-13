/** Browse an older local server, select a file and route one source to two screens.
 * Pass a local MP4 path to verify its real audio track without uploading the file.
 * An optional second argument tests its URL on an already-running local media server too.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { launchBrowser, sleep } from '../viewport/cdp.mjs';
import { startApp } from '../viewport/servers.mjs';
import * as dom from '../viewport/dom.mjs';

const fileName = process.argv[2] ? basename(process.argv[2]) : 'Selected video.mp4';
let content;
if (process.argv[2]) content = readFileSync(process.argv[2]);
else {
  content = Buffer.alloc(44 + 16000 * 2);
  content.write('RIFF');
  content.writeUInt32LE(content.length - 8, 4);
  content.write('WAVEfmt ', 8);
  content.writeUInt32LE(16, 16);
  content.writeUInt16LE(1, 20);
  content.writeUInt16LE(1, 22);
  content.writeUInt32LE(8000, 24);
  content.writeUInt32LE(16000, 28);
  content.writeUInt16LE(2, 32);
  content.writeUInt16LE(16, 34);
  content.write('data', 36);
  content.writeUInt32LE(content.length - 44, 40);
  for (let i = 0; i < 16000; i++) content.writeInt16LE(Math.round(Math.sin(i * 0.25) * (i < 8000 ? 2000 : 18000)), 44 + i * 2);
}
let fileRequests = 0,
  largeBytes = 0,
  delayVideo = false,
  headRequests = 0;
const offsets = [];
const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length');
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/list') {
    const offset = Number(url.searchParams.get('offset'));
    offsets.push(offset);
    // Older desktop releases ignore type/search and return audio files too.
    const names = [...Array.from({ length: 50 }, (_, i) => 'audio-' + i + '.mp3'), fileName];
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ dirs: [], files: names.slice(offset, offset + 50), totalFiles: names.length }));
    return;
  }
  fileRequests++;
  if (req.method === 'HEAD') {
    headRequests++;
    res.writeHead(405);
    res.end();
    return;
  }
  if (url.pathname === '/unavailable.mp4') {
    res.writeHead(503);
    res.end();
    return;
  }
  const large = url.pathname === '/large.mp4';
  const padding = large ? 128 * 1024 * 1024 : 0;
  const size = content.length + padding;
  const range = url.pathname === '/no-ranges.mp4' ? null : /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '');
  const start = range ? Number(range[1]) : 0;
  const end = range?.[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  res.writeHead(range ? 206 : 200, {
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Content-Length': end - start + 1,
    ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
  });
  if (large) largeBytes += end - start + 1;
  const bytes = Buffer.alloc(end - start + 1);
  if (start < content.length) content.copy(bytes, 0, start, Math.min(content.length, end + 1));
  if (large && start <= content.length && end >= content.length + 7) {
    bytes.writeUInt32BE(padding, content.length - start);
    bytes.write('free', content.length - start + 4);
  }
  // Delay the size probe so even a tiny fixture exercises the loading skeleton.
  setTimeout(() => res.end(bytes), delayVideo ? 1800 : req.headers.range === 'bytes=0-0' ? 500 : 0);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const app = await startApp();
async function decodeWaveform(url) {
  const { default: WaveformWorker } = await import('/src/media/waveform.worker.ts?worker');
  const worker = new WaveformWorker();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('Waveform timed out'));
    }, 30000);
    worker.onerror = (event) => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error(event.message));
    };
    worker.onmessage = ({ data }) => {
      if (data.state !== 'loading') {
        clearTimeout(timer);
        worker.terminate();
        resolve(data);
      }
    };
    worker.postMessage(url);
  });
}
let browser, page;
try {
  browser = await launchBrowser();
  page = await browser.newPage({ device: { width: 1440, height: 1100, mobile: false } });
  const click = async (label, within) => {
    await page.waitFor(dom.exists, {}, { label, within });
    await page.evaluate(dom.click, { label, within });
    await page.raf();
  };
  await page.goto(app.origin, { timeout: 120000 });
  await page.waitFor(dom.exists, {}, { text: 'Gottesdienst 14.08.2026' });
  await page.evaluate(dom.click, { text: 'Gottesdienst 14.08.2026' });
  await click('Confirm');
  await page.waitFor(dom.exists, {}, { label: 'Create cue' });
  await page.evaluate(async (base) => {
    const { store } = await import('/src/store/index.ts');
    const { settingsSlice } = await import('/src/store/settingsSlice.ts');
    const { upsertWindowConfig } = await import('/src/store/windowSlice.ts');
    store.dispatch(settingsSlice.actions.updateSetting({ key: 'mediaPath', value: base }));
    store.dispatch(upsertWindowConfig({ id: 'left', name: 'Left screen' }));
    store.dispatch(upsertWindowConfig({ id: 'right', name: 'Right screen' }));
  }, base);
  await click('Create cue');
  await page.waitFor(dom.exists, {}, { label: fileName });
  assert.deepEqual(offsets, [0, 50]);
  assert.ok(fileRequests <= 2, 'only one video thumbnail starts at a time');
  console.log('PASS audio-only first page advances correctly; sequential thumbnail requests');
  if (process.argv[2]) {
    await page.waitFor(() => !!document.querySelector('[role=dialog] img[src^="data:image/jpeg"]'), { timeout: 10000 });
    console.log('PASS video thumbnail builds automatically without hovering');
    delayVideo = true;
    await page.send('Network.enable');
    await page.send('Network.setCacheDisabled', { cacheDisabled: true });
    const point = await page.evaluate(() => {
      const img = document.querySelector('[role=dialog] img[src^="data:image/jpeg"]');
      window.previewImage = img;
      const box = img.getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    await page.waitFor(() => !!document.querySelector('[role=dialog] video'));
    assert.ok(
      await page.evaluate(
        () => window.previewImage.isConnected && getComputedStyle(document.querySelector('[role=dialog] video')).opacity === '0',
      ),
    );
    await page.waitFor(() => getComputedStyle(document.querySelector('[role=dialog] video')).opacity === '1');
    assert.ok(await page.evaluate(() => window.previewImage.isConnected));
    // A decode/network failure falls back to the same cached image.
    await page.evaluate(() => document.querySelector('[role=dialog] video').dispatchEvent(new Event('error')));
    await page.waitFor(() => getComputedStyle(document.querySelector('[role=dialog] video')).opacity === '0');
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
    await page.waitFor(() => !document.querySelector('[role=dialog] video'));
    assert.ok(await page.evaluate(() => window.previewImage.isConnected));
    delayVideo = false;
    console.log('PASS thumbnail stays visible during delayed hover loading, playback, failure and hover exit');
  }
  await click(fileName);
  await click('Use this file');
  await page.waitFor(() => !!document.querySelector('[role=dialog] input[aria-label="Left screen"]'));
  await page.evaluate(() => document.querySelector('[role=dialog] input[aria-label="Left screen"]').click());
  await page.raf();
  await page.evaluate(() => document.querySelector('[role=dialog] input[aria-label="Right screen"]').click());
  await page.waitFor(() => [...document.querySelectorAll('[role=dialog] video')].some((v) => v.duration > 0));
  const expectedDuration = await page.evaluate(
    () => [...document.querySelectorAll('[role=dialog] video')].find((v) => v.duration > 0).duration,
  );
  await sleep(100);
  writeFileSync('test/media-cue/source-setup.png', await page.screenshot());
  await click('Save', '[role=dialog]');
  await page.waitFor(() => !!document.querySelector('[data-testid=waveform-loading] [role=progressbar]'));
  assert.ok(await page.evaluate(() => document.querySelectorAll('[data-testid=waveform-loading] .MuiSkeleton-root').length > 5));
  writeFileSync('test/media-cue/waveform-loading.png', await page.screenshot());
  await page.waitFor(
    () => [...document.querySelectorAll('[data-testid=media-cue-timeline] svg rect')].some((r) => Number(r.getAttribute('height')) > 20),
    { timeout: 30000 },
  );
  const result = await page.evaluate(async () => {
    const { store } = await import('/src/store/index.ts');
    return store.getState().show.currentShow.mediaCues[0];
  });
  assert.ok(Math.abs(result.duration - expectedDuration) < 0.002, 'duration comes from the chosen video');
  assert.equal(result.sources.length, 1);
  assert.equal(result.assignments.length, 2);
  assert.ok(result.assignments.every((a) => a.sourceId === result.sources[0].id));
  assert.ok(result.sources[0].path.startsWith(base), 'preserve the selected server address');
  console.log('PASS file-first setup, automatic duration, shared source on two screens and real waveform');
  await page.waitFor(() => document.querySelector('[data-testid=main-cue-audio] audio')?.readyState >= 3);
  await click('Play / pause');
  await page.waitFor(() => {
    const a = document.querySelector('[data-testid=main-cue-audio] audio');
    return a && !a.paused && !a.muted && a.currentTime > 0.1;
  });
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('video[data-role=media-cue]')].every((v) => v.muted)));
  await click('Mute audio');
  await page.waitFor(() => !document.querySelector('[data-testid=main-cue-audio] audio'));
  assert.ok(await page.evaluate(async () => (await import('/src/media/runtime.ts')).getCuePacket().transport.playing));
  await click('Enable audio');
  await page.waitFor(() => {
    const a = document.querySelector('[data-testid=main-cue-audio] audio');
    return a && !a.paused && a.currentTime > 0.1;
  });
  await click('Stop');
  console.log('PASS one main-window audio player, muted previews and live mute without pausing video');
  // Fill representative editable sections for visual review.
  await page.evaluate(async () => {
    const { store } = await import('/src/store/index.ts');
    const { saveMediaCue } = await import('/src/store/showSlice.ts');
    const show = store.getState().show.currentShow,
      cue = show.mediaCues[0],
      d = cue.duration;
    store.dispatch(
      saveMediaCue({
        itemIndex: 0,
        binding: show.order[0].mediaCue,
        cue: {
          ...cue,
          regions: [
            { id: 'verse', kind: 'section', name: 'Verse 1', start: d * 0.05, end: d * 0.4 },
            { id: 'chorus', kind: 'section', loop: true, name: 'Chorus', start: d * 0.4, end: d * 0.85 },
            { id: 'hold', kind: 'pause', name: 'Hold for next song', start: d * 0.9, end: d * 0.9 + 0.001 },
          ],
        },
      }),
    );
  });
  await page.waitFor(() => document.querySelectorAll('[data-region-id]').length === 3);
  await page.evaluate(() => document.querySelector('[data-testid=media-cue-timeline]').scrollIntoView({ block: 'center' }));
  writeFileSync('test/media-cue/library-editor.png', await page.screenshot());
  await page.send('Emulation.setDeviceMetricsOverride', { width: 760, height: 1000, deviceScaleFactor: 1, mobile: false });
  await page.raf();
  await page.evaluate(() =>
    document.querySelector('[data-testid=media-cue-timeline]').scrollIntoView({ block: 'center', inline: 'nearest' }),
  );
  assert.ok(
    await page.evaluate(() => {
      const box = document.querySelector('[data-testid=media-cue-timeline]').getBoundingClientRect();
      return box.left >= 0 && box.right <= innerWidth + 1;
    }),
    'timeline stays inside a narrow viewport',
  );
  writeFileSync('test/media-cue/library-narrow.png', await page.screenshot());
  if (process.argv[2]) {
    const waveform = await page.evaluate(decodeWaveform, base + '/large.mp4');
    assert.equal(waveform.state, 'ready');
    assert.ok(waveform.peaks.some((v) => v > 0.01));
    assert.ok(largeBytes < 16 * 1024 * 1024, 'audio waveform must not download the 128 MB padding');
    console.log('PASS actual MP4 with virtual 128 MB padding: audio-only range reading (' + largeBytes + ' bytes)');
  }
  const noRanges = await page.evaluate(decodeWaveform, base + '/no-ranges.mp4');
  assert.equal(noRanges.state, 'ready', 'small files still work when the server ignores Range');
  if (process.argv[3]) {
    const actualServer = await page.evaluate(decodeWaveform, process.argv[3]);
    assert.equal(actualServer.state, 'ready');
    assert.ok(actualServer.peaks.some((v) => v > 0.01));
    console.log('PASS real local server URL with the original filename');
  }
  assert.equal(headRequests, 0, 'waveform works without HEAD');
  await page.evaluate(async (base) => {
    const { store } = await import('/src/store/index.ts');
    const { saveMediaCue } = await import('/src/store/showSlice.ts');
    const show = store.getState().show.currentShow;
    const cue = show.mediaCues[0];
    window.savedCue = cue;
    store.dispatch(
      saveMediaCue({
        itemIndex: 0,
        binding: show.order[0].mediaCue,
        cue: { ...cue, sources: cue.sources.map((s) => ({ ...s, path: base + '/unavailable.mp4' })) },
      }),
    );
  }, base);
  await page.waitFor(dom.exists, {}, { text: 'Cannot read the audio track' });
  assert.ok(await page.evaluate(() => !!document.querySelector('[data-testid=media-cue-timeline]')));
  await click('Retry', '[data-testid=waveform-error]');
  await page.waitFor(dom.exists, {}, { text: 'Cannot read the audio track' });
  console.log('PASS failed media request stays in the waveform field; editor remains usable with Retry');
  await page.evaluate(() => {
    window.RealWorker = window.Worker;
    window.Worker = class {
      constructor() {
        throw new DOMException('Worker blocked', 'SecurityError');
      }
    };
  });
  await click('Retry', '[data-testid=waveform-error]');
  await page.waitFor(dom.exists, {}, { text: 'Cannot read the audio track' });
  assert.ok(await page.evaluate(() => !!document.querySelector('[data-testid=media-cue-timeline]')));
  await page.evaluate(() => {
    window.Worker = window.RealWorker;
  });
  console.log('PASS worker startup failure does not blank the page');
  assert.deepEqual(page.pageErrors, []);
  // Exercise a persistent React render failure independently of network/worker errors.
  await page.evaluate(
    async (deps) => {
      const { default: React } = await import(deps + '/react.js');
      const { default: ReactDOM } = await import(deps + '/react-dom_client.js');
      const h = React.createElement;
      const { ErrorBoundary } = await import('/src/components/common/ErrorBoundary.tsx');
      const { default: I18n } = await import('/src/i18n/i18n-react.tsx');
      const host = document.createElement('div');
      host.id = 'boundary-test';
      document.body.append(host);
      window.boundaryFailure = true;
      window.boundaryReports = 0;
      const BrokenView = () => {
        if (window.boundaryFailure) throw new Error('Expected boundary regression test');
        return h('div', null, 'View recovered');
      };
      window.boundaryRoot = ReactDOM.createRoot(host);
      window.boundaryRoot.render(h(I18n, { locale: 'en' }, h(ErrorBoundary, { onError: () => window.boundaryReports++ }, h(BrokenView))));
    },
    `/@fs/${process.cwd().replaceAll('\\', '/')}/node_modules/.vite/deps`,
  );
  await page.waitFor(dom.exists, {}, { text: 'This view could not be displayed', within: '#boundary-test' });
  await click('Try again', '#boundary-test');
  await page.waitFor(() => window.boundaryReports === 2);
  assert.ok(await page.evaluate(() => !!document.querySelector('#boundary-test [role=alert]')));
  await page.evaluate(() => {
    window.boundaryFailure = false;
  });
  await click('Try again', '#boundary-test');
  await page.waitFor(dom.exists, {}, { text: 'View recovered', within: '#boundary-test' });
  await page.evaluate(() => {
    window.boundaryRoot.unmount();
    document.querySelector('#boundary-test').remove();
  });
  console.log('PASS persistent React error shows recovery UI, reports once per attempt and recovers on retry');
} catch (error) {
  if (page) {
    console.error(await page.evaluate(() => document.body.innerText));
    console.error(page.pageErrors, page.consoleMessages.slice(-4));
  }
  throw error;
} finally {
  await browser?.close();
  await app.stop();
  await new Promise((r) => server.close(r));
}
