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
  const [groupByPage, setGroupByPage] = useState(false); // 자동 목차(페이지 헤더) 대신 기본은 단일 목록

  const byPage = useMemo(() => {
    // 각 페이지별로 별개 그룹을 만들고, 각 페이지 내에서만 중복 제거
    const makeDocSig = (h) => {
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
    };

    const map = new Map();
    (highlights || []).forEach((h) => {
      const p = h.page || h.page_number || 1;
      if (!map.has(p)) map.set(p, []);
      map.get(p).push(h);
    });

    // 각 페이지별로 중복 제거
    const result = [];
    map.forEach((list, page) => {
      const seen = new Set();
      const deduped = [];
      for (const h of list) {
        const sig = makeDocSig(h);
        if (seen.has(sig)) continue;
        seen.add(sig);
        deduped.push(h);
      }
      if (deduped.length > 0) {
        result.push({ page, list: deduped });
      }
    });

    return result.sort((a, b) => a.page - b.page);
  }, [highlights]);

  const flatList = useMemo(() => {
    // 각 페이지별로 중복 제거한 뒤 전체를 플랫하게 정렬
    // (같은 내용이 다른 페이지에 있으면 각각 표시)
    const makeDocSig = (h) => {
      const type = h.type || (Array.isArray(h.rects) ? "text" : "area");
      const color = h.color || "";
      const page = h.page || h.page_number || 1;
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
        return `${page}|${type}|${color}|${rectSig}|${text}`;
      }
      if (h.area) {
        const r = h.area;
        const rectSig = [r.x, r.y, r.width, r.height]
          .map((v) => Math.round(Number(v) || 0))
          .join(":");
        return `${page}|area|${color}|${rectSig}`;
      }
      return `${page}|${type}|${color}`;
    };
    const seen = new Set();
    const arr = [];
    const src = Array.isArray(highlights) ? [...highlights] : [];
    src.sort(
      (a, b) =>
        (a.page || 0) - (b.page || 0) ||
        (a.created_at || 0) - (b.created_at || 0)
    );
    for (const h of src) {
      const sig = makeDocSig(h);
      if (seen.has(sig)) continue;
      seen.add(sig);
      arr.push(h);
    }
    return arr;
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            color: "#6b7280",
          }}
        >
          <span>총 {flatList?.length || 0}개</span>
          <label
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
            title="페이지별 그룹 표시"
          >
            <input
              type="checkbox"
              checked={groupByPage}
              onChange={(e) => setGroupByPage(e.target.checked)}
            />
            <span style={{ color: "#374151" }}>페이지별</span>
          </label>
        </div>
      </div>

      <div>
        {groupByPage ? (
          byPage.map(({ page, list }) => {
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
                <div
                  style={{ padding: "4px 8px 8px 16px", background: "#fff" }}
                >
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
          })
        ) : (
          <div style={{ padding: "8px 8px 12px 8px", background: "#fff" }}>
            {flatList.map((h, idx) => (
              <button
                key={`flat-${idx}-${h.type}-${h.color}-${(h.text || "").slice(
                  0,
                  50
                )}`}
                onClick={() => onJumpToHighlight && onJumpToHighlight(h)}
                style={{
                  display: "flex",
                  width: "100%",
                  alignItems: "center",
                  gap: 8,
                  textAlign: "left",
                  background: "transparent",
                  border: "none",
                  fontSize: 12,
                  color: "#4b5563",
                  padding: "6px 4px",
                  borderBottom: "1px dashed #f3f4f6",
                  cursor: "pointer",
                }}
                title={h.text || "영역 하이라이트"}
              >
                <span style={{ minWidth: 36, color: "#6b7280" }}>
                  p{h.page}
                </span>
                <span style={{ flex: 1 }}>
                  {h.type === "text"
                    ? (h.text || "텍스트 하이라이트").slice(0, 120)
                    : "영역 하이라이트"}
                </span>
              </button>
            ))}
            {flatList.length === 0 && (
              <div style={{ padding: 12, color: "#9ca3af", fontSize: 12 }}>
                아직 하이라이트가 없습니다.
              </div>
            )}
          </div>
        )}

        {groupByPage && byPage.length === 0 && (
          <div style={{ padding: 12, color: "#9ca3af", fontSize: 12 }}>
            아직 하이라이트가 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}
