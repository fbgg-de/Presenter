/**
 * Look resolution: themes across account, show and agenda group, per screen group. Themes bring a
 * colour only — pictures and videos behind the text are agenda entries (test/media-items).
 *
 *   node test/look/run.mjs
 *
 * Every rule here fails silently in the app — a wrong precedence just shows the show's colours on
 * a group that was meant to have its own — so they are pinned down one by one.
 */
import { build } from 'esbuild';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { pathToFileURL } from 'url';

const dir = mkdtempSync(join(tmpdir(), 'look-'));
await build({
  entryPoints: ['src/renderer/src/look/resolveLook.ts'],
  bundle: true,
  format: 'esm',
  outfile: join(dir, 'look.mjs'),
  platform: 'node',
  alias: { '@': resolve('src/renderer/src') },
});
const L = await import(pathToFileURL(join(dir, 'look.mjs')).href);

let failed = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a !== b) {
    failed++;
    console.log(`FAIL ${name}\n  got  ${a}\n  want ${b}`);
  } else {
    console.log(`ok   ${name}`);
  }
};

// ── Fixtures ──────────────────────────────────────────────────────────────────

const prop = (value) => ({ enabled: true, value });
const style = (id, data, over = {}) => ({ id, name: `Style ${id}`, enabled: true, data, ...over });

const styles = [
  style(1, { fontColor: prop('#ffffff'), fontSize: prop('4vw'), backgroundColor: prop('#000000') }), // account theme
  style(2, { fontColor: prop('#ffeecc'), backgroundColor: prop('#100800'), variants: { 2: { fontSize: prop('7vw') } } }), // show
  style(3, { fontColor: prop('#ccddff') }), // agenda group "Starlight"
  style(4, { fontSize: prop('3vw') }),
  // A theme saved before backgrounds moved to the agenda still stores a picture and a video.
  style(5, { backgroundVideo: prop('legacy.mp4'), backgroundImage: prop('legacy.jpg'), backgroundColor: prop('#224466') }),
  style(6, { fontColor: prop('#000000') }, { enabled: false }),
];

const input = (levels) => ({ levels, styles });
const look = (levels, group) => L.resolveLook(input(levels), group).style;

const christmas = { global: { styleId: 1 }, show: { styleId: 2 }, group: { styleId: 3 } };

// ── Themes ────────────────────────────────────────────────────────────────────

eq('nothing assigned is the default look', look({}).fontColor, '#FFFFFF');
eq('the group theme beats the show theme', look(christmas).fontColor, '#ccddff');
eq('inherited properties still come through', look(christmas).fontSize, '4vw');
eq('the colour comes from the highest theme that sets one', look(christmas).backgroundColor, '#100800');
eq('a disabled theme is skipped', look({ show: { styleId: 6 } }).fontColor, '#FFFFFF');

// ── Pictures and videos are not part of a look ────────────────────────────────

eq('an old theme video is ignored', look({ show: { styleId: 5 } }).backgroundVideo, undefined);
eq('so is its picture', look({ show: { styleId: 5 } }).backgroundImage, undefined);
eq('its colour stays', look({ show: { styleId: 5 } }).backgroundColor, '#224466');

// ── Screen groups ─────────────────────────────────────────────────────────────

const show = { global: { styleId: 1 }, show: { styleId: 2 } };
eq('a group variant changes that group', look(show, '2').fontSize, '7vw');
eq('other groups keep the base', look(show, '1').fontSize, '4vw');
eq('a variant does not beat a higher level theme', look({ ...show, group: { styleId: 4 } }, '2').fontSize, '3vw');
eq('variants make the look vary by group', L.lookVariesByGroup(input(show)), true);
eq('plain themes do not', L.lookVariesByGroup(input({ global: { styleId: 1 }, group: { styleId: 3 } })), false);

// ── Where the theme comes from ────────────────────────────────────────────────

eq('the source is the highest level with a theme', L.themeSource(input(christmas)), { level: 'group', name: 'Style 3', id: 3 });
eq('a disabled theme is not a source', L.themeSource(input({ show: { styleId: 6 } })), {});

// ── Building the input ────────────────────────────────────────────────────────

eq(
  'lookInputFor maps the app objects to levels, the group found by the item',
  L.lookInputFor({
    globalStyleId: 0,
    show: { styleId: 2, groups: [{ id: 'worship', styleId: 3 }] },
    item: { groupId: 'worship' },
  }),
  { levels: { global: {}, show: { styleId: 2 }, group: { styleId: 3 } }, styles: [] },
);
eq(
  'an item without a group id is in the default group',
  L.lookInputFor({ show: { groups: [{ id: 'default', styleId: 4 }] }, item: {} }).levels.group,
  { styleId: 4 },
);
eq('without an item there is no group', L.lookInputFor({ show: { groups: [{ id: 'default', styleId: 4 }] } }).levels.group, {});

console.log(failed ? `\n${failed} failing` : '\nall passing');
process.exit(failed ? 1 : 0);
