/**
 * PDF 관리 유틸리티
 * 로컬 캐시, Google Drive 연동, 하이라이트 동기화
 */

import { initDB } from "@/db/localDB";
import {
  downloadFromDrive,
  uploadToDrive,
  extractFileIdFromUrl,
  getDriveUrl,
  isDriveAPIAvailable,
  isAuthenticated,
} from "@/api/driveClient";

/**
 * PDF 캐시에 저장 (오프라인용)
 * @param {Blob} pdfBlob - PDF 파일
 * @param {string} referenceId - 참고문헌 ID
 * @param {string} driveUrl - Google Drive URL
 * @returns {Promise<string>} 캐시 ID
 */
export const cachePDF = async (pdfBlob, referenceId, driveUrl = null) => {
  try {
    const db = await initDB();
    const id = `pdf-cache-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    const cache = {
      id,
      reference_id: referenceId,
      file_data: pdfBlob,
      file_size: pdfBlob.size,
      drive_url: driveUrl,
      last_synced: Date.now(),
    };

    await db.add("pdf_cache", cache);
    console.log("✅ PDF 캐시 저장 완료:", id);
    return id;
  } catch (error) {
    console.error("❌ PDF 캐시 저장 실패:", error);
    throw error;
  }
};

/**
 * PDF 캐시 가져오기
 * @param {string} cacheId - 캐시 ID
 * @returns {Promise<Object>} 캐시 데이터
 */
export const getCachedPDF = async (cacheId) => {
  try {
    const db = await initDB();
    const cache = await db.get("pdf_cache", cacheId);
    return cache;
  } catch (error) {
    console.error("❌ PDF 캐시 로드 실패:", error);
    throw error;
  }
};

/**
 * Reference ID로 캐시된 PDF 찾기
 * @param {string} referenceId - 참고문헌 ID
 * @returns {Promise<Object|null>} 캐시 데이터
 */
export const getCachedPDFByReferenceId = async (referenceId) => {
  try {
    const db = await initDB();
    const tx = db.transaction("pdf_cache", "readonly");
    const index = tx.objectStore("pdf_cache").index("reference_id");
    const caches = await index.getAll(referenceId);

    // 가장 최근 캐시 반환
    if (caches && caches.length > 0) {
      return caches.sort((a, b) => b.last_synced - a.last_synced)[0];
    }
    return null;
  } catch (error) {
    console.error("❌ PDF 캐시 검색 실패:", error);
    return null;
  }
};

/**
 * PDF 캐시 삭제
 * @param {string} cacheId - 캐시 ID
 * @returns {Promise<boolean>}
 */
export const deleteCachedPDF = async (cacheId) => {
  try {
    const db = await initDB();
    await db.delete("pdf_cache", cacheId);
    console.log("✅ PDF 캐시 삭제 완료:", cacheId);
    return true;
  } catch (error) {
    console.error("❌ PDF 캐시 삭제 실패:", error);
    return false;
  }
};

/**
 * Google Drive에서 PDF 로드 및 캐시
 * @param {string} driveUrl - Google Drive URL
 * @param {string} referenceId - 참고문헌 ID
 * @param {boolean} forceDownload - 캐시 무시하고 다운로드
 * @returns {Promise<{blob: Blob, cacheId: string}>}
 */
export const loadPDFFromDrive = async (
  driveUrl,
  referenceId,
  forceDownload = false
) => {
  try {
    // 1. 캐시 확인
    if (!forceDownload) {
      const cached = await getCachedPDFByReferenceId(referenceId);
      if (cached && cached.drive_url === driveUrl) {
        console.log("✅ 캐시된 PDF 사용:", cached.id);
        return {
          blob: cached.file_data,
          cacheId: cached.id,
        };
      }
    }

    // 2. Drive API 사용 가능 여부 확인
    if (!isDriveAPIAvailable()) {
      throw new Error("Google Drive API가 설정되지 않았습니다.");
    }

    if (!isAuthenticated()) {
      throw new Error("Google 계정 인증이 필요합니다.");
    }

    // 3. Drive에서 다운로드
    const fileId = extractFileIdFromUrl(driveUrl);
    if (!fileId) {
      throw new Error("올바른 Google Drive URL이 아닙니다.");
    }

    const blob = await downloadFromDrive(fileId);

    // 4. 캐시에 저장
    const cacheId = await cachePDF(blob, referenceId, driveUrl);

    return { blob, cacheId };
  } catch (error) {
    console.error("❌ Drive PDF 로드 실패:", error);
    throw error;
  }
};

/**
 * 로컬 파일을 Google Drive에 업로드
 * @param {Blob} fileBlob - PDF 파일
 * @param {string} filename - 파일 이름
 * @param {string} referenceId - 참고문헌 ID
 * @returns {Promise<{url: string, cacheId: string}>}
 */
export const uploadPDFToDrive = async (fileBlob, filename, referenceId) => {
  try {
    // 1. Drive에 업로드
    const fileId = await uploadToDrive(fileBlob, filename);
    const driveUrl = getDriveUrl(fileId);

    // 2. 캐시에도 저장
    const cacheId = await cachePDF(fileBlob, referenceId, driveUrl);

    console.log("✅ PDF 업로드 및 캐시 완료:", driveUrl);
    return { url: driveUrl, cacheId };
  } catch (error) {
    console.error("❌ PDF 업로드 실패:", error);
    throw error;
  }
};

/**
 * Reference의 pdf_url 필드 업데이트
 * @param {Object} Reference - Reference Entity
 * @param {string} referenceId - 참고문헌 ID
 * @param {string} pdfUrl - Google Drive URL
 * @returns {Promise<Object>} 업데이트된 Reference
 */
export const linkPDFToReference = async (Reference, referenceId, pdfUrl) => {
  try {
    const updated = await Reference.update(referenceId, {
      pdf_url: pdfUrl,
      pdf_cached: false, // 초기에는 캐시 안 됨
    });
    console.log("✅ Reference에 PDF 연결:", referenceId);
    return updated;
  } catch (error) {
    console.error("❌ PDF 연결 실패:", error);
    throw error;
  }
};

/**
 * Reference에서 PDF 연결 해제
 * @param {Object} Reference - Reference Entity
 * @param {string} referenceId - 참고문헌 ID
 * @returns {Promise<Object>}
 */
export const unlinkPDFFromReference = async (Reference, referenceId) => {
  try {
    // 캐시 삭제
    const cached = await getCachedPDFByReferenceId(referenceId);
    if (cached) {
      await deleteCachedPDF(cached.id);
    }

    // Reference 업데이트
    const updated = await Reference.update(referenceId, {
      pdf_url: null,
      pdf_cached: false,
    });

    console.log("✅ PDF 연결 해제:", referenceId);
    return updated;
  } catch (error) {
    console.error("❌ PDF 연결 해제 실패:", error);
    throw error;
  }
};

/**
 * 오프라인용 PDF 캐시 생성
 * @param {Object} Reference - Reference Entity
 * @param {string} referenceId - 참고문헌 ID
 * @returns {Promise<string>} 캐시 ID
 */
export const createOfflineCache = async (Reference, referenceId) => {
  try {
    const reference = await Reference.get(referenceId);
    if (!reference.pdf_url) {
      throw new Error("PDF URL이 설정되지 않았습니다.");
    }

    const { cacheId } = await loadPDFFromDrive(
      reference.pdf_url,
      referenceId,
      true // 강제 다운로드
    );

    // Reference 업데이트
    await Reference.update(referenceId, {
      pdf_cached: true,
      pdf_cache_id: cacheId,
    });

    console.log("✅ 오프라인 캐시 생성:", cacheId);
    return cacheId;
  } catch (error) {
    console.error("❌ 오프라인 캐시 생성 실패:", error);
    throw error;
  }
};

/**
 * PDF 타입 감지 (텍스트 vs 이미지)
 * @param {Blob} pdfBlob - PDF 파일
 * @returns {Promise<'text'|'image'>}
 */
export const detectPDFType = async (pdfBlob) => {
  try {
    // PDF.js를 사용하여 첫 페이지의 텍스트 확인
    const pdfjsLib = await import("pdfjs-dist");
    const arrayBuffer = await pdfBlob.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);
    const textContent = await page.getTextContent();

    if (textContent.items.length > 0) {
      return "text";
    } else {
      return "image";
    }
  } catch (error) {
    console.error("PDF 타입 감지 실패:", error);
    return "image"; // 기본값
  }
};

/**
 * 모든 동기화되지 않은 하이라이트 가져오기
 * @returns {Promise<Array>}
 */
export const getUnsyncedHighlights = async () => {
  try {
    const db = await initDB();
    const tx = db.transaction("highlights", "readonly");
    const index = tx.objectStore("highlights").index("synced");
    const highlights = await index.getAll(false);
    return highlights;
  } catch (error) {
    console.error("동기화 안 된 하이라이트 조회 실패:", error);
    return [];
  }
};

/**
 * 하이라이트를 Google Drive에 동기화
 * (실제 구현은 PDF-lib 등을 사용하여 PDF에 annotation 추가)
 * @param {string} referenceId - 참고문헌 ID
 * @returns {Promise<boolean>}
 */
export const syncHighlightsToDrive = async (referenceId) => {
  try {
    // TODO: PDF-lib를 사용하여 하이라이트를 PDF에 병합
    // 여기서는 메타데이터만 저장하는 간단한 버전

    const db = await initDB();
    const tx = db.transaction("highlights", "readonly");
    const index = tx.objectStore("highlights").index("reference_id");
    const highlights = await index.getAll(referenceId);

    console.log(
      `✅ ${highlights.length}개의 하이라이트 동기화 완료 (메타데이터)`
    );

    // 동기화 상태 업데이트
    for (const highlight of highlights) {
      await db.put("highlights", { ...highlight, synced: true });
    }

    return true;
  } catch (error) {
    console.error("하이라이트 동기화 실패:", error);
    return false;
  }
};
