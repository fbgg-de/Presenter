/**
 * PowerPoint files through pptx-vanilla-viewer, which draws slides as HTML and plays their
 * transitions and click animations. Its version is pinned exactly in package.json: the package
 * changes almost daily, and this module leans on details of it that are not public API — the
 * store fields read below, its class names, and how its show reacts to `next()`.
 *
 * On a screen the viewer runs its own slide show; this module only steps it. The show takes one
 * step at a time and ignores a step while it is still animating, so steps are queued and each
 * waits until the host has no running animation. A step forward animates like PowerPoint; any
 * other move goes to the page (a step back restarts it, see `restartPage`) and replays its builds
 * up to the step.
 */
import { createDefaultRegistry, createPptxViewer, renderSlideStage } from 'pptx-vanilla-viewer';
import type { DocumentStep } from './document';
import type { OpenedDocument } from './openDocument';

type StageOptions = Parameters<typeof renderSlideStage>[0];
type Slide = StageOptions['slide'];

/** What this module reads from the viewer beyond its public API. */
interface ViewerInternals {
  store: {
    get(): {
      slides: Slide[];
      presenting: boolean;
      canvasSize: StageOptions['canvasSize'];
      mediaDataUrls: StageOptions['mediaDataUrls'];
      colorScheme?: StageOptions['colorScheme'];
      fontScheme?: StageOptions['fontScheme'];
      presentationProperties?: { loopContinuously?: boolean; advanceMode?: 'manual' | 'useTimings' };
    };
    subscribe(listener: () => void): () => void;
  };
  t: StageOptions['t'];
}

const HOST_ATTR = 'data-document-host';

/**
 * The viewer's show insists on the Fullscreen API and ends when fullscreen ends. A screen window
 * is already full-screen and the operator's preview is an iframe that must not take over the
 * screen, so fullscreen requests from inside a document host are answered without doing anything.
 */
let fakeFullscreen: Element | null = null;
let fullscreenPatched = false;
function patchFullscreen() {
  if (fullscreenPatched) return;
  fullscreenPatched = true;
  const realElement = Object.getOwnPropertyDescriptor(Document.prototype, 'fullscreenElement')?.get;
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => fakeFullscreen ?? realElement?.call(document) ?? null,
  });
  const announce = () => queueMicrotask(() => document.dispatchEvent(new Event('fullscreenchange')));
  const realRequest = Element.prototype.requestFullscreen;
  Element.prototype.requestFullscreen = function (this: Element, options?: FullscreenOptions) {
    if (!this.closest(`[${HOST_ATTR}]`)) return realRequest.call(this, options);
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- the element the show asked to make fullscreen
    fakeFullscreen = this;
    announce();
    return Promise.resolve();
  };
  const realExit = Document.prototype.exitFullscreen;
  Document.prototype.exitFullscreen = function (this: Document) {
    if (!fakeFullscreen) return realExit.call(this);
    fakeFullscreen = null;
    announce();
    return Promise.resolve();
  };
}

/** The show's own controls, counter and notices never belong on a screen. */
let styleAdded = false;
function addStyle() {
  if (styleAdded) return;
  styleAdded = true;
  const style = document.createElement('style');
  style.textContent = `
    [${HOST_ATTR}] .pptxv-present-toolbar-wrap, [${HOST_ATTR}] .pptxv-presentation-touch-controls,
    [${HOST_ATTR}] .pptxv-compat-toasts, [${HOST_ATTR}] .pptxv-notes-toolbar,
    [${HOST_ATTR}] .pptxv-present-counter { display: none !important; }
  `;
  document.head.appendChild(style);
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Font names a deck uses: its theme's and every text run's (theme tokens like "+mn-lt" aside). */
function fontsOf(slides: readonly Slide[], scheme: StageOptions['fontScheme']): string[] {
  const names = new Set<string>();
  const add = (name: unknown) => {
    if (typeof name === 'string' && name.trim() && !name.startsWith('+')) names.add(name.trim());
  };
  add(scheme?.majorFont?.latin);
  add(scheme?.minorFont?.latin);
  const seen = new Set<object>();
  const walk = (value: unknown) => {
    if (!value || typeof value !== 'object' || seen.has(value) || ArrayBuffer.isView(value)) return;
    seen.add(value);
    const record = value as Record<string, unknown>;
    add(record.fontFamily);
    Object.values(record).forEach(walk);
  };
  slides.forEach((slide) => walk(slide.elements));
  return [...names];
}

/** Whether this computer has a font: a sample in it measures differently from every generic fallback. */
function installed(font: string): boolean {
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return true;
  const sample = 'mmmmmmmmmmlli WWQ@#0123';
  return ['monospace', 'serif', 'sans-serif'].some((fallback) => {
    context.font = `72px ${fallback}`;
    const plain = context.measureText(sample).width;
    context.font = `72px "${font.replace(/"/g, '')}", ${fallback}`;
    return context.measureText(sample).width !== plain;
  });
}

/** Resolves once nothing in `host` animates any more (endless loops aside), for at most 15 s. */
async function idle(host: HTMLElement) {
  const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
  const started = performance.now();
  let quiet = 0;
  await frame();
  while (quiet < 2 && performance.now() - started < 15_000) {
    await frame();
    const running = host.getAnimations({ subtree: true }).filter((a) => a.effect?.getComputedTiming().endTime !== Infinity);
    quiet = running.length ? 0 : quiet + 1;
  }
}

export function open(url: string, host: HTMLElement): Promise<OpenedDocument> {
  patchFullscreen();
  addStyle();
  host.setAttribute(HOST_ATTR, '');
  return new Promise((resolve, reject) => {
    const viewer = createPptxViewer(host, {
      source: url,
      showToolbar: false,
      showThumbnails: false,
      editable: false,
      autosave: false,
      fitPadding: 0,
      onLoad: () => resolve(opened(viewer, host)),
      onError: (message) => {
        viewer.destroy();
        reject(new Error(message));
      },
    });
  });
}

function opened(viewer: ReturnType<typeof createPptxViewer>, host: HTMLElement): OpenedDocument {
  const internals = viewer as unknown as ViewerInternals;
  const state = () => internals.store.get();
  // Hidden slides are skipped by the show, as in PowerPoint, so they are not pages here either.
  const slideOf = state()
    .slides.map((slide, index) => (slide.hidden ? -1 : index))
    .filter((index) => index >= 0);
  const builds = slideOf.map((index) => (state().slides[index].nativeAnimations ?? []).filter((a) => a.trigger === 'onClick').length);
  // Timed slides would advance one screen on its own; the operator's app turns them instead (their
  // timings go to the entry, see document/autoAdvance.ts).
  const timings = slideOf.map((index) => state().slides[index].transition?.advanceAfterMs ?? null);
  for (const slide of state().slides) if (slide.transition) slide.transition.advanceAfterMs = undefined;
  const registry = createDefaultRegistry();
  /** How long entering a slide animates. The show starts it a moment late, so idle alone can miss it. */
  const transitionMs = (index: number) => {
    const transition = state().slides[index].transition;
    return transition ? (transition.durationMs ?? 1000) : 0;
  };

  let target: DocumentStep | null = null;
  /** What the show displays; null until it has been started. */
  let at: DocumentStep | null = null;
  let running = false;
  let destroyed = false;
  let unsubscribe: (() => void) | undefined;

  /**
   * Back within a page: the show cannot take a build back, and going to the slide it is on does
   * nothing — so it goes to a neighbour and back in the same tick. With both transitions switched
   * off for that moment only the page, back at its start, is ever painted; its builds then replay.
   */
  const restartPage = (page: number) => {
    const slides = state().slides;
    const index = slideOf[page];
    const neighbour = slideOf[page > 0 ? page - 1 : page + 1];
    const saved = [slides[neighbour].transition, slides[index].transition];
    slides[neighbour].transition = undefined;
    slides[index].transition = undefined;
    viewer.goToSlide(neighbour);
    viewer.goToSlide(index);
    [slides[neighbour].transition, slides[index].transition] = saved;
  };

  const pump = async () => {
    if (running) return;
    running = true;
    try {
      while (!destroyed && target && !(at && at.page === target.page && at.step === target.step)) {
        const to: DocumentStep = target;
        if (at && to.page === at.page && to.step > at.step) {
          // One build further — also how a jump catches up with a later build.
          viewer.next();
          at = { page: at.page, step: at.step + 1 };
        } else if (at && to.page === at.page + 1 && to.step === 0 && at.step >= builds[at.page]) {
          viewer.next();
          at = to;
          await delay(transitionMs(slideOf[to.page]));
        } else if (at && to.page === at.page && slideOf.length > 1) {
          restartPage(to.page);
          at = { page: to.page, step: 0 };
        } else if (at && to.page === at.page) {
          // ponytail: a one-page deck has no neighbour to restart through, so a step back is dropped
          // and the page stays as built as it is; re-entering the show (setMode) could reset it.
          target = at;
        } else {
          viewer.goToSlide(slideOf[to.page]);
          at = { page: to.page, step: 0 };
          await delay(transitionMs(slideOf[to.page]));
        }
        await idle(host);
      }
    } finally {
      running = false;
    }
  };

  return {
    builds,
    aspect: state().canvasSize.width / state().canvasSize.height,
    notes: slideOf.map((index) => state().slides[index].notes ?? ''),
    missingFonts: fontsOf(state().slides, state().fontScheme).filter((font) => !installed(font)),
    timings,
    loops: !!state().presentationProperties?.loopContinuously,
    usesTimings: state().presentationProperties?.advanceMode !== 'manual',
    async drawPage(page, target) {
      const { slides, canvasSize, mediaDataUrls, colorScheme, fontScheme } = state();
      const scale = Math.min(target.clientWidth / canvasSize.width, (target.clientHeight || Infinity) / canvasSize.height);
      const box = document.createElement('div');
      box.style.cssText = `position:relative;overflow:hidden;margin:auto;width:${canvasSize.width * scale}px;height:${canvasSize.height * scale}px`;
      box.appendChild(
        renderSlideStage({
          document,
          slide: slides[slideOf[page]],
          canvasSize,
          mediaDataUrls,
          colorScheme,
          fontScheme,
          registry,
          t: internals.t,
          scale,
        }),
      );
      target.replaceChildren(box);
    },
    show(page, step) {
      if (!unsubscribe) {
        // The show also ends when something leaves fullscreen (a double-click on the window):
        // resume it — but only one that had started, or its own start-up would loop.
        let presenting = false;
        unsubscribe = internals.store.subscribe(() => {
          if (state().presenting) presenting = true;
          else if (presenting && !destroyed) {
            presenting = false;
            at = null;
            viewer.setMode('present');
            void pump();
          }
        });
        viewer.setMode('present');
      }
      target = { page: Math.min(Math.max(0, page), slideOf.length - 1), step: Math.max(0, step) };
      void pump();
    },
    park() {
      if (!unsubscribe) return;
      // Out of the show and back in on the next `show`, which enters its page afresh.
      unsubscribe();
      unsubscribe = undefined;
      target = null;
      at = null;
      viewer.setMode('preview');
      if (fakeFullscreen && host.contains(fakeFullscreen)) fakeFullscreen = null;
      host.querySelectorAll('video, audio').forEach((media) => (media as HTMLMediaElement).pause());
    },
    destroy() {
      destroyed = true;
      unsubscribe?.();
      if (fakeFullscreen && host.contains(fakeFullscreen)) fakeFullscreen = null;
      viewer.destroy();
      host.removeAttribute(HOST_ATTR);
    },
  };
}
