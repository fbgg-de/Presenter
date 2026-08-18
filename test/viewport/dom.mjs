/**
 * Page-side element lookup and interaction.
 *
 * Like `probe.mjs`, every export is serialised into the browser, so each function has to be
 * self-contained. They all take the same selector shape:
 *
 *   { css }     a CSS selector
 *   { label }   accessible name — aria-label, title, or the control's own text. This is what
 *               most steps use: MUI Tooltip puts its title on the child as aria-label, so the
 *               icon-only buttons in the toolbars are all reachable by the name a user sees.
 *   { text }    visible text, matched loosely (trimmed, collapsed whitespace, case-insensitive)
 *   { nth }     which match to take when more than one qualifies (default 0)
 *   { within }  a CSS selector to scope the search to — needed once a dialog is open and the
 *               same label exists behind it
 */

/** Shared finder, inlined into each exported function below (they cannot import it). */
const FINDER = `
  const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim();
  const accName = (el) =>
    norm(el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder') || el.textContent);
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && Number(cs.opacity) !== 0;
  };
  const find = (sel) => {
    const root = sel.within ? document.querySelector(sel.within) : document;
    if (!root) return null;
    let candidates;
    if (sel.css) {
      candidates = Array.from(root.querySelectorAll(sel.css));
    } else {
      const wanted = norm(sel.label || sel.text).toLowerCase();
      const scope = sel.label
        ? 'a, button, input, select, textarea, [role="button"], [role="tab"], [role="menuitem"], [role="option"], [role="switch"], [tabindex]'
        : '*';
      candidates = Array.from(root.querySelectorAll(scope)).filter((el) => {
        const name = accName(el).toLowerCase();
        return sel.label ? name === wanted : name.includes(wanted);
      });
      // For a text match, prefer the innermost node that still contains it — otherwise
      // every wrapper up to <body> qualifies and the first match is the whole page.
      if (sel.text) candidates = candidates.filter((el) => !candidates.some((o) => o !== el && el.contains(o)));
    }
    candidates = candidates.filter(visible);
    return candidates[sel.nth || 0] || null;
  };
`;

/** Click a control. Throws with the selector in the message when nothing matches. */
export const click = new Function(
  'sel',
  `${FINDER}
  const el = find(sel);
  if (!el) throw new Error('No visible element matched ' + JSON.stringify(sel));
  el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  // A real pointer sequence, not just .click(): MUI opens menus on mousedown and several
  // controls only respond to the full press/release pair. The final 'click' is dispatched
  // rather than calling el.click(), which does not exist on SVG nodes — and an icon inside
  // a button is exactly what a { css: '[data-testid="…Icon"]' } selector lands on.
  const r = el.getBoundingClientRect();
  const at = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true, view: window };
  el.dispatchEvent(new PointerEvent('pointerdown', { ...at, pointerType: 'touch', isPrimary: true }));
  el.dispatchEvent(new MouseEvent('mousedown', at));
  el.dispatchEvent(new PointerEvent('pointerup', { ...at, pointerType: 'touch', isPrimary: true }));
  el.dispatchEvent(new MouseEvent('mouseup', at));
  el.dispatchEvent(new MouseEvent('click', at));
  return true;`,
);

/** True when a matching element is on screen. Used for waits and preconditions. */
export const exists = new Function(
  'sel',
  `${FINDER}
  return find(sel) !== null;`,
);

/** Count matching elements — for waiting until a list has actually been populated. */
export const count = new Function(
  'sel',
  `${FINDER}
  const root = sel.within ? document.querySelector(sel.within) : document;
  if (!root) return 0;
  return Array.from(root.querySelectorAll(sel.css)).filter(visible).length;`,
);

/** Type into an input, firing the events React listens for. */
export const type = new Function(
  'sel',
  'value',
  `${FINDER}
  const el = find(sel);
  if (!el) throw new Error('No visible element matched ' + JSON.stringify(sel));
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  // React tracks the previous value on the node and swallows an event whose value it thinks
  // it already knows; going through the prototype setter bypasses that tracker.
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;`,
);

/**
 * Dump every visible control with its accessible name — not used by the suite itself, but
 * the fastest way to work out what a new screen's steps should target.
 */
export const inventory = new Function(
  `${FINDER}
  const sel = 'a, button, input, select, textarea, [role="button"], [role="tab"], [role="menuitem"], [role="option"], [role="combobox"], [role="switch"]';
  return Array.from(document.querySelectorAll(sel))
    .filter(visible)
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { tag: el.tagName.toLowerCase(), name: accName(el).slice(0, 50), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width) };
    });`,
);
