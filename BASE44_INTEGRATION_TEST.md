# Base44 연동 구현 검증

## 구현 내용 요약

### 1. App.jsx 변경사항
```javascript
// 추가된 URL 파라미터 파싱
const refManagerApiBaseUrl = params.get("refManagerApiBaseUrl");

// Base44 토큰 저장 (기존 코드 유지)
if (token) {
  localStorage.setItem("base44_auth_token", token);  // ✅ 명시적 저장 추가
  setAuthToken(token);
}

// Base44 API URL 저장 (신규)
if (refManagerApiBaseUrl) {
  localStorage.setItem("refmanager_api_url", refManagerApiBaseUrl);
}
```

### 2. refManagerClient.js 변경사항
```javascript
// 기존: 상수로 고정
const API_BASE_URL = import.meta.env.VITE_REFMANAGER_API_URL || "/api/refmanager";

// 신규: 동적으로 결정하는 함수
function getApiBaseUrl() {
  const base44ApiUrl = localStorage.getItem("refmanager_api_url");
  if (base44ApiUrl) return base44ApiUrl;
  
  const envApiUrl = import.meta.env.VITE_REFMANAGER_API_URL;
  if (envApiUrl) return envApiUrl;
  
  return "/api/refmanager";  // 기본값 유지
}
```

## 시나리오별 동작 검증

### ✅ 시나리오 1: 기존 로컬 개발 (변경 없음)
**상황**: `npm run dev`로 로컬 실행, URL 파라미터 없음

**동작 흐름**:
1. `refManagerApiBaseUrl` URL 파라미터 없음
2. `localStorage.getItem("refmanager_api_url")` → `null`
3. `import.meta.env.VITE_REFMANAGER_API_URL` → `.env.local`에 주석 처리됨 → `undefined`
4. **최종**: `/api/refmanager` (프록시) 사용 ✅

**결론**: 기존 동작 그대로 유지

---

### ✅ 시나리오 2: 로컬 임시 모드 (PDF 업로드)
**상황**: URL 파라미터 없이 로컬에서 PDF 파일 직접 업로드

**동작 흐름**:
1. URL 파라미터 없음 → `refId = "temp"`, `token = null`
2. `token`이 `null`이므로 localStorage 저장 건너뜀 ✅
3. `refManagerApiBaseUrl`도 `null`이므로 localStorage 저장 건너뜀 ✅
4. `loadPdfData("temp", null, null)` 호출
5. `refId === "temp"` 조건으로 서버 호출 없이 로컬 모드 ✅
6. `isApiAvailable()` → `getAuthToken()` → `""` → `false`
7. 서버 API 호출 없이 IndexedDB만 사용 ✅

**결론**: 기존 로컬 업로드 기능 정상 동작

---

### ✅ 시나리오 3: Base44 연동 (신규)
**상황**: Base44에서 다음 URL로 접근
```
https://pdf-annotator.app?referenceId=123&title=논문&pdfUrl=https://...&token=eyJ...&refManagerApiBaseUrl=https://refmanager.base44.app/api/functions
```

**동작 흐름**:
1. URL 파라미터 파싱
   - `refId = "123"`
   - `title = "논문"`
   - `pdfUrl = "https://..."`
   - `token = "eyJ..."`
   - `refManagerApiBaseUrl = "https://refmanager.base44.app/api/functions"`

2. localStorage 저장
   - `localStorage.setItem("base44_auth_token", "eyJ...")` ✅
   - `localStorage.setItem("refmanager_api_url", "https://...")` ✅

3. PDF 정보 로드
   - `urlPdfUrl`이 있으므로 서버 호출 없이 URL 정보 사용 ✅
   - `setPdfInfo({ referenceId: "123", title: "논문", pdfUrl: "https://..." })` ✅

4. 주석 로드
   - `isApiAvailable()` → `getAuthToken()` → `"eyJ..."` → `true` ✅
   - `refId !== "temp"` → `true` ✅
   - `getAnnotations("123")` 호출:
     - `getApiBaseUrl()` → `localStorage.getItem("refmanager_api_url")` → `"https://refmanager.base44.app/api/functions"` ✅
     - `fetch("https://refmanager.base44.app/api/functions/functions/getAnnotations")` 
     - **⚠️ 문제 발견**: `/functions` 중복!

**결론**: 경로 중복 문제 발견!

---

### ❌ 발견된 문제: 경로 중복

Base44에서 전달하는 `refManagerApiBaseUrl`이 이미 `/api/functions`까지 포함하는데,
`apiRequest()` 함수에서 다시 `/functions/getPdfInfo`를 붙이면:

```
https://refmanager.base44.app/api/functions/functions/getPdfInfo
                                           ^^^^^^^^^ 중복!
```

### 해결 방법 2가지:

#### 옵션 A: Base44에서 base URL만 전달 (권장)
```javascript
// Base44에서 전달
refManagerApiBaseUrl=https://refmanager.base44.app/api

// 결과
fetch("https://refmanager.base44.app/api/functions/getPdfInfo") ✅
```

#### 옵션 B: 엔드포인트 경로 조정
```javascript
// getPdfInfo() 함수 내부
return apiRequest("/getPdfInfo", {  // /functions 제거
```

---

### ✅ 시나리오 4: 환경변수로 직접 URL 설정
**상황**: `.env.local`에서 `VITE_REFMANAGER_API_URL` 주석 해제

```bash
VITE_REFMANAGER_API_URL=https://refmanager.my-server.com/api
```

**동작 흐름**:
1. URL 파라미터 없음 → localStorage 비어있음
2. `getApiBaseUrl()`:
   - `localStorage.getItem("refmanager_api_url")` → `null`
   - `import.meta.env.VITE_REFMANAGER_API_URL` → `"https://refmanager.my-server.com/api"` ✅
3. 환경변수 URL 사용 ✅

**결론**: 환경변수 fallback 정상 동작

---

## 호환성 매트릭스

| 사용 케이스 | URL 파라미터 | localStorage | 환경변수 | 최종 API URL | 상태 |
|------------|------------|--------------|---------|-------------|------|
| 로컬 개발 (기본) | ❌ | 비어있음 | ❌ | `/api/refmanager` | ✅ |
| 로컬 PDF 업로드 | ❌ | 비어있음 | ❌ | 호출 안함 | ✅ |
| Base44 연동 | ✅ token, apiUrl | 저장됨 | ❌ | Base44 URL | ⚠️ 경로수정 |
| 환경변수 설정 | ❌ | 비어있음 | ✅ | 환경변수 URL | ✅ |
| Base44 이후 로컬 | ❌ | 남아있음 | ❌ | Base44 URL (캐시) | ⚠️ 의도된 동작? |

---

## 추가 확인 필요 사항

### 1. localStorage 영속성
**문제**: Base44에서 한 번 접속 후 localStorage에 URL이 남아있으면,
이후 로컬 개발 시에도 Base44 URL을 계속 사용하게 됨

**해결 방안**:
- 옵션 A: URL 파라미터 없을 때 localStorage 클리어
- 옵션 B: 세션 기반으로 변경 (`sessionStorage`)
- 옵션 C: 현재 그대로 (Base44 URL 캐시 유지)

### 2. 토큰 만료 처리
**현재**: localStorage에 토큰 저장, 만료 체크 없음

**권장 개선**:
```javascript
// 401 응답 시 토큰 클리어 및 재인증 요청
if (response.status === 401) {
  localStorage.removeItem("base44_auth_token");
  // Base44로 재인증 리다이렉트 필요할 수도
}
```

### 3. CORS Preflight 처리
**현재**: RefManager에서 `Access-Control-Allow-Origin: *` 설정됨
**확인 필요**: Preflight OPTIONS 요청도 올바르게 처리되는지 확인

---

## 권장 수정 사항

### 🔧 수정 1: API 엔드포인트 경로 통일
Base44 개발자에게 확인 필요:
```
refManagerApiBaseUrl에 /api까지만 포함할지,
/api/functions까지 포함할지 명확히 정의
```

### 🔧 수정 2 (선택): localStorage 클리어 로직 추가
```javascript
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  const refManagerApiBaseUrl = params.get("refManagerApiBaseUrl");
  
  // URL 파라미터가 없으면 Base44 캐시 클리어
  if (!token && !refManagerApiBaseUrl) {
    localStorage.removeItem("base44_auth_token");
    localStorage.removeItem("refmanager_api_url");
  }
  
  // 나머지 로직...
}, []);
```

### 🔧 수정 3 (선택): 디버그 로깅 추가
```javascript
function getApiBaseUrl() {
  const base44ApiUrl = localStorage.getItem("refmanager_api_url");
  const envApiUrl = import.meta.env.VITE_REFMANAGER_API_URL;
  const finalUrl = base44ApiUrl || envApiUrl || "/api/refmanager";
  
  console.log("[API URL]", {
    base44: base44ApiUrl,
    env: envApiUrl,
    final: finalUrl
  });
  
  return finalUrl;
}
```

---

## 최종 결론

### ✅ 정상 동작하는 부분
- 로컬 개발 모드 (프록시 사용)
- 로컬 PDF 업로드 (temp 모드)
- 환경변수 fallback
- 토큰 저장 및 Authorization 헤더 전달
- URL 우선순위 체인 (localStorage > env > 기본값)

### ⚠️ 확인 및 수정 필요
1. **API 엔드포인트 경로 중복** (Base44 개발자와 협의 필요)
   - Base44가 `/api` vs `/api/functions` 중 어느 수준까지 전달하는지 확인
   
2. **localStorage 영속성 전략**
   - 현재: 한 번 저장되면 계속 유지
   - 대안: URL 파라미터 없을 때 클리어 or sessionStorage 사용

3. **토큰 만료 및 에러 처리**
   - 401 응답 시 재인증 플로우 필요

### 📋 다음 단계
1. Base44 개발자에게 `refManagerApiBaseUrl` 형식 확인
2. 위 확인 결과에 따라 엔드포인트 경로 조정
3. localStorage vs sessionStorage 전략 결정
4. 실제 Base44 환경에서 E2E 테스트
