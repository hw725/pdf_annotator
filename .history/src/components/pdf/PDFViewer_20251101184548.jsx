/* eslint-disable react/prop-types *//* eslint-disable react/prop-types */

import { useState, useEffect, useRef, useCallback } from "react";import { useState, useEffect, useRef, useCallback } from "react";

import { Document, Page, pdfjs } from "react-pdf";import { Document, Page, pdfjs } from "react-pdf";

import "react-pdf/dist/Page/AnnotationLayer.css";import "react-pdf/dist/Page/AnnotationLayer.css";

import "react-pdf/dist/Page/TextLayer.css";import "react-pdf/dist/Page/TextLayer.css";

import PDFHighlight from "./PDFHighlight";import PDFHighlight from "./PDFHighlight";

import PageHighlightOverlay from "./PageHighlightOverlay";import PageHighlightOverlay from "./PageHighlightOverlay";

import { saveAnnotation, deleteAnnotation } from "../../api/refManagerClient";

// PDF.js worker 설정

// PDF.js worker 설정pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const PDFViewer = ({

const PDFViewer = ({  file,

  file,  referenceId,

  referenceId,  pdfCacheId,

  initialAnnotations = [],  onLoadSuccess,

  onAnnotationChange,  onLoadError,

  onLoadSuccess,  onFilePicked, // 파일 선택(업로드) 콜백 (선택)

  onLoadError,}) => {

}) => {  const [numPages, setNumPages] = useState(null);

  const [numPages, setNumPages] = useState(null);  const [currentPage, setCurrentPage] = useState(1);

  const [currentPage, setCurrentPage] = useState(1);  const [scale, setScale] = useState(1.0);

  const [scale, setScale] = useState(1.0);  const pdfType = null; // 'text' or 'image' (향후 필요 시 감지 로직 연결)

  const pdfType = null; // 'text' or 'image'  const [highlightMode, setHighlightMode] = useState(null); // 'text', 'area', or null

  const [highlightMode, setHighlightMode] = useState(null);  const [selectedColor, setSelectedColor] = useState("#FFFF00");

  const [selectedColor, setSelectedColor] = useState("#FFFF00");  const containerRef = useRef(null);

  const containerRef = useRef(null);  const pageRefs = useRef({});

  const pageRefs = useRef({});  const [sessionHighlights, setSessionHighlights] = useState([]); // 임시 업로드 세션 하이라이트

  const [annotations, setAnnotations] = useState(initialAnnotations);  const [driveInfo, setDriveInfo] = useState({

  const [basePageWidth, setBasePageWidth] = useState(null);    updatable: false,

  const [basePageHeight, setBasePageHeight] = useState(null);    fileId: null,

  const [viewMode, setViewMode] = useState("fit-width");  });

  const [saving, setSaving] = useState(false);  const [basePageWidth, setBasePageWidth] = useState(null); // scale=1 기준 첫 페이지 폭(CSS px)

  const [basePageHeight, setBasePageHeight] = useState(null); // scale=1 기준 첫 페이지 높이(CSS px)

  useEffect(() => {  // 보기 모드: fit-width | fit-page | actual | custom

    setAnnotations(initialAnnotations);  const [viewMode, setViewMode] = useState("fit-width");

  }, [initialAnnotations]);

  // 파일 변경 시 세션 하이라이트 초기화

  const handleDocumentLoadSuccess = ({ numPages }) => {  useEffect(() => {

    setNumPages(numPages);    setSessionHighlights([]);

    if (onLoadSuccess) onLoadSuccess({ numPages });  }, [file]);

  };

  // Drive 업데이트 가능 여부 감지 (캐시/Reference에서 drive_url 찾기)

  const handleDocumentLoadError = (error) => {  useEffect(() => {

    console.error("PDF 로드 에러:", error);    let cancelled = false;

    if (onLoadError) onLoadError(error);    (async () => {

  };      try {

        setDriveInfo({ updatable: false, fileId: null });

  useEffect(() => {        if (!referenceId && !pdfCacheId) return;

    const container = containerRef.current;        const [

    if (!container) return;          { getCachedPDF, getCachedPDFByReferenceId },

          { extractFileIdFromUrl },

    const handleScroll = () => {        ] = await Promise.all([

      let closestPage = 1;          import("@/utils/pdfManager"),

      let minDistance = Infinity;          import("@/api/driveClient"),

        ]);

      Object.entries(pageRefs.current).forEach(([pageNum, element]) => {        let cache = null;

        if (element) {        if (pdfCacheId) {

          const rect = element.getBoundingClientRect();          cache = await getCachedPDF(pdfCacheId);

          const containerRect = container.getBoundingClientRect();        } else if (referenceId) {

          const pageCenter = rect.top - containerRect.top + rect.height / 2;          cache = await getCachedPDFByReferenceId(referenceId);

          const viewportCenter = container.clientHeight / 2;        }

          const distance = Math.abs(pageCenter - viewportCenter);        const driveUrl = cache?.drive_url;

        if (driveUrl) {

          if (distance < minDistance) {          const fid = extractFileIdFromUrl(driveUrl);

            minDistance = distance;          if (!cancelled && fid) setDriveInfo({ updatable: true, fileId: fid });

            closestPage = parseInt(pageNum);        }

          }      } catch (e) {

        }        console.warn("Drive 업데이트 대상 확인 실패", e);

      });      }

    })();

      setCurrentPage(closestPage);    return () => {

    };      cancelled = true;

    };

    container.addEventListener("scroll", handleScroll);  }, [referenceId, pdfCacheId]);

    return () => container.removeEventListener("scroll", handleScroll);

  }, [numPages]);  const handleDocumentLoadSuccess = ({ numPages }) => {

    setNumPages(numPages);

  const goToPage = (pageNum) => {    if (onLoadSuccess) {

    if (pageNum >= 1 && pageNum <= numPages) {      onLoadSuccess({ numPages });

      pageRefs.current[pageNum]?.scrollIntoView({ behavior: "smooth", block: "start" });    }

    }  };

  };

  const handleDocumentLoadError = (error) => {

  const zoomIn = () => {    console.error("PDF 로드 에러:", error);

    setViewMode("custom");    if (onLoadError) {

    setScale((prev) => Math.min(prev + 0.2, 3.0));      onLoadError(error);

  };    }

  const zoomOut = () => {  };

    setViewMode("custom");

    setScale((prev) => Math.max(prev - 0.2, 0.5));  // 스크롤 위치에 따라 현재 페이지 업데이트

  };  useEffect(() => {

  const resetZoom = () => setViewMode("fit-width");    const container = containerRef.current;

    if (!container) return;

  const computeScaleForMode = useCallback(

    (mode) => {    const handleScroll = () => {

      if (!containerRef.current) return null;      const containerHeight = container.clientHeight;

      const el = containerRef.current;

      if (mode === "fit-width" && basePageWidth) {      // 뷰포트 중앙에 있는 페이지 찾기

        return Math.max((el.clientWidth - 16) / basePageWidth, 0.1);      let closestPage = 1;

      }      let minDistance = Infinity;

      if (mode === "fit-page" && basePageHeight) {

        return Math.max((el.clientHeight - 16) / basePageHeight, 0.1);      Object.entries(pageRefs.current).forEach(([pageNum, element]) => {

      }        if (element) {

      if (mode === "actual") return 1.0;          const rect = element.getBoundingClientRect();

      return null;          const containerRect = container.getBoundingClientRect();

    },          const pageCenter = rect.top - containerRect.top + rect.height / 2;

    [basePageWidth, basePageHeight]          const viewportCenter = containerHeight / 2;

  );          const distance = Math.abs(pageCenter - viewportCenter);



  useEffect(() => {          if (distance < minDistance) {

    if (viewMode === "custom") return;            minDistance = distance;

    const s = computeScaleForMode(viewMode);            closestPage = parseInt(pageNum);

    if (s && s > 0) setScale(s);          }

  }, [viewMode, basePageWidth, basePageHeight, computeScaleForMode]);        }

      });

  useEffect(() => {

    const el = containerRef.current;      setCurrentPage(closestPage);

    if (!el) return;    };

    const ro = new ResizeObserver(() => {

      if (viewMode === "custom") return;    container.addEventListener("scroll", handleScroll);

      const s = computeScaleForMode(viewMode);    return () => container.removeEventListener("scroll", handleScroll);

      if (s && s > 0) setScale(s);  }, [numPages]);

    });

    ro.observe(el);  // (선택) PDF 타입 감지는 향후 필요 시 활성화

    return () => ro.disconnect();

  }, [viewMode, computeScaleForMode]);  const goToPage = (pageNum) => {

    if (pageNum >= 1 && pageNum <= numPages) {

  const handleAnnotationAdded = async (highlight) => {      const pageElement = pageRefs.current[pageNum];

    try {      if (pageElement) {

      setSaving(true);        pageElement.scrollIntoView({ behavior: "smooth", block: "start" });

      const annotationData = {      }

        reference_id: referenceId,    }

        type: highlight.type,  };

        page_number: highlight.page,

        content: highlight.text || "",  const goToPreviousPage = () => goToPage(currentPage - 1);

        position: highlight.type === "text" ? { rects: highlight.rects } : { area: highlight.area },  const goToNextPage = () => goToPage(currentPage + 1);

        color: highlight.color,

      };  const zoomIn = () => {

    setViewMode("custom");

      const response = await saveAnnotation(annotationData);    setScale((prev) => Math.min(prev + 0.2, 3.0));

      if (response.success) {  };

        const newAnnotations = [...annotations, response.annotation];  const zoomOut = () => {

        setAnnotations(newAnnotations);    setViewMode("custom");

        if (onAnnotationChange) onAnnotationChange(newAnnotations);    setScale((prev) => Math.max(prev - 0.2, 0.5));

      }  };

    } catch (error) {  const resetZoom = () => {

      console.error("주석 저장 실패:", error);    // 너비 맞춤으로 복귀

      alert("주석 저장 실패: " + error.message);    setViewMode("fit-width");

    } finally {    // 실제 scale 계산은 아래 useEffect에서 수행

      setSaving(false);  };

    }

  };  // 보기 모드에 맞춰 scale 계산

  const computeScaleForMode = useCallback(

  const handleAnnotationDelete = async (annotationId) => {    (mode) => {

    try {      if (!containerRef.current) return null;

      setSaving(true);      const el = containerRef.current;

      const response = await deleteAnnotation(annotationId);      const horizontalPadding = 16; // p-2 (8px 좌우) + 여유

      if (response.success) {      const verticalPadding = 16; // p-2 (상하) + 여유

        const newAnnotations = annotations.filter(a => a.id !== annotationId);      if (mode === "fit-width") {

        setAnnotations(newAnnotations);        if (!basePageWidth) return null;

        if (onAnnotationChange) onAnnotationChange(newAnnotations);        const containerWidth = el.clientWidth || 0;

      }        const target = Math.max(containerWidth - horizontalPadding, 100);

    } catch (error) {        return target / basePageWidth;

      console.error("주석 삭제 실패:", error);      }

      alert("주석 삭제 실패: " + error.message);      if (mode === "fit-page") {

    } finally {        if (!basePageHeight) return null;

      setSaving(false);        const containerHeight = el.clientHeight || 0;

    }        const target = Math.max(containerHeight - verticalPadding, 100);

  };        return target / basePageHeight;

      }

  return (      if (mode === "actual") return 1.0;

    <div className="pdf-viewer-container" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>      return null;

      <div style={{     },

        background: '#f9fafb',     [containerRef, basePageWidth, basePageHeight]

        borderBottom: '1px solid #e5e7eb',  );

        padding: '0.5rem 0.75rem',

        display: 'flex',  // fit-* 모드에서는 기준 크기가 준비되면 scale 자동 맞춤

        alignItems: 'center',  useEffect(() => {

        gap: '0.75rem'    if (

      }}>      viewMode !== "fit-width" &&

        <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>      viewMode !== "fit-page" &&

          <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1}      viewMode !== "actual"

            style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}>←</button>    )

          <input type="number" value={currentPage} onChange={(e) => goToPage(parseInt(e.target.value) || 1)}      return;

            min={1} max={numPages} style={{ width: '3.5rem', textAlign: 'center', fontSize: '0.875rem' }} />    const s = computeScaleForMode(viewMode);

          <span style={{ fontSize: '0.875rem' }}>/ {numPages || "?"}</span>    if (s && s > 0) setScale(s);

          <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= numPages}  }, [viewMode, basePageWidth, basePageHeight, computeScaleForMode]);

            style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}>→</button>

        </div>  // 컨테이너 리사이즈 시 자동 맞춤

  useEffect(() => {

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>    const el = containerRef.current;

          <button onClick={zoomOut} style={{ fontSize: '0.875rem' }}>-</button>    if (!el) return;

          <span style={{ fontSize: '0.875rem', width: '3.5rem', textAlign: 'center' }}>    const ro = new ResizeObserver(() => {

            {Math.round(scale * 100)}%      if (viewMode !== "fit-width" && viewMode !== "fit-page") return;

          </span>      const s = computeScaleForMode(viewMode);

          <button onClick={zoomIn} style={{ fontSize: '0.875rem' }}>+</button>      if (s && s > 0) setScale(s);

          <button onClick={resetZoom} style={{ fontSize: '0.75rem' }}>맞춤</button>    });

        </div>    ro.observe(el);

    return () => ro.disconnect();

        <div style={{ flex: 1 }} />  }, [viewMode, computeScaleForMode]);

        

        <PDFHighlight  // 공통: 현재 문서의 하이라이트를 반영한 주석 포함 Blob 생성

          pdfType={pdfType}  const buildAnnotatedBlob = async () => {

          currentPage={currentPage}    const { exportFromIndexedDB, exportPDFWithHighlights } = await import(

          referenceId={referenceId}      "@/utils/pdfExport"

          highlightMode={highlightMode}    );

          setHighlightMode={setHighlightMode}    const getSourceArrayBuffer = async () => {

          selectedColor={selectedColor}      if (typeof file === "string") {

          setSelectedColor={setSelectedColor}        const res = await fetch(file);

          compact        return await res.arrayBuffer();

          annotationCount={annotations.filter(a => a.page_number === currentPage).length}      } else if (file?.arrayBuffer) {

        />        return await file.arrayBuffer();

      } else if (file?.url) {

        {saving && <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>저장 중...</span>}        const res = await fetch(file.url);

      </div>        return await res.arrayBuffer();

      }

      <div ref={containerRef} style={{      throw new Error("원본 PDF를 불러올 수 없습니다.");

        flex: 1,    };

        overflow: 'auto',    if (referenceId && referenceId !== "temp") {

        background: '#e5e7eb',      return await exportFromIndexedDB({

        padding: '0.5rem'        referenceId,

      }}>        pdfCacheId,

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>        getSourceArrayBuffer,

          {file ? (      });

            <Document file={file} onLoadSuccess={handleDocumentLoadSuccess} onLoadError={handleDocumentLoadError}    }

              loading={<div style={{ padding: '2rem', color: '#6b7280' }}>PDF 로딩 중...</div>}    if (sessionHighlights.length > 0) {

              error={<div style={{ padding: '2rem', color: '#dc2626' }}>PDF를 로드할 수 없습니다.</div>}>      const ab = await getSourceArrayBuffer();

              {Array.from(new Array(numPages), (el, index) => (      return await exportPDFWithHighlights({

                <div key={`page_${index + 1}`} ref={(el) => (pageRefs.current[index + 1] = el)}        sourceArrayBuffer: ab,

                  style={{ marginBottom: '1rem', position: 'relative' }}>        highlights: sessionHighlights,

                  <Page pageNumber={index + 1} scale={scale} renderTextLayer renderAnnotationLayer      });

                    style={{ boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}    }

                    onLoadSuccess={index === 0 ? (page) => {    const ab = await getSourceArrayBuffer();

                      const viewport = page.getViewport({ scale: 1 });    return new Blob([ab], { type: "application/pdf" });

                      if (viewport.width > 0) setBasePageWidth(viewport.width);  };

                      if (viewport.height > 0) setBasePageHeight(viewport.height);

                      const s = computeScaleForMode(viewMode);  return (

                      if (s && s > 0) setScale(s);    <div className="pdf-viewer-container flex flex-col h-full">

                    } : undefined}      {/* 툴바 (컴팩트) */}

                    loading={<div style={{ padding: '2rem', background: 'white' }}>페이지 {index + 1} 로딩 중...</div>} />      <div className="pdf-toolbar bg-gray-50 border-b px-3 py-2 flex items-center gap-3">

                  <PageHighlightOverlay pageNumber={index + 1} referenceId={referenceId}        {/* 페이지 네비게이션 */}

                    annotations={annotations.filter(a => a.page_number === index + 1)}        <div className="flex items-center gap-1">

                    highlightMode={highlightMode} selectedColor={selectedColor} scale={scale}          <button

                    onHighlightAdded={handleAnnotationAdded} onHighlightDeleted={handleAnnotationDelete} />            onClick={goToPreviousPage}

                </div>            disabled={currentPage <= 1}

              ))}            className="px-2 py-1 bg-white border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"

            </Document>          >

          ) : (            ←

            <div style={{ padding: '2rem', color: '#6b7280' }}>PDF 파일이 없습니다.</div>          </button>

          )}          <span className="text-sm">

        </div>            <input

      </div>              type="number"

    </div>              value={currentPage}

  );              onChange={(e) => goToPage(parseInt(e.target.value) || 1)}

};              className="w-14 px-2 py-1 border rounded text-center"

              min={1}

export default PDFViewer;              max={numPages}

            />
            <span className="mx-1">/</span>
            <span>{numPages || "?"}</span>
          </span>
          <button
            onClick={goToNextPage}
            disabled={currentPage >= numPages}
            className="px-2 py-1 bg-white border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            →
          </button>
        </div>

        {/* 줌 컨트롤 */}
        <div className="flex items-center gap-2">
          <button
            onClick={zoomOut}
            className="px-2 py-1 bg-white border rounded hover:bg-gray-50 text-sm"
          >
            -
          </button>
          <span className="text-sm w-14 text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={zoomIn}
            className="px-2 py-1 bg-white border rounded hover:bg-gray-50 text-sm"
          >
            +
          </button>
          <button
            onClick={resetZoom}
            className="px-2 py-1 bg-white border rounded hover:bg-gray-50 text-xs"
          >
            맞춤
          </button>
          {/* 보기 모드 토글 */}
          <div className="flex items-center border rounded overflow-hidden text-xs">
            <button
              onClick={() => setViewMode("fit-width")}
              className={`px-2 py-1 ${
                viewMode === "fit-width"
                  ? "bg-gray-900 text-white"
                  : "bg-white hover:bg-gray-50"
              }`}
              title="너비 맞춤"
            >
              너비
            </button>
            <button
              onClick={() => setViewMode("fit-page")}
              className={`px-2 py-1 border-l ${
                viewMode === "fit-page"
                  ? "bg-gray-900 text-white"
                  : "bg-white hover:bg-gray-50"
              }`}
              title="페이지 맞춤"
            >
              페이지
            </button>
            <button
              onClick={() => setViewMode("actual")}
              className={`px-2 py-1 border-l ${
                viewMode === "actual"
                  ? "bg-gray-900 text-white"
                  : "bg-white hover:bg-gray-50"
              }`}
              title="실제 크기(100%)"
            >
              100%
            </button>
          </div>
        </div>

        {/* 하이라이트 툴바(컴팩트) / 업로드 */}
        <div className="flex-1" />
        {file ? (
          <div className="flex items-center gap-2">
            <PDFHighlight
              pdfType={pdfType}
              currentPage={currentPage}
              referenceId={referenceId || "temp"}
              pdfCacheId={pdfCacheId}
              highlightMode={highlightMode}
              setHighlightMode={setHighlightMode}
              selectedColor={selectedColor}
              setSelectedColor={setSelectedColor}
              compact
            />

            {/* 미리보기(새 탭) */}
            <button
              onClick={async () => {
                try {
                  const blob = await buildAnnotatedBlob();
                  const url = URL.createObjectURL(blob);
                  window.open(url, "_blank");
                  // 새 탭 이용 시 해제는 브라우저가 관리
                } catch (e) {
                  console.error(e);
                  alert("미리보기 생성에 실패했습니다.");
                }
              }}
              className="px-2 py-1 bg-white border rounded hover:bg-gray-50 text-sm"
              title="주석 포함 PDF를 새 탭에서 확인"
            >
              미리보기
            </button>
            {/* 로컬 저장(덮어쓰기 시도) */}
            <button
              onClick={async () => {
                try {
                  const blob = await buildAnnotatedBlob();
                  const defaultName =
                    file && typeof file === "object" && file.name
                      ? file.name.replace(/\.pdf$/i, " (annotated).pdf")
                      : "annotated.pdf";

                  if ("showSaveFilePicker" in window) {
                    // Chromium 계열: 파일 시스템 접근 API 사용
                    const handle = await window.showSaveFilePicker({
                      suggestedName: defaultName,
                      types: [
                        {
                          description: "PDF",
                          accept: { "application/pdf": [".pdf"] },
                        },
                      ],
                    });
                    const writable = await handle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                    alert("로컬 저장 완료");
                  } else {
                    // 미지원 브라우저: 다운로드로 대체
                    const { triggerDownload } = await import(
                      "@/utils/pdfExport"
                    );
                    await triggerDownload(blob, defaultName);
                  }
                } catch (e) {
                  console.error(e);
                  alert("로컬 저장에 실패했습니다.");
                }
              }}
              className="px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm"
              title="로컬 파일로 저장(브라우저 지원 시 같은 파일로 덮어쓰기 가능)"
            >
              로컬 저장
            </button>

            {/* Drive에 저장 */}
            <button
              onClick={async () => {
                try {
                  const [
                    {
                      initDriveAPI,
                      isDriveAPIAvailable,
                      updateDriveFile,
                      getDriveUrl,
                    },
                    { uploadPDFToDrive },
                  ] = await Promise.all([
                    import("@/api/driveClient"),
                    import("@/utils/pdfManager"),
                  ]);

                  if (!isDriveAPIAvailable()) {
                    alert(
                      "Google Drive API 설정이 필요합니다. .env.local의 VITE_GOOGLE_CLIENT_ID, VITE_GOOGLE_API_KEY를 확인하세요."
                    );
                    return;
                  }

                  const inited = await initDriveAPI();
                  if (!inited) {
                    alert("Google Drive API 초기화에 실패했습니다.");
                    return;
                  }

                  // 주석 포함 Blob 생성 (공통 함수 사용)
                  const blob = await buildAnnotatedBlob();

                  if (driveInfo.updatable && driveInfo.fileId) {
                    // 기존 파일 업데이트
                    await updateDriveFile(driveInfo.fileId, blob);
                    const url = getDriveUrl(driveInfo.fileId);
                    alert("Drive 업데이트 완료: " + url);
                  } else {
                    // 신규 업로드
                    let baseName = "annotated";
                    if (file && typeof file === "object" && file.name) {
                      baseName = file.name.replace(/\.pdf$/i, "");
                    }
                    const filename = `${baseName} (annotated).pdf`;
                    const { url } = await uploadPDFToDrive(
                      blob,
                      filename,
                      referenceId || "temp"
                    );
                    alert("Drive 업로드 완료: " + url);
                  }
                } catch (e) {
                  console.error(e);
                  alert("Drive 업로드에 실패했습니다.");
                }
              }}
              className="px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
              title={
                driveInfo.updatable
                  ? "Drive에 주석 포함 업데이트"
                  : "Drive에 주석 포함 저장"
              }
            >
              {driveInfo.updatable ? "Drive 업데이트" : "Drive 저장"}
            </button>
          </div>
        ) : (
          // 파일 미선택: 업로드 버튼 표시
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center">
              <input
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f && f.type === "application/pdf") {
                    onFilePicked && onFilePicked(f);
                  } else if (f) {
                    alert("PDF 파일을 선택해주세요.");
                  }
                  // 동일 파일 재업로드 대비 초기화
                  e.currentTarget.value = "";
                }}
              />
              <span className="px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm cursor-pointer select-none">
                업로드
              </span>
            </label>
          </div>
        )}
      </div>

      {/* PDF 렌더링 영역 - 스크롤 가능 */}
      <div
        ref={containerRef}
        className="pdf-content flex-1 overflow-auto bg-gray-200 p-2"
        onDragOver={(e) => {
          if (!file) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }
        }}
        onDrop={(e) => {
          if (!file) {
            e.preventDefault();
            const dt = e.dataTransfer;
            if (!dt) return;
            const pdfItem = Array.from(dt.files || []).find(
              (f) =>
                f.type === "application/pdf" ||
                f.name?.toLowerCase().endsWith(".pdf")
            );
            if (pdfItem) {
              onFilePicked && onFilePicked(pdfItem);
            }
          }
        }}
      >
        {/* 초미니 드롭존 힌트 (파일 미선택 시 1줄 안내) */}
        {!file && (
          <div className="flex items-center justify-center py-1">
            <div className="text-xs text-gray-600 border border-dashed border-gray-400 rounded px-2 py-1 bg-white/70">
              PDF를 여기로 끌어다 놓거나 '업로드'를 클릭하세요
            </div>
          </div>
        )}

        <div className="flex flex-col items-center gap-4">
          {file ? (
            <Document
              file={file}
              onLoadSuccess={handleDocumentLoadSuccess}
              onLoadError={handleDocumentLoadError}
              loading={
                <div className="flex items-center justify-center p-8">
                  <div className="text-gray-600">PDF 로딩 중...</div>
                </div>
              }
              error={
                <div className="flex items-center justify-center p-8">
                  <div className="text-red-600">PDF를 로드할 수 없습니다.</div>
                </div>
              }
            >
              {/* 모든 페이지 렌더링 */}
              {Array.from(new Array(numPages), (el, index) => (
                <div
                  key={`page_${index + 1}`}
                  ref={(el) => (pageRefs.current[index + 1] = el)}
                  className="mb-4 relative"
                >
                  <Page
                    pageNumber={index + 1}
                    scale={scale}
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                    className="shadow-lg"
                    onLoadSuccess={
                      index === 0
                        ? (page) => {
                            try {
                              const viewport = page.getViewport({ scale: 1 });
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
                    loading={
                      <div className="bg-white p-8 rounded shadow">
                        페이지 {index + 1} 로딩 중...
                      </div>
                    }
                  />
                  {/* 하이라이트 오버레이 */}
                  <PageHighlightOverlay
                    pageNumber={index + 1}
                    referenceId={referenceId}
                    pdfCacheId={pdfCacheId}
                    highlightMode={highlightMode}
                    selectedColor={selectedColor}
                    scale={scale}
                    onHighlightAdded={(highlight) => {
                      // 세션 하이라이트 누적 (임시 업로드 저장용)
                      setSessionHighlights((prev) => {
                        // 간단 병합: 동일 id가 있으면 교체
                        if (highlight?.id) {
                          const idx = prev.findIndex(
                            (h) => h.id === highlight.id
                          );
                          if (idx !== -1) {
                            const next = prev.slice();
                            next[idx] = highlight;
                            return next;
                          }
                        }
                        return [...prev, highlight];
                      });
                    }}
                  />
                  {/* 페이지 번호 표시 제거로 공간 절약 */}
                </div>
              ))}
            </Document>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default PDFViewer;
