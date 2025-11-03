/* eslint-disable react/prop-types */
import { useState, useEffect, useRef } from "react";
import { useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Configure pdf.js worker for Vite/ESM
pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

const PDFViewer = ({
  file,
  referenceId,
  initialAnnotations = [],
  onAnnotationChange,
  onLoadSuccess,
  onLoadError,
}) => {
  const [numPages, setNumPages] = useState(null);
  const [scale] = useState(1.0);
  const [annotations, setAnnotations] = useState(initialAnnotations);
  const containerRef = useRef(null);
  const pageRefs = useRef({});
  const [pdfError, setPdfError] = useState(null);

  useEffect(() => {
    setAnnotations(initialAnnotations);
  }, [initialAnnotations]);

  const handleDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
    if (onLoadSuccess) onLoadSuccess({ numPages });
  };

  const handleDocumentLoadError = (err) => {
    console.error("PDF load error:", err);
    const message = err?.message || err?.name || String(err);
    setPdfError(message);
    if (onLoadError) onLoadError(err);
  };

  const normalizedFile =
    typeof file === "string" ? { url: file, withCredentials: false } : file;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid #eee",
          background: "#fafafa",
        }}
      >
        <strong>PDF</strong>
        {numPages ? (
          <span style={{ marginLeft: 8, color: "#666" }}>
            총 {numPages}페이지
          </span>
        ) : null}
      </div>
      <div
        ref={containerRef}
        style={{ flex: 1, overflow: "auto", background: "#f3f4f6", padding: 8 }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
          const [currentPage, setCurrentPage] = useState(1);
          const [scale, setScale] = useState(1.0);
            gap: 16,
          }}
        >
          {normalizedFile ? (
            <Document
              file={normalizedFile}
              onLoadSuccess={handleDocumentLoadSuccess}
              onLoadError={handleDocumentLoadError}
              loading={
                <div style={{ padding: 24, color: "#6b7280" }}>
                  PDF 로딩 중...
                </div>
              }
              error={
                <div style={{ padding: 24, color: "#dc2626", maxWidth: 720 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>
                    PDF를 로드할 수 없습니다.
                  </div>
                  {pdfError && (
                    <div
                      style={{
                        whiteSpace: "pre-wrap",
                        fontFamily:

          // Scroll -> currentPage 동기화
          useEffect(() => {
            const container = containerRef.current;
            if (!container) return;
            const onScroll = () => {
              let closest = 1;
              let minDist = Infinity;
              const rectContainer = container.getBoundingClientRect();
              const mid = rectContainer.top + rectContainer.height / 2;
              Object.entries(pageRefs.current).forEach(([p, el]) => {
                if (!el) return;
                const r = el.getBoundingClientRect();
                const pageMid = r.top + r.height / 2;
                const d = Math.abs(pageMid - mid);
                if (d < minDist) {
                  minDist = d;
                  closest = parseInt(p, 10);
                }
              });
              setCurrentPage(closest);
            };
            container.addEventListener("scroll", onScroll);
            return () => container.removeEventListener("scroll", onScroll);
          }, [numPages]);

          const goToPage = (p) => {
            if (!numPages) return;
            const pageNum = Math.max(1, Math.min(numPages, Number(p) || 1));
            pageRefs.current[pageNum]?.scrollIntoView({ behavior: "smooth", block: "start" });
          };

          const zoomIn = () => setScale((s) => Math.min(3, s + 0.2));
          const zoomOut = () => setScale((s) => Math.max(0.5, s - 0.2));
          const resetZoom = () => setScale(1.0);

          // 주석 추가 시 API 저장(베스트 에포트) 및 상위로 변경 사항 전달
          const handleHighlightAdded = useCallback(
            async (highlight) => {
              try {
                const payload = {
                  reference_id: referenceId,
                  type: highlight.type,
                  page_number: highlight.page,
                  content: highlight.text || "",
                  position: highlight.type === "text" ? { rects: highlight.rects } : { area: highlight.area },
                  color: highlight.color,
                };
                // 동기화는 실패해도 뷰어는 유지
                const { saveAnnotation } = await import("../../api/refManagerClient");
                saveAnnotation(payload).catch((e) => console.warn("주석 원격 저장 실패", e));
              } catch (e) {
                console.warn("주석 처리 중 경고", e);
              }
              const next = [...annotations, highlight];
              setAnnotations(next);
              onAnnotationChange && onAnnotationChange(next);
            },
            [annotations, onAnnotationChange, referenceId]
          );
                          "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                        fontSize: 12,
                      }}
                    >
                      {pdfError}
                    </div>
                  )}
                  <ul
                    style={{
                      marginTop: 8,
                      color: "#9ca3af",
                      fontSize: 12,
                      paddingLeft: 18,
                    }}
                  >
                    <li>
                      외부 PDF의 CORS 또는 Range 요청이 허용되어야 합니다.
                    </li>
                    <li>URL이 올바른지, 인증이 필요하지 않은지 확인하세요.</li>
                  </ul>
                </div>
              }
            >
              {numPages &&
                Array.from({ length: numPages }, (_, i) => (
                  <div
                    key={`page_${i + 1}`}
                    ref={(el) => (pageRefs.current[i + 1] = el)}
                    style={{ position: "relative" }}
                  >
                    <Page
                      pageNumber={i + 1}
                      scale={scale}
                      renderTextLayer
                      renderAnnotationLayer
                      loading={
                        <div style={{ padding: 24, background: "white" }}>
                          페이지 {i + 1} 로딩 중...
                        </div>
                      }
                    />
                  </div>
                ))}
            </Document>
          ) : (
            <div style={{ padding: 24, color: "#6b7280" }}>
              PDF 파일이 없습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PDFViewer;
