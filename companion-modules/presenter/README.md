# Presenter module for Bitfocus Companion

Connects to the WebSocket server built into the Presenter desktop app (`src/main/wsServer.ts`,
port 9001) and turns its `state_update` broadcasts into Companion variables, feedbacks and presets.
It replaces pasting JSON commands into Companion's generic WebSocket module.

Local-only: never published to the Companion module store.

## What it offers

- **Actions**: next/previous slide, entry and line; go to an agenda entry (picked by title) or a
  slide; black and hide text (toggle/on/off); media play/pause/stop/seek; identify windows.
- **Presets**: navigation labelled with what comes next, black/text with their on-air colours,
  media transport, one button per agenda entry (32) and per slide of the live entry (16) — slides
  in Presenter's section colours, the one on screen red.
- **Variables**: `$(presenter:itemTitle)`, `nextItemTitle`, `slideName`, `nextSlideName`,
  `slideNumber`/`slideCount`, `item_1`…`item_32`, `slide_1`…`slide_16` and more.

## Loading it

1. `yarn install` in this folder (the repo's Yarn: `node ../../.yarn/releases/yarn-4.18.0.cjs install`),
   then `yarn build`.
2. In the Companion launcher, set **Developer modules path** to `companion-modules` — the _parent_
   of this folder — and restart Companion.
3. Add an **efsh-presenter** connection and point it at the machine running Presenter.

`npm run package:companion` in the repo root builds the ready-to-extract zip into `dist-app/`;
a published release attaches it (scripts/package-artifacts.cjs).

## Keeping both ends in step

The wire format is the app's: `useBroadcastCompanionState.ts` (state), `useWsCompanionCommands.ts`
and `wsServer.ts` (commands). `npm run test:companion` runs this module's client against the real
server, so a change on one side that the other misses fails there.

This folder is outside the app's Yarn workspace, excluded from `electron-builder.yml`, the app's
eslint and its tsconfigs: it targets a different Node runtime and must not leak into the app bundle.
