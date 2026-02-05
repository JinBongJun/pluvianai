# Additional Data 형식 명세

> Test Lab 박스에서 "추가 첨부"용 데이터 (이미지, 코드, 파일 등).
> Input Data와 별도: Input Data는 테스트 시작용, Additional Data는 모든 테스트에 공통 첨부.
>
> Last Updated: 2026-02-02

---

## 1. 개요

| 구분 | 용도 | 예시 |
|------|------|------|
| **Input Data** | 테스트 케이스별 입력 (시작 박스) | 질문 목록, CSV 행들 |
| **Additional Data** | 해당 박스에 항상 첨부되는 데이터 | 이미지, 코드 파일, 참조 문서 |

- Additional Data만 있고 Input Data 없으면 [▶ Test] 비활성화.
- 체인 중간 박스: 체인 입력 + Additional Data(선택) 조합 가능.

---

## 2. 지원 타입

| type | 설명 | 저장 형태 | 최대 크기 (권장) |
|------|------|-----------|------------------|
| `text` | 일반 텍스트 | DB 문자열 | 64KB |
| `code` | 코드 조각 (언어 지정) | DB 문자열 + language | 256KB |
| `image` | 이미지 | URL (업로드 후) 또는 base64* | 10MB |
| `file` | 기타 파일 (PDF 등) | URL (업로드 후) | 20MB |

\* base64는 개발/소량용. 프로덕션은 업로드 후 URL 권장.

---

## 3. 스키마 (TypeScript)

```typescript
interface AdditionalDataItem {
  id: string;                    // 클라이언트 생성 UUID
  type: "text" | "code" | "image" | "file";
  name?: string | null;          // 파일명, 라벨 (예: "reference.py")
  content?: string | null;       // text, code: 본문
  url?: string | null;          // image, file: 업로드 후 URL
  language?: string | null;      // code: "python" | "javascript" | "typescript" | "json" | ...
  mime_type?: string | null;     // file: "application/pdf", "text/plain" 등
  size_bytes?: number | null;    // file/image: 바이트 (선택)
}

// API 요청 시 (업로드 미처리)
interface AdditionalDataItemRequest {
  id: string;
  type: "text" | "code" | "image" | "file";
  name?: string | null;
  content?: string | null;       // text/code
  url?: string | null;           // 이미 업로드된 URL 재사용
  language?: string | null;
  mime_type?: string | null;
  // image/file 신규 업로드: multipart 별도 필드로 전송 후 url 반환
}
```

---

## 4. JSON 표현 (DB/API)

박스 저장 시 `additional_data` 필드 예시:

```json
[
  {
    "id": "adj_001",
    "type": "text",
    "name": "context",
    "content": "This is a reference paragraph..."
  },
  {
    "id": "adj_002",
    "type": "code",
    "name": "main.py",
    "content": "def hello():\n    print('world')",
    "language": "python"
  },
  {
    "id": "adj_003",
    "type": "image",
    "name": "screenshot.png",
    "url": "https://storage.agentguard.ai/proj/xxx/adj_003.png",
    "mime_type": "image/png",
    "size_bytes": 102400
  },
  {
    "id": "adj_004",
    "type": "file",
    "name": "doc.pdf",
    "url": "https://storage.agentguard.ai/proj/xxx/adj_004.pdf",
    "mime_type": "application/pdf",
    "size_bytes": 524288
  }
]
```

---

## 5. 업로드 플로우 (image / file)

1. **클라이언트**: `POST /api/v1/projects/{project_id}/upload` (multipart/form-data)
   - 필드: `file`, `type` (image | file), `name` (선택)
2. **서버**: 스토리지 저장 후 URL 반환
   - Response: `{ "data": { "url": "https://...", "mime_type": "...", "size_bytes": 12345 } }`
3. **클라이언트**: 박스 저장 시 `additional_data`에 `{ type, url, name, mime_type, size_bytes }` 포함

---

## 6. LLM 호출 시 전달 형식

테스트 실행 시 백엔드가 LLM API에 넘길 때:

- **text**: `messages` 또는 별도 필드에 텍스트로 포함
- **code**: `content`에 코드 블록 문자열로 포함 (language는 메타데이터)
- **image**: Vision API면 `image_url` 또는 `base64`로 포함
- **file**: PDF 등은 텍스트 추출 후 포함하거나, 지원 시 멀티모달로 전달

(실제 LLM별 포맷은 백엔드 구현 시 결정.)

---

## 7. 제약 사항

| 항목 | 제한 |
|------|------|
| 박스당 Additional Data 개수 | 최대 20개 (권장) |
| text/code content 길이 | 각 64KB / 256KB (권장) |
| image/file 크기 | 각 10MB / 20MB (권장) |
| 지원 언어 (code) | python, javascript, typescript, json, markdown, plaintext 등 |

---

## 8. DB/API 스키마와의 연결

### 8.1 DB 저장 위치

**테이블**: `test_lab_canvases`  
**컬럼**: `boxes` (JSONB)

- `boxes`는 박스 배열. 각 박스가 `additional_data` 필드를 가짐.
- `additional_data`는 위 `AdditionalDataItem[]` 형식의 JSON 배열.
- 별도 테이블 없이 박스 객체 내에 인라인 저장.

**예시 (DB에 저장되는 boxes JSONB 한 요소)**:
```json
{
  "id": "box_1",
  "label": "Classifier",
  "position": { "x": 100, "y": 100 },
  "system_prompt": "You are a classifier...",
  "model": "gpt-4o",
  "input_data_ids": ["snap_1", "snap_2"],
  "additional_data": [
    {
      "id": "adj_001",
      "type": "text",
      "name": "context",
      "content": "Reference paragraph..."
    },
    {
      "id": "adj_002",
      "type": "image",
      "name": "screenshot.png",
      "url": "https://storage.agentguard.ai/...",
      "mime_type": "image/png",
      "size_bytes": 102400
    }
  ]
}
```

### 8.2 API 연동

| 계층 | 필드 | 형식 |
|------|------|------|
| **API Request** (PUT canvas) | `body.boxes[].additional_data` | `AdditionalDataItem[]` |
| **API Response** (GET canvas) | `data.boxes[].additional_data` | 동일 |
| **DB** | `test_lab_canvases.boxes` (JSONB) | 동일 구조 직렬화 |

- **업로드**: `POST /api/v1/projects/{project_id}/upload` → 반환된 `url` 등을 박스의 `additional_data` 항목에 넣어 저장.
- **캔버스 저장**: `PUT .../test-lab/canvases/{id}` 시 `boxes` 전체(각 박스의 `additional_data` 포함)를 그대로 전송.

### 8.3 관련 문서

- **DETAILED_DESIGN.md** Section 3.1: `test_lab_canvases` 테이블 정의, Box JSONB 스키마 주석.
- **API_SPEC.md** Section 3.2, 6: `TestLabBox.additional_data`, 업로드 엔드포인트.

---

*이 문서는 API_SPEC.md Section 6, DETAILED_DESIGN.md Section 3 (DB 설계) 및 Test Lab 설계와 함께 사용됩니다.*
