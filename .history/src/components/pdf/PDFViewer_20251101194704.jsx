/* eslint-disable react/prop-types *//* eslint-disable react/prop-types *//* eslint-disable react/prop-types */

import { useState } from "react";

import { Document, Page, pdfjs } from "react-pdf";import { useState, useEffect, useRef, useCallback } from "react";import { useState, useEffect, useRef } from "react";

import "react-pdf/dist/esm/Page/AnnotationLayer.css";

import "react-pdf/dist/esm/Page/TextLayer.css";import { Document, Page, pdfjs } from "react-pdf";import { useCallback } from "react";

import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import "react-pdf/dist/esm/Page/AnnotationLayer.css";import { Document, Page, pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

import "react-pdf/dist/esm/Page/TextLayer.css";import "react-pdf/dist/esm/Page/AnnotationLayer.css";

export default function PDFViewer({ file, onLoadSuccess, onLoadError }) {

  const [numPages, setNumPages] = useState(null);import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";import "react-pdf/dist/esm/Page/TextLayer.css";



  const handleLoad = ({ numPages }) => {import PDFHighlight from "./PDFHighlight";import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

    setNumPages(numPages);

    onLoadSuccess && onLoadSuccess({ numPages });import PageHighlightOverlay from "./PageHighlightOverlay";

  };

// Configure pdf.js worker for Vite/ESM

  const handleError = (err) => {

    console.error("PDF load error:", err);// Configure pdf.js worker for Vite/ESMpdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

    onLoadError && onLoadError(err);

  };pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;



  const normalizedFile = typeof file === "string" ? { url: file, withCredentials: false } : file;const PDFViewer = ({



// Deprecated: Use BetterPDFViewer instead. This stub avoids build/lint errors.
/* eslint-disable react/prop-types */
import React from "react";

export default function PDFViewerStub() {
  return (
    <div style={{ padding: 12, color: "#6b7280", fontSize: 12 }}>
      Deprecated component. Please use BetterPDFViewer.
    </div>
  );
}

    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      <div style={{ padding: "8px 12px", borderBottom: "1px solid #eee", background: "#fafafa" }}>  file,  referenceId,

        <strong>PDF</strong>

        {numPages ? <span style={{ marginLeft: 8, color: "#666" }}>총 {numPages}페이지</span> : null}  referenceId,  initialAnnotations = [],

      </div>

      <div style={{ flex: 1, overflow: "auto", background: "#f3f4f6", padding: 8 }}>  initialAnnotations = [],  onAnnotationChange,

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>

          {normalizedFile ? (  onAnnotationChange,  onLoadSuccess,

            <Document file={normalizedFile} onLoadSuccess={handleLoad} onLoadError={handleError}>

              {numPages && Array.from({ length: numPages }, (_, i) => (  onLoadSuccess,  onLoadError,

                <div key={`page_${i + 1}`} style={{ position: "relative", marginBottom: 16 }}>

                  <Page pageNumber={i + 1} scale={1.0} renderTextLayer renderAnnotationLayer />  onLoadError,}) => {

                </div>

              ))}}) => {  const [numPages, setNumPages] = useState(null);

            </Document>

          ) : (  const [numPages, setNumPages] = useState(null);  const [scale] = useState(1.0);

            <div style={{ padding: 24, color: "#6b7280" }}>PDF 파일이 없습니다.</div>

          )}  const [currentPage, setCurrentPage] = useState(1);  const [annotations, setAnnotations] = useState(initialAnnotations);

        </div>

      </div>  const [scale, setScale] = useState(1.0);  const containerRef = useRef(null);

    </div>

  );  const [annotations, setAnnotations] = useState(initialAnnotations);  const pageRefs = useRef({});

}

  const [highlightMode, setHighlightMode] = useState(null);  const [pdfError, setPdfError] = useState(null);

  const [selectedColor, setSelectedColor] = useState("#FFFF00");

  const containerRef = useRef(null);  useEffect(() => {

  const pageRefs = useRef({});    setAnnotations(initialAnnotations);

  const [pdfError, setPdfError] = useState(null);  }, [initialAnnotations]);



  useEffect(() => {  const handleDocumentLoadSuccess = ({ numPages }) => {

    setAnnotations(initialAnnotations);    setNumPages(numPages);

  }, [initialAnnotations]);    if (onLoadSuccess) onLoadSuccess({ numPages });

  };

  const handleDocumentLoadSuccess = ({ numPages }) => {

    setNumPages(numPages);  const handleDocumentLoadError = (err) => {

    if (onLoadSuccess) onLoadSuccess({ numPages });    console.error("PDF load error:", err);

  };    const message = err?.message || err?.name || String(err);

    setPdfError(message);

  const handleDocumentLoadError = (err) => {    if (onLoadError) onLoadError(err);

    console.error("PDF load error:", err);  };

    const message = err?.message || err?.name || String(err);

    setPdfError(message);  const normalizedFile =

    if (onLoadError) onLoadError(err);    typeof file === "string" ? { url: file, withCredentials: false } : file;

  };

  return (

  const normalizedFile =    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

    typeof file === "string" ? { url: file, withCredentials: false } : file;      <div

        style={{

  // Scroll -> currentPage 동기화          padding: "8px 12px",

  useEffect(() => {          borderBottom: "1px solid #eee",

    const container = containerRef.current;          background: "#fafafa",

    if (!container) return;        }}

    const onScroll = () => {      >

      let closest = 1;        <strong>PDF</strong>

      let minDist = Infinity;        {numPages ? (

      const rectContainer = container.getBoundingClientRect();          <span style={{ marginLeft: 8, color: "#666" }}>

      const mid = rectContainer.top + rectContainer.height / 2;            총 {numPages}페이지

      Object.entries(pageRefs.current).forEach(([p, el]) => {          </span>

        if (!el) return;        ) : null}

        const r = el.getBoundingClientRect();      </div>

        const pageMid = r.top + r.height / 2;      <div

        const d = Math.abs(pageMid - mid);        ref={containerRef}

        if (d < minDist) {        style={{ flex: 1, overflow: "auto", background: "#f3f4f6", padding: 8 }}

          minDist = d;      >

          closest = parseInt(p, 10);        <div

        }          style={{

      });            display: "flex",

      setCurrentPage(closest);            /* eslint-disable react/prop-types */

    };            import { useState, useEffect, useRef, useCallback } from "react";

    container.addEventListener("scroll", onScroll);            import { Document, Page, pdfjs } from "react-pdf";

    return () => container.removeEventListener("scroll", onScroll);            import "react-pdf/dist/esm/Page/AnnotationLayer.css";

  }, [numPages]);            import "react-pdf/dist/esm/Page/TextLayer.css";

            import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

  const goToPage = (p) => {            import PDFHighlight from "./PDFHighlight";

    if (!numPages) return;            import PageHighlightOverlay from "./PageHighlightOverlay";

    const pageNum = Math.max(1, Math.min(numPages, Number(p) || 1));

    pageRefs.current[pageNum]?.scrollIntoView({ behavior: "smooth", block: "start" });            // Configure pdf.js worker for Vite/ESM

  };            pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;



  const zoomIn = () => setScale((s) => Math.min(3, s + 0.2));            const PDFViewer = ({

  const zoomOut = () => setScale((s) => Math.max(0.5, s - 0.2));              file,

  const resetZoom = () => setScale(1.0);              referenceId,

              initialAnnotations = [],

  // 주석 추가 시 API 저장(베스트 에포트) 및 상위로 변경 사항 전달              onAnnotationChange,

  const handleHighlightAdded = useCallback(              onLoadSuccess,

    async (highlight) => {              onLoadError,

      try {            }) => {

        const payload = {              const [numPages, setNumPages] = useState(null);

          reference_id: referenceId,              const [currentPage, setCurrentPage] = useState(1);

          type: highlight.type,              const [scale, setScale] = useState(1.0);

          page_number: highlight.page,              const [annotations, setAnnotations] = useState(initialAnnotations);

          content: highlight.text || "",              const [highlightMode, setHighlightMode] = useState(null);

          position: highlight.type === "text" ? { rects: highlight.rects } : { area: highlight.area },              const [selectedColor, setSelectedColor] = useState("#FFFF00");

          color: highlight.color,              const containerRef = useRef(null);

        };              const pageRefs = useRef({});

        // 동기화는 실패해도 뷰어는 유지              const [pdfError, setPdfError] = useState(null);

        const { saveAnnotation } = await import("../../api/refManagerClient");

        saveAnnotation(payload).catch((e) => console.warn("주석 원격 저장 실패", e));              useEffect(() => {

      } catch (e) {                setAnnotations(initialAnnotations);

        console.warn("주석 처리 중 경고", e);              }, [initialAnnotations]);

      }

      const next = [...annotations, highlight];              const handleDocumentLoadSuccess = ({ numPages }) => {

      setAnnotations(next);                setNumPages(numPages);

      onAnnotationChange && onAnnotationChange(next);                if (onLoadSuccess) onLoadSuccess({ numPages });

    },              };

    [annotations, onAnnotationChange, referenceId]

  );              const handleDocumentLoadError = (err) => {

                console.error("PDF load error:", err);

  return (                const message = err?.message || err?.name || String(err);

    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>                setPdfError(message);

      {/* Toolbar: Navigation, Zoom, Highlight */}                if (onLoadError) onLoadError(err);

      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", borderBottom: "1px solid #eee", background: "#fafafa" }}>              };

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>

          <button onClick={() => goToPage(currentPage - 1)} disabled={!numPages || currentPage <= 1}>←</button>              const normalizedFile =

          <input type="number" min={1} max={numPages || 1} value={currentPage} onChange={(e) => goToPage(e.target.value)} style={{ width: 60, textAlign: "center" }} />                typeof file === "string" ? { url: file, withCredentials: false } : file;

          <span>/ {numPages || "?"}</span>

          <button onClick={() => goToPage(currentPage + 1)} disabled={!numPages || currentPage >= numPages}>→</button>              // Scroll -> currentPage 동기화

        </div>              useEffect(() => {

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 12 }}>                const container = containerRef.current;

          <button onClick={zoomOut}>-</button>                if (!container) return;

          <span style={{ width: 48, textAlign: "center" }}>{Math.round(scale * 100)}%</span>                const onScroll = () => {

          <button onClick={zoomIn}>+</button>                  let closest = 1;

          <button onClick={resetZoom} style={{ marginLeft: 6 }}>맞춤</button>                  let minDist = Infinity;

        </div>                  const rectContainer = container.getBoundingClientRect();

        <div style={{ flex: 1 }} />                  const mid = rectContainer.top + rectContainer.height / 2;

        <PDFHighlight                  Object.entries(pageRefs.current).forEach(([p, el]) => {

          pdfType={null}                    if (!el) return;

          currentPage={currentPage}                    const r = el.getBoundingClientRect();

          referenceId={referenceId}                    const pageMid = r.top + r.height / 2;

          highlightMode={highlightMode}                    const d = Math.abs(pageMid - mid);

          setHighlightMode={setHighlightMode}                    if (d < minDist) {

          selectedColor={selectedColor}                      minDist = d;

          setSelectedColor={setSelectedColor}                      closest = parseInt(p, 10);

          compact                    }

        />                  });

      </div>                  setCurrentPage(closest);

      <div                };

        ref={containerRef}                container.addEventListener("scroll", onScroll);

        style={{ flex: 1, overflow: "auto", background: "#f3f4f6", padding: 8 }}                return () => container.removeEventListener("scroll", onScroll);

      >              }, [numPages]);

        <div

          style={{              const goToPage = (p) => {

            display: "flex",                if (!numPages) return;

            flexDirection: "column",                const pageNum = Math.max(1, Math.min(numPages, Number(p) || 1));

            alignItems: "center",                pageRefs.current[pageNum]?.scrollIntoView({ behavior: "smooth", block: "start" });

            gap: 16,              };

          }}

        >              const zoomIn = () => setScale((s) => Math.min(3, s + 0.2));

          {normalizedFile ? (              const zoomOut = () => setScale((s) => Math.max(0.5, s - 0.2));

            <Document              const resetZoom = () => setScale(1.0);

              file={normalizedFile}

              onLoadSuccess={handleDocumentLoadSuccess}              // 주석 추가 시 API 저장(베스트 에포트) 및 상위로 변경 사항 전달

              onLoadError={handleDocumentLoadError}              const handleHighlightAdded = useCallback(

              loading={                async (highlight) => {

                <div style={{ padding: 24, color: "#6b7280" }}>                  try {

                  PDF 로딩 중...                    const payload = {

                </div>                      reference_id: referenceId,

              }                      type: highlight.type,

              error={                      page_number: highlight.page,

                <div style={{ padding: 24, color: "#dc2626", maxWidth: 720 }}>                      content: highlight.text || "",

                  <div style={{ fontWeight: 600, marginBottom: 8 }}>                      position: highlight.type === "text" ? { rects: highlight.rects } : { area: highlight.area },

                    PDF를 로드할 수 없습니다.                      color: highlight.color,

                  </div>                    };

                  {pdfError && (                    // 동기화는 실패해도 뷰어는 유지

                    <div                    const { saveAnnotation } = await import("../../api/refManagerClient");

                      style={{                    saveAnnotation(payload).catch((e) => console.warn("주석 원격 저장 실패", e));

                        whiteSpace: "pre-wrap",                  } catch (e) {

                        fontFamily:                    console.warn("주석 처리 중 경고", e);

                          "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",                  }

                        fontSize: 12,                  const next = [...annotations, highlight];

                      }}                  setAnnotations(next);

                    >                  onAnnotationChange && onAnnotationChange(next);

                      {pdfError}                },

                    </div>                [annotations, onAnnotationChange, referenceId]

                  )}              );

                  <ul

                    style={{              return (

                      marginTop: 8,                </div>

                      color: "#9ca3af",                  {/* Toolbar: Navigation, Zoom, Highlight */}

                      fontSize: 12,                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", borderBottom: "1px solid #eee", background: "#fafafa" }}>

                      paddingLeft: 18,                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>

                    }}                      <button onClick={() => goToPage(currentPage - 1)} disabled={!numPages || currentPage <= 1}>←</button>

                  >                      <input type="number" min={1} max={numPages || 1} value={currentPage} onChange={(e) => goToPage(e.target.value)} style={{ width: 60, textAlign: "center" }} />

                    <li>                      <span>/ {numPages || "?"}</span>

                      외부 PDF의 CORS 또는 Range 요청이 허용되어야 합니다.                      <button onClick={() => goToPage(currentPage + 1)} disabled={!numPages || currentPage >= numPages}>→</button>

                    </li>                    </div>

                    <li>URL이 올바른지, 인증이 필요하지 않은지 확인하세요.</li>                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 12 }}>

                  </ul>                      <button onClick={zoomOut}>-</button>

                </div>                      <span style={{ width: 48, textAlign: "center" }}>{Math.round(scale * 100)}%</span>

              }                      <button onClick={zoomIn}>+</button>

            >                      <button onClick={resetZoom} style={{ marginLeft: 6 }}>맞춤</button>

              {numPages &&                    </div>

                Array.from({ length: numPages }, (_, i) => (                    <div style={{ flex: 1 }} />

                  <div                    <PDFHighlight

                    key={`page_${i + 1}`}                      pdfType={null}

                    ref={(el) => (pageRefs.current[i + 1] = el)}                      currentPage={currentPage}

                    style={{ position: "relative", marginBottom: 16 }}                      referenceId={referenceId}

                  >                      highlightMode={highlightMode}

                    <Page                      setHighlightMode={setHighlightMode}

                      pageNumber={i + 1}                      selectedColor={selectedColor}

                      scale={scale}                      setSelectedColor={setSelectedColor}

                      renderTextLayer                      compact

                      renderAnnotationLayer                    />

                      loading={                  </div>

                        <div style={{ padding: 24, background: "white" }}>              }

                          페이지 {i + 1} 로딩 중...            >

                        </div>              {numPages &&

                      }                Array.from({ length: numPages }, (_, i) => (

                    />                  <div

                    <PageHighlightOverlay                    key={`page_${i + 1}`}

                      pageNumber={i + 1}                    ref={(el) => (pageRefs.current[i + 1] = el)}

                      referenceId={referenceId}                    style={{ position: "relative" }}

                      highlightMode={highlightMode}                        alignItems: "center",

                      selectedColor={selectedColor}                        gap: 16,

                      scale={scale}                      pageNumber={i + 1}

                      onHighlightAdded={handleHighlightAdded}                      scale={scale}

                    />                      renderTextLayer

                  </div>                      renderAnnotationLayer

                ))}                      loading={

            </Document>                        <div style={{ padding: 24, background: "white" }}>

          ) : (                          페이지 {i + 1} 로딩 중...

            <div style={{ padding: 24, color: "#6b7280" }}>                        </div>

              PDF 파일이 없습니다.                      }

            </div>                    />

          )}                  </div>

        </div>                ))}

      </div>            </Document>

    </div>          ) : (

  );            <div style={{ padding: 24, color: "#6b7280" }}>

};              PDF 파일이 없습니다.

            </div>

export default PDFViewer;          )}

        </div>
      </div>
    </div>
  );
};

export default PDFViewer;
