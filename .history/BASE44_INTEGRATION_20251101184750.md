# Base44 RefManager - PDF Annotator 연동 가이드

## 📋 개요

PDF Annotator 앱과 연동하기 위해 Base44 RefManager에 추가해야 할 Functions 목록입니다.

## 🏗️ 데이터 모델

### PdfAnnotation 엔티티 생성

Base44 앱에 다음 엔티티를 추가:

```javascript
const PdfAnnotation = {
  name: 'PdfAnnotation',
  fields: {
    id: { type: 'id', auto: true },
    reference_id: { 
      type: 'reference', 
      entity: 'Reference',
      required: true 
    },
    type: { 
      type: 'string', 
      required: true,
      validation: ['highlight', 'text_note', 'drawing']
    },
    page_number: { 
      type: 'number', 
      required: true 
    },
    content: { 
      type: 'text',
      default: '' 
    },
    position: { 
      type: 'json',
      required: true 
    },
    color: { 
      type: 'string',
      default: '#FFFF00' 
    },
    created_at: { 
      type: 'datetime', 
      default: 'now' 
    },
    updated_at: { 
      type: 'datetime', 
      auto: 'update' 
    }
  }
};
```

## 🔧 Functions 구현

### 1. getPdfInfo

PDF 정보를 반환하는 Function

```javascript
// functions/getPdfInfo.js
export default async function getPdfInfo({ referenceId }, { entities }) {
  const { Reference } = entities;
  
  // 참고문헌 조회
  const reference = await Reference.get(referenceId);
  
  if (!reference) {
    throw new Error('참고문헌을 찾을 수 없습니다.');
  }
  
  return {
    referenceId: reference.id,
    title: reference.title || '제목 없음',
    pdfUrl: reference.pdf_url || null,
    author_ids: reference.author_ids || [],
    year: reference.year || null,
  };
}
```

**Function 설정:**
- Method: POST
- Authentication: Required
- CORS: Enable for PDF Annotator domain

### 2. getAnnotations

참고문헌의 모든 주석을 반환

```javascript
// functions/getAnnotations.js
export default async function getAnnotations({ referenceId }, { entities }) {
  const { PdfAnnotation } = entities;
  
  // 참고문헌의 모든 주석 조회
  const annotations = await PdfAnnotation.find({
    reference_id: referenceId
  });
  
  return {
    success: true,
    annotations: annotations || []
  };
}
```

**Function 설정:**
- Method: POST
- Authentication: Required
- CORS: Enable

### 3. saveAnnotation

주석 생성 또는 업데이트

```javascript
// functions/saveAnnotation.js
export default async function saveAnnotation(data, { entities, user }) {
  const { PdfAnnotation, Reference } = entities;
  
  // 참고문헌 존재 여부 확인
  const reference = await Reference.get(data.reference_id);
  if (!reference) {
    throw new Error('참고문헌을 찾을 수 없습니다.');
  }
  
  // 기존 주석 업데이트 또는 새 주석 생성
  let annotation;
  if (data.id) {
    // 업데이트
    annotation = await PdfAnnotation.update(data.id, {
      type: data.type,
      page_number: data.page_number,
      content: data.content,
      position: data.position,
      color: data.color,
    });
  } else {
    // 생성
    annotation = await PdfAnnotation.create({
      reference_id: data.reference_id,
      type: data.type,
      page_number: data.page_number,
      content: data.content || '',
      position: data.position,
      color: data.color || '#FFFF00',
    });
  }
  
  return {
    success: true,
    annotation
  };
}
```

**Function 설정:**
- Method: POST
- Authentication: Required
- CORS: Enable

**입력 데이터 예시:**
```json
{
  "reference_id": "REF123",
  "type": "highlight",
  "page_number": 1,
  "content": "하이라이트된 텍스트",
  "position": {
    "rects": [
      { "x": 100, "y": 200, "width": 300, "height": 20 }
    ]
  },
  "color": "#FFFF00"
}
```

### 4. deleteAnnotation

주석 삭제

```javascript
// functions/deleteAnnotation.js
export default async function deleteAnnotation({ annotationId }, { entities }) {
  const { PdfAnnotation } = entities;
  
  // 주석 삭제
  await PdfAnnotation.delete(annotationId);
  
  return {
    success: true
  };
}
```

**Function 설정:**
- Method: POST
- Authentication: Required
- CORS: Enable

## 🔐 CORS 설정

모든 Functions에 CORS 헤더 추가:

```javascript
// 각 Function의 응답에 추가
export default async function yourFunction(data, context) {
  // ... 로직 ...
  
  return {
    headers: {
      'Access-Control-Allow-Origin': 'https://your-pdf-annotator.app',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    },
    // ... 응답 데이터 ...
  };
}
```

또는 Base44 앱 설정에서 전역 CORS 설정.

## 🔑 인증 처리

PDF Annotator는 URL 파라미터로 인증 토큰을 받습니다:

```javascript
// RefManager에서 PDF Annotator 호출 시
const token = await getBase44AuthToken(); // Base44 세션 토큰 가져오기

const url = new URL('https://your-pdf-annotator.app/');
url.searchParams.set('referenceId', referenceId);
url.searchParams.set('token', token);
url.searchParams.set('title', reference.title);
url.searchParams.set('pdfUrl', reference.pdf_url);

window.open(url.toString(), '_blank');
```

## 📊 Reference 엔티티 필드 추가 (선택)

Reference 엔티티에 PDF 관련 필드가 없다면 추가:

```javascript
// Reference 엔티티에 추가
{
  pdf_url: { 
    type: 'string',
    label: 'PDF URL' 
  },
  pdf_cached: { 
    type: 'boolean',
    default: false 
  }
}
```

## 🧪 테스트

### 1. getPdfInfo 테스트

```bash
curl -X POST https://your-refmanager.base44.app/api/functions/getPdfInfo \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"referenceId": "REF123"}'
```

### 2. saveAnnotation 테스트

```bash
curl -X POST https://your-refmanager.base44.app/api/functions/saveAnnotation \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reference_id": "REF123",
    "type": "highlight",
    "page_number": 1,
    "content": "테스트",
    "position": {"rects": [{"x": 100, "y": 200, "width": 300, "height": 20}]},
    "color": "#FFFF00"
  }'
```

## 📝 체크리스트

- [ ] PdfAnnotation 엔티티 생성
- [ ] getPdfInfo Function 구현
- [ ] getAnnotations Function 구현
- [ ] saveAnnotation Function 구현
- [ ] deleteAnnotation Function 구현
- [ ] CORS 설정 완료
- [ ] Reference 엔티티에 pdf_url 필드 확인
- [ ] Functions 테스트 완료
- [ ] PDF Annotator 앱에 API URL 설정
- [ ] 통합 테스트 완료

## 🚀 배포 후 설정

1. Base44에 Functions 배포
2. PDF Annotator 앱의 `.env` 파일 업데이트:
   ```
   VITE_REFMANAGER_API_URL=https://your-refmanager.base44.app/api
   ```
3. RefManager UI에 "PDF 보기" 버튼 추가
4. 통합 테스트 수행

## 🐛 문제 해결

### 인증 오류
- Base44 토큰이 올바르게 전달되는지 확인
- Token 만료 시간 확인

### CORS 오류
- CORS 헤더가 모든 Functions에 설정되어 있는지 확인
- 브라우저 콘솔에서 정확한 에러 확인

### 주석 저장 실패
- position 데이터 형식 확인
- PdfAnnotation 엔티티 필드 검증

## 📚 참고

- [Base44 Functions 문서](https://docs.base44.com/functions)
- [Base44 Entities 문서](https://docs.base44.com/entities)
- [PDF Annotator README](./README.md)
