/* eslint-disable react/prop-types */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import PDFHighlight from "./PDFHighlight";
import PageHighlightOverlay from "./PageHighlightOverlay";
import PageHighlightsSidebar from "./PageHighlightsSidebar";
import { localDB } from "@/db/localDB";
import {
  exportFromIndexedDB,
  exportPDFWithHighlights,
  triggerDownload,
} from "@/utils/pdfExport";

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
  // 하이라이트 중복 방지용 시그니처 생성기(문서 전체 기준, 페이지 제외)
  const makeHighlightSignature = useCallback((h) => {
    if (!h) return "";
    const type = h.type || (Array.isArray(h.rects) ? "text" : "area");
    const color = h.color || "";
    // base_size는 표시/점프에 영향이 적으므로 좌표와 텍스트 위주로 판단
    if (type === "text" && Array.isArray(h.rects)) {
      const rectSig = h.rects
        .map((r) =>
          [r.x, r.y, r.width, r.height]
            .map((v) => Math.round(Number(v) || 0))
            .join(":")
        )
        .sort()
        .join("|");
      const text = (h.text || "").trim();
      return `${type}|${color}|${rectSig}|${text}`;
    }
    if (h.area) {
      const r = h.area;
      const rectSig = [r.x, r.y, r.width, r.height]
        .map((v) => Math.round(Number(v) || 0))
        .join(":");
      return `area|${color}|${rectSig}`;
    }
    return `${type}|${color}`;
  }, []);

  const dedupeHighlights = useCallback(
    (list) => {
      const seen = new Set();
      const result = [];
      const src = Array.isArray(list) ? [...list] : [];
      // 작은 페이지 번호 우선, 동일 페이지에서는 생성시각 오름차순으로 우선
      src.sort(
        (a, b) =>
          (a.page || 0) - (b.page || 0) ||
          (a.created_at || 0) - (b.created_at || 0)
      );
      for (const h of src) {
        const sig = makeHighlightSignature(h);
        if (seen.has(sig)) continue;
        seen.add(sig);
        result.push(h);
      }
      return result;
    },
    [makeHighlightSignature]
  );
  // UI state
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [highlightMode, setHighlightMode] = useState(null);
  const [selectedColor, setSelectedColor] = useState("#FFFF00");
  const containerRef = useRef(null);
  const pageRefs = useRef({});
  const [pdfError, setPdfError] = useState(null);
  const fileInputRef = useRef(null);

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
  const [driveInfo, setDriveInfo] = useState({
    updatable: false,
    fileId: null,
  });
  const [dbRefreshKey, setDbRefreshKey] = useState(0);

  // file 우선, 사용자가 업로드한 로컬 파일이 있으면 해당 파일 사용
  const normalizedFile = localFile || file;
  const hasSource = useMemo(() => !!normalizedFile, [normalizedFile]);
  // 로컬 업로드 세션 여부에 따라 referenceId를 temp로 전환
  const effectiveReferenceId = useMemo(
    () => (localFile ? "temp" : referenceId),
    [localFile, referenceId]
  );
  // 파일 식별 키(파일 변경 시 페이지/오버레이 강제 리마운트용)
  const docKey = useMemo(() => {
    if (typeof normalizedFile === "string") return `url:${normalizedFile}`;
    if (
      normalizedFile &&
      typeof normalizedFile === "object" &&
      "url" in normalizedFile &&
      normalizedFile.url
    )
      return `url:${normalizedFile.url}`;
    if (normalizedFile && normalizedFile.name)
      return `file:${normalizedFile.name}:${normalizedFile.size || 0}:$${
        normalizedFile.lastModified || 0
      }`;
    if (normalizedFile instanceof ArrayBuffer)
      return `ab:${normalizedFile.byteLength}`;
    return `unknown:${Date.now()}`;
  }, [normalizedFile]);

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
    if (!hasSource) {
      alert("먼저 PDF를 열어주세요. 상단의 '업로드' 또는 'URL' 버튼을 사용하세요.");
      return;
    }
    // 팝업 차단 회피를 위해 먼저 빈 탭을 연 뒤 URL을 설정
    const win = window.open("about:blank", "_blank", "noopener,noreferrer");
    try {
      setExportBusy(true);
      let blob;
      if (effectiveReferenceId === "temp") {
        const ab = await getSourceArrayBuffer();
        blob = await exportPDFWithHighlights({
          sourceArrayBuffer: ab,
          highlights: allHighlights,
        });
      } else {
        blob = await exportFromIndexedDB({
          referenceId: effectiveReferenceId,
          pdfCacheId: undefined,
          getSourceArrayBuffer,
        });
      }
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
  }, [effectiveReferenceId, getSourceArrayBuffer, allHighlights, hasSource]);

  const handleDownloadExport = useCallback(async () => {
    if (!hasSource) {
      alert("먼저 PDF를 열어주세요. 상단의 '업로드' 또는 'URL' 버튼을 사용하세요.");
      return;
    }
    try {
      setExportBusy(true);
      let blob;
      if (effectiveReferenceId === "temp") {
        const ab = await getSourceArrayBuffer();
        blob = await exportPDFWithHighlights({
          sourceArrayBuffer: ab,
          highlights: allHighlights,
        });
      } else {
        blob = await exportFromIndexedDB({
          referenceId: effectiveReferenceId,
          pdfCacheId: undefined,
          getSourceArrayBuffer,
        });
      }
      await triggerDownload(blob, "annotated.pdf");
    } catch (e) {
      console.error("다운로드 내보내기 실패", e);
      alert(`내보내기 실패: ${e?.message || e}`);
    } finally {
      setExportBusy(false);
    }
  }, [effectiveReferenceId, getSourceArrayBuffer, allHighlights, hasSource]);

  // 로컬 저장 (showSaveFilePicker 지원 시 사용)
  const handleLocalSave = useCallback(async () => {
    if (!hasSource) {
      alert("먼저 PDF를 열어주세요. 상단의 '업로드' 또는 'URL' 버튼을 사용하세요.");
      return;
    }
    try {
      setExportBusy(true);
      let blob;
      if (effectiveReferenceId === "temp") {
        const ab = await getSourceArrayBuffer();
        blob = await exportPDFWithHighlights({
          sourceArrayBuffer: ab,
          highlights: allHighlights,
        });
      } else {
        blob = await exportFromIndexedDB({
          referenceId: effectiveReferenceId,
          pdfCacheId: undefined,
          getSourceArrayBuffer,
        });
      }
      const defaultName =
        localFile && localFile.name
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
  }, [effectiveReferenceId, getSourceArrayBuffer, localFile, allHighlights, hasSource]);

  // Drive 저장/업데이트
  const handleDriveSave = useCallback(async () => {
    if (!hasSource) {
      alert("먼저 PDF를 열어주세요. 상단의 '업로드' 또는 'URL' 버튼을 사용하세요.");
      return;
    }
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
      let blob;
      if (effectiveReferenceId === "temp") {
        const ab = await getSourceArrayBuffer();
        blob = await exportPDFWithHighlights({
          sourceArrayBuffer: ab,
          highlights: allHighlights,
        });
      } else {
        blob = await exportFromIndexedDB({
          referenceId: effectiveReferenceId,
          pdfCacheId: undefined,
          getSourceArrayBuffer,
        });
      }
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
          effectiveReferenceId || "temp"
        );
        alert("Drive 업로드 완료: " + url);
      }
    } catch (e) {
      console.error("Drive 저장 실패", e);
      alert(`Drive 저장 실패: ${e?.message || e}`);
    }
  }, [
    effectiveReferenceId,
    getSourceArrayBuffer,
    driveInfo,
    localFile,
    allHighlights,
    hasSource,
  ]);

  // 초기 하이라이트 동기화
  useEffect(() => {
    const list = Array.isArray(initialAnnotations) ? initialAnnotations : [];
    setAllHighlights(dedupeHighlights(list));
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

  // 새로고침/재진입 시 IndexedDB에서 하이라이트 재로딩하여 사이드바에 반영
  useEffect(() => {
    (async () => {
      try {
        if (!effectiveReferenceId || effectiveReferenceId === "temp") return;
        const db = await (await import("@/db/localDB")).initDB();
        const items = await db.getAllFromIndex(
          "highlights",
          "reference_id",
          effectiveReferenceId
        );

        // 페이지별로 그룹핑한 뒤, 각 페이지 내에서만 중복 제거
        // (같은 내용이 다른 페이지에 있으면 각각 유지)
        const byPageMap = new Map();
        for (const it of items) {
          const p = it.page || it.page_number || 1;
          if (!byPageMap.has(p)) byPageMap.set(p, []);
          byPageMap.get(p).push(it);
        }

        const toKeep = [];
        const toDeleteIds = [];

        byPageMap.forEach((pageItems, page) => {
          // 각 페이지 내에서만 중복 제거
          const groups = new Map();
          for (const it of pageItems) {
            const sig = makeHighlightSignature(it);
            const cur = groups.get(sig);
            if (!cur) groups.set(sig, [it]);
            else cur.push(it);
          }

          groups.forEach((arr) => {
            if (arr.length === 1) {
              toKeep.push(arr[0]);
              return;
            }
            // 같은 페이지 내 중복: 최근 생성 우선
            arr.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
            toKeep.push(arr[0]);
            for (let i = 1; i < arr.length; i++) {
              if (arr[i]?.id != null) toDeleteIds.push(arr[i].id);
            }
          });
        });

        if (toDeleteIds.length > 0) {
          try {
            const tx = db.transaction("highlights", "readwrite");
            for (const id of toDeleteIds) {
              await tx.store.delete(id);
            }
            await tx.done;
            console.log(
              `[DB 정리] ${toDeleteIds.length}개 페이지 내 중복 삭제 완료`
            );
          } catch (e) {
            console.warn("중복 정리 중 DB 삭제 실패(무시)", e);
          }
        }

        // 페이지/생성시간 기준으로 정렬(안정적인 표시 순서)
        toKeep.sort(
          (a, b) =>
            (a.page || 0) - (b.page || 0) ||
            (a.created_at || 0) - (b.created_at || 0)
        );
        setAllHighlights(toKeep);
      } catch (e) {
        console.warn("IndexedDB 하이라이트 재로딩 실패(계속 진행)", e);
      }
    })();
  }, [effectiveReferenceId, dbRefreshKey, makeHighlightSignature]);

  // 파일이 바뀔 때 상태/스크롤 초기화(잔상 방지)
  useEffect(() => {
    try {
      setCurrentPage(1);
      if (containerRef.current) containerRef.current.scrollTop = 0;
    } catch {}
  }, [docKey]);

  // 로컬 업로드 세션으로 전환 시, 사이드바 잔상 방지를 위해 하이라이트 목록 초기화
  useEffect(() => {
    if (localFile) {
      setAllHighlights([]);
    }
  }, [docKey, localFile]);

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
      setAllHighlights((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        const sig = makeHighlightSignature(highlight);
        const exists = list.some((h) => makeHighlightSignature(h) === sig);
        if (exists) return list; // 동일 항목 이미 존재 시 추가 생략
        return [...list, highlight];
      });
      onAnnotationChange &&
        onAnnotationChange((prev) =>
          prev ? [...prev, highlight] : [highlight]
        );

      // 로컬 업로드 세션에서는 서버/큐 동작 생략
      if (!effectiveReferenceId || effectiveReferenceId === "temp") {
        return;
      }

      // 원격 저장 시도 (실패하면 큐에 적재)
      try {
        setSaving(true);
        const { saveAnnotation } = await import("../../api/refManagerClient");
        const payload = {
          reference_id: effectiveReferenceId,
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
    [effectiveReferenceId, onAnnotationChange, refreshPendingCount]
  );

  const handleHighlightDeleted = useCallback(
    async (highlight) => {
      // 즉시 내부/상위 상태 반영
      setAllHighlights((prev) => prev.filter((h) => h.id !== highlight.id));
      onAnnotationChange &&
        onAnnotationChange((prev) =>
          Array.isArray(prev) ? prev.filter((h) => h.id !== highlight.id) : prev
        );

      // 로컬 업로드 세션에서는 서버 삭제 생략
      if (!effectiveReferenceId || effectiveReferenceId === "temp") {
        return;
      }

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
    [effectiveReferenceId, onAnnotationChange, refreshPendingCount]
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
      <div className="pdf-toolbar">
        {/* 좌측: 페이지 내비게이션 */}
        <div className="toolbar-group">
          <button
            className="btn"
            onClick={() => goToPage(currentPage - 1)}
            disabled={!numPages || currentPage <= 1}
            title="이전 페이지"
          >
            ←
          </button>
          <input
            className="input-number"
            type="number"
            min={1}
            max={numPages || 1}
            value={currentPage}
            onChange={(e) => goToPage(e.target.value)}
          />
          <span className="muted">/ {numPages || "?"}</span>
          <button
            className="btn"
            onClick={() => goToPage(currentPage + 1)}
            disabled={!numPages || currentPage >= numPages}
            title="다음 페이지"
          >
            →
          </button>
        </div>

        {/* 줌 + 보기 모드 */}
        <div className="toolbar-group">
          <button
            className="btn"
            onClick={zoomOut}
            title="축소"
          >
            -
          </button>
          <span className="scale-display">{Math.round(scale * 100)}%</span>
          <button
            className="btn"
            onClick={zoomIn}
            title="확대"
          >
            +
          </button>
          <div
            className="btn-group"
            role="group"
            aria-label="view modes"
          >
            <button
              className={`btn ${viewMode === "fit-width" ? "active" : ""}`}
              onClick={() => setViewMode("fit-width")}
              title="너비 맞춤"
            >
              너비
            </button>
            <button
              className={`btn ${viewMode === "fit-page" ? "active" : ""}`}
              onClick={() => setViewMode("fit-page")}
              title="페이지 맞춤"
            >
              페이지
            </button>
            <button
              className={`btn ${viewMode === "actual" ? "active" : ""}`}
              onClick={() => setViewMode("actual")}
              title="실제 크기(100%)"
            >
              100%
            </button>
          </div>
        </div>

        {/* 하이라이트 도구 */}
        <div className="toolbar-group">
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
          <span className="muted">
            {Array.isArray(allHighlights) ? allHighlights.length : 0}개
          </span>
        </div>

        <div className="toolbar-spacer" />

        {/* 숨김 파일 입력 */}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (
              f &&
              (f.type === "application/pdf" ||
                f.name?.toLowerCase().endsWith(".pdf"))
            ) {
              setLocalFile(f);
            } else if (f) {
              alert("PDF 파일을 선택해주세요.");
            }
            e.currentTarget.value = "";
          }}
        />

        {/* Edge 호환 토글 */}
        <div className="toolbar-group">
          <label
            className="checkbox"
            title="Edge 렌더 호환 모드 (SVG)"
          >
            <input
              type="checkbox"
              checked={compatMode}
              onChange={(e) => setCompatMode(e.target.checked)}
            />
            <span>Edge</span>
          </label>
        </div>

        {/* 업로드 + 동기화 + 내보내기 */}
        <div className="toolbar-group">
          <button
            className="btn primary"
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            title="로컬 PDF 업로드"
          >
            업로드
          </button>
          <button
            className="btn"
            onClick={() => {
              const u = window.prompt("열고 싶은 PDF의 URL을 입력하세요 (https://…)");
              if (!u) return;
              try {
                const url = new URL(u);
                if (!/^https?:$/i.test(url.protocol)) {
                  alert("http(s) URL만 지원합니다.");
                  return;
                }
                setLocalFile({ url: url.toString() });
              } catch {
                alert("유효한 URL이 아닙니다.");
              }
            }}
            title="PDF URL로 열기"
          >
            URL
          </button>
          {saving && <span className="muted">저장 중…</span>}
          {pendingCount > 0 && (
            <button
              className="btn warn"
              onClick={processSyncQueue}
              title="대기 중인 동기화 작업을 즉시 재시도"
            >
              동기화 대기 <span className="badge">{pendingCount}</span>
            </button>
          )}
          <div className="btn-split">
            <button
              className="btn info"
              onClick={handlePreviewExport}
              disabled={exportBusy || !hasSource}
              title="주석 포함 PDF 미리보기"
            >
              미리
            </button>
            <button
              className="btn success"
              onClick={handleDownloadExport}
              disabled={exportBusy || !hasSource}
              title="주석 포함 PDF 다운로드"
            >
              다운
            </button>
            <button
              className="btn"
              onClick={handleLocalSave}
              disabled={exportBusy || !hasSource}
              title="로컬 파일로 저장(브라우저 지원 시 대화상자)"
            >
              로컬
            </button>
            <button
              className="btn drive"
              onClick={handleDriveSave}
              disabled={exportBusy || !hasSource}
              title={
                driveInfo.updatable
                  ? "Drive에 주석 포함 업데이트"
                  : "Drive에 주석 포함 저장"
              }
            >
              Drive
            </button>
          </div>
          {exportBusy && <span className="muted">내보내는 중…</span>}
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
          onDragOver={(e) => {
            // 언제든 드롭으로 파일 교체 가능
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(e) => {
            e.preventDefault();
            const dt = e.dataTransfer;
            if (!dt) return;
            const pdfItem = Array.from(dt.files || []).find(
              (f) =>
                f.type === "application/pdf" ||
                f.name?.toLowerCase().endsWith(".pdf")
            );
            if (pdfItem) setLocalFile(pdfItem);
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
                      key={`${docKey}_page_${i + 1}`}
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
                        referenceId={effectiveReferenceId}
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
                    (f) =>
                      f.type === "application/pdf" ||
                      f.name?.toLowerCase().endsWith(".pdf")
                  );
                  if (pdfItem) setLocalFile(pdfItem);
                }}
              >
                <div>
                  PDF 파일이 없습니다. ‘업로드’를 클릭하거나 파일을 끌어다
                  놓으세요.
                </div>
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
