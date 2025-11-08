import { useState, useEffect } from "react";
import { initDB } from "@/db/localDB";

/**
 * PDF 북마크 사이드바 컴포넌트
 */
export default function PageBookmarksSidebar({
  referenceId,
  currentPage,
  onJumpToPage,
  refreshKey = 0,
  bookmarksOverride = null,
  onBookmarksOverrideChange = null,
}) {
  const [bookmarks, setBookmarks] = useState([]);
  const [newBookmarkTitle, setNewBookmarkTitle] = useState("");

  // 북마크 로드
  useEffect(() => {
    (async () => {
      try {
        if (Array.isArray(bookmarksOverride)) {
          // 임포트된 북마크( temp ) 우선 표시
          const sorted = [...bookmarksOverride];
          sorted.sort(
            (a, b) =>
              (a.page || 0) - (b.page || 0) ||
              (a.created_at || 0) - (b.created_at || 0)
          );
          setBookmarks(sorted);
          return;
        }
        if (!referenceId || referenceId === "temp") {
          setBookmarks([]);
          return;
        }
        const db = await initDB();
        const all = await db.getAllFromIndex(
          "bookmarks",
          "reference_id",
          referenceId
        );
        all.sort(
          (a, b) =>
            (a.page || 0) - (b.page || 0) ||
            (a.created_at || 0) - (b.created_at || 0)
        );
        setBookmarks(all);
      } catch (e) {
        console.warn("북마크 로드 실패", e);
      }
    })();
  }, [referenceId, refreshKey, bookmarksOverride]);

  // 북마크 추가
  const handleAddBookmark = async () => {
    const title = newBookmarkTitle.trim() || `페이지 ${currentPage}`;
    const now = Date.now();

    // Override 모드 편집 지원: 메모리 편집 + 상위 콜백 통지
    if (Array.isArray(bookmarksOverride)) {
      if (typeof onBookmarksOverrideChange !== "function") {
        alert("임포트된 북마크는 읽기 전용입니다.");
        return;
      }
      const id = `temp-bookmark-${now}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const bookmark = {
        id,
        page: currentPage,
        title,
        created_at: now,
      };
      const updated = [...bookmarks, bookmark].sort(
        (a, b) =>
          (a.page || 0) - (b.page || 0) ||
          (a.created_at || 0) - (b.created_at || 0)
      );
      setBookmarks(updated);
      onBookmarksOverrideChange(updated);
      setNewBookmarkTitle("");
      return;
    }

    // 일반 모드: IndexedDB에 저장
    if (!referenceId || referenceId === "temp") {
      alert("이 모드에서는 북마크를 추가할 수 없습니다.");
      return;
    }
    try {
      const db = await initDB();
      const id = `bookmark-${now}-${Math.random().toString(36).substr(2, 9)}`;
      const bookmark = {
        id,
        reference_id: referenceId,
        page: currentPage,
        title,
        created_at: now,
      };
      await db.add("bookmarks", bookmark);
      const updated = [...bookmarks, bookmark].sort(
        (a, b) =>
          (a.page || 0) - (b.page || 0) ||
          (a.created_at || 0) - (b.created_at || 0)
      );
      setBookmarks(updated);
      setNewBookmarkTitle("");
    } catch (e) {
      console.error("북마크 추가 실패", e);
      alert("북마크 추가에 실패했습니다.");
    }
  };

  // 북마크 삭제
  const handleDeleteBookmark = async (bookmark) => {
    const ok = window.confirm(`"${bookmark.title}" 북마크를 삭제할까요?`);
    if (!ok) return;

    // Override 모드: 메모리에서 제거 + 상위 콜백 통지
    if (Array.isArray(bookmarksOverride)) {
      if (typeof onBookmarksOverrideChange !== "function") {
        alert("임포트된 북마크는 읽기 전용입니다.");
        return;
      }
      const updated = bookmarks.filter(
        (b) => b !== bookmark && b.id !== bookmark.id
      );
      setBookmarks(updated);
      onBookmarksOverrideChange(updated);
      return;
    }

    try {
      if (!referenceId || referenceId === "temp") {
        alert("이 모드에서는 삭제할 수 없습니다.");
        return;
      }
      const db = await initDB();
      await db.delete("bookmarks", bookmark.id);
      setBookmarks((prev) => prev.filter((b) => b.id !== bookmark.id));
    } catch (e) {
      console.error("북마크 삭제 실패", e);
      alert("삭제에 실패했습니다.");
    }
  };

  return (
    <div className="bookmarks-sidebar">
      <div className="sidebar-header">
        <h3>북마크</h3>
        <span className="count">{bookmarks.length}</span>
      </div>

      <div className="bookmark-add-form">
        <input
          type="text"
          placeholder={`페이지 ${currentPage} 북마크...`}
          value={newBookmarkTitle}
          onChange={(e) => setNewBookmarkTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAddBookmark();
          }}
          className="bookmark-input"
        />
        <button
          onClick={handleAddBookmark}
          className="btn btn-sm primary"
          title="현재 페이지에 북마크 추가"
        >
          + 추가
        </button>
      </div>

      <div className="bookmark-list">
        {bookmarks.length === 0 && (
          <div className="empty-state">북마크가 없습니다.</div>
        )}
        {bookmarks.map((b) => (
          <div
            key={b.id}
            className={`bookmark-item ${
              b.page === currentPage ? "current" : ""
            }`}
          >
            <div
              className="bookmark-content"
              onClick={() => onJumpToPage && onJumpToPage(b.page)}
              style={{ cursor: "pointer" }}
            >
              <div className="bookmark-page">p.{b.page}</div>
              <div className="bookmark-title">{b.title}</div>
            </div>
            <button
              className="btn-icon delete"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteBookmark(b);
              }}
              title="북마크 삭제"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <style jsx>{`
        .bookmarks-sidebar {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #fff;
          border-right: 1px solid #e5e7eb;
        }
        .sidebar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid #e5e7eb;
          background: #f9fafb;
        }
        .sidebar-header h3 {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
          color: #111827;
        }
        .count {
          padding: 2px 8px;
          background: #e5e7eb;
          border-radius: 12px;
          font-size: 12px;
          color: #6b7280;
        }
        .bookmark-add-form {
          display: flex;
          gap: 8px;
          padding: 12px 16px;
          border-bottom: 1px solid #e5e7eb;
        }
        .bookmark-input {
          flex: 1;
          padding: 6px 10px;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          font-size: 13px;
        }
        .bookmark-input:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
        }
        .bookmark-list {
          flex: 1;
          overflow-y: auto;
          padding: 8px 0;
        }
        .empty-state {
          padding: 24px 16px;
          text-align: center;
          color: #9ca3af;
          font-size: 13px;
        }
        .bookmark-item {
          display: flex;
          align-items: center;
          padding: 10px 16px;
          border-bottom: 1px solid #f3f4f6;
          transition: background 0.15s;
        }
        .bookmark-item:hover {
          background: #f9fafb;
        }
        .bookmark-item.current {
          background: #eff6ff;
          border-left: 3px solid #3b82f6;
        }
        .bookmark-content {
          flex: 1;
          min-width: 0;
        }
        .bookmark-page {
          font-size: 11px;
          font-weight: 600;
          color: #6b7280;
          margin-bottom: 2px;
        }
        .bookmark-title {
          font-size: 13px;
          color: #111827;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .btn-icon {
          padding: 4px 8px;
          background: none;
          border: none;
          cursor: pointer;
          font-size: 18px;
          color: #9ca3af;
          transition: color 0.15s;
        }
        .btn-icon:hover {
          color: #ef4444;
        }
        .btn {
          padding: 6px 12px;
          border: none;
          border-radius: 4px;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .btn-sm {
          padding: 4px 10px;
          font-size: 12px;
        }
        .btn.primary {
          background: #3b82f6;
          color: white;
        }
        .btn.primary:hover {
          background: #2563eb;
        }
      `}</style>
    </div>
  );
}
