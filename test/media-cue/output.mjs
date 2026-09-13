import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { launchBrowser, sleep } from '../viewport/cdp.mjs';
import { startApp } from '../viewport/servers.mjs';
import * as dom from '../viewport/dom.mjs';

// A deterministic PCM fixture exercises native media decoding and waveform extraction.
const sampleRate = 8000,
  samples = sampleRate * 4,
  wav = Buffer.alloc(44 + samples * 2);
wav.write('RIFF');
wav.writeUInt32LE(wav.length - 8, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24);
wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(samples * 2, 40);
for (let i = 0; i < samples; i++)
  wav.writeInt16LE(Math.round(Math.sin((i / sampleRate) * 440 * Math.PI * 2) * (i < samples / 2 ? 2000 : 16000)), 44 + i * 2);
const media = createServer((req, res) => {
  const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '');
  const start = range ? Number(range[1]) : 0,
    end = range?.[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1;
  res.writeHead(range ? 206 : 200, {
    'Content-Type': 'audio/wav',
    'Accept-Ranges': 'bytes',
    'Content-Length': end - start + 1,
    ...(range ? { 'Content-Range': `bytes ${start}-${end}/${wav.length}` } : {}),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(wav.subarray(start, end + 1));
});
await new Promise((r) => media.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${media.address().port}/fixture.wav`;
const app = await startApp();
let browser,
  pages = [];
try {
  browser = await launchBrowser();
  pages = await Promise.all([browser.newPage(), browser.newPage()]);
  await Promise.all(pages.map((p) => p.send('Emulation.setFocusEmulationEnabled', { enabled: true })));
  await Promise.all(pages.map((p) => p.goto(`${app.origin}/presentation.html`, { timeout: 120000 })));
  const base = {
    id: 'cue',
    name: 'Fixture',
    duration: 4,
    sources: [{ id: 'source', name: 'Fixture', path: url, type: 'video', offset: 0 }],
    regions: [{ id: 'hold', kind: 'pause', name: 'Hold', start: 1, end: 1.001 }],
    assignments: [],
    audioSourceId: 'source',
  };
  const frame = { crop: { x: 0, y: 0, w: 0.5, h: 1 }, x: 50, y: 50, scale: 100, fit: 'fill', blur: 0 };
  const packet = {
    cue: base,
    at: Date.now(),
    transport: { session: 'test', revision: 1, time: 0, playing: false, enabled: {}, bypass: [], exitLoop: false },
  };
  const publish = async () =>
    Promise.all(
      pages.map((page, i) =>
        page.evaluate(
          async (packet, frame, i) => {
            const { updatePresentation } = await import('/src/presentation/index.tsx');
            const { EMPTY_CONTENT } = await import('/src/presentation/types.ts');
            updatePresentation({
              content: {
                ...EMPTY_CONTENT,
                contentType: i ? 'media' : 'song',
                mediaSubType: 'video',
                mediaCue: {
                  ...packet,
                  assignment: { role: `screen${i}`, sourceId: 'source', frame: { ...frame, crop: { ...frame.crop, x: i * 0.5 } } },
                  audioOwner: i === 0,
                },
              },
            });
          },
          packet,
          frame,
          i,
        ),
      ),
    );
  await publish();
  await Promise.all(pages.map((p) => p.waitFor(() => document.querySelector('video')?.readyState >= 3)));
  assert.deepEqual(await Promise.all(pages.map((p) => p.evaluate(() => document.querySelector('video').muted))), [true, true]);
  assert.deepEqual(await Promise.all(pages.map((p) => p.evaluate(() => document.querySelectorAll('video').length))), [1, 1]);
  assert.deepEqual(await Promise.all(pages.map((p) => p.evaluate(() => getComputedStyle(document.querySelector('video')).opacity))), [
    '1',
    '1',
  ]);
  console.log('PASS independent crops, muted presentation outputs, native source decoding');
  packet.transport.playing = true;
  packet.transport.revision++;
  packet.at = Date.now();
  await publish();
  await sleep(1500);
  const holds = await Promise.all(
    pages.map((p) =>
      p.evaluate(() => {
        const v = document.querySelector('video');
        return { paused: v.paused, time: v.currentTime };
      }),
    ),
  );
  assert.ok(
    holds.every((v) => v.paused && Math.abs(v.time - 1) < 0.025),
    JSON.stringify(holds),
  );
  console.log('PASS both output clocks stop at a pause without an operator polling command');
  packet.transport.time = 1;
  packet.transport.revision++;
  packet.at = Date.now();
  await publish();
  await sleep(350);
  const times = await Promise.all(pages.map((p) => p.evaluate(() => document.querySelector('video').currentTime)));
  assert.ok(times.every((t) => t > 1.1) && Math.abs(times[0] - times[1]) < 0.12, JSON.stringify(times));
  console.log('PASS outputs resume and maintain bounded native-media drift');
  packet.transport.playing = false;
  packet.transport.time = 2.5;
  packet.transport.revision++;
  packet.at = Date.now();
  await publish();
  await Promise.all(
    pages.map((p) =>
      p.waitFor(
        () => {
          const v = document.querySelector('video');
          return v.paused && !v.seeking && Math.abs(v.currentTime - 2.5) < 0.025;
        },
        { timeout: 2000 },
      ),
    ),
  );
  assert.ok(pages.every((p) => p.pageErrors.length === 0));
  console.log('PASS coordinated seek and no output exceptions');
  const operator = pages[0];
  await operator.goto(app.origin, { timeout: 120000 });
  await operator.waitFor(dom.exists, { timeout: 20000 }, { text: 'Gottesdienst 14.08.2026' });
  await operator.evaluate(dom.click, { text: 'Gottesdienst 14.08.2026' });
  await operator.evaluate(dom.click, { label: 'Confirm' });
  await operator.waitFor(dom.exists, {}, { label: 'Create cue' });
  await operator.evaluate(async (cue) => {
    const { store } = await import('/src/store/index.ts');
    const { saveMediaCue } = await import('/src/store/showSlice.ts');
    store.dispatch(
      saveMediaCue({
        cue: { ...cue, waveformSourceId: 'source' },
        itemIndex: 0,
        binding: { cueId: cue.id, lyrics: {}, followVideo: false, followLyrics: false },
      }),
    );
  }, base);
  await operator.waitFor(
    () => {
      const bars = [...document.querySelectorAll('[data-testid=media-cue-timeline] svg rect')];
      return bars.length > 20 && Math.max(...bars.map((r) => Number(r.getAttribute('height')))) > 50;
    },
    { timeout: 20000 },
  );
  const peaks = await operator.evaluate(() =>
    [...document.querySelectorAll('[data-testid=media-cue-timeline] svg rect')].map((r) => Number(r.getAttribute('height'))),
  );
  assert.ok(peaks[Math.floor(peaks.length * 0.75)] > peaks[Math.floor(peaks.length * 0.25)] * 4);
  console.log('PASS real waveform extraction preserves quiet/loud source sections');
} catch (error) {
  for (const p of pages)
    console.error(
      await p.evaluate(() => ({
        html: document.body.innerHTML.slice(-1500),
        videos: [...document.querySelectorAll('video')].map((v) => ({
          src: v.src,
          data: v.dataset,
          paused: v.paused,
          seeking: v.seeking,
          time: v.currentTime,
          ready: v.readyState,
          error: v.error?.message,
          duration: v.duration,
        })),
      })),
      p.pageErrors,
      p.consoleMessages.slice(-4),
    );
  throw error;
} finally {
  await browser?.close();
  await app.stop();
  await new Promise((r) => media.close(r));
}
