# test/viewport — small-screen layout test

Drives the real app in a real browser at phone size and reports anything that does not fit.
It exists because this class of bug is invisible on the machine the app is developed on: a
sidebar pinned to 400px looks perfect on a monitor and hides half the settings button on an
iPhone SE, and nobody finds out until someone is standing at the front of a service.

```bash
npm run test:screens
```

That starts the fixture backend and a Vite dev server on ports the OS hands out (so an
existing `npm run dev:web:mock` is undisturbed), launches headless Chrome or Edge, walks
every screen at 375×667, and exits non-zero if anything is off screen.

```bash
npm run test:screens -- --device=all       # iPhone SE, Pixel 7 and iPad mini
npm run test:screens -- --device=pixel-7   # one preset (see devices.mjs)
npm run test:screens -- login show-list    # only these screen ids
npm run test:screens -- --headed           # watch it happen in a visible window
npm run test:screens -- --verbose          # stream the dev server logs as well
npm run test:screens -- --tolerance=4      # allow 4px of slop instead of 1
```

Every screen with findings writes an annotated PNG to `screenshots/` (git-ignored) with the
offending elements outlined in red, so a report can be checked against the screen rather than
argued with. A screen that could not be reached at all is captured too, as `--error.png`.

## What it checks

| Rule                  | Means                                                                             |
| --------------------- | --------------------------------------------------------------------------------- |
| `overflows-viewport`  | An element's box crosses the left or right edge of the screen                     |
| `clipped-control`     | A button or input is cut off by an ancestor with `overflow: hidden`               |
| `unreachable-control` | A control that cannot be tapped: centre off screen, or fully outside its clip box |
| `page-scrolls-x`      | The document itself scrolls sideways                                              |
| `no-viewport-meta`    | The page never opted into device-width layout                                     |

`clipped-control` is the one that pays for the suite. It catches the case that viewport
overflow misses entirely: a container that fits the screen perfectly, holding a control that
does not. The half-visible settings gear in the sidebar toolbar is exactly that shape.

Things it deliberately does **not** report, because they are normal design:

- text truncated with `text-overflow: ellipsis`
- content wider than a container that scrolls horizontally, including MUI's `Tabs` strip while
  its arrow buttons are enabled
- anything below the fold of a scrollable dialog or a page that scrolls down

When one container clips a dozen controls, only the three worst are listed and the rest are
rolled up into a `clipped-control-more` line — they are one CSS rule, not a dozen bugs.

## Layout

| File          | Role                                                                             |
| ------------- | -------------------------------------------------------------------------------- |
| `run.mjs`     | The runner: options, the per-screen loop, reporting, screenshots                 |
| `screens.mjs` | Which screens are visited and the clicks that reach each one                     |
| `probe.mjs`   | The in-page checks. Every export is serialised into the browser                  |
| `dom.mjs`     | In-page element lookup, clicking and typing                                      |
| `devices.mjs` | Viewport presets                                                                 |
| `cdp.mjs`     | A minimal Chrome DevTools Protocol client — launch, attach, evaluate, screenshot |
| `servers.mjs` | Starts the mock backend and Vite for the run                                     |

## Why there is no Playwright here

The suite needs four things from a browser: set a viewport, navigate, run a function in the
page, take a screenshot. That is a few hundred lines of CDP over a websocket, and `ws` is
already a dependency because the relay uses it. Adding a browser-automation framework would
mean a ~150MB browser download in every checkout and CI job to get the same four calls, so
`cdp.mjs` owns them instead. It resolves Chrome or Edge from the usual install locations;
`CHROME_PATH=/path/to/chrome` overrides that if the guesses are wrong.

The trade is real: there is no auto-waiting, no network interception, no trace viewer. If this
grows into general end-to-end testing rather than layout checking, that trade stops being
worth it.

## Adding a screen

Append an entry to `screens.mjs`:

```js
{
  id: 'my-screen',
  name: 'Human readable name',
  // optional — skip on viewports where this screen does not exist at all
  appliesWhen: (device) => device.width < 600,
  open: async (ui) => {
    await ui.loadShow();
    await ui.tab('Shows');
    await ui.click({ label: 'Set Lists' });
    await ui.waitFor({ css: '[role="dialog"]' });
    await ui.settle();
  },
}
```

Selectors are `{ label }` (accessible name — MUI puts a `Tooltip` title on its child as
`aria-label`, so the icon-only toolbar buttons are all reachable by the name a user sees),
`{ text }` for a loose visible-text match, or `{ css }`. Add `within: '<css>'` to scope the
search once a dialog is open, and `nth` to pick among several matches.

To work out what to target on a new screen, `dom.mjs` exports `inventory`, which dumps every
visible control with its accessible name and position.

## Fixtures and coverage gaps

Data comes from `test/mock-backend`, whose fixtures are deliberately awkward — long German
titles with umlauts, multi-author credits, 7-digit CCLI numbers. Layout bugs show up on
strings like those and hide behind `Song 1`. A screen that needs a new shape of data wants a
fixture added there rather than a special case here.

Known gaps:

- **The style editor is not covered.** `/rest/Styles` returns `[]` in the mock, so the style
  submenus that open the editor never render. Covering it means adding style fixtures first.
- **The musician view, `/control` and the admin pages are not covered**, by choice.
- **Only the layouts the fixtures produce are checked.** An empty show, a show with 40 items or
  a set list with no entries can each break differently, and none of them is visited today.
