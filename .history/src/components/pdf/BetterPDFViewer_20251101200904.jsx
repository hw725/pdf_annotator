/* eslint-disable react/prop-types */
import { useState, useEffect, useRef, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import PDFHighlight from "./PDFHighlight";
import PageHighlightOverlay from "./PageHighlightOverlay";

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

export default function BetterPDFViewer({
  file,
  referenceId,
  initialAnnotations = [],
  onAnnotationChange,
  onLoadSuccess,
  onLoadError,
}) {
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [highlightMode, setHighlightMode] = useState(null);
  const [selectedColor, setSelectedColor] = useState("#FFFF00");
  const containerRef = useRef(null);
  const pageRefs = useRef({});
  const [pdfError, setPdfError] = useState(null);
  // 로딩 호환성 자동 폴백 (브라우저/소스에 따라 실패 시 단계적으로 시도)
  const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const forceCompat = urlParams?.get("compat") === "1" || urlParams?.get("compat") === "true";
  const [compatOn, setCompatOn] = useState(!!forceCompat);
  const [prefetched, setPrefetched] = useState(false);
  const [fileSource, setFileSource] = useState(null);
  // Chrome에서 초기 로딩 편차가 있을 때 스트리밍/Range를 끄는 호환 옵션
  const search = typeof window !== "undefined" ? window.location.search : "";
  const compatParam = new URLSearchParams(search).get("compat");
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isEdge = /Edg\//.test(ua);
  const isChrome = /Chrome\//.test(ua) && !isEdge && !/OPR\//.test(ua);
  const forceCompat = compatParam === "1" || compatParam === "true";
  const docOptions =
    forceCompat || isChrome
      ? { withCredentials: false, disableStream: true, disableRange: true }
      : { withCredentials: false };
  // 이전 상태로 되돌림: 브라우저별 옵션을 쓰지 않고 기본 스트리밍 동작 사용

  const normalizedFile =
    typeof file === "string" ? { url: file, withCredentials: false } : file;

  // 최초 파일 소스 설정 (URL 형태 유지)
  useEffect(() => {
    setFileSource(normalizedFile);
    setCompatOn(!!forceCompat);
    setPrefetched(false);
    setPdfError(null);
  }, [file]);

  const handleLoad = ({ numPages }) => {
    setNumPages(numPages);
    onLoadSuccess && onLoadSuccess({ numPages });
  };

  const handleError = async (err) => {
    console.error("PDF load error:", err);
    const message = err?.message || err?.name || String(err);

    // 1단계: 호환 모드(스트리밍/Range 비활성화)로 재시도
    if (!compatOn) {
      setCompatOn(true);
      setPdfError(null);
      return;
    }

    // 2단계: 프록시를 통해 전체 파일을 직접 받아 data로 전달 (CORS/Range 회피)
    if (!prefetched && normalizedFile?.url) {
      try {
        const resp = await fetch(normalizedFile.url, { method: "GET" });
        if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
        const buf = await resp.arrayBuffer();
        setFileSource({ data: new Uint8Array(buf) });
        setPrefetched(true);
        setPdfError(null);
        return;
      } catch (e) {
        console.warn("PDF prefetch failed", e);
      }
    }

    // 실패 최종 보고
    setPdfError(message);
    onLoadError && onLoadError(err);
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onScroll = () => {
      let closest = 1;
      let min = Infinity;
      const rect = container.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      Object.entries(pageRefs.current).forEach(([p, el]) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        const d = Math.abs(r.top + r.height / 2 - mid);
        if (d < min) {
          min = d;
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
    const n = Math.max(1, Math.min(numPages, Number(p) || 1));
    pageRefs.current[n]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const zoomIn = () => setScale((s) => Math.min(3, s + 0.2));
  const zoomOut = () => setScale((s) => Math.max(0.5, s - 0.2));
  const resetZoom = () => setScale(1.0);

  const handleHighlightAdded = useCallback(
    async (highlight) => {
      try {
        const { saveAnnotation } = await import("../../api/refManagerClient");
        const payload = {
          reference_id: referenceId,
          type: highlight.type,
          page_number: highlight.page,
          content: highlight.text || "",
          position:
            highlight.type === "text"
              ? { rects: highlight.rects }
              : { area: highlight.area },
          color: highlight.color,
        };
        saveAnnotation(payload).catch((e) =>
          console.warn("주석 원격 저장 실패", e)
        );
      } catch (e) {
        console.warn("주석 처리 중 경고", e);
      }
      onAnnotationChange &&
        onAnnotationChange((prev) =>
          prev ? [...prev, highlight] : [highlight]
        );
    },
    [referenceId, onAnnotationChange]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "8px 12px",
          borderBottom: "1px solid #eee",
          background: "#fafafa",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={!numPages || currentPage <= 1}
          >
            ←
          </button>
          <input
            type="number"
            min={1}
            max={numPages || 1}
            value={currentPage}
            onChange={(e) => goToPage(e.target.value)}
            style={{ width: 60, textAlign: "center" }}
          />
          <span>/ {numPages || "?"}</span>
          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={!numPages || currentPage >= numPages}
          >
            →
          </button>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginLeft: 12,
          }}
        >
          <button onClick={zoomOut}>-</button>
          <span style={{ width: 48, textAlign: "center" }}>
            {Math.round(scale * 100)}%
          </span>
          <button onClick={zoomIn}>+</button>
          <button
            onClick={resetZoom}
            style={{ marginLeft: 6 }}
          >
            맞춤
          </button>
        </div>
        <div style={{ flex: 1 }} />
        <PDFHighlight
          pdfType={null}
          currentPage={currentPage}
          referenceId={referenceId}
          highlightMode={highlightMode}
          setHighlightMode={setHighlightMode}
          selectedColor={selectedColor}
          setSelectedColor={setSelectedColor}
          compact
        />
      </div>
      <div
        ref={containerRef}
        style={{ flex: 1, overflow: "auto", background: "#f3f4f6", padding: 8 }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          {fileSource ? (
            <Document
              file={fileSource}
              onLoadSuccess={handleLoad}
              onLoadError={handleError}
              options={compatOn ? { withCredentials: false, disableStream: true, disableRange: true } : { withCredentials: false }}
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
                          "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                        fontSize: 12,
                      }}
                    >
                      {pdfError}
                    </div>
                  )}
                </div>
              }
            >
              {numPages &&
                Array.from({ length: numPages }, (_, i) => (
                  <div
                    key={`page_${i + 1}`}
                    ref={(el) => (pageRefs.current[i + 1] = el)}
                    style={{ position: "relative", marginBottom: 16 }}
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
                    <PageHighlightOverlay
                      pageNumber={i + 1}
                      referenceId={referenceId}
                      highlightMode={highlightMode}
                      selectedColor={selectedColor}
                      scale={scale}
                      onHighlightAdded={handleHighlightAdded}
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
      {pdfError && (
        <div style={{ padding: 12, color: "#dc2626", fontSize: 12 }}>
          {pdfError}
        </div>
      )}
    </div>
  );
}
