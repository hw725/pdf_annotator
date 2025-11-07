/**
 * RefManager API Client
 * Base44 RefManager 앱과 통신하기 위한 API 클라이언트
 */

/**
 * RefManager API Base URL 가져오기
 * 우선순위: localStorage (Base44 전달) > 환경변수 > 프록시
 */
function getApiBaseUrl() {
  // Base44에서 URL 파라미터로 전달받은 API URL (런타임)
  const base44ApiUrl = localStorage.getItem("refmanager_api_url");
  if (base44ApiUrl) {
    return base44ApiUrl;
  }

  // 환경변수에 설정된 직접 URL (빌드타임)
  const envApiUrl = import.meta.env.VITE_REFMANAGER_API_URL;
  if (envApiUrl) {
    return envApiUrl;
  }

  // 기본값: same-origin Edge Function 프록시 (권장)
  return "/api/refmanager";
}

/**
 * Base44 인증 토큰 가져오기
 * Base44에서 URL 파라미터로 전달받아 localStorage에 저장된 토큰 사용
 */
function getAuthToken() {
  return localStorage.getItem("base44_auth_token") || "";
}

/**
 * API 요청 헬퍼
 */
async function apiRequest(endpoint, options = {}) {
  const token = getAuthToken();
  const apiBaseUrl = getApiBaseUrl();
  const requestId = `req-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  const url = `${apiBaseUrl}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
      "x-client-request-id": requestId,
      ...options.headers,
    },
  });

  if (!response.ok) {
    // 에러 바디를 최대한 상세히 추출 (JSON -> text 순)
    let message = `HTTP ${response.status}`;
    let details = null;
    try {
      const data = await response.json();
      if (data && (data.message || data.error)) {
        message = data.message || data.error;
        details = data;
      }
    } catch {
      try {
        const text = await response.text();
        if (text) {
          message = text;
          details = text;
        }
      } catch {
        // ignore
      }
    }
    // 추가 진단 로그: 어디로 어떤 페이로드를 보냈는지 파악 도움
    try {
      const bodyPreview = options.body
        ? JSON.stringify(JSON.parse(options.body))
        : undefined;
      console.warn(
        "RefManager API 오류",
        {
          url,
          endpoint,
          status: response.status,
          requestId,
          body: bodyPreview,
        },
        details || ""
      );
    } catch {}
    throw new Error(message || "API 요청 실패");
  }

  return response.json();
}

/**
 * PDF 정보 가져오기
 * @param {string} referenceId - 참고문헌 ID
 * @returns {Promise<{referenceId: string, title: string, pdfUrl: string, author_ids: string[], year: number}>}
 */
export async function getPdfInfo(referenceId) {
  return apiRequest("/getPdfInfo", {
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
  return apiRequest("/getAnnotations", {
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
  return apiRequest("/saveAnnotation", {
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
  return apiRequest("/deleteAnnotation", {
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
