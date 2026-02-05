# AgentGuard API 세부 스펙

> Live View, Test Lab, Snapshots, Test Run 관련 API의 Request/Response 스키마.
> SCHEMA_SPEC.md 및 API_REFERENCE.md와 함께 사용.
>
> Last Updated: 2026-02-02

---

## 1. 공통 규칙

- **Base path**: `/api/v1`
- **Content-Type**: `application/json`
- **인증**: `Authorization: Bearer <token>` 또는 `X-API-Key: <key>` (SDK)
- **필드 네이밍**: snake_case (SCHEMA_SPEC.md와 동일)

---

## 2. Live View API

### 2.1 에이전트 목록 (박스 목록)

#### GET /api/v1/projects/{project_id}/live-view/agents

**설명**: System Prompt 기준으로 그룹핑된 에이전트(박스) 목록. 30개 초과 시 list_view 권장.

**Query**:
| 파라미터 | 타입 | 기본값 | 설명 |
|----------|------|--------|------|
| view_mode | string | "box" | "box" \| "list" |
| include_deleted | boolean | false | 삭제된 박스 포함 여부 |

**Response** `200 OK`:
```json
{
  "data": [
    {
      "agent_id": "hash_abc123",
      "display_name": "Classifier",
      "system_prompt_preview": "You are a classifier...",
      "total_calls": 328,
      "worst_count": 12,
      "success_rate": 0.96,
      "is_deleted": false,
      "created_at": "2026-01-15T10:00:00Z"
    }
  ],
  "meta": {
    "total": 15,
    "view_mode": "box"
  }
}
```

**스키마**:
```typescript
interface LiveViewAgent {
  agent_id: string;           // system_prompt hash 또는 고유 ID
  display_name: string;       // 사용자 지정 또는 첫 20자
  system_prompt_preview: string;
  total_calls: number;
  worst_count: number;
  success_rate: number;       // 0.0 ~ 1.0
  is_deleted: boolean;
  created_at: string;         // ISO 8601
}
```

---

### 2.2 스냅샷 목록 (에이전트별)

#### GET /api/v1/projects/{project_id}/snapshots

**Query**:
| 파라미터 | 타입 | 설명 |
|----------|------|------|
| agent_id | string | 에이전트 필터 (선택) |
| is_worst | boolean | Worst만 (선택) |
| period | string | "7d" \| "30d" \| "90d" (기본: "7d") |
| limit | number | 기본 50, 최대 200 |
| offset | number | 페이지네이션 |

**Response** `200 OK`:
```json
{
  "data": [
    {
      "id": "snap_xxx",
      "project_id": "proj_1",
      "agent_id": "hash_abc123",
      "trace_id": "trace_123",
      "parent_span_id": null,
      "span_order": 1,
      "is_parallel": false,
      "system_prompt": "You are...",
      "user_message": "I want a refund",
      "model": "gpt-4o",
      "model_settings": {},
      "response": "category: refund_request",
      "latency_ms": 230,
      "tokens_used": 150,
      "cost": 0.002,
      "signal_result": { "length_change": { "status": "SAFE" }, "webhook": { "status": "CRITICAL", "raw": {} } },
      "is_worst": true,
      "worst_status": "unreviewed",
      "created_at": "2026-01-31T12:00:00Z"
    }
  ],
  "meta": { "total": 127, "limit": 50, "offset": 0 }
}
```

---

### 2.3 Live View 연결 (수동 화살표)

#### GET /api/v1/projects/{project_id}/live-view/connections

**Response** `200 OK`:
```json
{
  "data": [
    {
      "id": "conn_1",
      "source_agent_id": "hash_abc",
      "target_agent_id": "hash_def",
      "created_at": "2026-01-31T12:00:00Z"
    }
  ]
}
```

#### POST /api/v1/projects/{project_id}/live-view/connections

**Request**:
```json
{
  "source_agent_id": "hash_abc",
  "target_agent_id": "hash_def"
}
```

**Response** `201 Created`: 단일 connection 객체.

#### DELETE /api/v1/projects/{project_id}/live-view/connections/{connection_id}

**Response** `204 No Content`.

---

### 2.4 에이전트 설정 (이름, 삭제)

#### GET /api/v1/projects/{project_id}/live-view/agents/{agent_id}/settings

**Response** `200 OK`:
```json
{
  "data": {
    "agent_id": "hash_abc123",
    "display_name": "Classifier",
    "is_deleted": false
  }
}
```

#### PATCH /api/v1/projects/{project_id}/live-view/agents/{agent_id}/settings

**Request**:
```json
{
  "display_name": "Intent Classifier",
  "is_deleted": false
}
```

#### DELETE /api/v1/projects/{project_id}/live-view/agents/{agent_id}

**Request** (optional):
```json
{
  "keep_snapshots": true
}
```
- `keep_snapshots: true`: 박스만 제거, 스냅샷 유지
- `keep_snapshots: false`: 스냅샷도 삭제

**Response** `204 No Content`.

---

## 3. Test Lab API

### 3.1 캔버스

#### GET /api/v1/projects/{project_id}/test-lab/canvases

**Response** `200 OK`:
```json
{
  "data": [
    {
      "id": "canvas_1",
      "project_id": "proj_1",
      "name": "Default",
      "boxes": [],
      "edges": [],
      "created_at": "2026-01-31T12:00:00Z",
      "updated_at": "2026-01-31T12:00:00Z"
    }
  ]
}
```

#### POST /api/v1/projects/{project_id}/test-lab/canvases

**Request**:
```json
{
  "name": "My Canvas",
  "boxes": [
    {
      "id": "box_1",
      "label": "Classifier",
      "position": { "x": 100, "y": 100 },
      "system_prompt": "You are...",
      "model": "gpt-4o",
      "input_data_ids": [],
      "additional_data": []
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "source": "box_1",
      "target": "box_2",
      "order_number": 1
    }
  ]
}
```

**Response** `201 Created`: 단일 Canvas 객체.

#### PUT /api/v1/projects/{project_id}/test-lab/canvases/{canvas_id}

**Request**: `{ "name?", "boxes", "edges" }` (전체 치환).

**Response** `200 OK`: 업데이트된 Canvas.

---

### 3.2 박스(노드) 스키마

**DB 저장**: `test_lab_canvases.boxes` (JSONB 배열). 각 요소가 아래 `TestLabBox` 형식.  
**Additional Data 형식**: [ADDITIONAL_DATA_SPEC.md](ADDITIONAL_DATA_SPEC.md) 및 Section 6.

```typescript
interface TestLabBox {
  id: string;
  label: string;
  position: { x: number; y: number };
  system_prompt: string;
  model: string;
  input_data_ids: string[];      // Load한 Input Data ID 목록
  additional_data: AdditionalDataItem[];  // ADDITIONAL_DATA_SPEC.md
}
```

### 3.3 엣지(화살표) 스키마

```typescript
interface TestLabEdge {
  id: string;
  source: string;   // box id
  target: string;   // box id
  order_number: number;  // 화살표 머리 위 순서 (같으면 병렬)
}
```

---

### 3.4 테스트 실행 (Chain / Single)

#### POST /api/v1/projects/{project_id}/test-lab/run

**설명**: Input Data가 있는 시작 박스부터 체인 실행. 단일 박스면 해당 박스만 실행.

**Request**:
```json
{
  "canvas_id": "canvas_1",
  "start_box_id": "box_1",
  "signal_config_id": null,
  "signal_config_override": null
}
```
- `signal_config_id`: 프로젝트/에이전트 저장된 Signal 설정 ID (선택)
- `signal_config_override`: 이번 실행만 쓰는 Signal 설정 (선택)

**Response** `202 Accepted` (비동기) 또는 `200 OK` (동기):
```json
{
  "data": {
    "test_run_id": "run_xxx",
    "status": "running",
    "started_at": "2026-01-31T12:00:00Z"
  }
}
```

#### GET /api/v1/projects/{project_id}/test-lab/runs/{test_run_id}

**Response** `200 OK`:
```json
{
  "data": {
    "id": "run_xxx",
    "project_id": "proj_1",
    "canvas_id": "canvas_1",
    "status": "completed",
    "total_steps": 3,
    "completed_steps": 3,
    "results_count": 48,
    "created_at": "2026-01-31T12:00:00Z",
    "finished_at": "2026-01-31T12:01:00Z"
  }
}
```

---

### 3.5 테스트 결과 목록

#### GET /api/v1/projects/{project_id}/test-lab/results

**Query**:
| 파라미터 | 타입 | 설명 |
|----------|------|------|
| test_run_id | string | 특정 run만 |
| agent_id | string | 박스(에이전트) 필터 |
| is_worst | boolean | Worst만 |
| limit, offset | number | 페이지네이션 |

**Response** `200 OK`:
```json
{
  "data": [
    {
      "id": "res_xxx",
      "project_id": "proj_1",
      "agent_id": "box_1",
      "test_run_id": "run_xxx",
      "step_order": 1,
      "parent_step_id": null,
      "is_parallel": false,
      "input": "I want a refund",
      "system_prompt": "You are...",
      "model": "gpt-4o",
      "response": "category: refund_request",
      "latency_ms": 220,
      "tokens_used": 140,
      "cost": 0.002,
      "signal_result": {},
      "is_worst": false,
      "worst_status": null,
      "baseline_snapshot_id": null,
      "baseline_response": null,
      "created_at": "2026-01-31T12:00:30Z"
    }
  ],
  "meta": { "total": 48, "limit": 20, "offset": 0 }
}
```

---

### 3.6 Load Test Data (Input Data 소스)

#### GET /api/v1/projects/{project_id}/snapshots (재사용)

**Query**: `agent_id`, `is_worst`, `period`, `limit`, `offset` (Live View와 동일).

**용도**: Test Lab "Load from Live View Snapshots" 시 사용.

#### POST /api/v1/projects/{project_id}/test-lab/import-csv

**Request**: `multipart/form-data`
- `file`: CSV 파일
- `column_mapping`: JSON 문자열 `{ "input": "question" }` (선택, 자동 감지 실패 시)

**Response** `200 OK`:
```json
{
  "data": {
    "import_id": "imp_xxx",
    "rows_imported": 127,
    "columns_mapped": { "input": "question" }
  }
}
```

---

### 3.7 테스트 결과 저장 / Worst 마킹

#### POST /api/v1/projects/{project_id}/test-lab/results/save

**Request**:
```json
{
  "test_run_id": "run_xxx",
  "result_ids": ["res_1", "res_2"]
}
```
- `result_ids` 없으면 해당 run 전체 저장.

**Response** `200 OK`: `{ "data": { "saved": 48 } }`.

#### POST /api/v1/projects/{project_id}/test-lab/results/mark-worst

**Request**:
```json
{
  "result_ids": ["res_1", "res_2"]
}
```

**Response** `200 OK`: `{ "data": { "marked": 2 } }`.

---

## 4. Signal / Webhook

### 4.1 프로젝트 기본 Signal 설정

#### GET /api/v1/projects/{project_id}/signal-config/default

**Response** `200 OK`:
```json
{
  "data": {
    "signals": [
      { "type": "length_change", "config": { "threshold_percent": 50 }, "enabled": true },
      { "type": "latency_limit", "config": { "max_ms": 30000 }, "enabled": true }
    ]
  }
}
```

### 4.2 에이전트별 Signal 설정 (Live View)

#### GET /api/v1/projects/{project_id}/live-view/agents/{agent_id}/signal-config

**Response** `200 OK`: 위와 동일 구조. 없으면 프로젝트 기본값 반환.

#### PUT /api/v1/projects/{project_id}/live-view/agents/{agent_id}/signal-config

**Request**:
```json
{
  "signals": [
    { "type": "length_change", "config": { "threshold_percent": 50 }, "enabled": true },
    { "type": "webhook", "config": { "url": "https://...", "fail_condition": "pass_false" }, "enabled": true }
  ]
}
```

---

## 5. 스키마 요약 (TypeScript)

```typescript
// Live View
interface LiveViewAgent { agent_id: string; display_name: string; system_prompt_preview: string; total_calls: number; worst_count: number; success_rate: number; is_deleted: boolean; created_at: string; }
interface Snapshot { id: string; project_id: string; agent_id: string; trace_id?: string | null; parent_span_id?: string | null; span_order?: number | null; is_parallel?: boolean; system_prompt: string; user_message: string; model: string; model_settings?: object; response: string; latency_ms?: number | null; tokens_used?: number | null; cost?: number | null; signal_result?: object; is_worst: boolean; worst_status?: string | null; created_at: string; }

// Test Lab
interface Canvas { id: string; project_id: string; name: string; boxes: TestLabBox[]; edges: TestLabEdge[]; created_at: string; updated_at: string; }
interface TestLabBox { id: string; label: string; position: { x: number; y: number }; system_prompt: string; model: string; input_data_ids: string[]; additional_data: AdditionalDataItem[]; }
interface TestLabEdge { id: string; source: string; target: string; order_number: number; }
interface TestResult { id: string; project_id: string; agent_id: string; test_run_id: string; step_order?: number | null; parent_step_id?: string | null; is_parallel?: boolean; input: string; system_prompt: string; model: string; response: string; latency_ms?: number | null; tokens_used?: number | null; cost?: number | null; signal_result?: object; is_worst: boolean; worst_status?: string | null; baseline_snapshot_id?: string | null; baseline_response?: string | null; created_at: string; }
```

---

## 6. Additional Data 형식 (요약)

**상세**: [docs/ADDITIONAL_DATA_SPEC.md](ADDITIONAL_DATA_SPEC.md) 참조.

```typescript
interface AdditionalDataItem {
  id: string;
  type: "text" | "image" | "code" | "file";
  name?: string | null;
  content?: string | null;   // text/code
  url?: string | null;       // image/file: 업로드 후 URL
  language?: string | null;  // code
  mime_type?: string | null;
  size_bytes?: number | null;
}
```

### 6.1 파일 업로드 (image / file)

#### POST /api/v1/projects/{project_id}/upload

**Request**: `multipart/form-data`
- `file`: 파일 바이너리
- `type`: "image" | "file"
- `name`: 파일명 (선택)

**Response** `200 OK`:
```json
{
  "data": {
    "url": "https://storage.agentguard.ai/proj/xxx/adj_003.png",
    "mime_type": "image/png",
    "size_bytes": 102400
  }
}
```

---

*이 문서는 DETAILED_DESIGN.md Section 4, API_REFERENCE.md, ERROR_HANDLING_AND_EDGE_CASES.md, ADDITIONAL_DATA_SPEC.md와 함께 사용됩니다.*
