import { PDFDocument, PDFName, PDFHexString } from "pdf-lib";

// hex color (#RRGGBB) -> [r,g,b] (0..1)
function hexToRgb01(hex) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return [r, g, b];
}

function rectCanvasToPdf(rect, baseSize, pageWidth, pageHeight) {
  const x = (rect.x / (baseSize?.width || 1)) * pageWidth;
  const w = (rect.width / (baseSize?.width || 1)) * pageWidth;
  const h = (rect.height / (baseSize?.height || 1)) * pageHeight;
  const yBottom =
    pageHeight -
    ((rect.y + rect.height) / (baseSize?.height || 1)) * pageHeight;
  return { x, y: yBottom, width: w, height: h };
}

// Add or get Annots array on a page
function getOrCreateAnnotsArray(pdfDoc, page) {
  let annots = page.node.get(PDFName.of("Annots"));
  if (!annots) {
    annots = pdfDoc.context.obj([]);
    page.node.set(PDFName.of("Annots"), annots);
  }
  return annots;
}

export async function exportPDFWithHighlights({
  sourceArrayBuffer,
  highlights,
}) {
  const pdfDoc = await PDFDocument.load(sourceArrayBuffer);
  const pages = pdfDoc.getPages();

  // Group by page
  const byPage = new Map();
  for (const h of highlights || []) {
    const idx = (h.page || 1) - 1;
    if (!byPage.has(idx)) byPage.set(idx, []);
    byPage.get(idx).push(h);
  }

  for (const [pageIndex, items] of byPage.entries()) {
    if (!pages[pageIndex]) continue;
    const page = pages[pageIndex];
    const pageW = page.getWidth();
    const pageH = page.getHeight();
    const annots = getOrCreateAnnotsArray(pdfDoc, page);

    for (const h of items) {
      const [r, g, b] = hexToRgb01(h.color || "#FFFF00");
      const opacity = 0.3; // 기본 투명도

      const rects = h.type === "text" ? h.rects || [] : h.area ? [h.area] : [];
      if (!rects.length) continue;

      // PDF 좌표로 변환 + 전체 bbox 계산
      const pdfRects = [];
      let bbox = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
      for (const rct of rects) {
        const rr = rectCanvasToPdf(rct, h.base_size, pageW, pageH);
        pdfRects.push(rr);
        bbox = {
          x1: Math.min(bbox.x1, rr.x),
          y1: Math.min(bbox.y1, rr.y),
          x2: Math.max(bbox.x2, rr.x + rr.width),
          y2: Math.max(bbox.y2, rr.y + rr.height),
        };
      }

      // 공통: AP(appearance) 스트림 생성 유틸
      const createFilledRectsAP = (rectsPdf, bboxPdf) => {
        const w = Math.max(0, bboxPdf.x2 - bboxPdf.x1);
        const hght = Math.max(0, bboxPdf.y2 - bboxPdf.y1);
        const translate = `1 0 0 1 ${-bboxPdf.x1} ${-bboxPdf.y1} cm`;
        let content = `q\n${r} ${g} ${b} rg\n${translate}\n`;
        for (const rr of rectsPdf) {
          const x = rr.x;
          const y = rr.y;
          const w2 = rr.width;
          const h2 = rr.height;
          content += `${x} ${y} ${w2} ${h2} re f\n`;
        }
        content += `Q`;
        const stream = pdfDoc.context.flateStream(content, {
          BBox: pdfDoc.context.obj([
            bboxPdf.x1,
            bboxPdf.y1,
            bboxPdf.x2,
            bboxPdf.y2,
          ]),
          Resources: pdfDoc.context.obj({}),
          // 투명도는 주석의 CA가 쓰이므로 스트림엔 별도 설정 없음
        });
        const streamRef = pdfDoc.context.register(stream);
        return pdfDoc.context.obj({ N: streamRef });
      };

      if (h.type === "text") {
        // Highlight 주석: QuadPoints 구성
        const quads = [];
        for (const rr of pdfRects) {
          const x1 = rr.x;
          const y1 = rr.y + rr.height; // top-left
          const x2 = rr.x + rr.width;
          const y2 = rr.y + rr.height; // top-right
          const x3 = rr.x;
          const y3 = rr.y; // bottom-left
          const x4 = rr.x + rr.width;
          const y4 = rr.y; // bottom-right
          quads.push(x1, y1, x2, y2, x3, y3, x4, y4);
        }

        const annotDict = pdfDoc.context.obj({
          Type: PDFName.of("Annot"),
          Subtype: PDFName.of("Highlight"),
          Rect: pdfDoc.context.obj([bbox.x1, bbox.y1, bbox.x2, bbox.y2]),
          QuadPoints: pdfDoc.context.obj(quads),
          C: pdfDoc.context.obj([r, g, b]),
          F: 4,
          NM: PDFHexString.fromText(h.id || `hl-${Date.now()}`),
          T: PDFHexString.fromText("refmanager"),
          Contents: h.text
            ? PDFHexString.fromText(h.text)
            : PDFHexString.fromText(""),
          CA: opacity,
          AP: createFilledRectsAP(pdfRects, bbox),
        });
        annots.push(annotDict);
      } else {
        // 영역 주석: Square로 저장, 내부 색상과 투명도 적용
        const rect = pdfDoc.context.obj([bbox.x1, bbox.y1, bbox.x2, bbox.y2]);
        const annotDict = pdfDoc.context.obj({
          Type: PDFName.of("Annot"),
          Subtype: PDFName.of("Square"),
          Rect: rect,
          C: pdfDoc.context.obj([r, g, b]), // stroke (미사용)
          IC: pdfDoc.context.obj([r, g, b]), // interior fill color
          CA: opacity,
          F: 4,
          NM: PDFHexString.fromText(h.id || `sq-${Date.now()}`),
          T: PDFHexString.fromText("refmanager"),
          // Border Style: width 0 (테두리 없음)
          BS: pdfDoc.context.obj({ W: 0 }),
          AP: createFilledRectsAP(pdfRects, bbox),
        });
        annots.push(annotDict);
      }
    }
  }

  const out = await pdfDoc.save({ updateFieldAppearances: false });
  return new Blob([out], { type: "application/pdf" });
}

export async function triggerDownload(blob, filename = "annotated.pdf") {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function exportFromIndexedDB({
  referenceId,
  pdfCacheId,
  getSourceArrayBuffer,
}) {
  // 1) 원본 PDF 가져오기
  const sourceArrayBuffer = await getSourceArrayBuffer();
  // 2) 하이라이트 로드
  const { initDB } = await import("@/db/localDB");
  const db = await initDB();
  const tx = db.transaction("highlights", "readonly");
  const store = tx.objectStore("highlights");

  let all = [];
  if (referenceId && referenceId !== "temp") {
    const index = store.index("reference_id");
    all = await index.getAll(referenceId);
  } else if (pdfCacheId) {
    const index = store.index("pdf_cache_id");
    all = await index.getAll(pdfCacheId);
  } else {
    // fallback: 전체
    all = await store.getAll();
  }

  const blob = await exportPDFWithHighlights({
    sourceArrayBuffer,
    highlights: all,
  });
  return blob;
}
