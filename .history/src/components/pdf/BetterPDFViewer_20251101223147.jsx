/* eslint-disable react/prop-types */
import { useState, useEffect, useRef, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import PDFHighlight from "./PDFHighlight";
import PageHighlightOverlay from "./PageHighlightOverlay";
import PageHighlightsSidebar from "./PageHighlightsSidebar";
import { localDB } from "@/db/localDB";
import { exportFromIndexedDB, triggerDownload } from "@/utils/pdfExport";

// Use the same worker strategy as refmanager to avoid bundler/URL issues
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function BetterPDFViewer({
  file,
  referenceId,
  originalPdfUrl,
  initialAnnotations = [],
  onAnnotationChange,
  onLoadSuccess,
  onLoadError,
}) {
  // UI state
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [highlightMode, setHighlightMode] = useState(null);
  const [selectedColor, setSelectedColor] = useState("#FFFF00");
  const containerRef = useRef(null);
  const pageRefs = useRef({});
  const [pdfError, setPdfError] = useState(null);

  // highlights/sync state
  const [allHighlights, setAllHighlights] = useState([]);
  const [saving, setSaving] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // view modes & base sizes
  const [basePageWidth, setBasePageWidth] = useState(null);
  const [basePageHeight, setBasePageHeight] = useState(null);
  const [viewMode, setViewMode] = useState("fit-width");
  const [compatMode, setCompatMode] = useState(false); // Edge 호환(렌더모드: svg)
  const [exportBusy, setExportBusy] = useState(false);
  const [localFile, setLocalFile] = useState(null);
  const [driveInfo, setDriveInfo] = useState({ updatable: false, fileId: null });
  const [dbRefreshKey, setDbRefreshKey] = useState(0);

  // file 우선, 사용자가 업로드한 로컬 파일이 있으면 해당 파일 사용
  const normalizedFile = localFile || file;

  // 현재 파일로부터 ArrayBuffer 가져오기 (URL/Blob/File/ArrayBuffer 모두 지원)
  const getSourceArrayBuffer = useCallback(async () => {
    if (!normalizedFile) throw new Error("PDF 소스가 없습니다.");
    // URL 문자열
    if (typeof normalizedFile === "string") {
      const res = await fetch(normalizedFile);
      if (!res.ok) throw new Error(`PDF 다운로드 실패: ${res.status}`);
      return await res.arrayBuffer();
    }
    // { url: string }
    if (
      normalizedFile &&
      typeof normalizedFile === "object" &&
      "url" in normalizedFile
    ) {
      const res = await fetch(normalizedFile.url);
      if (!res.ok) throw new Error(`PDF 다운로드 실패: ${res.status}`);
      return await res.arrayBuffer();
    }
    // Blob/File
    if (normalizedFile && typeof normalizedFile.arrayBuffer === "function") {
      return await normalizedFile.arrayBuffer();
    }
    // ArrayBuffer
    if (normalizedFile instanceof ArrayBuffer) {
      return normalizedFile;
    }
    throw new Error("지원하지 않는 PDF 입력 형식입니다.");
  }, [normalizedFile]);

  // Drive 업데이트 대상 판단(원본 URL에서 파일 ID 추출)
  useEffect(() => {
    (async () => {
      try {
        const url = originalPdfUrl;
        if (!url) {
          setDriveInfo({ updatable: false, fileId: null });
          return;
        }
        const { extractFileIdFromUrl } = await import("@/api/driveClient");
        const fid = extractFileIdFromUrl(url);
        if (fid) setDriveInfo({ updatable: true, fileId: fid });
        else setDriveInfo({ updatable: false, fileId: null });
      } catch (e) {
        console.warn("Drive 대상 확인 실패", e);
        setDriveInfo({ updatable: false, fileId: null });
      }
    })();
  }, [originalPdfUrl]);

  const handlePreviewExport = useCallback(async () => {
    // 팝업 차단 회피를 위해 먼저 빈 탭을 연 뒤 URL을 설정
    const win = window.open("about:blank", "_blank", "noopener,noreferrer");
    try {
      setExportBusy(true);
      const blob = await exportFromIndexedDB({
        referenceId,
        pdfCacheId: undefined,
        getSourceArrayBuffer,
      });
      const url = URL.createObjectURL(blob);
      if (win) {
        win.location.href = url;
      } else {
        // 실패 시 대체
        window.open(url, "_blank", "noopener,noreferrer");
      }
      // URL.revokeObjectURL는 새 탭이 로드된 이후 호출해야 하므로 생략(탭에서 관리)
    } catch (e) {
      console.error("미리보기 내보내기 실패", e);
      if (win) win.close();
      alert(`내보내기 실패: ${e?.message || e}`);
    } finally {
      setExportBusy(false);
    }
  }, [referenceId, getSourceArrayBuffer]);

  const handleDownloadExport = useCallback(async () => {
    try {
      setExportBusy(true);
      const blob = await exportFromIndexedDB({
        referenceId,
        pdfCacheId: undefined,
        getSourceArrayBuffer,
      });
      await triggerDownload(blob, "annotated.pdf");
    } catch (e) {
      console.error("다운로드 내보내기 실패", e);
      alert(`내보내기 실패: ${e?.message || e}`);
    } finally {
      setExportBusy(false);
    }
  }, [referenceId, getSourceArrayBuffer]);

  // 로컬 저장 (showSaveFilePicker 지원 시 사용)
  const handleLocalSave = useCallback(async () => {
    try {
      setExportBusy(true);
      const blob = await exportFromIndexedDB({
        referenceId,
        pdfCacheId: undefined,
        getSourceArrayBuffer,
      });
      const defaultName =
        (localFile && localFile.name)
          ? localFile.name.replace(/\.pdf$/i, " (annotated).pdf")
          : "annotated.pdf";
      if ("showSaveFilePicker" in window) {
        const handle = await window.showSaveFilePicker({
          suggestedName: defaultName,
          types: [
            { description: "PDF", accept: { "application/pdf": [".pdf"] } },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        alert("로컬 저장 완료");
      } else {
        await triggerDownload(blob, defaultName);
      }
    } catch (e) {
      console.error("로컬 저장 실패", e);
      alert(`로컬 저장 실패: ${e?.message || e}`);
    } finally {
      setExportBusy(false);
    }
  }, [referenceId, getSourceArrayBuffer, localFile]);

  // Drive 저장/업데이트
  const handleDriveSave = useCallback(async () => {
    try {
      const [drive, pdfMgr] = await Promise.all([
        import("@/api/driveClient"),
        import("@/utils/pdfManager"),
      ]);
      if (!drive.isDriveAPIAvailable()) {
        alert("Google Drive API 설정이 필요합니다. .env.local을 확인하세요.");
        return;
      }
      const inited = await drive.initDriveAPI();
      if (!inited) {
        alert("Google Drive API 초기화 실패");
        return;
      }
      const blob = await exportFromIndexedDB({
        referenceId,
        pdfCacheId: undefined,
        getSourceArrayBuffer,
      });
      if (driveInfo.updatable && driveInfo.fileId) {
        await drive.updateDriveFile(driveInfo.fileId, blob);
        const url = drive.getDriveUrl(driveInfo.fileId);
        alert("Drive 업데이트 완료: " + url);
      } else {
        let baseName = "annotated";
        if (localFile?.name) baseName = localFile.name.replace(/\.pdf$/i, "");
        const filename = `${baseName} (annotated).pdf`;
        const { url } = await pdfMgr.uploadPDFToDrive(
          blob,
          filename,
          referenceId || "temp"
        );
        alert("Drive 업로드 완료: " + url);
      }
    } catch (e) {
      console.error("Drive 저장 실패", e);
      alert(`Drive 저장 실패: ${e?.message || e}`);
    }
  }, [referenceId, getSourceArrayBuffer, driveInfo, localFile]);

  // 초기 하이라이트 동기화
  useEffect(() => {
    const list = Array.isArray(initialAnnotations) ? initialAnnotations : [];
    setAllHighlights(list);
  }, [initialAnnotations]);

  // 서버 주석을 로컬 IndexedDB(highlights)로 반영하여 오버레이/내보내기에서 사용 가능하게 함
  useEffect(() => {
    (async () => {
      try {
        if (!referenceId) return;
        const serverList = Array.isArray(initialAnnotations)
          ? initialAnnotations
          : [];
        if (serverList.length === 0) return;

        const db = await (await import("@/db/localDB")).initDB();
        const storeItems = await db.getAllFromIndex(
          "highlights",
          "reference_id",
          referenceId
        );
        const existingRemoteIds = new Set(
          storeItems
            .map((it) => it.remote_id || it.id)
            .filter((x) => typeof x !== "undefined" && x !== null)
        );

        const toInsert = [];
        for (const a of serverList) {
          const sid = a.id || a.remote_id;
          if (sid && existingRemoteIds.has(sid)) continue; // 이미 있음
          const pos = a.position || {};
          const isText = Array.isArray(pos.rects) && pos.rects.length > 0;
          const isArea = !isText && pos.area;
          const mapped = {
            id: sid ? String(sid) : `srv-${Date.now()}-${Math.random()}`,
            remote_id: sid ? String(sid) : undefined,
            reference_id: referenceId,
            page: a.page_number || a.page || 1,
            type: a.type || (isText ? "text" : "area"),
            rects: isText ? pos.rects : undefined,
            area: isArea ? pos.area : undefined,
            color: a.color || "#FFFF00",
            text: a.content || a.text || "",
            base_size: a.base_size || null,
            created_at: a.created_at || Date.now(),
            synced: true,
          };
          toInsert.push(mapped);
        }

        if (toInsert.length > 0) {
          const tx = db.transaction("highlights", "readwrite");
          for (const item of toInsert) {
            await tx.store.put(item);
          }
          await tx.done;
          setDbRefreshKey((k) => k + 1);
        }
      } catch (e) {
        console.warn("서버 주석 로컬 반영 실패(계속 진행)", e);
      }
    })();
  }, [referenceId, initialAnnotations]);

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

  // 하이라이트 위치로 스크롤 (페이지 내 상대 위치 계산)
  const scrollToHighlight = useCallback(
    (h) => {
      if (!h) return;
      const pageNum = h.page || h.page_number;
      const pageEl = pageRefs.current[pageNum];
      const container = containerRef.current;
      if (!pageEl || !container) return;

      const containerRect = container.getBoundingClientRect();
      const pageRect = pageEl.getBoundingClientRect();
      const currentTop = container.scrollTop;
      const pageTopDelta = pageRect.top - containerRect.top; // 컨테이너 안에서 페이지 상단까지 거리

      // 첫 사각형의 y 기준으로 오프셋 계산
      let rectY = 0;
      let baseH = h?.base_size?.height || basePageHeight || 0;
      if (h.type === "text" && Array.isArray(h.rects) && h.rects.length > 0) {
        rectY = Math.min(...h.rects.map((r) => r.y));
        baseH = h?.base_size?.height || baseH;
      } else if (h.type === "area" && h.area) {
        rectY = h.area.y || 0;
        baseH = h?.base_size?.height || baseH;
      }

      const pagePixelHeight = pageRect.height; // 현재 스케일 적용된 높이
      const offsetWithinPage =
        baseH > 0 ? (rectY / baseH) * pagePixelHeight : 0;

      const target =
        currentTop + pageTopDelta + Math.max(0, offsetWithinPage - 80);
      container.scrollTo({ top: target, behavior: "smooth" });
    },
    [basePageHeight]
  );

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
            style={{
              padding: "4px 8px",
              border: "1px solid #e5e7eb",
              borderRadius: 4,
              background: "#fff",
            }}
          >
            ←
          </button>
          <input
            type="number"
            min={1}
            max={numPages || 1}
            value={currentPage}
            onChange={(e) => goToPage(e.target.value)}
            style={{
              width: 64,
              textAlign: "center",
              padding: "4px 6px",
              border: "1px solid #e5e7eb",
              borderRadius: 4,
            }}
          />
          <span>/ {numPages || "?"}</span>
          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={!numPages || currentPage >= numPages}
            style={{
              padding: "4px 8px",
              border: "1px solid #e5e7eb",
              borderRadius: 4,
              background: "#fff",
            }}
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
          <button
            onClick={zoomOut}
            style={{
              padding: "4px 8px",
              border: "1px solid #e5e7eb",
              borderRadius: 4,
              background: "#fff",
            }}
          >
            -
          </button>
          <span style={{ width: 56, textAlign: "center" }}>
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={zoomIn}
            style={{
              padding: "4px 8px",
              border: "1px solid #e5e7eb",
              borderRadius: 4,
              background: "#fff",
            }}
          >
            +
          </button>
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
        {/* 업로드 */}
        <label style={{ display: "inline-flex", alignItems: "center", marginRight: 8 }}>
          <input
            type="file"
            accept=".pdf,application/pdf"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f && f.type === "application/pdf") {
                setLocalFile(f);
              } else if (f) {
                alert("PDF 파일을 선택해주세요.");
              }
              e.currentTarget.value = "";
            }}
          />
          <span
            style={{
              padding: "4px 8px",
              background: "#4f46e5",
              color: "white",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 12,
            }}
            title="로컬 PDF 업로드"
          >
            업로드
          </span>
        </label>
        {/* 호환 모드 토글 */}
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "#374151",
            marginRight: 8,
          }}
        >
          <input
            type="checkbox"
            checked={compatMode}
            onChange={(e) => setCompatMode(e.target.checked)}
          />
          Edge 호환
        </label>
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
          {/* 내보내기/저장 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginLeft: 8,
            }}
          >
            <button
              onClick={handlePreviewExport}
              disabled={exportBusy}
              style={{
                fontSize: 12,
                background: "#eff6ff",
                color: "#1d4ed8",
                border: "1px solid #93c5fd",
                padding: "4px 8px",
                borderRadius: 4,
                cursor: exportBusy ? "not-allowed" : "pointer",
              }}
              title="주석 포함 PDF 미리보기"
            >
              미리보기
            </button>
            <button
              onClick={handleDownloadExport}
              disabled={exportBusy}
              style={{
                fontSize: 12,
                background: "#ecfdf5",
                color: "#065f46",
                border: "1px solid #34d399",
                padding: "4px 8px",
                borderRadius: 4,
                cursor: exportBusy ? "not-allowed" : "pointer",
              }}
              title="주석 포함 PDF 다운로드"
            >
              다운로드
            </button>
            <button
              onClick={handleLocalSave}
              disabled={exportBusy}
              style={{
                fontSize: 12,
                background: "#ffffff",
                color: "#111827",
                border: "1px solid #d1d5db",
                padding: "4px 8px",
                borderRadius: 4,
                cursor: exportBusy ? "not-allowed" : "pointer",
              }}
              title="로컬 파일로 저장(브라우저 지원 시 대화상자)"
            >
              로컬 저장
            </button>
            <button
              onClick={handleDriveSave}
              disabled={exportBusy}
              style={{
                fontSize: 12,
                background: "#10b981",
                color: "#ffffff",
                border: "1px solid #059669",
                padding: "4px 8px",
                borderRadius: 4,
                cursor: exportBusy ? "not-allowed" : "pointer",
              }}
              title={driveInfo.updatable ? "Drive에 주석 포함 업데이트" : "Drive에 주석 포함 저장"}
            >
              {driveInfo.updatable ? "Drive 업데이트" : "Drive 저장"}
            </button>
            {exportBusy && (
              <span style={{ fontSize: 12, color: "#6b7280" }}>
                내보내는 중…
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 좌측 사이드바 + 문서 뷰 */}
      <div style={{ display: "flex", minHeight: 0, flex: 1 }}>
        <PageHighlightsSidebar
          highlights={allHighlights}
          currentPage={currentPage}
          onJumpToPage={goToPage}
          onJumpToHighlight={scrollToHighlight}
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
                        renderMode={compatMode ? "svg" : "canvas"}
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
                        refreshKey={dbRefreshKey}
                        onHighlightAdded={handleHighlightAdded}
                        onHighlightDeleted={handleHighlightDeleted}
                      />
                    </div>
                  ))}
              </Document>
            ) : (
              <div
                style={{
                  padding: 24,
                  color: "#6b7280",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const dt = e.dataTransfer;
                  const pdfItem = Array.from(dt.files || []).find(
                    (f) => f.type === "application/pdf" || f.name?.toLowerCase().endsWith(".pdf")
                  );
                  if (pdfItem) setLocalFile(pdfItem);
                }}
              >
                <div>PDF 파일이 없습니다. ‘업로드’를 클릭하거나 파일을 끌어다 놓으세요.</div>
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
