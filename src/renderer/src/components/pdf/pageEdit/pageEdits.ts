/**
 * Page edits on a PDF file: move a lassoed region (onto another page or elsewhere on its own),
 * erase one, delete a page. Pure functions over the file's bytes, so what the editor previews is
 * exactly the file that gets saved.
 *
 * A moved region stays vector. The source page is embedded as a Form XObject and drawn clipped to
 * the lasso polygon at its new place, and the original spot is painted white. That *covers* the
 * old content, it does not remove it: the text is still underneath for search and copy. Right for
 * chord charts on white paper; wrong for anything that has to be redacted.
 *
 * Annotations and block mappings live outside the file, in percent of the page, so they are
 * carried along with the same edits (`remapAnnotation`, `remapMapping`).
 */
import {
  PDFDocument,
  type PDFPage,
  pushGraphicsState,
  popGraphicsState,
  moveTo,
  lineTo,
  closePath,
  clip,
  endPath,
  concatTransformationMatrix,
  drawObject,
  setFillingRgbColor,
  fill,
} from 'pdf-lib';
import type { AnnotationDto } from '@/api/pdfAnnotations.api';
import type { PdfAreaMapping } from '@/api/pdfs.api';

/** A point in PDF user space: points, origin bottom-left. */
export type Point = [number, number];

/** A page's visible box as pdf.js reports it (`page.view`): `[x0, y0, x1, y1]` in points. */
export type PageBox = [number, number, number, number];

/** Page indexes are 0-based and mean the document as it is when the edit is applied. */
export type PageEdit =
  | { kind: 'move'; from: number; to: number; polygon: Point[]; dx: number; dy: number }
  | { kind: 'erase'; page: number; polygon: Point[] }
  | { kind: 'delete'; page: number };

const outline = (polygon: Point[]) => [moveTo(...polygon[0]), ...polygon.slice(1).map(([x, y]) => lineTo(x, y)), closePath()];

const whiteOut = (page: PDFPage, polygon: Point[]) =>
  page.pushOperators(pushGraphicsState(), setFillingRgbColor(1, 1, 1), ...outline(polygon), fill(), popGraphicsState());

/** One edit, applied to a fresh load of the bytes — so every edit sees the result of the last. */
export async function applyPageEdit(bytes: Uint8Array, edit: PageEdit): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes);

  if (edit.kind === 'delete') {
    doc.removePage(edit.page);
  } else if (edit.kind === 'erase') {
    const page = doc.getPage(edit.page);
    page.node.normalize();
    whiteOut(page, edit.polygon);
  } else {
    const src = doc.getPage(edit.from);
    const dst = doc.getPage(edit.to);
    // Content that leaves a transformation behind — wkhtmltopdf's charts flip the page and never
    // restore it — would apply it to everything appended here. Wrapping it in q … Q contains it.
    src.node.normalize();
    dst.node.normalize();
    // The form keeps the page's own coordinates: its box is the real media box and its matrix the
    // identity. pdf-lib's default is a box at the origin, which on a page whose media box does not
    // start at 0,0 clips off the right and top and leaves the content unshifted.
    const media = src.getMediaBox();
    const box = { left: media.x, bottom: media.y, right: media.x + media.width, top: media.y + media.height };
    const embedded = await doc.embedPage(src, box, [1, 0, 0, 1, 0, 0]);
    // pdf-lib embeds lazily, at save time, which would copy the page *after* the white-out below
    // and move a blank. Embed now.
    await embedded.embed();
    whiteOut(src, edit.polygon);

    const name = dst.node.newXObject('Moved', embedded.ref);
    const placed = edit.polygon.map(([x, y]): Point => [x + edit.dx, y + edit.dy]);
    dst.pushOperators(
      pushGraphicsState(),
      ...outline(placed),
      clip(),
      endPath(),
      concatTransformationMatrix(1, 0, 0, 1, edit.dx, edit.dy),
      drawObject(name),
      popGraphicsState(),
    );
  }

  return doc.save();
}

// ── Coordinates ─────────────────────────────────────────────────────────────

/** Percent of the page box (origin top-left, as annotations and mappings store it) → points. */
export const percentToPoint = (box: PageBox, x: number, y: number): Point => [
  box[0] + (x / 100) * (box[2] - box[0]),
  box[3] - (y / 100) * (box[3] - box[1]),
];

export const pointToPercent = (box: PageBox, [x, y]: Point) => ({
  x: ((x - box[0]) / (box[2] - box[0])) * 100,
  y: ((box[3] - y) / (box[3] - box[1])) * 100,
});

/** Ray casting; points on the edge may land either side, which is fine for a hand-drawn lasso. */
export const insidePolygon = ([x, y]: Point, polygon: Point[]): boolean => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

// ── Carrying annotations and mappings along ─────────────────────────────────

type Placement = {
  /** 1-based, like annotations and mappings count pages. */
  page: number;
  map: (x: number, y: number) => { x: number; y: number };
  /** Size factors for widths and heights, which change when the target page is a different size. */
  scaleX: number;
  scaleY: number;
};

const unchanged = (page: number): Placement => ({ page, map: (x, y) => ({ x, y }), scaleX: 1, scaleY: 1 });

/**
 * Where something on `page` (1-based) ends up after `edit`, judged by one representative point
 * `at` in percent. `null`: its page was deleted. `boxes` are the pages *before* the edit.
 *
 * An erase leaves annotations alone: they are the musicians' own marks, not the sheet's content.
 */
export function placementAfter(edit: PageEdit, boxes: PageBox[], page: number, at: { x: number; y: number }): Placement | null {
  const index = page - 1;
  if (edit.kind === 'delete') {
    if (index === edit.page) return null;
    return unchanged(index > edit.page ? page - 1 : page);
  }
  if (edit.kind === 'erase' || index !== edit.from || !boxes[edit.from] || !boxes[edit.to]) return unchanged(page);
  if (!insidePolygon(percentToPoint(boxes[edit.from], at.x, at.y), edit.polygon)) return unchanged(page);

  const from = boxes[edit.from];
  const to = boxes[edit.to];
  return {
    page: edit.to + 1,
    map: (x, y) => {
      const [px, py] = percentToPoint(from, x, y);
      return pointToPercent(to, [px + edit.dx, py + edit.dy]);
    },
    scaleX: (from[2] - from[0]) / (to[2] - to[0]),
    scaleY: (from[3] - from[1]) / (to[3] - to[1]),
  };
}

type AnnotationPlace = Pick<AnnotationDto, 'page' | 'x' | 'y' | 'data'>;

/** The point an annotation is judged by: the middle of a stroke or box, else its anchor. */
const annotationCentre = ({ x, y, data }: AnnotationPlace) => {
  if (data.points?.length) {
    return {
      x: data.points.reduce((sum, p) => sum + p.x, 0) / data.points.length,
      y: data.points.reduce((sum, p) => sum + p.y, 0) / data.points.length,
    };
  }
  if (data.width !== undefined && data.height !== undefined) return { x: x + data.width / 2, y: y + data.height / 2 };
  return { x, y };
};

/** An annotation after `edit`; `null` when its page was deleted. */
export function remapAnnotation<T extends AnnotationPlace>(annotation: T, edit: PageEdit, boxes: PageBox[]): T | null {
  const placement = placementAfter(edit, boxes, annotation.page, annotationCentre(annotation));
  if (!placement) return null;
  const { x, y } = placement.map(annotation.x, annotation.y);
  const data = { ...annotation.data };
  if (data.points) data.points = data.points.map((p) => placement.map(p.x, p.y));
  if (data.width !== undefined) data.width *= placement.scaleX;
  if (data.height !== undefined) data.height *= placement.scaleY;
  return { ...annotation, page: placement.page, x, y, data };
}

/** A block mapping after `edit`; `null` when its page was deleted. */
export function remapMapping(mapping: PdfAreaMapping, edit: PageEdit, boxes: PageBox[]): PdfAreaMapping | null {
  const region = mapping.region;
  const centre = region ? { x: region.x + region.width / 2, y: region.y + region.height / 2 } : { x: 50, y: 50 };
  const placement = placementAfter(edit, boxes, mapping.page, centre);
  if (!placement) return null;
  if (!region) return { ...mapping, page: placement.page };
  const { x, y } = placement.map(region.x, region.y);
  return {
    ...mapping,
    page: placement.page,
    region: { x, y, width: region.width * placement.scaleX, height: region.height * placement.scaleY },
  };
}

/** Run something through every edit in order; `boxes[i]` are the pages before `edits[i]`. */
export function throughEdits<T>(
  item: T,
  edits: PageEdit[],
  boxes: PageBox[][],
  remap: (item: T, edit: PageEdit, boxes: PageBox[]) => T | null,
): T | null {
  let current: T | null = item;
  edits.forEach((edit, i) => {
    if (current) current = remap(current, edit, boxes[i]);
  });
  return current;
}
