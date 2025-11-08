import { PDFDocument, PDFName } from "pdf-lib";

function rgbToHex(r, g, b) {
  const to255 = (x) => Math.max(0, Math.min(255, Math.round(x * 255)));
  const rr = to255(r).toString(16).padStart(2, "0");
  const gg = to255(g).toString(16).padStart(2, "0");
  const bb = to255(b).toString(16).padStart(2, "0");
  return `#${rr}${gg}${bb}`.toUpperCase();
}

// PDF rect (x,y from bottom-left) -> our top-left base coordinates
function pdfRectToBase(rect, pageW, pageH, baseW, baseH) {
  const x = (rect.x / pageW) * baseW;
  const width = (rect.width / pageW) * baseW;
  const yTop = pageH - (rect.y + rect.height);
  const y = (yTop / pageH) * baseH;
  const height = (rect.height / pageH) * baseH;
  return { x, y, width, height };
}

function quadPointsToRects(quads) {
  // Each quad: [x1,y1,x2,y2,x3,y3,x4,y4] (top-left, top-right, bottom-left, bottom-right)
  const rects = [];
  for (let i = 0; i + 7 < quads.length; i += 8) {
    const xs = [quads[i], quads[i + 2], quads[i + 4], quads[i + 6]];
    const ys = [quads[i + 1], quads[i + 3], quads[i + 5], quads[i + 7]];
    const x1 = Math.min(...xs);
    const x2 = Math.max(...xs);
    const y1 = Math.min(...ys);
    const y2 = Math.max(...ys);
    rects.push({ x: x1, y: y1, width: x2 - x1, height: y2 - y1 });
  }
  return rects;
}

// Deprecated placeholder (not used)
export async function parseAnnotationsFromPDF(_arrayBuffer) {
  return { highlights: [], bookmarks: [] };
}

export async function parseHighlightsAndBookmarks(arrayBuffer) {
  const pdfDoc = await PDFDocument.load(arrayBuffer);
  const pages = pdfDoc.getPages();
  const highlights = [];
  const now = Date.now();

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const page = pages[pageIndex];
    const pageW = page.getWidth();
    const pageH = page.getHeight();
    const base_size = { width: pageW, height: pageH }; // base를 PDF 포인트로 설정

    const annotsRef = page.node.get(PDFName.of("Annots"));
    if (!annotsRef) continue;
    const annots = pdfDoc.context.lookup(annotsRef);
    if (!annots || !Array.isArray(annots.asArray?.() || annots.array)) continue;
    const items = annots.asArray ? annots.asArray() : annots.array;

    for (const ref of items) {
      const annot = pdfDoc.context.lookup(ref);
      if (!annot || typeof annot.get !== "function") continue;
      const subtype = annot.get(PDFName.of("Subtype"));
      const nm = annot.get(PDFName.of("NM"));
      const contents = annot.get(PDFName.of("Contents"));
      const C = annot.get(PDFName.of("C"));
      const IC = annot.get(PDFName.of("IC"));

      const id = nm?.decodeText ? nm.decodeText() : undefined;
      const text = contents?.decodeText ? contents.decodeText() : undefined;
      let color = "#FFFF00";
      try {
        const arr = IC || C;
        if (arr && arr.size && arr.size() >= 3) {
          const r = arr.get(0);
          const g = arr.get(1);
          const b = arr.get(2);
          color = rgbToHex(
            r?.numberValue?.() ?? r,
            g?.numberValue?.() ?? g,
            b?.numberValue?.() ?? b
          );
        }
      } catch {}

      const subtypeName = subtype?.name ?? subtype?.value;
      if (subtypeName === "Highlight") {
        const quadObj = annot.get(PDFName.of("QuadPoints"));
        let rects = [];
        if (quadObj) {
          const qarr = pdfDoc.context.lookup(quadObj);
          const nums = qarr?.asArray?.().map((n) => n.numberValue()) || [];
          const rectsPdf = quadPointsToRects(nums);
          rects = rectsPdf.map((rr) =>
            pdfRectToBase(rr, pageW, pageH, base_size.width, base_size.height)
          );
        } else {
          const r = pdfDoc.context.lookup(annot.get(PDFName.of("Rect")));
          if (r && r.size && r.size() >= 4) {
            const x1 = r.get(0).numberValue();
            const y1 = r.get(1).numberValue();
            const x2 = r.get(2).numberValue();
            const y2 = r.get(3).numberValue();
            const rr = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
            rects = [
              pdfRectToBase(
                rr,
                pageW,
                pageH,
                base_size.width,
                base_size.height
              ),
            ];
          }
        }
        if (rects.length) {
          highlights.push({
            id: id || `hl-import-${now}-${pageIndex}-${highlights.length}`,
            type: "text",
            page: pageIndex + 1,
            rects,
            color,
            text: text || "",
            base_size,
            created_at: now,
            synced: false,
          });
        }
      } else if (subtypeName === "Square") {
        const rectObj = annot.get(PDFName.of("Rect"));
        const r = pdfDoc.context.lookup(rectObj);
        if (r && r.size && r.size() >= 4) {
          const x1 = r.get(0).numberValue();
          const y1 = r.get(1).numberValue();
          const x2 = r.get(2).numberValue();
          const y2 = r.get(3).numberValue();
          const rr = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
          const area = pdfRectToBase(
            rr,
            pageW,
            pageH,
            base_size.width,
            base_size.height
          );
          highlights.push({
            id: id || `sq-import-${now}-${pageIndex}-${highlights.length}`,
            type: "area",
            page: pageIndex + 1,
            area,
            color,
            text: text || "",
            base_size,
            created_at: now,
            synced: false,
          });
        }
      }
    }
  }

  // 북마크 복원 (Catalog 커스텀 키 기준)
  let bookmarks = [];
  try {
    const entry = pdfDoc.catalog.get(PDFName.of("RefManagerBookmarks"));
    if (entry) {
      const arr = pdfDoc.context.lookup(entry);
      const list = arr?.asArray?.() || arr?.array || [];
      bookmarks = list
        .map((item) => {
          const dict = pdfDoc.context.lookup(item);
          if (dict && dict.get) {
            return {
              id: dict.get(PDFName.of("id"))?.decodeText?.() || undefined,
              page: dict.get(PDFName.of("page"))?.numberValue?.() || undefined,
              title: dict.get(PDFName.of("title"))?.decodeText?.() || undefined,
              created_at:
                dict.get(PDFName.of("created_at"))?.numberValue?.() ||
                undefined,
            };
          }
          // plain object fallback
          return item;
        })
        .filter((b) => b && b.page);
    }
  } catch (e) {
    console.warn("PDF 북마크 복원 실패(무시)", e);
  }

  return { highlights, bookmarks };
}
