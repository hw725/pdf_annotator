/* eslint-disable react/prop-types */
import { useState, useEffect, useRef, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import PDFHighlight from "./PDFHighlight";
import PageHighlightOverlay from "./PageHighlightOverlay";
import PageHighlightsSidebar from "./PageHighlightsSidebar";
import { localDB } from "@/db/localDB";

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

export default function BetterPDFViewer({
  file,
  referenceId,
  initialAnnotations = [],
  onAnnotationChange,
  onLoadSuccess,
  onLoadError,
}) {
  // UI/뷰 상태
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [highlightMode, setHighlightMode] = useState(null);
  const [selectedColor, setSelectedColor] = useState("#FFFF00");
  const [pdfError, setPdfError] = useState(null);

  // 하이라이트/동기화 상태
  const [allHighlights, setAllHighlights] = useState([]);
  const [saving, setSaving] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // 레이아웃 참조
  const containerRef = useRef(null);
  const pageRefs = useRef({});

  // 초기 하이라이트 동기화 (props -> 내부 상태)
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

  // 동기화 큐 처리기 (주기적으로 실행/버튼으로 수동 실행)
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

  // PDF 파일 소스 정규화
  const normalizedFile =
    typeof file === "string" ? { url: file, withCredentials: false } : file;

  // PDF 로드 성공/실패
  const handleLoad = ({ numPages }) => {
    setNumPages(numPages);
    onLoadSuccess && onLoadSuccess({ numPages });
  };

  const handleError = (err) => {
    console.error("PDF load error:", err);
    setPdfError(err?.message || err?.name || String(err));
    onLoadError && onLoadError(err);
  };

  // 페이지 스크롤 시 현재 페이지 추적
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !numPages) return;
    const onScroll = () => {
      const top = container.scrollTop;
      let closest = 1;
      let minDist = Infinity;
      for (let p = 1; p <= numPages; p++) {
        const el = pageRefs.current[p];
        if (!el) continue;
        const dist = Math.abs(el.offsetTop - top);
        if (dist < minDist) {
          minDist = dist;
          closest = p;
        }
      }
      setCurrentPage(closest);
    };
    container.addEventListener("scroll", onScroll);
    onScroll();
    return () => container.removeEventListener("scroll", onScroll);
  }, [numPages]);

  // 네비게이션 & 줌
  const goToPage = (p) => {
    if (!numPages) return;
    const n = Math.max(1, Math.min(numPages, Number(p) || 1));
    pageRefs.current[n]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const zoomIn = () => setScale((s) => Math.min(3, s + 0.2));
  const zoomOut = () => setScale((s) => Math.max(0.5, s - 0.2));
  const resetZoom = () => setScale(1.0);

  // 하이라이트 추가/삭제 콜백
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

      // 원격 삭제는 베스트 에포트 (실패 시 큐 등록 가능)
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
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* 상단 툴바 */}
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
