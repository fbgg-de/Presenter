/** PDF pages through pdf.js: every page is a static slide without builds. */
import * as pdfjs from 'pdfjs-dist';
import type { OpenedDocument } from './openDocument';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

export async function open(url: string, host: HTMLElement): Promise<OpenedDocument> {
  const pdf = await pdfjs.getDocument({ url }).promise;
  const first = (await pdf.getPage(1)).getViewport({ scale: 1 });

  /** Renders off-screen first and swaps the canvas in, so a page never flickers blank. */
  const draw = async (page: number, target: HTMLElement) => {
    const pdfPage = await pdf.getPage(page + 1);
    const base = pdfPage.getViewport({ scale: 1 });
    const width = target.clientWidth || base.width;
    const height = target.clientHeight || width / (base.width / base.height);
    const fit = Math.min(width / base.width, height / base.height);
    const viewport = pdfPage.getViewport({ scale: fit * (window.devicePixelRatio || 1) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    canvas.style.width = `${Math.round(base.width * fit)}px`;
    canvas.style.height = `${Math.round(base.height * fit)}px`;
    await pdfPage.render({ canvas, viewport }).promise;
    return canvas;
  };

  let latest = 0;
  return {
    builds: Array.from({ length: pdf.numPages }, () => 0),
    aspect: first.width / first.height,
    notes: Array.from({ length: pdf.numPages }, () => ''),
    missingFonts: [],
    timings: Array.from({ length: pdf.numPages }, () => null),
    loops: false,
    usesTimings: false,
    async drawPage(page, target) {
      target.replaceChildren(await draw(page, target));
    },
    show(page) {
      const token = ++latest;
      void draw(page, host).then((canvas) => {
        if (token === latest) host.replaceChildren(canvas);
      });
    },
    park() {
      latest++;
    },
    destroy() {
      latest++;
      host.replaceChildren();
      void pdf.destroy();
    },
  };
}
