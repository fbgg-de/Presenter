/**
 * The agenda as text for messengers and mail (utils/agendaText.ts).
 *
 *   node test/agenda-text/run.mjs
 */
import { build } from 'esbuild';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';

const dir = mkdtempSync(join(tmpdir(), 'agenda-text-'));
await build({ entryPoints: ['src/renderer/src/utils/agendaText.ts'], bundle: true, format: 'esm', outdir: dir, platform: 'node', outExtension: { '.js': '.mjs' } });
const { agendaText } = await import(pathToFileURL(join(dir, 'agendaText.mjs')).href);

let failed = 0;
const eq = (name, got, want) => {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`}`);
};

const grouped = agendaText(
  { title: 'Sunday Service', date: 'Sun 27 Sep 2026 · 10:00' },
  [
    { name: '', items: ['Welcome'] },
    { name: 'Worship', items: ['Way Maker (G)', 'Holy Spirit'] },
    { name: 'Empty', items: [] },
    { name: 'Sermon', items: ['John 3:16 (ESV)'] },
  ],
  'Other',
);
eq('groups become headings over bullets; empty groups are left out', grouped.text, [
  'Sunday Service',
  'Sun 27 Sep 2026 · 10:00',
  '',
  'Other',
  '- Welcome',
  '',
  'Worship',
  '- Way Maker (G)',
  '- Holy Spirit',
  '',
  'Sermon',
  '- John 3:16 (ESV)',
].join('\n'));

const flat = agendaText({ title: 'Probe' }, [{ name: '', items: ['A', 'B'] }], 'Other');
eq('only the unnamed group: no heading, no date line', flat.text, 'Probe\n\n- A\n- B');
eq('html has real lists', flat.html, '<p><strong>Probe</strong></p><ul><li>A</li><li>B</li></ul>');
eq('html is escaped', agendaText({ title: 'A & B' }, [{ name: '<x>', items: ['"q"'] }], 'O').html, '<p><strong>A &amp; B</strong></p><p><strong>&lt;x&gt;</strong></p><ul><li>&quot;q&quot;</li></ul>');

console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
