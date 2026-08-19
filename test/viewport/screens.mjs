/**
 * The screens the suite visits, and how to get to each one.
 *
 * A screen is a *state*, not a URL: most of what an operator looks at on a phone is a dialog,
 * a menu or a tab within one page, and those are exactly the places where a fixed pixel width
 * survives from the desktop layout. So each entry carries the clicks that put the app into
 * that state, and the probe runs once it has settled.
 *
 * Deliberately not covered: the musician view, the mobile remote (`/control`) and the admin
 * pages. `/control` is already phone-first by construction, and the other two were excluded
 * from this pass.
 *
 * Adding a screen: append an entry. `open(ui)` receives the helpers below; if it throws, the
 * screen is reported as an error rather than silently passing. An optional
 * `appliesWhen(device)` skips the screen on viewports where it does not exist at all.
 *
 *   ui.goto(path)            navigate, and wait for the app to have rendered something
 *   ui.click(sel)            click the first visible match (see dom.mjs for the selector shape)
 *   ui.type(sel, value)      set an input's value the way React notices
 *   ui.waitFor(sel)          wait until a match appears
 *   ui.waitGone(sel)         wait until no match remains
 *   ui.settle(ms)            let animations and transitions finish
 *   ui.tab(name)             switch bottom-nav tab (a no-op on layouts that show both panes)
 *   ui.loadShow()            get to the operator view with a show open
 */

const DIALOG = '[role="dialog"]';
const MENU = '.MuiMenu-paper, [role="menu"]';

export const screens = [
  {
    id: 'login',
    name: 'Login — account selection',
    open: async (ui) => {
      await ui.goto('/login');
      await ui.waitFor({ css: '[role="combobox"]' });
      await ui.settle();
    },
  },
  {
    id: 'login-account-list',
    name: 'Login — account dropdown open',
    open: async (ui) => {
      await ui.goto('/login');
      await ui.waitFor({ css: '[role="combobox"]' });
      await ui.click({ css: '[role="combobox"]' });
      await ui.waitFor({ css: '[role="listbox"]' });
      await ui.settle();
    },
  },
  {
    id: 'show-selector',
    name: 'Show selector',
    open: async (ui) => {
      await ui.freshStart();
      await ui.waitFor({ css: DIALOG });
      // The list arrives from the API a beat after the dialog frame does.
      await ui.waitFor({ text: 'Gottesdienst 14.08.2026' });
      await ui.settle();
    },
  },
  {
    id: 'show-selector-item-menu',
    name: 'Show selector — per-show actions menu',
    // Only exists below the `sm` breakpoint: above it the four row actions are separate icon
    // buttons and there is no menu to open.
    appliesWhen: (device) => device.width < 600,
    open: async (ui) => {
      await ui.freshStart();
      await ui.waitFor({ text: 'Gottesdienst 14.08.2026' });
      await ui.click({ label: 'More actions' });
      await ui.waitFor({ css: MENU });
      await ui.settle();
    },
  },
  {
    id: 'control',
    name: 'Operator — Control tab',
    open: async (ui) => {
      await ui.loadShow();
      await ui.tab('Control');
      await ui.settle();
    },
  },
  {
    id: 'show-list',
    name: 'Operator — Shows tab (sidebar)',
    open: async (ui) => {
      await ui.loadShow();
      await ui.tab('Shows');
      await ui.waitFor({ label: 'Settings' });
      await ui.settle();
    },
  },
  {
    id: 'show-list-add-menu',
    name: 'Operator — Add item menu',
    open: async (ui) => {
      await ui.loadShow();
      await ui.tab('Shows');
      await ui.click({ label: 'Add Item' });
      await ui.waitFor({ css: MENU });
      await ui.settle();
    },
  },
  {
    id: 'show-list-item-menu',
    name: 'Operator — show item context menu',
    open: async (ui) => {
      await ui.loadShow();
      await ui.tab('Shows');
      await ui.waitFor({ text: 'Way Maker' });
      // The row's trailing ⋮; the toolbar above has no MoreVert, so the first one is the item's.
      await ui.click({ css: 'button:has([data-testid="MoreVertIcon"])' });
      await ui.waitFor({ css: MENU });
      await ui.settle();
    },
  },
  {
    id: 'search',
    name: 'Operator — song search',
    open: async (ui) => {
      await ui.loadShow();
      await ui.tab('Shows');
      await ui.click({ label: 'Search Songs' });
      await ui.settle();
      await ui.type({ css: 'input[type="text"], input:not([type])' }, 'Way');
      await ui.settle(600);
    },
  },
  {
    id: 'account-menu',
    name: 'Operator — account menu',
    open: async (ui) => {
      await ui.loadShow();
      await ui.tab('Shows');
      await ui.click({ label: 'Account' });
      await ui.waitFor({ css: MENU });
      await ui.settle();
    },
  },
  {
    id: 'set-lists',
    name: 'Set lists',
    open: async (ui) => {
      await ui.loadShow();
      await ui.tab('Shows');
      await ui.click({ label: 'Set Lists' });
      await ui.waitFor({ css: DIALOG });
      await ui.settle();
    },
  },
  {
    id: 'settings',
    name: 'Settings',
    open: async (ui) => {
      await ui.loadShow();
      await ui.tab('Shows');
      await ui.click({ label: 'Settings' });
      await ui.waitFor({ css: DIALOG });
      await ui.settle();
    },
  },
  {
    id: 'settings-general',
    name: 'Settings — General category',
    open: async (ui) => {
      await ui.loadShow();
      await ui.tab('Shows');
      await ui.click({ label: 'Settings' });
      await ui.waitFor({ css: DIALOG });
      await ui.click({ text: 'General', within: DIALOG });
      await ui.settle(500);
    },
  },
  {
    id: 'settings-remote',
    name: 'Settings — Remote Control category',
    // The viewer-token block and its QR code live here; both are fixed-size by nature.
    // At phone width the category list is a scrollable tab strip, so this taps a tab.
    open: async (ui) => {
      await ui.loadShow();
      await ui.tab('Shows');
      await ui.click({ label: 'Settings' });
      await ui.waitFor({ css: DIALOG });
      await ui.click({ text: 'Remote Control', within: DIALOG });
      await ui.settle(500);
    },
  },
  {
    id: 'settings-presentation',
    name: 'Settings — Presentation category',
    open: async (ui) => {
      await ui.loadShow();
      await ui.tab('Shows');
      await ui.click({ label: 'Settings' });
      await ui.waitFor({ css: DIALOG });
      await ui.click({ text: 'Presentation', within: DIALOG });
      await ui.settle(500);
    },
  },
];
