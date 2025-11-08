import { useState, useEffect, useRef, useCallback } from "react";
import { initDB } from "@/db/localDB";

// 색상 팔레트 (모듈 상수)
const COLORS = [
  { name: "노란색", value: "#FFFF00", opacity: 0.4 },
  { name: "초록색", value: "#00FF00", opacity: 0.3 },
  { name: "파란색", value: "#00BFFF", opacity: 0.3 },
  { name: "분홍색", value: "#FF69B4", opacity: 0.3 },
  { name: "주황색", value: "#FFA500", opacity: 0.4 },
];

/**
 * 개별 페이지의 하이라이트 오버레이
 */
const PageHighlightOverlay = ({
  pageNumber,
  referenceId,
  pdfCacheId,
  highlightMode,
  selectedColor,
  onHighlightAdded,
  onHighlightDeleted,
  scale,
  refreshKey,
  basePageWidth,
  basePageHeight,
}) => {
  const [highlights, setHighlights] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState(null);
  const [drawRect, setDrawRect] = useState(null);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  // 오버레이 캔버스를 PDF 페이지 크기에 맞춰 즉시 동기화
  const ensureOverlaySize = useCallback(() => {
    const pageEl = getPdfPageElement();
    const overlayCanvas = canvasRef.current;
    if (!pageEl || !overlayCanvas) return false;
    const rect = pageEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    // CSS 사이즈 동기화
    overlayCanvas.style.width = `${rect.width}px`;
    overlayCanvas.style.height = `${rect.height}px`;
    // 실제 캔버스 해상도(DPR 반영)
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (overlayCanvas.width !== w || overlayCanvas.height !== h) {
      overlayCanvas.width = w;
      overlayCanvas.height = h;
      setCanvasSize({ width: w, height: h });
    }
    return w > 1 && h > 1;
  }, []);

  // 현재 페이지의 PDF 렌더 요소 찾기 (canvas 또는 svg)
  const getPdfPageElement = () => {
    const container = containerRef.current;
    if (!container) return null;
    const parent = container.parentElement; // div.mb-4.relative
    if (!parent) return null;
    return (
      parent.querySelector(".react-pdf__Page__canvas") ||
      parent.querySelector(".react-pdf__Page__svg") ||
      null
    );
  };

  // 하이라이트 로드
  useEffect(() => {
    (async () => {
      try {
        // temp 모드(로컬 업로드)에서는 DB 로드 생략 (메모리 상태만 사용)
        if (referenceId === "temp" && !pdfCacheId) {
          return;
        }

        const db = await initDB();
        const tx = db.transaction("highlights", "readonly");
        const store = tx.objectStore("highlights");

        let allHighlights = [];
        if (referenceId && referenceId !== "temp") {
          const index = store.index("reference_id");
          allHighlights = await index.getAll(referenceId);
        } else if (pdfCacheId) {
          const index = store.index("pdf_cache_id");
          allHighlights = await index.getAll(pdfCacheId);
        }

        const pageHighlights =
          allHighlights?.filter((h) => h.page === pageNumber) || [];
        // 페이지 내 중복 제거(시그니처 기준)
        const makeSig = (h) => {
          const type = h.type || (Array.isArray(h.rects) ? "text" : "area");
          const color = h.color || "";
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
            return `${pageNumber}|${type}|${color}|${rectSig}|${text}`;
          }
          if (h.area) {
            const r = h.area;
            const rectSig = [r.x, r.y, r.width, r.height]
              .map((v) => Math.round(Number(v) || 0))
              .join(":");
            return `${pageNumber}|area|${color}|${rectSig}`;
          }
          return `${pageNumber}|${type}|${color}`;
        };
        const seen = new Set();
        const deduped = [];
        for (const h of pageHighlights) {
          const sig = makeSig(h);
          if (seen.has(sig)) continue;
          seen.add(sig);
          deduped.push(h);
        }

        // 기존 메모리 상태와 머지 (DB에 아직 없는 새 항목 유지)
        setHighlights((prev) => {
          const merged = [...deduped];
          const dedupedIds = new Set(deduped.map((h) => h.id));
          // DB에 없는 메모리 항목 추가 (방금 생성된 항목 등)
          prev.forEach((h) => {
            if (!dedupedIds.has(h.id)) {
              const sig = makeSig(h);
              if (!seen.has(sig)) {
                seen.add(sig);
                merged.push(h);
              }
            }
          });
          return merged;
        });
      } catch (error) {
        console.error("하이라이트 로드 실패:", error);
      }
    })();
  }, [referenceId, pdfCacheId, pageNumber, refreshKey]);

  // Canvas 크기 조정 (PDF 페이지 요소 기준으로 동기화)
  useEffect(() => {
    const updateCanvasSize = () => {
      ensureOverlaySize();
    };

    // 초기 및 렌더링 안정화 후 재측정
    updateCanvasSize();
    const t = setTimeout(updateCanvasSize, 150);

    // 창 리사이즈 시 반영
    window.addEventListener("resize", updateCanvasSize);

    // PDF 페이지 캔버스의 크기 변화도 감지 (줌 등)
    const pdfCanvas = getPdfPageElement();
    let ro;
    if (pdfCanvas && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => updateCanvasSize());
      ro.observe(pdfCanvas);
    }

    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", updateCanvasSize);
      if (ro) ro.disconnect();
    };
  }, [pageNumber, scale]);

  // 좌표에 포함되는 하이라이트 찾기 (상단 우선)
  const hitTestHighlightAt = useCallback(
    (x, y) => {
      // 현재 캔버스/페이지 크기
      const pageEl = getPdfPageElement();
      const overlay = canvasRef.current;
      const currentLogicalW =
        pageEl?.getBoundingClientRect().width || overlay?.width || 1;
      const currentLogicalH =
        pageEl?.getBoundingClientRect().height || overlay?.height || 1;
      const canvasW = overlay?.width || currentLogicalW;
      const canvasH = overlay?.height || currentLogicalH;

      // 뒤에서부터 탐색하여 화면상 위에 그려진 것을 우선
      for (let i = highlights.length - 1; i >= 0; i--) {
        const h = highlights[i];
        let baseW = h.base_size?.width || currentLogicalW;
        let baseH = h.base_size?.height || currentLogicalH;
        // 레거시(캔버스 픽셀로 저장) 감지 후 보정
        const sampleRect =
          h.type === "area" && h.area ? h.area : h.rects && h.rects[0];
        if (sampleRect && baseW > 0 && baseH > 0) {
          const ratioX = sampleRect.width / baseW;
          const ratioY = sampleRect.height / baseH;
          if (ratioX > 1.2 || ratioY > 1.2) {
            // 임의 임계값
            baseW = canvasW;
            baseH = canvasH;
          }
        }
        const scaleX = canvasW / baseW;
        const scaleY = canvasH / baseH;

        if (h.type === "area" && h.area) {
          const r = h.area;
          const rx = r.x * scaleX;
          const ry = r.y * scaleY;
          const rw = r.width * scaleX;
          const rh = r.height * scaleY;
          if (x >= rx && x <= rx + rw && y >= ry && y <= ry + rh) {
            return h;
          }
        } else if (h.type === "text" && Array.isArray(h.rects)) {
          for (const r of h.rects) {
            const rx = r.x * scaleX;
            const ry = r.y * scaleY;
            const rw = r.width * scaleX;
            const rh = r.height * scaleY;
            if (x >= rx && x <= rx + rw && y >= ry && y <= ry + rh) {
              return h;
            }
          }
        }
      }
      return null;
    },
    [highlights]
  );

  // 우클릭으로 삭제 메뉴 동작
  const handleContextMenu = useCallback(
    async (e) => {
      if (!canvasRef.current) return;
      e.preventDefault();
      const rect = canvasRef.current.getBoundingClientRect();
      const cssX = e.clientX - rect.left;
      const cssY = e.clientY - rect.top;
      const scaleX = canvasRef.current.width / (rect.width || 1);
      const scaleY = canvasRef.current.height / (rect.height || 1);
      const x = cssX * scaleX;
      const y = cssY * scaleY;

      const target = hitTestHighlightAt(x, y);
      if (!target) return;

      const ok = window.confirm("이 하이라이트를 삭제할까요?");
      if (!ok) return;

      try {
        // 로컬 삭제 (DB 또는 메모리)
        const canPersist =
          (referenceId && referenceId !== "temp") || !!pdfCacheId;
        if (canPersist) {
          const db = await initDB();
          await db.delete("highlights", target.id);
        }
        setHighlights((prev) => prev.filter((h) => h.id !== target.id));

        // 상위 콜백 알림
        if (onHighlightDeleted) onHighlightDeleted(target);
      } catch (err) {
        console.error("하이라이트 삭제 실패:", err);
        alert("삭제에 실패했습니다.");
      }
    },
    [referenceId, pdfCacheId, hitTestHighlightAt, onHighlightDeleted]
  );

  const saveHighlight = useCallback(
    async (highlightData) => {
      try {
        // 저장 전 중복 확인(현재 페이지 highlights 기준)
        const makeSigForData = (data) => {
          const type =
            data.type || (Array.isArray(data.rects) ? "text" : "area");
          const color = data.color || "";
          if (type === "text" && Array.isArray(data.rects)) {
            const rectSig = data.rects
              .map((r) =>
                [r.x, r.y, r.width, r.height]
                  .map((v) => Math.round(Number(v) || 0))
                  .join(":")
              )
              .sort()
              .join("|");
            const text = (data.text || "").trim();
            return `${pageNumber}|${type}|${color}|${rectSig}|${text}`;
          }
          if (data.area) {
            const r = data.area;
            const rectSig = [r.x, r.y, r.width, r.height]
              .map((v) => Math.round(Number(v) || 0))
              .join(":");
            return `${pageNumber}|area|${color}|${rectSig}`;
          }
          return `${pageNumber}|${type}|${color}`;
        };
        const newSig = makeSigForData(highlightData);
        const exists = highlights.some((h) => {
          // 기존 하이라이트에 대한 시그니처 계산
          const type = h.type || (Array.isArray(h.rects) ? "text" : "area");
          const color = h.color || "";
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
            return (
              newSig === `${pageNumber}|${type}|${color}|${rectSig}|${text}`
            );
          }
          if (h.area) {
            const r = h.area;
            const rectSig = [r.x, r.y, r.width, r.height]
              .map((v) => Math.round(Number(v) || 0))
              .join(":");
            return newSig === `${pageNumber}|area|${color}|${rectSig}`;
          }
          return newSig === `${pageNumber}|${type}|${color}`;
        });
        if (exists) {
          // 동일 항목이 이미 있으면 저장 생략
          return;
        }

        const id = `highlight-${Date.now()}-${Math.random()
          .toString(36)
          .substr(2, 9)}`;

        // base_size는 PDF 페이지의 논리 크기(DPR 무시한 CSS px 기준)로 저장
        // 안정화: 저장 기준은 최초 로드된 basePageWidth/Height(실제 PDF viewport scale=1) 혹은 현재 페이지 CSS 크기
        const pageEl = getPdfPageElement();
        const currentCss = pageEl
          ? pageEl.getBoundingClientRect()
          : { width: canvasSize.width, height: canvasSize.height };
        const logicalSize = {
          width: basePageWidth || currentCss.width,
          height: basePageHeight || currentCss.height,
        };

        // fraction 좌표(0..1) 추가 저장 -> 렌더 시 재계산 안정화
        const toFractionRects = (rects, base) =>
          (rects || []).map((r) => ({
            fx: (r.x || 0) / (base.width || 1),
            fy: (r.y || 0) / (base.height || 1),
            fw: (r.width || 0) / (base.width || 1),
            fh: (r.height || 0) / (base.height || 1),
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
          }));
        const toFractionArea = (area, base) =>
          area
            ? {
                fx: (area.x || 0) / (base.width || 1),
                fy: (area.y || 0) / (base.height || 1),
                fw: (area.width || 0) / (base.width || 1),
                fh: (area.height || 0) / (base.height || 1),
                x: area.x,
                y: area.y,
                width: area.width,
                height: area.height,
              }
            : null;

        const highlight = {
          id,
          reference_id: referenceId,
          pdf_cache_id: pdfCacheId,
          page: pageNumber,
          ...highlightData,
          base_size: logicalSize,
          // fraction 좌표 보조 필드
          rects:
            highlightData.type === "text"
              ? toFractionRects(highlightData.rects, logicalSize)
              : highlightData.rects,
          area:
            highlightData.type === "area"
              ? toFractionArea(highlightData.area, logicalSize)
              : highlightData.area,
          created_at: Date.now(),
          synced: false,
        };

        const canPersist =
          (referenceId && referenceId !== "temp") || !!pdfCacheId;
        if (canPersist) {
          const db = await initDB();
          await db.add("highlights", highlight);
          // 최신 하이라이트를 즉시 상태에 반영 (DB 반영 대기 없이)
          setHighlights((prev) => [...prev, highlight]);
        } else {
          // 임시 보기(업로드 등)에서는 메모리 상태로만 관리
          setHighlights((prev) => [...prev, highlight]);
        }

        if (onHighlightAdded) {
          onHighlightAdded(highlight);
        }
      } catch (error) {
        console.error("하이라이트 저장 실패:", error);
      }
    },
    [
      referenceId,
      pdfCacheId,
      pageNumber,
      onHighlightAdded,
      canvasSize.width,
      canvasSize.height,
    ]
  );

  // 텍스트 하이라이팅 (멀티라인 대응)
  const handleTextHighlight = useCallback(() => {
    if (highlightMode !== "text") return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const text = selection.toString().trim();

    if (!text) return;

    const pageEl = getPdfPageElement();
    if (!pageEl) return;

    const pageRect = pageEl.getBoundingClientRect();
    const clientRects = Array.from(range.getClientRects());
    // 이 페이지와 실제로 겹치는 텍스트 사각형만 채택 (중앙점 기준)
    const rectsOnPageCss = clientRects
      .filter((r) => {
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        return (
          cx >= pageRect.left &&
          cx <= pageRect.right &&
          cy >= pageRect.top &&
          cy <= pageRect.bottom
        );
      })
      .map((r) => ({
        x: r.x - pageRect.x,
        y: r.y - pageRect.y,
        width: r.width,
        height: r.height,
      }))
      .filter((r) => r.width > 0 && r.height > 0);

    if (rectsOnPageCss.length === 0) return;

    // CSS 직사각형을 base 좌표계(가능하면 PDF viewport 기준)로 변환하여 저장
    const baseW = basePageWidth || pageRect.width || 1;
    const baseH = basePageHeight || pageRect.height || 1;
    const factorX = baseW / (pageRect.width || 1);
    const factorY = baseH / (pageRect.height || 1);
    const rectsInBase = rectsOnPageCss.map((r) => ({
      x: r.x * factorX,
      y: r.y * factorY,
      width: r.width * factorX,
      height: r.height * factorY,
    }));

    saveHighlight({
      type: "text",
      text,
      // 저장은 base 좌표계(가능하면 PDF viewport 기준)
      rects: rectsInBase,
      color: selectedColor,
      note: "",
    });

    // 약간의 딜레이 후 선택 해제 (사용자가 하이라이트를 볼 수 있도록)
    setTimeout(() => {
      selection.removeAllRanges();
    }, 80);
  }, [highlightMode, selectedColor, saveHighlight, ensureOverlaySize]);

  // 텍스트 모드: 전역 mouseup에서 처리하여 텍스트 선택 방해 없도록
  useEffect(() => {
    if (highlightMode !== "text") return;
    const onUp = () => handleTextHighlight();
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [highlightMode, handleTextHighlight]);

  // 영역 하이라이팅
  const handleMouseDown = (e) => {
    if (highlightMode !== "area") return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // 오버레이 크기가 반영되지 않았으면 즉시 동기화
    if ((canvas.width || 0) < 2 || (canvas.height || 0) < 2) {
      ensureOverlaySize();
    }

    const rect = canvas.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    const scaleX = canvas.width / (rect.width || 1);
    const scaleY = canvas.height / (rect.height || 1);
    const x = cssX * scaleX;
    const y = cssY * scaleY;

    setIsDrawing(true);
    setDrawStart({ x, y });
    setDrawRect(null);
  };

  const handleMouseMove = (e) => {
    if (!isDrawing || highlightMode !== "area") return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    const scaleX = canvas.width / (rect.width || 1);
    const scaleY = canvas.height / (rect.height || 1);
    const x = cssX * scaleX;
    const y = cssY * scaleY;

    setDrawRect({
      x: Math.min(drawStart.x, x),
      y: Math.min(drawStart.y, y),
      width: Math.abs(x - drawStart.x),
      height: Math.abs(y - drawStart.y),
    });
  };

  const handleMouseUp = () => {
    if (!isDrawing || highlightMode !== "area") return;

    if (drawRect && drawRect.width > 10 && drawRect.height > 10) {
      // canvas px -> 논리 CSS px로 변환 후 저장
      const pageEl = getPdfPageElement();
      const pageRect = pageEl?.getBoundingClientRect();
      const cssW = pageRect?.width || 1;
      const cssH = pageRect?.height || 1;
      const baseW = basePageWidth || cssW;
      const baseH = basePageHeight || cssH;
      const factorX = baseW / cssW;
      const factorY = baseH / cssH;
      const areaCss = {
        x: (drawRect.x / (canvasRef.current?.width || 1)) * cssW * factorX,
        y: (drawRect.y / (canvasRef.current?.height || 1)) * cssH * factorY,
        width:
          (drawRect.width / (canvasRef.current?.width || 1)) * cssW * factorX,
        height:
          (drawRect.height / (canvasRef.current?.height || 1)) * cssH * factorY,
      };
      saveHighlight({
        type: "area",
        area: areaCss,
        color: selectedColor,
        note: "",
      });
    }

    setIsDrawing(false);
    setDrawStart(null);
    setDrawRect(null);
  };

  // ESC로 현재 선택/드로잉 취소
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      // 영역 드로잉 취소
      if (isDrawing) {
        setIsDrawing(false);
        setDrawStart(null);
        setDrawRect(null);
      }
      // 텍스트 선택 취소
      if (highlightMode === "text") {
        const sel = window.getSelection?.();
        try {
          sel && sel.removeAllRanges && sel.removeAllRanges();
        } catch {}
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDrawing, highlightMode]);

  // 우클릭 전역 처리: 텍스트/비활성 모드에서도 하이라이트 위에서 삭제 가능
  useEffect(() => {
    const onGlobalContextMenu = async (e) => {
      try {
        const pageEl = getPdfPageElement();
        const overlay = canvasRef.current;
        if (!pageEl || !overlay) return;

        const rect = pageEl.getBoundingClientRect();
        const { clientX, clientY } = e;
        if (
          clientX < rect.left ||
          clientX > rect.right ||
          clientY < rect.top ||
          clientY > rect.bottom
        ) {
          return; // 다른 영역 우클릭은 무시
        }

        // 페이지 내부 좌표로 변환 후 히트 테스트
        const cssX = clientX - rect.left;
        const cssY = clientY - rect.top;
        const scaleX = overlay.width / (rect.width || 1);
        const scaleY = overlay.height / (rect.height || 1);
        const x = cssX * scaleX;
        const y = cssY * scaleY;
        const target = hitTestHighlightAt(x, y);
        if (!target) return;

        // 브라우저 컨텍스트 메뉴 차단 및 삭제 확인
        e.preventDefault();
        const ok = window.confirm("이 하이라이트를 삭제할까요?");
        if (!ok) return;

        const canPersist =
          (referenceId && referenceId !== "temp") || !!pdfCacheId;
        if (canPersist) {
          const db = await initDB();
          await db.delete("highlights", target.id);
        }
        setHighlights((prev) => prev.filter((h) => h.id !== target.id));
        onHighlightDeleted && onHighlightDeleted(target);
      } catch (err) {
        console.error("글로벌 컨텍스트 삭제 실패:", err);
      }
    };

    window.addEventListener("contextmenu", onGlobalContextMenu);
    return () => window.removeEventListener("contextmenu", onGlobalContextMenu);
  }, [hitTestHighlightAt, referenceId, pdfCacheId, onHighlightDeleted]);

  // Canvas에 하이라이트 그리기
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 캔버스 크기 확인 및 동기화
    if (canvas.width < 2 || canvas.height < 2) {
      ensureOverlaySize();
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 현재 페이지의 논리 크기(CSS px)
    const pageEl = getPdfPageElement();
    const currentLogicalW =
      pageEl?.getBoundingClientRect().width || canvas.width;
    const currentLogicalH =
      pageEl?.getBoundingClientRect().height || canvas.height;

    highlights.forEach((highlight) => {
      const colorObj = COLORS.find((c) => c.value === highlight.color);
      const opacity = colorObj?.opacity || 0.3;

      // 좌표 스케일 보정: base_size 대비 현재 크기 비율
      let baseW =
        highlight.base_size?.width || basePageWidth || currentLogicalW;
      let baseH =
        highlight.base_size?.height || basePageHeight || currentLogicalH;
      const sampleRect =
        highlight.type === "area" && highlight.area
          ? highlight.area
          : highlight.rects && highlight.rects[0];
      if (sampleRect && baseW > 0 && baseH > 0) {
        const ratioX = sampleRect.width / baseW;
        const ratioY = sampleRect.height / baseH;
        if (ratioX > 1.2 || ratioY > 1.2) {
          // 레거시 데이터: base를 캔버스 크기로 재설정해 왜곡 줄이기
          baseW = canvas.width;
          baseH = canvas.height;
        }
      }
      // base 좌표(논리 CSS px)를 캔버스 픽셀로 변환: (canvas.width / currentLogicalW) * (baseLogical / baseW)
      // base_size는 논리 CSS px로 저장되므로 currentLogicalW/baseW ≈ 1, 다만 최초 저장 당시 페이지 크기와 현재가 달라졌을 경우 보정
      const scaleToCanvasX = canvas.width / currentLogicalW;
      const scaleToCanvasY = canvas.height / currentLogicalH;
      const rescaleX = currentLogicalW / baseW;
      const rescaleY = currentLogicalH / baseH;
      const scaleX = scaleToCanvasX * rescaleX;
      const scaleY = scaleToCanvasY * rescaleY;

      if (highlight.type === "area" && highlight.area) {
        const src = highlight.area;
        const hasFraction = src.fx !== undefined;
        const baseRefW = baseW || 1;
        const baseRefH = baseH || 1;
        const drawX = hasFraction ? src.fx * baseRefW : src.x;
        const drawY = hasFraction ? src.fy * baseRefH : src.y;
        const drawW = hasFraction ? src.fw * baseRefW : src.width;
        const drawH = hasFraction ? src.fh * baseRefH : src.height;
        ctx.fillStyle = highlight.color;
        ctx.globalAlpha = opacity;
        ctx.fillRect(
          drawX * scaleX,
          drawY * scaleY,
          drawW * scaleX,
          drawH * scaleY
        );
        ctx.globalAlpha = 1.0;
      } else if (highlight.type === "text" && highlight.rects) {
        ctx.fillStyle = highlight.color;
        ctx.globalAlpha = opacity;
        highlight.rects.forEach((rect) => {
          const hasFraction = rect.fx !== undefined;
          const baseRefW = baseW || 1;
          const baseRefH = baseH || 1;
          const drawX = hasFraction ? rect.fx * baseRefW : rect.x;
          const drawY = hasFraction ? rect.fy * baseRefH : rect.y;
          const drawW = hasFraction ? rect.fw * baseRefW : rect.width;
          const drawH = hasFraction ? rect.fh * baseRefH : rect.height;
          ctx.fillRect(
            drawX * scaleX,
            drawY * scaleY,
            drawW * scaleX,
            drawH * scaleY
          );
        });
        ctx.globalAlpha = 1.0;
      }
    });

    if (drawRect) {
      const colorObj = COLORS.find((c) => c.value === selectedColor);
      ctx.fillStyle = selectedColor;
      ctx.globalAlpha = colorObj?.opacity || 0.3;
      ctx.fillRect(drawRect.x, drawRect.y, drawRect.width, drawRect.height);
      ctx.globalAlpha = 1.0;

      ctx.strokeStyle = selectedColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(drawRect.x, drawRect.y, drawRect.width, drawRect.height);
    }
  }, [
    highlights,
    drawRect,
    selectedColor,
    canvasSize,
    pageNumber,
    ensureOverlaySize,
  ]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        pointerEvents: highlightMode === "area" ? "auto" : "none",
        zIndex: 10,
      }}
    >
      <canvas
        ref={canvasRef}
        onContextMenu={handleContextMenu}
        onMouseDown={highlightMode === "area" ? handleMouseDown : undefined}
        onMouseMove={highlightMode === "area" ? handleMouseMove : undefined}
        onMouseUp={highlightMode === "area" ? handleMouseUp : undefined}
        onMouseLeave={() => {
          if (isDrawing) handleMouseUp();
        }}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: highlightMode === "area" ? "auto" : "none",
          cursor: highlightMode === "area" ? "crosshair" : "default",
        }}
      />
    </div>
  );
};

export default PageHighlightOverlay;
