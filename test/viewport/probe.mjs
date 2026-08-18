/**
 * The in-page checks.
 *
 * Everything here is serialised with `toString()` and evaluated inside the browser, so each
 * exported function must be self-contained: no imports, no closure over module scope, and
 * only JSON-able arguments and return values.
 *
 * What it looks for, and why each rule is written the way it is:
 *
 *   overflows-viewport   An element's border box crosses the left or right edge of the
 *                        viewport. This is the "sticks out of the screen" bug. Only the
 *                        outermost element of an overflowing chain is reported — a 480px
 *                        card in a 375px viewport otherwise reports its card, its content,
 *                        its stack and every button inside it.
 *
 *   clipped-control      An interactive control is cut in half by an ancestor with
 *                        `overflow: hidden`. This is the "settings icon is only half
 *                        visible" bug, and it does NOT show up as viewport overflow: the
 *                        clipping ancestor fits the screen perfectly, it is the icon inside
 *                        it that does not.
 *
 *   unreachable-control  An interactive control whose centre is outside the viewport, or
 *                        entirely outside its clipping ancestor. Nothing can tap it.
 *
 *   page-scrolls-x       The document itself scrolls sideways.
 *
 *   no-viewport-meta     The page never opted into device-width layout, so a phone renders
 *                        it at 980px and scales it down.
 *
 * Text truncated with an ellipsis is deliberate and is never reported.
 */

/**
 * Walk the rendered tree and return every layout finding, worst first.
 *
 * @param opts.tolerance        Pixels of slack before a crossing counts. Subpixel layout
 *                              routinely lands a box a fraction past its container; 1px
 *                              keeps that quiet.
 * @param opts.maxPerContainer  How many clipped controls to keep per clipping container
 *                              before collapsing the rest into one summary line.
 */
export function collectFindings(opts) {
  const TOL = opts.tolerance;
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const findings = [];

  // ── helpers ────────────────────────────────────────────────────────────────

  const INTERACTIVE =
    'a[href], button, input, select, textarea, summary, [role="button"], [role="tab"], [role="menuitem"], [role="switch"], [role="checkbox"], [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

  const isInteractive = (el) => el.matches(INTERACTIVE);

  /** Ripples and MUI's hidden inputs are painted outside their button on purpose. */
  const isDecorative = (el) =>
    el.closest('.MuiTouchRipple-root') !== null ||
    (el.tagName === 'INPUT' && el.classList.contains('MuiSwitch-input')) ||
    el.classList.contains('MuiBackdrop-root') ||
    el.classList.contains('MuiSkeleton-root') ||
    // MUI renders a hidden native <input> under file/select controls, sized to its parent.
    (el.tagName === 'INPUT' && getComputedStyle(el).opacity === '0');

  const isRendered = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return false;
    if (Number(cs.opacity) === 0) return false;
    // Elements parked off-screen on purpose (screen-reader text, MUI's clone measurement nodes).
    if (cs.clipPath === 'inset(50%)' || cs.clip === 'rect(0px, 0px, 0px, 0px)') return false;
    return true;
  };

  /** True while any ancestor hides the subtree — cheaper than walking styles per node. */
  const isInHiddenSubtree = (el) => {
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      if (p.hasAttribute('hidden') || p.getAttribute('aria-hidden') === 'true') {
        // aria-hidden is also set on the *inert background* of an open MUI dialog. Those nodes
        // are genuinely not on screen for the user, so skipping them is correct either way.
        return true;
      }
      if (!isRendered(p)) return true;
    }
    return false;
  };

  /** The client box of `el` in viewport coordinates (border box minus borders/scrollbars). */
  const clientBox = (el) => {
    const r = el.getBoundingClientRect();
    const left = r.left + el.clientLeft;
    const top = r.top + el.clientTop;
    return { left, top, right: left + el.clientWidth, bottom: top + el.clientHeight };
  };

  /**
   * Ancestors that cut content off with no way to reach it.
   *
   * `auto`/`scroll` are excluded: content wider than a scroller is reachable by scrolling and
   * is usually the whole point. `ellipsis` is excluded because truncating a long title with
   * "…" is a deliberate design, not a layout bug.
   */
  const clippingAncestors = (el) => {
    const out = [];
    // `body`/`html` are excluded: a control cut off by the document edge is the same fact as
    // the viewport overflow already reported above, and listing it twice buries the cases
    // where a control is clipped by a container that itself fits the screen perfectly.
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.textOverflow === 'ellipsis') return out;
      // MUI's Tabs strip clips with `overflow: hidden` and scrolls itself from JS when its
      // arrow buttons are shown, so a tab past the end is reachable even though no CSS on the
      // page says so. With the buttons switched off the same markup really does strand the
      // tab, which is why this looks for an enabled button rather than for Tabs.
      if (
        p.classList.contains('MuiTabs-scroller') &&
        p.closest('.MuiTabs-root')?.querySelector('.MuiTabs-scrollButtons:not(.Mui-disabled)')
      ) {
        return out;
      }
      const clipsX = cs.overflowX === 'hidden' || cs.overflowX === 'clip';
      const clipsY = cs.overflowY === 'hidden' || cs.overflowY === 'clip';
      if (clipsX || clipsY) out.push({ el: p, clipsX, clipsY, box: clientBox(p) });
    }
    return out;
  };

  /**
   * True when the element sits inside a container that scrolls on `axis`, so whatever is off
   * screen can still be brought into view. Without this every control below the fold of a
   * scrollable dialog reads as unreachable.
   *
   * Only real scroll containers count, never the document. Scrolling the *page* down to reach
   * something is normal; scrolling the page sideways is the bug being hunted, so it must not
   * be allowed to excuse itself. The document is consulted separately, for the y axis only.
   */
  const inScroller = (el, axis) => {
    const overflowProp = axis === 'x' ? 'overflowX' : 'overflowY';
    const scrollSize = axis === 'x' ? 'scrollWidth' : 'scrollHeight';
    const clientSize = axis === 'x' ? 'clientWidth' : 'clientHeight';
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const ov = getComputedStyle(p)[overflowProp];
      if ((ov === 'auto' || ov === 'scroll') && p[scrollSize] > p[clientSize] + 1) return true;
    }
    return false;
  };

  /**
   * A name a human can match to something on screen.
   *
   * Deliberately refuses to fall back to text for a large container: `body`'s text content is
   * the whole app, and its first `svg[data-testid]` is whichever icon happens to render first.
   * Either one makes a finding read as if it were about that icon.
   */
  const label = (el) => {
    const attr = el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder') || '';
    if (attr) return attr.trim().slice(0, 60);
    const icon = el.querySelector(':scope > svg[data-testid], :scope > * > svg[data-testid]');
    if (icon) return icon.getAttribute('data-testid');
    if (el.childElementCount > 3 && !isInteractive(el)) return '';
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    return text.slice(0, 60);
  };

  // Base classes every MUI node of a given family carries; they never say which node this is.
  const GENERIC_CLASS = /^(MuiPaper-root|MuiPaper-elevation\d*|MuiPaper-rounded|MuiButtonBase-root|MuiBox-root|MuiTypography-root)$/;

  /** Short, human-readable identity: `button.MuiIconButton-root "Settings"`. */
  const describe = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += `#${el.id}`;
    // MUI emits both semantic class names and hashed ones (`css-1q2w3e`); the hashed ones
    // change on every build, so they are dropped and the `-root` names are preferred.
    const classes = Array.from(el.classList).filter((c) => !/^css-/.test(c) && !/^Mui.*-(ripple|input)$/.test(c));
    const named = classes.filter((c) => /-root$/.test(c) && !GENERIC_CLASS.test(c));
    const cls = [...named, ...classes.filter((c) => !named.includes(c))].slice(0, 2);
    if (cls.length) s += `.${cls.join('.')}`;
    const l = label(el);
    if (l) s += ` "${l}"`;
    return s;
  };

  /** Ancestor trail, outermost first, so a finding can be located in the source. */
  const trail = (el) => {
    const parts = [];
    for (let p = el.parentElement; p && p !== document.body && parts.length < 4; p = p.parentElement) {
      let s = p.tagName.toLowerCase();
      const cls = Array.from(p.classList).filter((c) => !/^css-/.test(c))[0];
      if (cls) s += `.${cls}`;
      parts.unshift(s);
    }
    return parts.join(' > ');
  };

  const round = (n) => Math.round(n * 10) / 10;

  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    return {
      left: round(r.left),
      top: round(r.top),
      right: round(r.right),
      bottom: round(r.bottom),
      width: round(r.width),
      height: round(r.height),
    };
  };

  // ── page-level checks ──────────────────────────────────────────────────────

  if (!document.querySelector('meta[name="viewport"]')) {
    findings.push({
      rule: 'no-viewport-meta',
      element: 'head',
      detail: 'No <meta name="viewport">, so a phone lays the page out at 980px and scales it down.',
    });
  }

  const scroller = document.scrollingElement || document.documentElement;
  const pageScrollsDown = scroller.scrollHeight > scroller.clientHeight + 1;
  const pageOverflow = Math.max(scroller.scrollWidth, document.body.scrollWidth) - vw;
  if (pageOverflow > TOL) {
    findings.push({
      rule: 'page-scrolls-x',
      element: 'document',
      overflow: round(pageOverflow),
      detail: `The page is ${round(pageOverflow)}px wider than the ${vw}px viewport and scrolls sideways.`,
    });
  }

  // ── per-element checks ─────────────────────────────────────────────────────

  // Document order, so an ancestor is always examined before its descendants and the
  // outermost-offender rule below can rely on having seen it already.
  const all = Array.from(document.body.querySelectorAll('*'));
  const reportedOverflow = new WeakMap(); // el -> overflow px, for the outermost-offender rule

  for (const el of all) {
    if (isDecorative(el) || !isRendered(el) || isInHiddenSubtree(el)) continue;

    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;

    // ── viewport overflow ────────────────────────────────────────────────────
    const overRight = r.right - vw;
    const overLeft = -r.left;
    const overflow = Math.max(overRight, overLeft);

    if (overflow > TOL && !inScroller(el, 'x')) {
      // Only the outermost element of an overflowing chain is worth a line. A descendant is
      // reported separately only when it sticks out *further* than the ancestor already did.
      let coveredBy = null;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const seen = reportedOverflow.get(p);
        if (seen !== undefined && seen >= overflow - 1) {
          coveredBy = p;
          break;
        }
      }
      reportedOverflow.set(el, overflow);
      if (!coveredBy) {
        findings.push({
          rule: 'overflows-viewport',
          element: describe(el),
          trail: trail(el),
          rect: rectOf(el),
          overflow: round(overflow),
          detail:
            overRight >= overLeft
              ? `Extends ${round(overRight)}px past the right edge (right: ${round(r.right)}, viewport: ${vw}).`
              : `Starts ${round(overLeft)}px left of the screen (left: ${round(r.left)}).`,
        });
      }
    }

    // ── clipping and reachability, interactive controls only ─────────────────
    // Restricted to controls on purpose: a clipped decorative box is usually intended
    // (masked artwork, a collapsed panel mid-animation), a clipped button never is.
    if (!isInteractive(el)) continue;

    // "Off screen" only counts when nothing can scroll it back into view — otherwise every
    // control below the fold of a long settings dialog would be reported.
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const strandedX = (cx < 0 || cx > vw) && !inScroller(el, 'x');
    const strandedY = (cy < 0 || cy > vh) && !inScroller(el, 'y') && !pageScrollsDown;
    const centreOutside = strandedX || strandedY;

    let worst = null;
    for (const anc of clippingAncestors(el)) {
      const cutRight = anc.clipsX ? r.right - anc.box.right : 0;
      const cutLeft = anc.clipsX ? anc.box.left - r.left : 0;
      const cutBottom = anc.clipsY ? r.bottom - anc.box.bottom : 0;
      const cutTop = anc.clipsY ? anc.box.top - r.top : 0;
      const cut = Math.max(cutRight, cutLeft, cutBottom, cutTop);
      if (cut > TOL && (!worst || cut > worst.cut)) {
        const fully =
          (anc.clipsX && (r.left >= anc.box.right - TOL || r.right <= anc.box.left + TOL)) ||
          (anc.clipsY && (r.top >= anc.box.bottom - TOL || r.bottom <= anc.box.top + TOL));
        const axis = Math.max(cutRight, cutLeft) >= Math.max(cutBottom, cutTop) ? 'horizontally' : 'vertically';
        worst = { cut, fully, anc: anc.el, axis };
      }
    }

    if (worst && worst.fully) {
      findings.push({
        rule: 'unreachable-control',
        element: describe(el),
        trail: trail(el),
        rect: rectOf(el),
        overflow: round(worst.cut),
        clippedBy: describe(worst.anc),
        detail: `Sits entirely outside ${describe(worst.anc)}, which clips its overflow — the control cannot be seen or tapped.`,
      });
    } else if (worst) {
      const extent = worst.axis === 'horizontally' ? r.width : r.height;
      const visible = 1 - worst.cut / extent;
      findings.push({
        rule: 'clipped-control',
        element: describe(el),
        trail: trail(el),
        rect: rectOf(el),
        overflow: round(worst.cut),
        clippedBy: describe(worst.anc),
        hidden: visible,
        detail: `Cut off ${worst.axis} by ${round(worst.cut)}px of ${round(extent)}px (${Math.round(visible * 100)}% visible) by ${describe(worst.anc)}, which clips its overflow.`,
      });
    } else if (centreOutside) {
      findings.push({
        rule: 'unreachable-control',
        element: describe(el),
        trail: trail(el),
        rect: rectOf(el),
        overflow: round(Math.max(cx - vw, -cx, cy - vh, -cy)),
        detail: `Centre is outside the ${vw}x${vh} viewport, so a tap cannot land on it.`,
      });
    }
  }

  return { viewport: { width: vw, height: vh }, findings: rank(findings, opts.maxPerContainer ?? 3) };

  /**
   * Order by how much a human would care, then collapse the tail.
   *
   * One container that is too wide clips everything inside it, so the raw list is dominated
   * by a dozen restatements of a single CSS rule. Keeping the worst few per container leaves
   * the severe case (a button 50% cut) visible instead of buried among 95%-visible rows.
   */
  function rank(list, maxPerContainer) {
    const severity = {
      'no-viewport-meta': 0,
      'page-scrolls-x': 1,
      'overflows-viewport': 2,
      'unreachable-control': 3,
      'clipped-control': 4,
    };
    const sorted = list.slice().sort((a, b) => {
      const s = severity[a.rule] - severity[b.rule];
      if (s !== 0) return s;
      // Within clipped controls, "least of it left on screen" beats "most pixels lost":
      // half of a 34px icon matters more than 19px off a 385px row.
      if (a.rule === 'clipped-control') return a.hidden - b.hidden;
      return (b.overflow || 0) - (a.overflow || 0);
    });

    const kept = [];
    const perContainer = new Map();
    const dropped = new Map();
    for (const f of sorted) {
      if (f.rule !== 'clipped-control') {
        kept.push(f);
        continue;
      }
      const seen = perContainer.get(f.clippedBy) || 0;
      if (seen < maxPerContainer) {
        perContainer.set(f.clippedBy, seen + 1);
        kept.push(f);
      } else {
        dropped.set(f.clippedBy, (dropped.get(f.clippedBy) || 0) + 1);
      }
    }
    for (const [container, n] of dropped) {
      kept.push({
        rule: 'clipped-control-more',
        element: container,
        detail: `${n} further control${n === 1 ? ' is' : 's are'} clipped by this same container — almost certainly the same cause as the entries above.`,
      });
    }
    return kept;
  }
}

/**
 * Outline the offending elements so the saved screenshot shows what the report is talking
 * about. Purely visual and always applied right before the capture, so it cannot affect
 * the measurements above.
 */
export function highlight(rects) {
  const layer = document.createElement('div');
  layer.id = '__viewport_probe_overlay__';
  layer.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
  for (const r of rects) {
    const box = document.createElement('div');
    box.style.cssText = [
      'position:absolute',
      `left:${r.left}px`,
      `top:${r.top}px`,
      `width:${Math.max(r.width, 2)}px`,
      `height:${Math.max(r.height, 2)}px`,
      'outline:2px solid #ff2d55',
      'background:rgba(255,45,85,0.14)',
    ].join(';');
    layer.appendChild(box);
  }
  document.body.appendChild(layer);
  return true;
}

/** Remove the overlay again, so a later probe on the same page is unaffected. */
export function unhighlight() {
  document.getElementById('__viewport_probe_overlay__')?.remove();
  return true;
}
