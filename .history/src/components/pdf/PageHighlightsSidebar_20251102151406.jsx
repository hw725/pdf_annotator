/* eslint-disable react/prop-types */
import React, { useEffect, useMemo, useState } from "react";

export default function PageHighlightsSidebar({
  highlights = [],
  currentPage = 1,
  onJumpToPage,
  onJumpToHighlight,
}) {
  const [expanded, setExpanded] = useState(null); // page number
  const MAX_ITEMS_PER_PAGE = 30;

  const byPage = useMemo(() => {
    const map = new Map();
    const seen = new Set(); // dedupe by id+page
    (highlights || []).forEach((h) => {
      const p = h.page || h.page_number || 1;
      const key = `${p}::${h.id ?? h.remote_id ?? Math.random()}`;
      if (seen.has(key)) return; // prevent duplicates across pages/lists
      seen.add(key);
      if (!map.has(p)) map.set(p, []);
      map.get(p).push(h);
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([page, list]) => ({ page, list }));
  }, [highlights]);

  // 현재 페이지 바뀌거나 하이라이트 구성이 바뀐 경우, 적절히 확장 상태 보정
  useEffect(() => {
    const pages = new Set(byPage.map((g) => g.page));
    if (expanded == null || !pages.has(expanded)) {
      setExpanded(currentPage);
    }
  }, [currentPage, byPage]);

  return (
    <div
      style={{
        width: 240,
        borderRight: "1px solid #e5e7eb",
        background: "#fafafa",
        overflow: "auto",
      }}
    >
      <div style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
        <div style={{ fontWeight: 600, color: "#374151" }}>하이라이트</div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          총 {highlights?.length || 0}개
        </div>
      </div>
      <div>
        {byPage.map(({ page, list }) => {
          const isExp = expanded === page;
          const isActive = page === currentPage;
          return (
            <div key={page}>
              <button
                onClick={() => {
                  setExpanded((prev) => (prev === page ? null : page));
                  if (onJumpToPage) onJumpToPage(page);
                }}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  width: "100%",
                  padding: "8px 12px",
                  background: isActive ? "#eef2ff" : "transparent",
                  border: "none",
                  borderBottom: "1px solid #f3f4f6",
                  cursor: "pointer",
                  color: "#374151",
                }}
                title="페이지로 이동"
              >
                <span>페이지 {page}</span>
                <span style={{ color: "#6b7280", fontSize: 12 }}>
                  {list.length}개
                </span>
              </button>
              {isExp && (
                <div
                  style={{ padding: "4px 8px 8px 16px", background: "#fff" }}
                >
                  {list.slice(0, MAX_ITEMS_PER_PAGE).map((h) => (
                    <button
                      key={h.id}
                      onClick={() => onJumpToHighlight && onJumpToHighlight(h)}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        background: "transparent",
                        border: "none",
                        fontSize: 12,
                        color: "#4b5563",
                        padding: "6px 0",
                        borderBottom: "1px dashed #f3f4f6",
                        cursor: "pointer",
                      }}
                      title={h.text || "영역 하이라이트"}
                    >
                      {h.type === "text"
                        ? (h.text || "텍스트 하이라이트").slice(0, 120)
                        : "영역 하이라이트"}
                    </button>
                  ))}
                  {list.length > MAX_ITEMS_PER_PAGE && (
                    <div style={{ fontSize: 12, color: "#9ca3af" }}>…</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {byPage.length === 0 && (
          <div style={{ padding: 12, color: "#9ca3af", fontSize: 12 }}>
            아직 하이라이트가 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}
