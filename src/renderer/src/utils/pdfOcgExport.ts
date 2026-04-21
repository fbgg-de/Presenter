/**
 * PDF OCG (Optional Content Group) Export Utilities
 *
 * Uses pdf-lib's low-level API to embed annotations as named,
 * toggleable layers inside a PDF for export/download purposes.
 *
 * This module is used ONLY for the "Download PDF with annotations" feature.
 * All annotation storage is now database-backed — see pdfAnnotations.api.ts.
 *
 * Implementation note: annotations are written directly into each page's
 * content stream (not as XObject Do references) so they are visible in
 * all PDF viewers including Microsoft PowerPoint and LibreOffice.
 * Each layer is still wrapped in an OCG Marked Content block
 * (/OC BDC … EMC) so compliant viewers (Acrobat, Preview) can toggle them.
 */
import { PDFDocument, PDFName, PDFString, PDFArray, PDFDict, PDFRef, rgb, StandardFonts } from 'pdf-lib';
import type { AnnotationEntry } from '@/components/pdf/PdfAnnotationToolbar';

/** Get the intrinsic page width (in PDF points) for page 1. Returns 612 as fallback. */
export async function getPdfPageWidth(pdfBytes: ArrayBuffer): Promise<number> {
  try {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    if (pdfDoc.getPageCount() === 0) return 612;
    const { width } = pdfDoc.getPage(0).getSize();
    return width || 612;
  } catch {
    return 612;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseHexColor(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return rgb(r, g, b);
}

/** Format a number with max 4 decimals, avoiding "-0" */
function n(v: number): string {
  const s = Number(v.toFixed(4));
  return String(s === 0 ? 0 : s);
}

// ─── Build content stream operators for one page's annotations ───────────────

function buildPageStream(
  anns: AnnotationEntry[],
  pw: number,
  ph: number,
  fonts: { regular: string; bold: string; italic: string; boldItalic: string },
): string {
  const ops: string[] = [];

  for (const ann of anns) {
    if (ann.tool === 'draw' && ann.points && ann.points.length > 1) {
      const c = parseHexColor(ann.color);
      const alpha = ann.opacity ?? 1;
      ops.push('q');
      if (alpha < 1) ops.push(`/GS_S${Math.round(alpha * 100)} gs`);
      ops.push(`${n(c.red)} ${n(c.green)} ${n(c.blue)} RG`);
      ops.push(`${n(ann.lineWidth)} w`);
      ops.push('1 J 1 j'); // round cap & join
      const first = ann.points[0];
      ops.push(`${n((first.x / 100) * pw)} ${n(ph - (first.y / 100) * ph)} m`);
      for (let i = 1; i < ann.points.length; i++) {
        const p = ann.points[i];
        ops.push(`${n((p.x / 100) * pw)} ${n(ph - (p.y / 100) * ph)} l`);
      }
      ops.push('S');
      ops.push('Q');
    } else if (ann.tool === 'highlight' && ann.rect) {
      const c = parseHexColor(ann.color);
      const opacity = ann.opacity ?? 0.25;
      const x = (ann.rect.x / 100) * pw;
      const y = ph - ((ann.rect.y + ann.rect.height) / 100) * ph;
      const w = (ann.rect.width / 100) * pw;
      const h = (ann.rect.height / 100) * ph;
      ops.push('q');
      ops.push(`/GS_A${Math.round(opacity * 100)} gs`);
      ops.push(`${n(c.red)} ${n(c.green)} ${n(c.blue)} rg`);
      ops.push(`${n(x)} ${n(y)} ${n(w)} ${n(h)} re f`);
      ops.push('Q');
    } else if (ann.tool === 'text' && ann.position && ann.text) {
      const c = parseHexColor(ann.color);
      const alpha = ann.opacity ?? 1;
      const size = ann.fontSize || 14;
      const tx = (ann.position.x / 100) * pw;
      const ty = ph - (ann.position.y / 100) * ph;
      let fontKey = fonts.regular;
      if (ann.fontBold && ann.fontItalic) fontKey = fonts.boldItalic;
      else if (ann.fontBold) fontKey = fonts.bold;
      else if (ann.fontItalic) fontKey = fonts.italic;

      ops.push('q');
      if (alpha < 1) ops.push(`/GS_S${Math.round(alpha * 100)} gs`);
      ops.push('BT');
      ops.push(`/${fontKey} ${n(size)} Tf`);
      ops.push(`${n(c.red)} ${n(c.green)} ${n(c.blue)} rg`);
      ops.push(`${n(tx)} ${n(ty)} Td`);
      const escaped = ann.text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
      ops.push(`(${escaped}) Tj`);
      ops.push('ET');

      if (ann.fontUnderline) {
        const approxWidth = size * 0.5 * ann.text.length;
        const underlineY = ty - 2;
        ops.push(`${n(c.red)} ${n(c.green)} ${n(c.blue)} RG`);
        ops.push(`${n(Math.max(0.5, size / 14))} w`);
        ops.push(`${n(tx)} ${n(underlineY)} m ${n(tx + approxWidth)} ${n(underlineY)} l S`);
      }
      ops.push('Q');
    }
    // Note: icon annotations use uploaded SVGs and cannot be trivially embedded
    // as vector content in the PDF content stream without rasterisation.
    // They are intentionally omitted from the export for now.
  }

  return ops.join('\n');
}

function collectOpacities(annotations: AnnotationEntry[]): { fill: Set<number>; stroke: Set<number> } {
  const fill = new Set<number>();
  const stroke = new Set<number>();
  for (const ann of annotations) {
    const op = Math.round((ann.opacity ?? 1) * 100);
    if (ann.tool === 'highlight') {
      fill.add(op);
    } else if (ann.tool === 'draw') {
      stroke.add(op);
    } else if (ann.tool === 'text') {
      fill.add(op);
      stroke.add(op); // used for underline stroke
    }
  }
  return { fill, stroke };
}

// ─── Internal: Register an OCG ref in the catalog's OCProperties ─────────────

function _registerOcg(pdfDoc: PDFDocument, ocgRef: PDFRef): void {
  const ctx = pdfDoc.context;
  const catalog = pdfDoc.catalog;
  const existing = catalog.get(PDFName.of('OCProperties'));
  if (existing instanceof PDFDict) {
    const ocgsArr = existing.get(PDFName.of('OCGs'));
    if (ocgsArr instanceof PDFArray) (ocgsArr as any).push(ocgRef);
    const dDict = existing.get(PDFName.of('D'));
    if (dDict instanceof PDFDict) {
      const onArr = dDict.get(PDFName.of('ON'));
      if (onArr instanceof PDFArray) (onArr as any).push(ocgRef);
      const orderArr = dDict.get(PDFName.of('Order'));
      if (orderArr instanceof PDFArray) (orderArr as any).push(ocgRef);
    }
  } else {
    const ocProps = ctx.obj({
      OCGs: [ocgRef],
      D: ctx.obj({
        Name: PDFString.of('Default'),
        ON: [ocgRef],
        Order: [ocgRef],
      }),
    });
    catalog.set(PDFName.of('OCProperties'), ocProps);
  }
}

// ─── Public: Export PDF with annotation layers as OCG groups ──────────────────

export interface ExportLayerData {
  layerName: string;
  annotations: AnnotationEntry[];
}

/**
 * Create a PDF with all annotation layers embedded as OCG (Optional Content Groups).
 *
 * Annotations are written **directly into each page's content stream** so they
 * are visible in all PDF viewers including Microsoft PowerPoint and LibreOffice.
 * Each layer is wrapped in an OCG Marked Content section (/OC BDC … EMC) so
 * compliant viewers (Adobe Acrobat, macOS Preview) can still toggle visibility.
 *
 * @param pdfBytes  The original clean PDF bytes
 * @param layers    Array of layers with their annotations
 * @returns PDF bytes with all annotation layers embedded
 */
export async function exportPdfWithAnnotations(pdfBytes: ArrayBuffer, layers: ExportLayerData[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const ctx = pdfDoc.context;

  // Embed fonts once
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const fontBoldItalic = await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique);
  const fontNames = { regular: 'F_AR', bold: 'F_AB', italic: 'F_AI', boldItalic: 'F_ABI' };

  // Collect all opacities across all layers and build ExtGState entries
  const allAnnotations = layers.flatMap((l) => l.annotations);
  const { fill: fillOps, stroke: strokeOps } = collectOpacities(allAnnotations);
  const gsRefs: Record<string, PDFRef> = {};
  for (const op of fillOps) {
    const key = `GS_A${op}`;
    if (!gsRefs[key]) gsRefs[key] = ctx.register(ctx.obj({ Type: 'ExtGState', ca: op / 100 }));
  }
  for (const op of strokeOps) {
    const key = `GS_S${op}`;
    if (!gsRefs[key]) gsRefs[key] = ctx.register(ctx.obj({ Type: 'ExtGState', CA: op / 100 }));
  }

  // Font object references keyed by resource name
  const fontRefs: Record<string, PDFRef> = {
    [fontNames.regular]: (fontRegular as any).ref,
    [fontNames.bold]: (fontBold as any).ref,
    [fontNames.italic]: (fontItalic as any).ref,
    [fontNames.boldItalic]: (fontBoldItalic as any).ref,
  };

  for (const layer of layers) {
    if (layer.annotations.length === 0) continue;

    // Create OCG and register it in the catalog
    const ocgRef = ctx.register(ctx.obj({ Type: 'OCG', Name: PDFString.of(layer.layerName) }));
    _registerOcg(pdfDoc, ocgRef);

    // The OCG Properties resource key used inside BDC
    const ocgResKey = `Ann_${layer.layerName.replace(/\W/g, '_')}`;

    // Group annotations by page
    const pageGroups = new Map<number, AnnotationEntry[]>();
    for (const ann of layer.annotations) {
      const list = pageGroups.get(ann.page) ?? [];
      list.push(ann);
      pageGroups.set(ann.page, list);
    }

    for (const [pageNum, pageAnns] of pageGroups.entries()) {
      const pageIdx = pageNum - 1;
      if (pageIdx < 0 || pageIdx >= pdfDoc.getPageCount()) continue;
      const page = pdfDoc.getPage(pageIdx);
      const { width: pw, height: ph } = page.getSize();

      const annotOps = buildPageStream(pageAnns, pw, ph, fontNames);
      if (!annotOps.trim()) continue;

      // Wrap operators in q/Q and OCG marked-content section
      const layerBlock = `q\n/OC /${ocgResKey} BDC\n${annotOps}\nEMC\nQ\n`;

      // ── Merge fonts into page Resources/Font ──
      const resources = page.node.Resources();
      if (!resources) continue;
      const fontDictRaw = resources.get(PDFName.of('Font'));
      let fontDict: PDFDict;
      if (fontDictRaw instanceof PDFRef) {
        fontDict = ctx.lookup(fontDictRaw) as PDFDict;
      } else if (fontDictRaw instanceof PDFDict) {
        fontDict = fontDictRaw;
      } else {
        fontDict = ctx.obj({}) as unknown as PDFDict;
        resources.set(PDFName.of('Font'), fontDict);
      }
      for (const [name, ref] of Object.entries(fontRefs)) {
        if (!(fontDict as any).get(PDFName.of(name))) (fontDict as any).set(PDFName.of(name), ref);
      }

      // ── Merge ExtGState into page Resources/ExtGState ──
      if (Object.keys(gsRefs).length > 0) {
        const gsRaw = resources.get(PDFName.of('ExtGState'));
        let gsDict: PDFDict;
        if (gsRaw instanceof PDFRef) {
          gsDict = ctx.lookup(gsRaw) as PDFDict;
        } else if (gsRaw instanceof PDFDict) {
          gsDict = gsRaw;
        } else {
          gsDict = ctx.obj({}) as unknown as PDFDict;
          resources.set(PDFName.of('ExtGState'), gsDict);
        }
        for (const [name, ref] of Object.entries(gsRefs)) {
          if (!(gsDict as any).get(PDFName.of(name))) (gsDict as any).set(PDFName.of(name), ref);
        }
      }

      // ── Register OCG in page Resources/Properties for BDC ──
      const propsRaw = resources.get(PDFName.of('Properties'));
      let propsDict: PDFDict;
      if (propsRaw instanceof PDFRef) {
        propsDict = ctx.lookup(propsRaw) as PDFDict;
      } else if (propsRaw instanceof PDFDict) {
        propsDict = propsRaw;
      } else {
        propsDict = ctx.obj({}) as unknown as PDFDict;
        resources.set(PDFName.of('Properties'), propsDict);
      }
      (propsDict as any).set(PDFName.of(ocgResKey), ocgRef);

      // ── Append annotation stream to page Contents ──
      const annotStreamRef = ctx.register(ctx.stream(layerBlock));
      const contentsRaw = page.node.get(PDFName.of('Contents'));
      if (!contentsRaw) {
        page.node.set(PDFName.of('Contents'), annotStreamRef);
      } else if (contentsRaw instanceof PDFArray) {
        (contentsRaw as any).push(annotStreamRef);
      } else {
        // Existing contents is a single ref — promote to array
        const arr = ctx.obj([contentsRaw, annotStreamRef]);
        page.node.set(PDFName.of('Contents'), arr);
      }
    }
  }

  return pdfDoc.save();
}
