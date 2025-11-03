/* eslint-disable react/prop-types */
import React, { useEffect, useMemo, useState } from "react";

export default function PageHighlightsSidebar({
  highlights = [],
  currentPage = 1,
  onJumpToPage,
  onJumpToHighlight,
}) {
  // 펼침/접힘 없이 항상 표시
  const MAX_ITEMS_PER_PAGE = 30;

  const byPage = useMemo(() => {
    // 안정적 시그니처 생성(페이지 내 동일 항목 1개만 유지)
    const makeSig = (h) => {
      const p = h.page || h.page_number || 1;
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
        return `${p}|${type}|${color}|${rectSig}|${text}`;
      }
      if (h.area) {
        const r = h.area;
        const rectSig = [r.x, r.y, r.width, r.height]
          .map((v) => Math.round(Number(v) || 0))
          .join(":");
        return `${p}|area|${color}|${rectSig}`;
      }
      return `${p}|${type}|${color}`;
    };

    const map = new Map();
    const seen = new Set();
    (highlights || []).forEach((h) => {
      const p = h.page || h.page_number || 1;
      const sig = makeSig(h);
      if (seen.has(sig)) return; // 페이지 내 중복 제거
      seen.add(sig);
      if (!map.has(p)) map.set(p, []);
      map.get(p).push(h);
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([page, list]) => ({ page, list }));
  }, [highlights]);

  // 현재 페이지 변경 시 사이드바 스크롤 보정(선택 사항: 헤더 클릭 시 이동은 유지)
  useEffect(() => {
    // 별도 상태 필요 없음. 필요시 스크롤 위치를 맞추는 로직을 추가할 수 있음.
  }, [currentPage]);

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
          const isActive = page === currentPage;
          return (
            <div key={page}>
              <button
                onClick={() => onJumpToPage && onJumpToPage(page)}
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
              <div style={{ padding: "4px 8px 8px 16px", background: "#fff" }}>
                {list.slice(0, MAX_ITEMS_PER_PAGE).map((h) => (
                  <button
                    key={`${page}-${h.type}-${h.color}-${(h.text || "").slice(
                      0,
                      50
                    )}`}
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
