import { useState, useEffect } from "react";
import { initDB } from "@/db/localDB";

/**
 * PDF 하이라이팅 툴바 컴포넌트
 * - 하이라이트 모드 및 색상 선택
 */
const PDFHighlight = ({
  pdfType,
  currentPage,
  referenceId,
  pdfCacheId,
  highlightMode,
  setHighlightMode,
  selectedColor,
  setSelectedColor,
  compact,
}) => {
  const [highlightCount, setHighlightCount] = useState(0);

  // 색상 옵션
  const COLORS = [
    { name: "노란색", value: "#FFFF00", opacity: 0.4 },
    { name: "초록색", value: "#00FF00", opacity: 0.3 },
    { name: "파란색", value: "#00BFFF", opacity: 0.3 },
    { name: "분홍색", value: "#FF69B4", opacity: 0.3 },
    { name: "주황색", value: "#FFA500", opacity: 0.4 },
  ];

  // 하이라이트 개수 로드
  useEffect(() => {
    loadHighlightCount();
  }, [referenceId, pdfCacheId, currentPage]);

  // PDF 타입에 따라 자동으로 모드 설정
  useEffect(() => {
    if (pdfType === "text" && !highlightMode) {
      setHighlightMode("text");
    } else if (pdfType === "image" && !highlightMode) {
      setHighlightMode("area");
    }
  }, [pdfType, highlightMode, setHighlightMode]);

  const loadHighlightCount = async () => {
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

      // 현재 페이지의 하이라이트만 카운트
      const pageHighlights =
        allHighlights?.filter((h) => h.page === currentPage) || [];
      setHighlightCount(pageHighlights.length);
    } catch (error) {
      console.error("하이라이트 로드 실패:", error);
    }
  };

  if (compact) {
    return (
      <div className="hl-toolbar">
        {/* 모드 */}
        <div className="hl-group">
          <button
            onClick={() => setHighlightMode(null)}
            className={`hl-btn ${highlightMode === null ? "active" : ""}`}
            title="하이라이트 비활성"
          >
            OFF
          </button>
          <button
            onClick={() => setHighlightMode("text")}
            disabled={pdfType === "image"}
            className={`hl-btn ${highlightMode === "text" ? "active" : ""}`}
            title="텍스트 하이라이트"
          >
            📝
          </button>
          <button
            onClick={() => setHighlightMode("area")}
            className={`hl-btn ${highlightMode === "area" ? "active" : ""}`}
            title="영역 하이라이트"
          >
            🖼️
          </button>
        </div>

        {/* 색상 팔레트 (선택 시만 표시) */}
        {highlightMode && (
          <div className="hl-group">
            {COLORS.map((color) => (
              <span
                key={color.value}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedColor(color.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setSelectedColor(color.value);
                  }
                }}
                className={`hl-color ${
                  selectedColor === color.value ? "selected" : ""
                }`}
                style={{ backgroundColor: color.value }}
                title={color.name}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // 기본(비컴팩트)
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-gray-700">하이라이트:</span>
        <div className="flex gap-2">
          <button
            onClick={() => setHighlightMode(null)}
            className={`px-3 py-1 text-sm rounded ${
              highlightMode === null
                ? "bg-gray-800 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            비활성
          </button>
          <button
            onClick={() => setHighlightMode("text")}
            disabled={pdfType === "image"}
            className={`px-3 py-1 text-sm rounded ${
              highlightMode === "text"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            📝 텍스트
          </button>
          <button
            onClick={() => setHighlightMode("area")}
            className={`px-3 py-1 text-sm rounded ${
              highlightMode === "area"
                ? "bg-green-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            🖼️ 영역
          </button>
        </div>
        <div className="ml-auto text-sm text-gray-600">
          현재 페이지: {highlightCount}개 하이라이트
        </div>
      </div>

      {highlightMode && (
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-gray-700">색상:</span>
          <div className="flex gap-2">
            {COLORS.map((color) => (
              <button
                key={color.value}
                onClick={() => setSelectedColor(color.value)}
                className={`w-8 h-8 rounded border-2 ${
                  selectedColor === color.value
                    ? "border-gray-800 scale-110"
                    : "border-gray-300"
                } transition-transform`}
                style={{ backgroundColor: color.value }}
                title={color.name}
              />
            ))}
          </div>
        </div>
      )}

      {highlightMode && (
        <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
          {highlightMode === "text" && "💡 텍스트를 선택하면 하이라이트됩니다"}
          {highlightMode === "area" &&
            "💡 마우스를 드래그하여 영역을 선택하세요"}
        </div>
      )}
    </div>
  );
};

export default PDFHighlight;
