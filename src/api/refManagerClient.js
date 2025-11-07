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

function isAbsoluteHttpUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
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

/**
 * Base44로 주석 포함 PDF 업로드
 * 멀티파트 전송이 필요하므로, 반드시 절대 URL(https://…)의 RefManager API Base가 설정되어 있어야 합니다.
 * - URL Base 우선순위: localStorage('refmanager_api_url') > env('VITE_REFMANAGER_API_URL')
 * - 기본 프록시(/api/refmanager)는 JSON 전용이므로 업로드에 사용할 수 없습니다.
 * @param {string} referenceId
 * @param {Blob|File} fileBlob
 * @param {string} filename
 * @returns {Promise<{success:boolean, file_url?:string, message?:string}>}
 */
export async function uploadAnnotatedPdf(
  referenceId,
  fileBlob,
  filename = "annotated.pdf"
) {
  const token = getAuthToken();
  if (!token)
    throw new Error("Base44 인증 토큰이 없습니다. Base44에서 열어주세요.");

  const apiBaseUrl = getApiBaseUrl();
  if (!isAbsoluteHttpUrl(apiBaseUrl)) {
    throw new Error(
      "RefManager API URL이 설정되지 않았습니다. Base44에서 열었는지 확인하거나 VITE_REFMANAGER_API_URL을 절대 URL로 설정하세요."
    );
  }

  const form = new FormData();
  form.append("referenceId", referenceId);
  form.append("file", fileBlob, filename);

  const url = `${apiBaseUrl.replace(/\/$/, "")}/uploadAnnotatedPdf`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      // Content-Type은 브라우저가 자동으로 설정하도록 두기
    },
    body: form,
  });

  if (!response.ok) {
    let msg = `HTTP ${response.status}`;
    try {
      const j = await response.json();
      msg = j?.message || j?.error || msg;
    } catch {
      try {
        msg = await response.text();
      } catch {}
    }
    throw new Error(msg || "업로드 실패");
  }
  return response.json();
}

/**
 * 업로드 가능 여부(토큰 + 절대 API Base URL)
 */
export function canUploadToBase44() {
  const token = getAuthToken();
  const base = getApiBaseUrl();
  return !!token && isAbsoluteHttpUrl(base);
}
