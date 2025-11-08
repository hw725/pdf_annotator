/**
 * RefManager API Client
 * Base44 RefManager 앱과 통신하기 위한 API 클라이언트
 */

/**
 * RefManager API Base URL 가져오기
 * 우선순위: localStorage (Base44 전달) > 환경변수 > 프록시
 */
function getApiBaseUrl() {
  // 최우선 런타임 전달(localStorage)
  const base44ApiUrl = localStorage.getItem("refmanager_api_url");
  if (base44ApiUrl) return base44ApiUrl;
  // 환경변수
  const envApiUrl = import.meta.env.VITE_REFMANAGER_API_URL;
  if (envApiUrl) return envApiUrl;
  return "/api/refmanager"; // 프록시 기본값
}

function getApiBaseUrlCandidates() {
  const cands = [];
  const ls = localStorage.getItem("refmanager_api_url");
  const envApi = import.meta.env.VITE_REFMANAGER_API_URL;
  if (ls) cands.push(ls);
  if (envApi && envApi !== ls) cands.push(envApi);
  // 항상 프록시를 마지막 후보로 추가 (중복 방지)
  if (!cands.includes("/api/refmanager")) cands.push("/api/refmanager");
  return cands;
}

/**
 * Base44 인증 토큰 가져오기
 * Base44에서 URL 파라미터로 전달받아 localStorage에 저장된 토큰 사용
 */
function getAuthToken() {
  // 다양한 키 후보를 순차 탐색 (RefManager 전달 상황 또는 레거시 환경 호환)
  const candidates = [
    "base44_auth_token",
    "base44-token",
    "base44_token",
    "auth_token",
    "token",
  ];
  for (const k of candidates) {
    const v = localStorage.getItem(k);
    if (v) return v;
  }
  return "";
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
  const requestIdBase = `req-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const debugMode = localStorage.getItem("debug_refmanager") === "true";
  const candidates = getApiBaseUrlCandidates();
  let lastError;

  for (let attempt = 0; attempt < candidates.length; attempt++) {
    const base = candidates[attempt];
    const requestId = `${requestIdBase}-a${attempt + 1}`;
    const url = `${base}${endpoint}`;
    if (debugMode) {
      console.log(`[RefManager API Request] ${requestId}`, {
        candidateIndex: attempt,
        base,
        url,
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token.slice(0, 20)}...` : "(없음)",
          "x-client-request-id": requestId,
        },
        body: options.body ? JSON.parse(options.body) : undefined,
      });
    }

    let response;
    let responseText = "";
    try {
      response = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
          "x-client-request-id": requestId,
          ...options.headers,
        },
      });
      responseText = await response.text();
    } catch (networkErr) {
      lastError = networkErr;
      if (debugMode) {
        console.warn(
          `[RefManager API Network Error] ${requestId} -> 후보 다음 시도`,
          networkErr
        );
      }
      continue; // 다음 후보 시도
    }

    if (debugMode) {
      console.log(`[RefManager API Response] ${requestId}`, {
        status: response.status,
        ok: response.ok,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        bodyPreview: responseText.slice(0, 500),
      });
    }

    if (!response.ok) {
      // 에러 바디 파싱
      let message = `HTTP ${response.status}`;
      let details = null;
      try {
        const data = JSON.parse(responseText);
        if (data && (data.message || data.error)) {
          message = data.message || data.error;
          details = data;
        } else {
          details = data;
        }
      } catch {
        if (responseText) {
          message = responseText;
          details = responseText;
        }
      }

      lastError = new Error(message || "API 요청 실패");
      if (debugMode) {
        console.warn(
          `[RefManager API Error] ${requestId} base=${base} status=${response.status} -> 후보 다음 시도`,
          details || message
        );
      }
      // 400/404는 재시도 무의미 → 즉시 중단
      if (
        response.status >= 400 &&
        response.status < 500 &&
        response.status !== 500
      ) {
        throw lastError;
      }
      // 500 또는 502/503 등은 다음 후보 재시도
      continue;
    }

    // 성공 응답
    try {
      return JSON.parse(responseText);
    } catch {
      console.warn("응답을 JSON으로 파싱할 수 없음, 원본 반환:", responseText);
      return { success: true, data: responseText };
    }
  }

  // 모든 후보 실패
  throw lastError || new Error("API 요청 실패: 모든 후보 URL 실패");
}

/**
 * PDF 정보 가져오기
 * @param {string} referenceId - 참고문헌 ID
 * @returns {Promise<{referenceId: string, title: string, pdfUrl: string, author_ids: string[], year: number}>}
 */
export async function getPdfInfo(referenceId) {
  return apiRequest("/getPdfInfo", {
    method: "POST",
    // 서버 호환성을 위해 reference_id도 함께 전송
    body: JSON.stringify({ referenceId, reference_id: referenceId }),
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
    // 서버 호환성을 위해 reference_id도 함께 전송
    body: JSON.stringify({ referenceId, reference_id: referenceId }),
  });
}

/**
 * 주석 저장 (생성 또는 업데이트)
 * @param {Object} annotationData - 주석 데이터
 * @returns {Promise<{success: boolean, annotation: Object}>}
 */
export async function saveAnnotation(annotationData) {
  // reference_id만 있는 경우 referenceId 필드도 추가하여 백엔드 호환성 향상
  let payload = { ...annotationData };
  if (payload.reference_id && !payload.referenceId) {
    payload.referenceId = payload.reference_id;
  }
  return apiRequest("/saveAnnotation", {
    method: "POST",
    body: JSON.stringify(payload),
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
    // 서버 호환성을 위해 annotation_id도 함께 전송
    body: JSON.stringify({ annotationId, annotation_id: annotationId }),
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
  // 필드명 호환: referenceId & reference_id 동시 전송
  form.append("referenceId", referenceId);
  form.append("reference_id", referenceId);
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
