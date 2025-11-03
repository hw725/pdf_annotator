# PDF Annotator 배포 가이드

중요: 이 앱은 정적 프론트엔드입니다. Supabase는 데이터베이스/Auth/Storage/Edge Functions를 제공하는 백엔드 플랫폼이지, 정적 웹앱 호스팅 서비스가 아닙니다. 배포는 Vercel 또는 Netlify 같은 프론트엔드 호스팅에 하고, 앱은 Supabase를 백엔드로 호출합니다.

## 🚀 Vercel 배포 (추천)

### 1. Vercel CLI 설치
```cmd
npm install -g vercel
```

### 2. 배포
```cmd
vercel
```

처음 실행 시:
- Set up and deploy? `Y`
- Which scope? (본인 계정 선택)
- Link to existing project? `N`
- Project name? `refmanager-pdf-annotator`
- In which directory is your code located? `./`
- Want to override settings? `N`

### 3. 환경 변수 설정

Vercel 대시보드(Project → Settings → Environment Variables) 또는 CLI로 아래 항목을 추가하세요.

- VITE_REFMANAGER_API_URL = https://your-refmanager.base44.app/api (선택)
- VITE_GOOGLE_CLIENT_ID = your_google_client_id.apps.googleusercontent.com (선택: Drive 연동 시)
- VITE_GOOGLE_API_KEY = your_google_api_key (선택: Drive 연동 시)
- VITE_SUPABASE_URL = https://YOUR-PROJECT-REF.supabase.co (선택: Supabase 사용 시)
- VITE_SUPABASE_ANON_KEY = supabase_anon_key (선택: Supabase 사용 시)

### 4. 프로덕션 배포
```cmd
vercel --prod
```

배포 URL 예시: `https://refmanager-pdf-annotator.vercel.app`

---

## 🔷 Netlify 배포 (대안)

### 1. Netlify CLI 설치
```cmd
npm install -g netlify-cli
```

### 2. 로그인
```cmd
netlify login
```

### 3. 배포
```cmd
netlify deploy
```

- Create & configure new site? `Y`
- Team? (본인 팀 선택)
- Site name? `refmanager-pdf-annotator`
- Publish directory? `dist`

### 4. 환경 변수 설정

Netlify 대시보드(Site settings → Environment variables)에서 아래 항목을 추가하세요.

- VITE_REFMANAGER_API_URL = https://your-refmanager.base44.app/api (선택)
- VITE_GOOGLE_CLIENT_ID = your_google_client_id.apps.googleusercontent.com (선택: Drive)
- VITE_GOOGLE_API_KEY = your_google_api_key (선택: Drive)
- VITE_SUPABASE_URL = https://YOUR-PROJECT-REF.supabase.co (선택: Supabase)
- VITE_SUPABASE_ANON_KEY = supabase_anon_key (선택: Supabase)

### 5. 프로덕션 배포
```cmd
netlify deploy --prod
```

배포 URL 예시: `https://refmanager-pdf-annotator.netlify.app`

---

## 🌐 GitHub Actions 자동 배포 (선택)

### Vercel

`.github/workflows/vercel.yml`:
```yaml
name: Vercel Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm install
      - run: npm run build
      - uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
```

### Netlify

`.github/workflows/netlify.yml`:
```yaml
name: Netlify Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm install
      - run: npm run build
      - uses: netlify/actions/cli@master
        with:
          args: deploy --prod --dir=dist
        env:
          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
          NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}
```

---

## 🔒 Base44/Supabase/Google 설정 체크

### 1) Base44 CORS 설정

배포 후 Base44 RefManager Functions에 CORS 설정 필요:

```javascript
// Base44 Functions에 추가
const ALLOWED_ORIGINS = [
  'https://refmanager-pdf-annotator.vercel.app',
  'https://refmanager-pdf-annotator.netlify.app',
  'http://localhost:3000' // 개발 환경
];

export default async function yourFunction(req, res) {
  const origin = req.headers.origin;
  
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // ... 함수 로직
}
```

### 2) Supabase
- Database와 RLS 정책을 이미 구성했다면 추가 설정은 없습니다.
- Supabase Auth를 도입하는 경우에는 해당 도메인을 Redirect URLs/Additional Redirect URLs에 등록하세요.

### 3) Google Cloud (Drive 연동 시)
- OAuth 클라이언트의 Authorized JavaScript origins에 배포 도메인 추가
  - 예: https://refmanager-pdf-annotator.vercel.app, https://refmanager-pdf-annotator.netlify.app
- (Redirect 방식 사용 시) Authorized redirect URIs도 필요에 맞게 추가

---

## ✅ 배포 체크리스트

- [ ] `npm run build` 로컬에서 테스트
- [ ] `.env.example` 파일 확인
- [ ] Vercel 또는 Netlify 계정 생성
- [ ] CLI 설치 및 로그인
- [ ] 첫 배포 실행
- [ ] 환경 변수 설정
  - [ ] VITE_REFMANAGER_API_URL (선택)
  - [ ] VITE_GOOGLE_CLIENT_ID / VITE_GOOGLE_API_KEY (Drive 사용 시)
  - [ ] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (Supabase 사용 시)
- [ ] Base44에 CORS 도메인 추가
- [ ] (선택) Supabase Auth 사용 시 Redirect URL 등록
- [ ] Google OAuth Authorized JavaScript origins에 배포 도메인 추가 (Drive 사용 시)
- [ ] RefManager에서 PDF Annotator URL로 링크 업데이트
- [ ] 통합 테스트 (RefManager → PDF Annotator)

---

## 🐛 문제 해결

### 빌드 에러
```cmd
# 로컬에서 빌드 테스트
npm run build

# 빌드 결과 미리보기
npm run preview
```

### 환경 변수 문제
- Vite 환경 변수는 반드시 `VITE_` 접두사 필요
- 배포 후 환경 변수 변경 시 재배포 필요

### CORS 에러
- Base44 Functions에 배포된 PDF Annotator 도메인 추가 필요
- 브라우저 개발자 도구에서 정확한 에러 확인

---

## 📊 배포 후 RefManager 연동

Base44 RefManager의 References 페이지에 버튼 추가:

```javascript
// References.jsx
const openPDFAnnotator = (reference) => {
  const token = getBase44AuthToken();
  const url = new URL('https://refmanager-pdf-annotator.vercel.app/');
  url.searchParams.set('referenceId', reference.id);
  url.searchParams.set('token', token);
  if (reference.title) url.searchParams.set('title', reference.title);
  if (reference.pdf_url) url.searchParams.set('pdfUrl', reference.pdf_url);
  
  window.open(url.toString(), '_blank');
};

// UI
{reference.pdf_url && (
  <button onClick={() => openPDFAnnotator(reference)}>
    📄 PDF 보기
  </button>
)}
```
