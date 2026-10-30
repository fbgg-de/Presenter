import assert from 'node:assert/strict';
import ts from 'typescript';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = mkdtempSync(join(tmpdir(), 'presenter-media-server-'));
const modulePath = join(root, 'server.mjs');
writeFileSync(
  modulePath,
  ts.transpileModule(readFileSync('src/main/mediaServer.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText,
);
const { LocalMediaServer, setMediaCorsOrigins, setMediaThumbnailer, imageSizeFromHeader } = await import(pathToFileURL(modulePath));
const media = join(root, 'media');
mkdirSync(media);
mkdirSync(join(media, 'nested'));
mkdirSync(join(root, 'media-sibling'));
for (let i = 0; i < 120; i++) writeFileSync(join(media, 'audio-' + i + '.mp3'), 'audio');
for (let i = 0; i < 75; i++) writeFileSync(join(media, 'video-' + String(i).padStart(2, '0') + '.mp4'), '0123456789');
writeFileSync(join(media, 'image.png'), 'image');
for (const [name, bytes, seconds] of [
  ['a.png', 'aaa', 3000],
  ['b9.png', 'bb', 1000],
  ['b10.png', 'b', 2000],
]) {
  writeFileSync(join(media, 'nested', name), bytes);
  utimesSync(join(media, 'nested', name), seconds, seconds);
}
const server = new LocalMediaServer(media);
try {
  await server.start();
  const base = server.getBaseUrl();
  const start = performance.now();
  const first = await fetch(base + '/list?type=video&limit=50').then((r) => r.json());
  const second = await fetch(base + '/list?type=video&limit=50&offset=' + first.nextOffset).then((r) => r.json());
  assert.equal(first.totalFiles, 75);
  assert.equal(first.files.length, 50);
  assert.equal(second.files.length, 25);
  assert.deepEqual(first.dirs, ['nested']);
  const search = await fetch(base + '/list?type=video&q=video-74').then((r) => r.json());
  assert.deepEqual(search.files, ['video-74.mp4']);
  assert.equal((await fetch(base + '/list?type=image').then((r) => r.json())).files.length, 1);
  console.log('PASS typed directory pagination and whole-folder search (' + Math.round(performance.now() - start) + ' ms)');
  const names = async (query) => (await fetch(base + '/list?path=nested&' + query).then((r) => r.json())).files;
  assert.deepEqual(await names(''), ['a.png', 'b9.png', 'b10.png'], 'numbers in names sort naturally');
  assert.deepEqual(await names('order=desc'), ['b10.png', 'b9.png', 'a.png']);
  assert.deepEqual(await names('sort=size'), ['b10.png', 'b9.png', 'a.png']);
  assert.deepEqual(await names('sort=date&order=desc'), ['a.png', 'b10.png', 'b9.png']);
  assert.deepEqual(await names('sort=date&order=desc&offset=1&limit=1'), ['b10.png'], 'sorted before paging');
  const { items } = await fetch(base + '/list?path=nested').then((r) => r.json());
  assert.deepEqual(items[0], { name: 'a.png', size: 3, mtime: 3000000 });
  console.log('PASS name/date/size sorting across pages with file metadata');
  const range = await fetch(base + '/video-00.mp4', { headers: { Range: 'bytes=3-5' } });
  assert.equal(range.status, 206);
  assert.equal(range.headers.get('content-range'), 'bytes 3-5/10');
  assert.equal(await range.text(), '345');
  assert.equal(await fetch(base + '/video-00.mp4', { headers: { Range: 'bytes=-3' } }).then((r) => r.text()), '789');
  assert.equal((await fetch(base + '/video-00.mp4', { headers: { Range: 'bytes=20-' } })).status, 416);
  assert.equal((await fetch(base + '/video-00.mp4', { headers: { Range: 'bytes=5-2' } })).status, 416);

  // CORS: only the configured origins may read across origins, never any website.
  setMediaCorsOrigins(() => ['https://presenter.example']);
  const acao = async (origin) => (await fetch(base + '/list', { headers: { Origin: origin } })).headers.get('access-control-allow-origin');
  assert.equal(await acao('https://presenter.example'), 'https://presenter.example');
  assert.equal(await acao('https://evil.example'), null);
  assert.equal(await acao('null'), null);
  const exposed = await fetch(base + '/video-00.mp4', { headers: { Origin: 'https://presenter.example', Range: 'bytes=3-5' } });
  assert.match(exposed.headers.get('access-control-expose-headers'), /Content-Range/);


  assert.equal((await fetch(base + '/video-00.mp4', { method: 'HEAD' })).headers.get('content-length'), '10');
  assert.equal((await fetch(base + '/video-00.mp4', { method: 'OPTIONS' })).status, 204);
  assert.equal((await fetch(base + '/list?path=../media-sibling')).status, 403);
  assert.equal((await fetch(base + '/%2e%2e%2fmedia-sibling/secret.mp4')).status, 403);
  console.log('PASS byte ranges, HEAD, CORS and directory containment');

  // ── Thumbnail cache and image sizes ──
  const png = Buffer.alloc(33);
  png.writeUInt32BE(0x89504e47, 0);
  png.writeUInt32BE(800, 16);
  png.writeUInt32BE(600, 20);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x04, 0x38, 0x07, 0x80, 0x03]);
  const gif = Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.from([0x40, 0x01, 0xf0, 0x00])]);
  assert.deepEqual(imageSizeFromHeader(png), { width: 800, height: 600 });
  assert.deepEqual(imageSizeFromHeader(jpeg), { width: 1920, height: 1080 });
  assert.deepEqual(imageSizeFromHeader(gif), { width: 320, height: 240 });
  assert.equal(imageSizeFromHeader(Buffer.from('not an image')), null);
  mkdirSync(join(media, 'pics'));
  writeFileSync(join(media, 'pics', 'photo.jpg'), jpeg);
  writeFileSync(join(media, 'pics', 'logo.png'), png);
  const pics = await fetch(base + '/list?path=pics').then((r) => r.json());
  assert.deepEqual(
    pics.items.map((i) => [i.name, i.width, i.height]),
    [
      ['logo.png', 800, 600],
      ['photo.jpg', 1920, 1080],
    ],
  );

  const thumb = (path, w = 320, init) => fetch(base + '/thumb?path=' + encodeURIComponent(path) + '&w=' + w, init);
  assert.equal((await thumb('pics/photo.jpg')).status, 404, 'no cache folder yet: the browser loads the file');
  let made = 0;
  setMediaThumbnailer(async (file, width) => {
    made++;
    return { data: Buffer.from('thumb:' + width + ':' + file.slice(-9)), type: 'jpeg' };
  }, join(root, 'thumbs'));
  const made1 = await thumb('pics/photo.jpg', 300);
  assert.equal(made1.status, 200);
  assert.equal(made1.headers.get('content-type'), 'image/jpeg');
  assert.equal(await made1.text(), 'thumb:320:photo.jpg', 'widths snap to 160 / 320 / 640');
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(await (await thumb('pics/photo.jpg', 320)).text(), 'thumb:320:photo.jpg');
  assert.equal(made, 1, 'the second request is served from the disk cache');
  await Promise.all([thumb('pics/logo.png'), thumb('pics/logo.png')]);
  assert.equal(made, 2, 'two tiles asking at once share one job');
  writeFileSync(join(media, 'pics', 'photo.jpg'), Buffer.concat([jpeg, Buffer.from('changed')]));
  await thumb('pics/photo.jpg');
  assert.equal(made, 3, 'an overwritten file gets a new thumbnail');
  assert.equal((await thumb('../outside.jpg')).status, 404, 'nothing outside the media folder');
  assert.equal((await thumb('pics/photo.jpg', 320, { method: 'PUT', body: jpeg })).status, 405, 'only video frames are stored from outside');

  // A video: the renderer grabs one frame and its facts once; later sessions read them back.
  const frame = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.from('frame')]);
  const meta = (init) => fetch(base + '/meta?path=' + encodeURIComponent('video-00.mp4'), init);
  assert.equal((await meta()).status, 404);
  assert.equal((await thumb('video-00.mp4')).status, 404, 'no frame yet: the renderer grabs one');
  assert.equal((await thumb('video-00.mp4', 320, { method: 'PUT', body: Buffer.from('not a jpeg') })).status, 400);
  assert.equal((await thumb('video-00.mp4', 320, { method: 'PUT', body: frame })).status, 204);
  assert.equal((await meta({ method: 'PUT', body: JSON.stringify({ duration: 12.5, width: 1920, height: 1080, thumb: 1, evil: 'x' }) })).status, 204);
  assert.deepEqual(await (await meta()).json(), { duration: 12.5, width: 1920, height: 1080, thumb: 1 }, 'only the known numeric facts are kept');
  assert.deepEqual(Buffer.from(await (await thumb('video-00.mp4')).arrayBuffer()), frame);
  assert.equal(made, 3, 'video thumbnails are never generated server-side');
  setMediaThumbnailer(null, '');
  console.log('PASS thumbnail cache: header sizes, snap, disk cache, shared jobs, invalidation, video frames');
  const incoming = join(root, 'incoming');
  mkdirSync(incoming);
  mkdirSync(join(incoming, 'folder.mp4'));
  writeFileSync(join(incoming, 'new.png'), 'new');
  writeFileSync(join(incoming, 'image.png'), 'other image');
  writeFileSync(join(incoming, 'notes.txt'), 'text');
  // Prime the listing cache, so the import has to invalidate it.
  assert.equal((await fetch(base + '/list?type=image').then((r) => r.json())).files.length, 1);
  const imported = await server.importFiles(
    ['new.png', 'image.png', 'notes.txt', 'folder.mp4'].map((n) => join(incoming, n)).concat(join(media, 'image.png')),
    '',
  );
  assert.deepEqual(imported.copied, ['new.png', 'image (2).png'], 'a taken name is numbered, never overwritten');
  assert.deepEqual(
    imported.skipped.map((s) => s.reason),
    ['unsupported', 'not-a-file', 'exists'],
  );
  assert.equal(readFileSync(join(media, 'image.png'), 'utf8'), 'image', 'the existing file is untouched');
  assert.deepEqual((await fetch(base + '/list?type=image').then((r) => r.json())).files.sort(), ['image (2).png', 'image.png', 'new.png']);
  assert.deepEqual((await server.importFiles([join(incoming, 'new.png')], 'nested')).copied, ['new.png']);
  await assert.rejects(server.importFiles([join(incoming, 'new.png')], '../media-sibling'), /outside/);
  console.log('PASS upload: copy into folder, numbered duplicates, skips, cache refresh, containment');
} finally {
  await server.stop();
  // Delete only this test's verified temporary directory.
  const rel = relative(resolve(tmpdir()), resolve(root));
  assert.ok(rel.startsWith('presenter-media-server-') && !rel.includes('..') && !isAbsolute(rel));
  rmSync(root, { recursive: true, force: true });
}
