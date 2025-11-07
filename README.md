# RefManager PDF Annotator

별도 호스팅되는 PDF 주석 편집기 - Base44 RefManager와 API로 연동

## 📋 개요

이 앱은 Base44 RefManager와 분리되어 독립적으로 호스팅되는 PDF 주석 편집기입니다. RefManager의 라이브러리 제약사항을 우회하면서 완전한 PDF 주석 기능을 제공합니다. 데이터 영속화는 선택적으로 Supabase를 백엔드로 사용합니다. 프런트엔드 호스팅은 Vercel/Netlify 등에서 수행하세요.

### 주요 기능

- 📄 PDF 뷰어 (react-pdf 기반)
- ✏️ 텍스트 하이라이트
- 🖼️ 영역 선택 주석
- 💾 RefManager API와 동기화 (선택)
- ☁️ Supabase로 주석 Save/Load (선택)
- 🎨 다양한 색상 선택
- 📱 반응형 UI

## 🏗️ 아키텍처

```
┌─────────────────────────────────┐
│   RefManager (Base44)           │
│   - 서지사항 관리               │
│   - 인용 생성                   │
│   - Base44 Functions API        │
└────────────┬────────────────────┘
             │ REST API
             │ (주석 데이터 교환)
             ↓
┌─────────────────────────────────┐
│   PDF Annotator (별도 호스팅)   │
│   - react-pdf 뷰어              │
│   - pdf-lib 주석 처리           │
│   - IndexedDB 캐시              │
└─────────────────────────────────┘
```

## 🚀 설치 및 실행

### 1. 의존성 설치

```cmd
npm install
```

### 2. 환경 변수 설정

`.env.local` 파일을 생성하고 필요한 값을 설정:

```env
# RefManager Functions (선택)
VITE_REFMANAGER_API_URL=https://your-refmanager-app.base44.app/api

# Google Drive 연동 (선택)
VITE_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=your_google_api_key

# Supabase (선택)
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

### 3. 개발 서버 실행

```cmd
npm run dev
```

브라우저에서 `http://localhost:3000` 열림 (vite.config.js에서 포트 3000 지정)

### 4. 빌드

```cmd
npm run build
```

빌드 결과물은 `dist` 폴더에 생성됩니다.

## 🐛 디버깅 모드

RefManager API 통신 문제를 진단하려면 브라우저 콘솔에서 디버깅 모드를 활성화하세요:

```javascript
// 활성화
localStorage.setItem("debug_refmanager", "true");

// 비활성화
localStorage.removeItem("debug_refmanager");
```

디버깅 모드에서는:
- 모든 API 요청/응답의 상세 정보가 콘솔에 출력됩니다
- 프록시 서버 로그 (Vercel Functions)에도 추가 정보가 기록됩니다
- 업스트림 타겟 URL, 요청 바디, 응답 바디 미리보기 확인 가능

**중요:** 프로덕션에서는 반드시 비활성화하세요 (토큰 정보가 로그에 노출될 수 있음)

## 🔗 RefManager와 연동

### URL 파라미터

PDF Annotator는 다음 URL 파라미터를 받습니다:

```
https://your-pdf-annotator.app/?referenceId=REF123&token=AUTH_TOKEN&title=논문제목&pdfUrl=https://...
```

**파라미터:**

- `referenceId` (선택): RefManager 참고문헌 ID. 미제공 시 임시 모드로 동작하며 URL 입력 또는 로컬 업로드로 PDF를 열 수 있습니다.
- `token` (선택): Base44 인증 토큰. RefManager API를 호출할 때만 필요합니다.
- `title` (선택): PDF 제목 (API에서 가져오지 않을 경우)
- `pdfUrl` (선택): PDF 직접 URL (API에서 가져오지 않을 경우)

### RefManager에서 호출

#### 방법 1: 새 탭으로 열기

```javascript
// RefManager의 References.jsx
const openPDFAnnotator = (reference) => {
  const token = getBase44AuthToken(); // Base44 세션 토큰
  const url = new URL('https://your-pdf-annotator.app/');
  url.searchParams.set('referenceId', reference.id);
  url.searchParams.set('token', token);
  if (reference.title) url.searchParams.set('title', reference.title);
  if (reference.pdf_url) url.searchParams.set('pdfUrl', reference.pdf_url);
  
  window.open(url.toString(), '_blank');
};
```

#### 방법 2: iframe 임베드

```jsx
// RefManager의 PDFViewModal.jsx
<iframe
  src={`https://your-pdf-annotator.app/?referenceId=${refId}&token=${token}`}
  style={{ width: '100%', height: '100%', border: 'none' }}
  allow="fullscreen"
/>
```

## 🔧 Base44 Functions API

RefManager 앱에 다음 Functions를 구현해야 합니다:

### 1. getPdfInfo

**요청:**
```json
POST /api/functions/getPdfInfo
{
  "referenceId": "REF123"
}
```

**응답:**
```json
{
  "referenceId": "REF123",
  "title": "연구 논문 제목",
  "pdfUrl": "https://drive.google.com/...",
  "author_ids": ["AUTH1", "AUTH2"],
  "year": 2023
}
```

### 2. getAnnotations

**요청:**
```json
POST /api/functions/getAnnotations
{
  "referenceId": "REF123"
}
```

**응답:**
```json
{
  "success": true,
  "annotations": [
    {
      "id": "ANNOT1",
      "reference_id": "REF123",
      "type": "highlight",
      "page_number": 1,
      "content": "하이라이트된 텍스트",
      "position": { "rects": [...] },
      "color": "#FFFF00"
    }
  ]
}
```

### 3. saveAnnotation

**요청:**
```json
POST /api/functions/saveAnnotation
{
  "reference_id": "REF123",
  "type": "highlight",
  "page_number": 1,
  "content": "하이라이트 텍스트",
  "position": { "rects": [...] },
  "color": "#FFFF00"
}
```

**응답:**
```json
{
  "success": true,
  "annotation": {
    "id": "ANNOT2",
    "reference_id": "REF123",
    ...
  }
}
```

### 4. deleteAnnotation

**요청:**
```json
POST /api/functions/deleteAnnotation
{
  "annotationId": "ANNOT1"
}
```

**응답:**
```json
{
  "success": true
}
```

## 🗄️ Base44 데이터 모델

RefManager에 `PdfAnnotation` 엔티티 생성:

```javascript
// Base44에서
const PdfAnnotation = Entity({
  name: 'PdfAnnotation',
  fields: {
    reference_id: { type: 'reference', entity: 'Reference' },
    type: { type: 'string' }, // 'highlight', 'text_note', 'drawing'
    page_number: { type: 'number' },
    content: { type: 'text' },
    position: { type: 'json' },
    color: { type: 'string' },
    created_at: { type: 'datetime', default: 'now' },
  }
});
```

## 🔐 인증

PDF Annotator는 RefManager에서 전달받은 Base44 인증 토큰을 사용합니다:

```javascript
// API 클라이언트 (src/api/refManagerClient.js)
const token = localStorage.getItem('base44_auth_token');
fetch(API_URL, {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

## 📦 배포

### Netlify

```cmd
npm run build
```

`dist` 폴더를 Netlify에 배포

### Vercel

```cmd
vercel --prod
```

### 환경 변수 설정 (배포 시)

배포 플랫폼(Vercel/Netlify)의 프로젝트 설정에서 위 환경 변수들을 동일하게 등록하세요. Drive 또는 Supabase를 쓰지 않으면 해당 키는 생략 가능합니다.

추가로, Drive 연동을 쓴다면 Google Cloud OAuth의 Authorized JavaScript origins에 배포 도메인을 등록해야 합니다.

## 🛠️ 개발

### 프로젝트 구조

```
pdf_annotator/
├── src/
│   ├── api/
│   │   └── refManagerClient.js   # RefManager API 클라이언트
│   ├── components/
│   │   └── pdf/
│   │       ├── PDFViewer.jsx      # 메인 PDF 뷰어
│   │       ├── PDFHighlight.jsx   # 하이라이트 툴바
│   │       └── PageHighlightOverlay.jsx  # 주석 오버레이
│   ├── utils/
│   │   ├── pdfExport.js          # PDF 내보내기
│   │   └── pdfManager.js         # PDF 관리
│   ├── db/
│   │   └── localDB.js            # IndexedDB (오프라인 캐시)
│   ├── App.jsx                   # 메인 앱
│   └── main.jsx                  # 엔트리 포인트
├── package.json
├── vite.config.js
└── index.html
```

### 주요 의존성

- `react`: ^18.3.1
- `react-pdf`: ^9.1.1
- `pdfjs-dist`: ^4.8.69
- `pdf-lib`: ^1.17.1
- `idb`: ^8.0.0
- `@supabase/supabase-js`: ^2.x (선택)

## 🐛 문제 해결

### CORS 에러

RefManager API에서 CORS 헤더 설정:

```javascript
// Base44 Function에서
response.headers['Access-Control-Allow-Origin'] = 'https://your-pdf-annotator.app';
```

### PDF 로드 실패

1. `pdfUrl`이 올바른지 확인
2. Google Drive 파일의 공유 설정 확인
3. CORS 프록시 사용 고려

### Supabase Save/Load 버튼이 보이지 않음
- VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY가 설정되어 있는지 확인
- 환경 변수 변경 후에는 개발 서버 재시작/배포 재실행 필요

## 📝 라이선스

MIT License

## 🤝 기여

이슈 및 PR 환영합니다!
