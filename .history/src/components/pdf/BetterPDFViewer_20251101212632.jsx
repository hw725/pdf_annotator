/* eslint-disable react/prop-types */
import { useState, useEffect, useRef, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import PDFHighlight from "./PDFHighlight";
import PageHighlightOverlay from "./PageHighlightOverlay";
import PageHighlightsSidebar from "./PageHighlightsSidebar";
import { localDB } from "@/db/localDB";

// Use the same worker strategy as refmanager to avoid bundler/URL issues
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

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

  // 하이라이트/동기화 상태
  const [allHighlights, setAllHighlights] = useState([]);
  const [saving, setSaving] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // 보기 모드 및 기준 크기
  const [basePageWidth, setBasePageWidth] = useState(null);
  const [basePageHeight, setBasePageHeight] = useState(null);
  const [viewMode, setViewMode] = useState("fit-width"); // 'fit-width' | 'fit-page' | 'actual' | 'custom'

  // Pass file through directly (string | File | { url }) as in refmanager
  const normalizedFile = file;

  // 초기 하이라이트 동기화
  useEffect(() => {
    const list = Array.isArray(initialAnnotations) ? initialAnnotations : [];
    setAllHighlights(list);
  }, [initialAnnotations]);

  // 동기화 큐 모니터링
  const refreshPendingCount = useCallback(async () => {
    try {
      const items = await localDB.getSyncQueue();
      setPendingCount(items.length);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refreshPendingCount();
    const id = setInterval(refreshPendingCount, 5000);
    return () => clearInterval(id);
  }, [refreshPendingCount]);

  // 동기화 큐 처리기
  const processSyncQueue = useCallback(async () => {
    try {
      const items = await localDB.getSyncQueue();
      for (const it of items) {
        try {
          if (it.action === "save") {
            const { saveAnnotation } = await import(
              "../../api/refManagerClient"
            );
            const resp = await saveAnnotation(it.payload);
            const serverId = resp?.annotation?.id;
            if (serverId && it.local_id) {
              setAllHighlights((prev) =>
                prev.map((h) =>
                  h.id === it.local_id ? { ...h, remote_id: serverId } : h
                )
              );
            }
            await localDB.clearFromSyncQueue(it.id);
          } else if (it.action === "delete") {
            const { deleteAnnotation } = await import(
              "../../api/refManagerClient"
            );
            if (it.target_id) {
              await deleteAnnotation(it.target_id);
            }
            await localDB.clearFromSyncQueue(it.id);
          } else {
            await localDB.clearFromSyncQueue(it.id);
          }
        } catch (e) {
          await localDB.updateSyncQueueItem(it.id, {
            retry_count: (it.retry_count || 0) + 1,
            last_error: e?.message || String(e),
          });
        }
      }
    } finally {
      refreshPendingCount();
    }
  }, [refreshPendingCount]);

  const handleLoad = ({ numPages }) => {
    setNumPages(numPages);
    onLoadSuccess && onLoadSuccess({ numPages });
  };

  const handleError = (err) => {
    console.error("PDF load error:", err);
    setPdfError(err?.message || err?.name || String(err));
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

  const zoomIn = () => {
    setViewMode("custom");
    setScale((s) => Math.min(3, s + 0.2));
  };
  const zoomOut = () => {
    setViewMode("custom");
    setScale((s) => Math.max(0.5, s - 0.2));
  };

  // 보기 모드에 맞춰 scale 계산
  const computeScaleForMode = useCallback(
    (mode) => {
      if (!containerRef.current) return null;
      const el = containerRef.current;
      const horizontalPadding = 16;
      const verticalPadding = 16;
      if (mode === "fit-width") {
        if (!basePageWidth) return null;
        const containerWidth = el.clientWidth || 0;
        const target = Math.max(containerWidth - horizontalPadding, 100);
        return target / basePageWidth;
      }
      if (mode === "fit-page") {
        if (!basePageHeight) return null;
        const containerHeight = el.clientHeight || 0;
        const target = Math.max(containerHeight - verticalPadding, 100);
        return target / basePageHeight;
      }
      if (mode === "actual") return 1.0;
      return null;
    },
    [basePageWidth, basePageHeight]
  );

  // 보기 모드 변경 시 scale 자동 맞춤
  useEffect(() => {
    if (
      viewMode !== "fit-width" &&
      viewMode !== "fit-page" &&
      viewMode !== "actual"
    )
      return;
    const s = computeScaleForMode(viewMode);
    if (s && s > 0) setScale(s);
  }, [viewMode, basePageWidth, basePageHeight, computeScaleForMode]);

  // 컨테이너 리사이즈 시 자동 맞춤
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (viewMode !== "fit-width" && viewMode !== "fit-page") return;
      const s = computeScaleForMode(viewMode);
      if (s && s > 0) setScale(s);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [viewMode, computeScaleForMode]);

  const handleHighlightAdded = useCallback(
    async (highlight) => {
      // 즉시 내부/상위 상태 반영
      setAllHighlights((prev) => (prev ? [...prev, highlight] : [highlight]));
      onAnnotationChange &&
        onAnnotationChange((prev) =>
          prev ? [...prev, highlight] : [highlight]
        );

      // 원격 저장 시도 (실패하면 큐에 적재)
      try {
        setSaving(true);
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
        try {
          const resp = await saveAnnotation(payload);
          const serverId = resp?.annotation?.id;
          if (serverId) {
            setAllHighlights((prev) =>
              prev.map((h) =>
                h.id === highlight.id ? { ...h, remote_id: serverId } : h
              )
            );
          }
        } catch (e) {
          console.warn("주석 원격 저장 실패", e);
          await localDB.addToSyncQueue({
            action: "save",
            payload,
            local_id: highlight.id,
          });
          refreshPendingCount();
        } finally {
          setSaving(false);
        }
      } catch (e) {
        console.warn("주석 처리 중 경고", e);
      }
    },
    [referenceId, onAnnotationChange, refreshPendingCount]
  );

  const handleHighlightDeleted = useCallback(
    async (highlight) => {
      // 즉시 내부/상위 상태 반영
      setAllHighlights((prev) => prev.filter((h) => h.id !== highlight.id));
      onAnnotationChange &&
        onAnnotationChange((prev) =>
          Array.isArray(prev) ? prev.filter((h) => h.id !== highlight.id) : prev
        );

      // 원격 삭제 시도
      try {
        const { deleteAnnotation } = await import("../../api/refManagerClient");
        const targetId = highlight.remote_id || highlight.id;
        if (targetId) {
          try {
            await deleteAnnotation(targetId);
          } catch (e) {
            console.warn("주석 원격 삭제 실패", e);
            await localDB.addToSyncQueue({
              action: "delete",
              target_id: targetId,
            });
            refreshPendingCount();
          }
        }
      } catch (e) {
        console.warn("삭제 처리 중 경고", e);
      }
    },
    [onAnnotationChange, refreshPendingCount]
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100%",
        position: "relative",
        background: "#f8fafc",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 12px",
          borderBottom: "1px solid #e5e7eb",
          background: "#ffffff",
          position: "sticky",
          top: 0,
          zIndex: 5,
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
          <div
            style={{
              display: "flex",
              gap: 4,
              marginLeft: 6,
              border: "1px solid #ddd",
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            <button
              onClick={() => setViewMode("fit-width")}
              style={{
                padding: "4px 8px",
                fontSize: 12,
                background: viewMode === "fit-width" ? "#1f2937" : "white",
                color: viewMode === "fit-width" ? "white" : "#374151",
                border: "none",
                cursor: "pointer",
              }}
              title="너비 맞춤"
            >
              너비
            </button>
            <button
              onClick={() => setViewMode("fit-page")}
              style={{
                padding: "4px 8px",
                fontSize: 12,
                background: viewMode === "fit-page" ? "#1f2937" : "white",
                color: viewMode === "fit-page" ? "white" : "#374151",
                border: "none",
                borderLeft: "1px solid #ddd",
                cursor: "pointer",
              }}
              title="페이지 맞춤"
            >
              페이지
            </button>
            <button
              onClick={() => setViewMode("actual")}
              style={{
                padding: "4px 8px",
                fontSize: 12,
                background: viewMode === "actual" ? "#1f2937" : "white",
                color: viewMode === "actual" ? "white" : "#374151",
                border: "none",
                borderLeft: "1px solid #ddd",
                cursor: "pointer",
              }}
              title="실제 크기(100%)"
            >
              100%
            </button>
          </div>
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
        {/* 동기화 상태 표시 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginLeft: 12,
          }}
        >
          {saving && (
            <div style={{ fontSize: 12, color: "#6b7280" }}>저장 중…</div>
          )}
          {pendingCount > 0 && (
            <button
              onClick={processSyncQueue}
              style={{
                fontSize: 12,
                background: "#fef3c7",
                color: "#92400e",
                border: "1px solid #f59e0b",
                padding: "4px 8px",
                borderRadius: 4,
                cursor: "pointer",
              }}
              title="대기 중인 동기화 작업을 즉시 재시도"
            >
              동기화 대기 {pendingCount}
            </button>
          )}
        </div>
      </div>

      {/* 좌측 사이드바 + 문서 뷰 */}
      <div style={{ display: "flex", minHeight: 0, flex: 1 }}>
        <PageHighlightsSidebar
          highlights={allHighlights}
          currentPage={currentPage}
          onJumpToPage={goToPage}
        />
        <div
          ref={containerRef}
          style={{
            flex: 1,
            overflow: "auto",
            background: "#f3f4f6",
            padding: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
            }}
          >
            {normalizedFile ? (
              <Document
                file={normalizedFile}
                onLoadSuccess={handleLoad}
                onLoadError={handleError}
                loading={
                  <div style={{ padding: 24, color: "#6b7280" }}>
                    PDF 로딩 중...
                  </div>
                }
                error={
                  <div style={{ padding: 24, color: "#dc2626" }}>
                    PDF를 로드할 수 없습니다.
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
                          <div style={{ padding: 24, color: "#6b7280" }}>
                            페이지 {i + 1} 로딩 중...
                          </div>
                        }
                        onLoadSuccess={
                          i === 0
                            ? (page) => {
                                try {
                                  const viewport = page.getViewport({
                                    scale: 1,
                                  });
                                  const w = viewport?.width;
                                  const h = viewport?.height;
                                  if (w && w > 0) setBasePageWidth(w);
                                  if (h && h > 0) setBasePageHeight(h);
                                  if (containerRef.current) {
                                    const s = computeScaleForMode(viewMode);
                                    if (s && s > 0) setScale(s);
                                  }
                                } catch (e) {
                                  console.warn("페이지 뷰포트 측정 실패", e);
                                }
                              }
                            : undefined
                        }
                      />
                      <PageHighlightOverlay
                        pageNumber={i + 1}
                        referenceId={referenceId}
                        highlightMode={highlightMode}
                        selectedColor={selectedColor}
                        scale={scale}
                        onHighlightAdded={handleHighlightAdded}
                        onHighlightDeleted={handleHighlightDeleted}
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

      {pdfError && (
        <div style={{ padding: 12, color: "#dc2626", fontSize: 12 }}>
          {pdfError}
        </div>
      )}
    </div>
  );
}
