/**
 * RefManager API Client
 * Base44 RefManager 앱과 통신하기 위한 API 클라이언트
 */

const API_BASE_URL =
  import.meta.env.VITE_REFMANAGER_API_URL ||
  "https://your-refmanager-app.base44.app/api";

/**
 * Base44 인증 토큰 가져오기
 * 실제 구현에서는 Base44 세션에서 토큰을 가져와야 함
 */
function getAuthToken() {
  // TODO: Base44 세션에서 토큰 가져오기
  // 예: localStorage, sessionStorage, 또는 Base44 SDK 사용
  return localStorage.getItem("base44_auth_token") || "";
}

/**
 * API 요청 헬퍼
 */
async function apiRequest(endpoint, options = {}) {
  const token = getAuthToken();

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: "API 요청 실패" }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * PDF 정보 가져오기
 * @param {string} referenceId - 참고문헌 ID
 * @returns {Promise<{referenceId: string, title: string, pdfUrl: string, author_ids: string[], year: number}>}
 */
export async function getPdfInfo(referenceId) {
  return apiRequest("/functions/getPdfInfo", {
    method: "POST",
    body: JSON.stringify({ referenceId }),
  });
}

/**
 * 주석 목록 가져오기
 * @param {string} referenceId - 참고문헌 ID
 * @returns {Promise<{success: boolean, annotations: Array}>}
 */
export async function getAnnotations(referenceId) {
  return apiRequest("/functions/getAnnotations", {
    method: "POST",
    body: JSON.stringify({ referenceId }),
  });
}

/**
 * 주석 저장 (생성 또는 업데이트)
 * @param {Object} annotationData - 주석 데이터
 * @returns {Promise<{success: boolean, annotation: Object}>}
 */
export async function saveAnnotation(annotationData) {
  return apiRequest("/functions/saveAnnotation", {
    method: "POST",
    body: JSON.stringify(annotationData),
  });
}

/**
 * 주석 삭제
 * @param {string} annotationId - 주석 ID
 * @returns {Promise<{success: boolean}>}
 */
export async function deleteAnnotation(annotationId) {
  return apiRequest("/functions/deleteAnnotation", {
    method: "POST",
    body: JSON.stringify({ annotationId }),
  });
}

/**
 * Base44 인증 토큰 설정
 * RefManager 앱에서 토큰을 전달받을 때 사용
 */
export function setAuthToken(token) {
  localStorage.setItem("base44_auth_token", token);
}

/**
 * API 사용 가능 여부 확인
 */
export function isApiAvailable() {
  return !!getAuthToken();
}
