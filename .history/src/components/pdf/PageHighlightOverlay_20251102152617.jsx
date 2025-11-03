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
}) => {
  const [highlights, setHighlights] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState(null);
  const [drawRect, setDrawRect] = useState(null);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

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
        setHighlights(deduped);
      } catch (error) {
        console.error("하이라이트 로드 실패:", error);
      }
    })();
  }, [referenceId, pdfCacheId, pageNumber, refreshKey]);

  // Canvas 크기 조정 (PDF 페이지 요소 기준으로 동기화)
  useEffect(() => {
    const updateCanvasSize = () => {
      const pageEl = getPdfPageElement();
      const overlayCanvas = canvasRef.current;
      if (pageEl && overlayCanvas) {
        const rect = pageEl.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        overlayCanvas.style.width = `${rect.width}px`;
        overlayCanvas.style.height = `${rect.height}px`;
        overlayCanvas.width = Math.max(1, Math.floor(rect.width * dpr));
        overlayCanvas.height = Math.max(1, Math.floor(rect.height * dpr));
        setCanvasSize({
          width: overlayCanvas.width,
          height: overlayCanvas.height,
        });
      }
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
      // 뒤에서부터 탐색하여 화면상 위에 그려진 것을 우선
      for (let i = highlights.length - 1; i >= 0; i--) {
        const h = highlights[i];
        if (h.type === "area" && h.area) {
          const r = h.area;
          if (
            x >= r.x &&
            x <= r.x + r.width &&
            y >= r.y &&
            y <= r.y + r.height
          ) {
            return h;
          }
        } else if (h.type === "text" && Array.isArray(h.rects)) {
          for (const r of h.rects) {
            if (
              x >= r.x &&
              x <= r.x + r.width &&
              y >= r.y &&
              y <= r.y + r.height
            ) {
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

        const highlight = {
          id,
          reference_id: referenceId,
          pdf_cache_id: pdfCacheId,
          page: pageNumber,
          ...highlightData,
          base_size: { width: canvasSize.width, height: canvasSize.height },
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
    const rectsOnPageCss = clientRects
      .map((r) => ({
        x: r.x - pageRect.x,
        y: r.y - pageRect.y,
        width: r.width,
        height: r.height,
      }))
      .filter((r) => r.width > 0 && r.height > 0);

    if (rectsOnPageCss.length === 0) return;

    // CSS px -> 캔버스 좌표 변환
    const overlay = canvasRef.current;
    if (!overlay) return;
    const scaleX = overlay.width / (pageRect.width || 1);
    const scaleY = overlay.height / (pageRect.height || 1);
    const rectsCanvas = rectsOnPageCss.map((r) => ({
      x: r.x * scaleX,
      y: r.y * scaleY,
      width: r.width * scaleX,
      height: r.height * scaleY,
    }));

    saveHighlight({
      type: "text",
      text,
      rects: rectsCanvas,
      color: selectedColor,
      note: "",
    });

    // 약간의 딜레이 후 선택 해제 (사용자가 하이라이트를 볼 수 있도록)
    setTimeout(() => {
      selection.removeAllRanges();
    }, 80);
  }, [highlightMode, selectedColor, saveHighlight]);

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
      saveHighlight({
        type: "area",
        area: drawRect,
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
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    highlights.forEach((highlight) => {
      const colorObj = COLORS.find((c) => c.value === highlight.color);
      const opacity = colorObj?.opacity || 0.3;

      if (highlight.type === "area" && highlight.area) {
        ctx.fillStyle = highlight.color;
        ctx.globalAlpha = opacity;
        ctx.fillRect(
          highlight.area.x,
          highlight.area.y,
          highlight.area.width,
          highlight.area.height
        );
        ctx.globalAlpha = 1.0;
      } else if (highlight.type === "text" && highlight.rects) {
        ctx.fillStyle = highlight.color;
        ctx.globalAlpha = opacity;
        highlight.rects.forEach((rect) => {
          ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
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
  }, [highlights, drawRect, selectedColor, canvasSize]);

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
