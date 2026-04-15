/**
 * Generic SVG icon renderer for Canvas 2D.
 *
 * Uploaded SVGs are fetched from the server and cached as HTMLImageElement
 * instances. Icons are rendered at a base size of 24×24 CSS pixels
 * (scaled by the current zoom factor).
 */

// ─── In-memory image cache ────────────────────────────────────────────────────

const imageCache = new Map<string, HTMLImageElement>();
const pendingLoads = new Map<string, Promise<HTMLImageElement>>();

/**
 * Load and cache an SVG image from a URL.
 * Returns a resolved HTMLImageElement suitable for `ctx.drawImage`.
 */
export function loadSvgImage(url: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(url);
  if (cached) return Promise.resolve(cached);

  const pending = pendingLoads.get(url);
  if (pending) return pending;

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageCache.set(url, img);
      pendingLoads.delete(url);
      resolve(img);
    };
    img.onerror = (err) => {
      pendingLoads.delete(url);
      reject(err);
    };
    img.src = url;
  });
  pendingLoads.set(url, promise);
  return promise;
}

/** Clear the image cache (e.g. when icons are uploaded/deleted). */
export function clearSvgImageCache(): void {
  imageCache.clear();
  pendingLoads.clear();
}

// ─── Canvas 2D renderer ───────────────────────────────────────────────────────

/** Base icon size in CSS pixels (before zoom scaling) */
export const ICON_BASE_SIZE = 24;

/**
 * Draw an uploaded SVG icon onto a Canvas 2D context.
 *
 * When a `color` is provided, the icon is drawn with a colour tint applied
 * via an offscreen canvas and `globalCompositeOperation = 'source-in'`.
 *
 * Guards against zero/NaN size or unloaded images (naturalWidth/naturalHeight === 0)
 * to prevent `InvalidStateError: The image argument is a canvas element with a
 * width or height of 0`.
 *
 * @param ctx    Canvas 2D rendering context
 * @param img    Pre-loaded HTMLImageElement (from {@link loadSvgImage})
 * @param cx     Center X in canvas pixels
 * @param cy     Center Y in canvas pixels
 * @param size   Bounding-box width/height in canvas pixels (typically ICON_BASE_SIZE × zoom)
 * @param color  Optional tint colour (e.g. '#ff0000'). If provided the icon
 *               is colourised using the alpha channel of the original SVG.
 */
export function drawSvgIconOnCanvas(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  cy: number,
  size: number,
  color?: string,
): void {
  // Bail out if size is invalid or the image hasn't fully decoded yet
  const drawSize = Math.ceil(size);
  if (!drawSize || drawSize <= 0 || !img.complete || (img.naturalWidth === 0 && img.naturalHeight === 0)) {
    return;
  }

  const x = cx - size / 2;
  const y = cy - size / 2;

  if (color) {
    // Use an offscreen canvas to apply a colour tint to the icon
    const offscreen = document.createElement('canvas');
    offscreen.width = drawSize;
    offscreen.height = drawSize;
    const offCtx = offscreen.getContext('2d');
    if (offCtx) {
      // Draw the original icon
      offCtx.drawImage(img, 0, 0, drawSize, drawSize);
      // Fill with the annotation colour, keeping only the original alpha mask
      offCtx.globalCompositeOperation = 'source-in';
      offCtx.fillStyle = color;
      offCtx.fillRect(0, 0, drawSize, drawSize);
      ctx.drawImage(offscreen, x, y);
    } else {
      ctx.drawImage(img, x, y, drawSize, drawSize);
    }
  } else {
    ctx.drawImage(img, x, y, drawSize, drawSize);
  }
}
