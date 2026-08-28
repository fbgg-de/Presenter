/**
 * Unit tests for the style editor's pure helpers.
 *
 *   node test/styles/run.mjs
 *
 * Two things live here, both fiddly enough to be worth pinning down and both free of React so
 * they bundle for plain node:
 *
 *   - `utils/cssBox.ts` — the CSS padding shorthand rules the box-model editor reads and writes.
 *     Getting the expansion wrong silently moves someone's spacing to a different edge.
 *   - `utils/cssTokens.ts` — the tokeniser behind the custom-CSS colouring. Its output is drawn
 *     underneath a transparent textarea, so the tokens must reproduce the input character for
 *     character or the colours slide out of line with the caret.
 */
import { build } from 'esbuild';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';

const dir = mkdtempSync(join(tmpdir(), 'styles-'));

await build({
  entryPoints: ['src/renderer/src/utils/cssBox.ts', 'src/renderer/src/utils/cssTokens.ts'],
  bundle: true,
  format: 'esm',
  outdir: dir,
  outbase: 'src/renderer/src',
  platform: 'node',
});

const Box = await import(pathToFileURL(join(dir, 'utils', 'cssBox.js')).href);
const Css = await import(pathToFileURL(join(dir, 'utils', 'cssTokens.js')).href);

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

// ── CSS box shorthand ─────────────────────────────────────────────────────────
//
// The four forms of the shorthand, per the CSS spec. Two values are vertical then horizontal —
// the case most easily got backwards, and the one the old two-field padding control stored.

eq('one value covers every side', Box.parseBoxShorthand('5%'), { top: '5%', right: '5%', bottom: '5%', left: '5%' });
eq('two values are vertical then horizontal', Box.parseBoxShorthand('5% 10%'), { top: '5%', right: '10%', bottom: '5%', left: '10%' });
eq('three values leave right and left equal', Box.parseBoxShorthand('1px 2px 3px'), {
  top: '1px',
  right: '2px',
  bottom: '3px',
  left: '2px',
});
eq('four values run clockwise from the top', Box.parseBoxShorthand('1px 2px 3px 4px'), {
  top: '1px',
  right: '2px',
  bottom: '3px',
  left: '4px',
});
eq('extra whitespace does not shift the sides', Box.parseBoxShorthand('  1vh   0px  '), {
  top: '1vh',
  right: '0px',
  bottom: '1vh',
  left: '0px',
});
eq('an empty value falls back', Box.parseBoxShorthand('', '0'), { top: '0', right: '0', bottom: '0', left: '0' });
eq('so does an undefined one', Box.parseBoxShorthand(undefined, '2px'), { top: '2px', right: '2px', bottom: '2px', left: '2px' });

// Collapsing keeps the stored value close to what a person would have typed
eq('all sides equal collapse to one', Box.formatBoxShorthand({ top: '5%', right: '5%', bottom: '5%', left: '5%' }), '5%');
eq('symmetric sides collapse to two', Box.formatBoxShorthand({ top: '5%', right: '10%', bottom: '5%', left: '10%' }), '5% 10%');
eq('equal sides only collapse to three', Box.formatBoxShorthand({ top: '1px', right: '2px', bottom: '3px', left: '2px' }), '1px 2px 3px');
eq('otherwise all four are written', Box.formatBoxShorthand({ top: '1px', right: '2px', bottom: '3px', left: '4px' }), '1px 2px 3px 4px');
eq('a blank side becomes zero rather than nothing', Box.formatBoxShorthand({ top: '1px', right: '', bottom: '1px', left: '' }), '1px 0');

// Round trip: editing one side of an evenly padded box must not permanently expand it
const evenly = Box.parseBoxShorthand('5%');
eq('editing one side keeps the rest', Box.formatBoxShorthand({ ...evenly, top: '8%' }), '8% 5% 5%');
eq('and setting it back re-collapses', Box.formatBoxShorthand({ ...evenly, top: '5%' }), '5%');

// ── CSS tokeniser ─────────────────────────────────────────────────────────────

const types = (source) => Css.tokeniseCss(source).map((token) => token.type);
const textOf = (source) =>
  Css.tokeniseCss(source)
    .map((token) => token.text)
    .join('');

eq('a rule splits into its parts', types('.line { color: red; }'), [
  'selector',
  'punctuation',
  'property',
  'punctuation',
  'value',
  'punctuation',
  'property',
  'punctuation',
]);

eq('a second declaration is read as one', types('.a { color: red; font-size: 4vw; }'), [
  'selector',
  'punctuation',
  'property',
  'punctuation',
  'value',
  'punctuation',
  'property',
  'punctuation',
  'value',
  'punctuation',
  'property',
  'punctuation',
]);

eq('comments are their own token', types('/* note */ .line {}'), ['comment', 'selector', 'punctuation', 'punctuation']);
eq('an at-rule is distinguished from a selector', types('@media screen { }'), ['atrule', 'punctuation', 'property', 'punctuation']);

// A colon inside a selector is part of the selector, not a declaration separator
eq('pseudo-classes stay in the selector', types('.line:hover { }'), ['selector', 'punctuation', 'property', 'punctuation']);

// Strings are held whole so a brace or semicolon inside one cannot end the rule
eq('braces inside a string do not close the block', types(`.a { content: "}"; }`), [
  'selector',
  'punctuation',
  'property',
  'punctuation',
  'value',
  'string',
  'punctuation',
  'property',
  'punctuation',
]);

// The invariant the overlay depends on: tokens reproduce the source exactly.
const SAMPLES = [
  '.line { color: red; }',
  '/* leading */\n.a, .b {\n  font-size: 4vw;\n  content: "x; y";\n}\n',
  '@media (min-width: 40em) { .a:hover { color: #fff } }',
  '',
  '   ',
  '.unclosed { color: red',
  '/* never closed',
  ".quote { content: 'unterminated",
  'no braces at all',
  '}}{{;;::',
];

let intact = true;
for (const sample of SAMPLES) {
  if (textOf(sample) !== sample) {
    intact = false;
    console.log(`FAIL tokens do not reproduce: ${JSON.stringify(sample)}\n  got ${JSON.stringify(textOf(sample))}`);
  }
}
if (!intact) failed++;
eq('tokens reproduce the source exactly', intact, true);

// Fuzz the same invariant, since malformed CSS is the normal state of a box being typed into
const ALPHABET = ['.a', '#b', '{', '}', ':', ';', '/*', '*/', '"', "'", ' ', '\n', 'red', 'color', '@media', '4vw'];
let seed = 7;
const rand = (n) => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed % n;
};

let fuzzOk = true;
for (let run = 0; run < 400 && fuzzOk; run++) {
  let source = '';
  const length = rand(14);
  for (let i = 0; i < length; i++) source += ALPHABET[rand(ALPHABET.length)];

  if (textOf(source) !== source) {
    fuzzOk = false;
    console.log(`FAIL fuzz reproduce on ${JSON.stringify(source)}\n  got ${JSON.stringify(textOf(source))}`);
  }
}
eq('fuzz: reproduces 400 random inputs', fuzzOk, true);

console.log(failed ? `\n${failed} failing` : '\nall passing');
process.exit(failed ? 1 : 0);
