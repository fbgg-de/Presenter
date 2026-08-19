/**
 * Small-screen layout test.
 *
 * Drives the real app in a real browser at phone size and reports anything that does not fit:
 * elements past the edge of the screen, controls cut in half by a container that clips, and
 * controls nothing can tap. It exists because those bugs are invisible on a desktop monitor
 * and nobody notices them until a service is starting.
 *
 *   npm run test:screens                     # iPhone SE, every screen
 *   npm run test:screens -- --device=all     # every device preset
 *   npm run test:screens -- login control    # only these screen ids
 *   npm run test:screens -- --headed         # watch it happen
 *   npm run test:screens -- --verbose        # stream the dev server logs too
 *
 * The app is started for the run — a Vite dev server and the fixture backend from
 * `test/mock-backend`, both on ports the OS hands out, so an already-running `dev:web:mock`
 * is not disturbed. Nothing here talks to a real backend or a real account.
 *
 * A failing screen writes an annotated PNG to `test/viewport/screenshots/`, with every
 * offending element outlined, so the report can be checked against what the screen looked
 * like rather than argued with.
 *
 * Exit code is 1 when any screen has findings, so CI can gate on it.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, sleep } from './cdp.mjs';
import { startApp } from './servers.mjs';
import { DEVICES } from './devices.mjs';
import { screens } from './screens.mjs';
import * as dom from './dom.mjs';
import * as probe from './probe.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, 'screenshots');

// ── options ─────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const VERBOSE = flag('verbose');
const HEADED = flag('headed');
const only = argv.filter((a) => !a.startsWith('--'));
const deviceArg = option('device', 'iphone-se');
const tolerance = Number(option('tolerance', '1'));

const devices = deviceArg === 'all' ? Object.values(DEVICES) : [DEVICES[deviceArg]];
if (devices.some((d) => !d)) {
  console.error(`Unknown device "${deviceArg}". Available: ${Object.keys(DEVICES).join(', ')}, all`);
  process.exit(2);
}

const selected = only.length ? screens.filter((s) => only.includes(s.id)) : screens;
if (!selected.length) {
  console.error(`No screen matched ${only.join(', ')}. Available: ${screens.map((s) => s.id).join(', ')}`);
  process.exit(2);
}

// ── output ──────────────────────────────────────────────────────────────────

const C = { dim: '\x1b[90m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', bold: '\x1b[1m', off: '\x1b[0m' };
const say = (s = '') => console.log(s);

/** Findings that fail the run. `clipped-control-more` is a roll-up of ones already counted. */
const isFailure = (f) => f.rule !== 'clipped-control-more';

// ── run ─────────────────────────────────────────────────────────────────────

rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });

say(`${C.bold}Small-screen layout test${C.off}`);
say(`${C.dim}${selected.length} screen(s) × ${devices.length} device(s), ${tolerance}px tolerance${C.off}`);
say();

const app = await startApp({ verbose: VERBOSE });
say(`${C.dim}app:     ${app.origin}${C.off}`);
const browser = await launchBrowser({ headless: !HEADED });
say(`${C.dim}browser: ${browser.binary}${C.off}`);
say();

const results = [];

try {
  for (const device of devices) {
    say(`${C.bold}${device.name}${C.off} ${C.dim}${device.width}×${device.height}${C.off}`);

    for (const screen of selected) {
      if (screen.appliesWhen && !screen.appliesWhen(device)) {
        say(`  ${C.dim}skip  ${screen.name} (${screen.id}) — does not exist at this width${C.off}`);
        continue;
      }

      // A page per screen: no leaked dialog, scroll position or focus from the screen before,
      // which is what makes an ordering-dependent suite flake at 3am and pass on a rerun.
      const page = await browser.newPage({ device });
      const ui = makeUi(page, app.origin);
      const result = { device: device.id, screen: screen.id, name: screen.name, findings: [], error: null, shot: null };

      try {
        await screen.open(ui);
        await page.raf();
        const { findings } = await page.evaluate(probe.collectFindings, { tolerance, maxPerContainer: 3 });
        result.findings = findings;

        if (findings.some(isFailure)) {
          const rects = findings.filter((f) => f.rect).map((f) => f.rect);
          await page.evaluate(probe.highlight, rects);
          const png = await page.screenshot();
          const file = path.join(SHOTS, `${device.id}--${screen.id}.png`);
          writeFileSync(file, png);
          result.shot = file;
          await page.evaluate(probe.unhighlight);
        }
      } catch (err) {
        result.error = err.message;
        try {
          const png = await page.screenshot();
          const file = path.join(SHOTS, `${device.id}--${screen.id}--error.png`);
          writeFileSync(file, png);
          result.shot = file;
        } catch {
          // The page may be gone entirely; the error message is the useful part either way.
        }
      } finally {
        await page.close();
      }

      report(result);
      results.push(result);
    }
    say();
  }
} finally {
  await browser.close();
  await app.stop();
}

// ── summary ─────────────────────────────────────────────────────────────────

const broken = results.filter((r) => r.error);
const failed = results.filter((r) => !r.error && r.findings.some(isFailure));
const passed = results.length - broken.length - failed.length;

say(`${C.bold}Summary${C.off}`);
say(
  `  ${C.green}${passed} clean${C.off}   ${C.red}${failed.length} with findings${C.off}   ${C.yellow}${broken.length} could not be reached${C.off}`,
);

if (failed.length) {
  const total = failed.reduce((n, r) => n + r.findings.filter(isFailure).length, 0);
  say(`  ${total} finding(s) across ${failed.length} screen(s). Annotated screenshots in ${path.relative(process.cwd(), SHOTS)}`);
}

process.exit(broken.length || failed.length ? 1 : 0);

// ── helpers ─────────────────────────────────────────────────────────────────

function report(result) {
  const tag = result.error
    ? `${C.yellow}ERROR${C.off}`
    : result.findings.some(isFailure)
      ? `${C.red}FAIL ${C.off}`
      : `${C.green}ok   ${C.off}`;
  say(`  ${tag} ${result.name} ${C.dim}(${result.screen})${C.off}`);

  if (result.error) {
    say(`        ${C.yellow}could not reach this screen: ${result.error}${C.off}`);
    return;
  }
  for (const f of result.findings) {
    const colour = f.rule === 'clipped-control-more' ? C.dim : C.red;
    say(`        ${colour}[${f.rule}]${C.off} ${f.element}`);
    say(`        ${C.dim}${f.detail}${C.off}`);
    if (f.trail) say(`        ${C.dim}in: ${f.trail}${C.off}`);
  }
  if (result.shot) say(`        ${C.dim}screenshot: ${path.relative(process.cwd(), result.shot)}${C.off}`);
}

/**
 * True once React has painted something. Not just `#root`: when the app opens with the show
 * selector, everything on screen is a portalled dialog and `#root` stays empty.
 */
function appMounted() {
  const root = document.getElementById('root');
  if (root && root.childElementCount > 0) return true;
  return !!document.querySelector('body > div:not(#root)');
}

/** The helper surface `screens.mjs` is written against. */
function makeUi(page, origin) {
  const ui = {
    async goto(to) {
      await page.goto(origin + to);
      // Without this, every later step races the first render.
      await page.waitFor(appMounted, { label: 'the app to mount' });
    },
    /**
     * Click a control, waiting for it to show up first.
     *
     * The wait is the whole point. Nearly every step here follows a React state change —
     * a tab switch, a dialog opening, a query resolving — and a bare click loses that race
     * often enough to fail one screen per run while its neighbours, doing the same thing,
     * pass. Waiting here rather than in each screen keeps the definitions readable and
     * stops the suite reporting a layout problem when it really just clicked too early.
     */
    async click(sel, { timeout = 5000 } = {}) {
      await ui.waitFor(sel, { timeout });
      return page.evaluate(dom.click, sel);
    },
    async type(sel, value, { timeout = 5000 } = {}) {
      await ui.waitFor(sel, { timeout });
      return page.evaluate(dom.type, sel, value);
    },
    exists: (sel) => page.evaluate(dom.exists, sel),

    /**
     * Switch to one of the two bottom-nav tabs.
     *
     * A no-op above the `sm` breakpoint: there the sidebar and the control pane are both on
     * screen at once and no tab bar is rendered, so every screen definition can name the tab
     * it wants and still be meaningful on a tablet-width run.
     */
    async tab(name) {
      const sel = { label: name, within: '.MuiBottomNavigation-root' };
      if (await ui.exists(sel)) await ui.click(sel);
    },
    waitFor: (sel, opts = {}) => page.waitFor(dom.exists, { ...opts, label: `element ${JSON.stringify(sel)}` }, sel),
    waitGone: (sel, opts = {}) =>
      page.waitFor(
        new Function('sel', `return !(${dom.exists.toString()})(sel);`),
        { ...opts, label: `element ${JSON.stringify(sel)} to disappear` },
        sel,
      ),
    settle: (ms = 250) => sleep(ms),

    /** First run of the app: no persisted show, no saved settings. */
    async freshStart() {
      await ui.goto('/');
      await page.evaluate(() => {
        localStorage.clear();
        return true;
      });
      await page.reload();
      await page.waitFor(appMounted, { label: 'the app to mount' });
    },

    /** Get to the operator view with a show open, whichever state the app starts in. */
    async loadShow() {
      await ui.freshStart();
      await ui.waitFor({ text: 'Gottesdienst 14.08.2026' }, { timeout: 15000 });
      await ui.click({ text: 'Gottesdienst 14.08.2026' });
      await ui.click({ label: 'Confirm' });
      // Either layout: the tab bar on a phone, the always-visible sidebar toolbar above it.
      await ui.waitFor({ css: '.MuiBottomNavigation-root, [data-testid="SettingsIcon"]' }, { timeout: 15000 });
      // Selecting a show kicks off the song fetch; the list is what most screens act on next.
      await ui.settle(800);
    },
  };
  return ui;
}
