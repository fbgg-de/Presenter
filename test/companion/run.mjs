/**
 * The Companion module's client against the desktop app's real WebSocket server.
 *
 *   node test/companion/run.mjs
 *
 * Both ends are bundled from source (src/main/wsServer.ts, companion-modules/presenter/src/
 * client.ts), so a protocol change on either side that the other does not follow fails here:
 * state reaching a fresh connection, commands reaching the renderer, answers reaching the module.
 */
import { build } from 'esbuild';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';

const dir = mkdtempSync(join(tmpdir(), 'companion-'));
await build({
  entryPoints: { server: 'src/main/wsServer.ts', client: 'companion-modules/presenter/src/client.ts' },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outdir: dir,
  outExtension: { '.js': '.mjs' },
  external: ['ws', 'electron'],
  // `ws` resolves from the presenter's node_modules for both bundles.
  nodePaths: [join(process.cwd(), 'node_modules')],
});
const { PresenterWebSocketServer } = await import(pathToFileURL(join(dir, 'server.mjs')).href);
const { PresenterClient } = await import(pathToFileURL(join(dir, 'client.mjs')).href);

let failed = 0;
const check = (name, ok) => {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}`);
};
const until = async (fn, ms = 2000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return false;
};

const toRenderer = [];
const windowManager = { fadeToBlack() {}, fadeFromBlack() {}, identifyWindows() {}, getWindowStates: () => [] };
const port = 19000 + Math.floor(Math.random() * 500);
const server = new PresenterWebSocketServer(port, windowManager);
server.setMainWindow({ isDestroyed: () => false, webContents: { send: (channel, data) => toRenderer.push({ channel, data }) } });
server.start();

// The renderer has already broadcast once before Companion connects.
server.broadcastStateUpdate({
  sentAt: Date.now() - 60000,
  itemIndex: 1,
  showItemCount: 3,
  itemTitle: 'Way Maker',
  blockName: 'Chorus',
  isBlack: false,
  items: [{ title: 'Welcome', type: 'media' }, { title: 'Way Maker', type: 'song' }, { title: 'Johannes 3,16', type: 'bible_verse' }],
  blocks: [{ name: 'Verse 1', color: '#3b82f6' }, { name: 'Chorus', color: '#a855f7' }],
});

let state = null;
const statuses = [];
const client = new PresenterClient({ onState: (s) => (state = s), onStatus: (s) => statuses.push(s.state), onLog: () => {} });
client.connect('127.0.0.1', port);

check('connects', await until(() => statuses.includes('connected')));
check('receives the last state on connect', await until(() => state?.itemTitle === 'Way Maker'));
check('fills fields an older Presenter omits', state?.isTextHidden === false && state?.nextItemTitle === '');
check('keeps section colours', state?.blocks?.[1]?.color === '#a855f7');

await client.send('next_block');
check('next_block reaches the renderer', toRenderer.some((m) => m.channel === 'ws-navigation-action' && m.data.action === 'next_block'));
await client.send('set_text_hidden', { value: true });
check('set_text_hidden carries its value', toRenderer.some((m) => m.data?.action === 'set_text_hidden' && m.data.payload?.value === true));
await client.send('set_item', { index: 2 });
check('set_item carries its index', toRenderer.some((m) => m.data?.action === 'set_item' && m.data.payload?.index === 2));

await client.send('stage', { layerId: 7, command: 'go' });
check('stage commands carry layer and command', toRenderer.some((m) => m.data?.action === 'stage' && m.data.payload?.layerId === 7 && m.data.payload?.command === 'go'));
for (const action of ['take', 'set_mode', 'toggle_background', 'toggle_media_layer', 'toggle_stage_overlays']) await client.send(action, { mode: 'toggle' });
check('operator and layer commands reach the renderer', ['take', 'set_mode', 'toggle_background', 'toggle_media_layer', 'toggle_stage_overlays'].every((a) => toRenderer.some((m) => m.channel === 'ws-navigation-action' && m.data.action === a)));
await client.send('master_speed', { step: 0.05 });
check('master_speed reaches the renderer with its step', toRenderer.some((m) => m.channel === 'ws-video-action' && m.data.action === 'master_speed' && m.data.payload?.step === 0.05));
await client.send('video_toggle');
check('video_toggle reaches the video channel', toRenderer.some((m) => m.channel === 'ws-video-action' && m.data.action === 'video_toggle'));

// A replayed state carries a fresh sentAt, so timers are not corrected by a stale clock.
let lateState = null;
const late = new PresenterClient({ onState: (s) => (lateState = s), onStatus: () => {}, onLog: () => {} });
late.connect('127.0.0.1', port);
check('replayed state has a fresh sentAt', await until(() => lateState && Math.abs(lateState.sentAt - Date.now()) < 1000));
late.disconnect();

server.broadcastStateUpdate({ itemIndex: 2, itemTitle: 'Johannes 3,16', isBlack: true, items: [], blocks: [] });
check('follows later broadcasts', await until(() => state?.isBlack === true && state.itemTitle === 'Johannes 3,16'));

let rejected = false;
await client.send('no_such_action').catch(() => (rejected = true));
check('an unknown action is rejected, not left hanging', rejected);

server.setCommandHandlingEnabled(false);
rejected = false;
await client.send('next_block').catch(() => (rejected = true));
check('paused command handling rejects commands', rejected);

client.disconnect();
server.stop();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
