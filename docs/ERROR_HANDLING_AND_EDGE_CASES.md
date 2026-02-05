# 에러 처리 및 엣지 케이스

> API_REFERENCE.md Section 4 (에러 처리)와 함께 사용.
> Live View / Test Lab / Signal 관련 에러 코드 및 엣지 케이스 정의.
>
> Last Updated: 2026-02-02

---

## 1. 공통 에러 응답 형식

API_REFERENCE.md와 동일:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {},
    "origin": "Proxy",
    "request_id": "req_xxx",
    "timestamp": "2026-01-31T12:00:00Z"
  }
}
```

---

## 2. Live View / Test Lab 전용 에러 코드

### 2.1 Live View

| 코드 | HTTP | 설명 |
|------|------|------|
| `NOT_FOUND_AGENT` | 404 | agent_id에 해당하는 에이전트 없음 |
| `NOT_FOUND_SNAPSHOT` | 404 | snapshot_id 없음 |
| `VALIDATION_AGENT_DELETED` | 400 | 이미 삭제된 에이전트에 대한 요청 |
| `VALIDATION_CONNECTION_DUPLICATE` | 409 | 동일 source→target 연결 이미 존재 |
| `VALIDATION_CONNECTION_SELF` | 400 | source와 target이 동일 |

### 2.2 Test Lab

| 코드 | HTTP | 설명 |
|------|------|------|
| `NOT_FOUND_CANVAS` | 404 | canvas_id 없음 |
| `NOT_FOUND_BOX` | 404 | box_id 없음 (캔버스 내) |
| `NOT_FOUND_TEST_RUN` | 404 | test_run_id 없음 |
| `VALIDATION_NO_START_BOX` | 400 | Input Data가 있는 시작 박스 없음 |
| `VALIDATION_EMPTY_INPUT_DATA` | 400 | 시작 박스에 Input Data 0건 |
| `VALIDATION_MISSING_SYSTEM_PROMPT` | 400 | 시작 박스에 System Prompt 미설정 |
| `VALIDATION_MISSING_MODEL` | 400 | 시작 박스에 Model 미설정 |
| `VALIDATION_CIRCULAR_REF` | 400 | 엣지 순환 참조 감지 |
| `VALIDATION_EDGE_INVALID_BOX` | 400 | edge의 source/target이 캔버스에 없음 |
| `VALIDATION_CSV_COLUMN_MISMATCH` | 422 | CSV 컬럼 매핑 실패 (필수 input 없음) |

### 2.3 Signal / Webhook

| 코드 | HTTP | 설명 |
|------|------|------|
| `SIGNAL_WEBHOOK_TIMEOUT` | 200* | Webhook 타임아웃 (응답 본문에 signal_result 실패 포함) |
| `SIGNAL_WEBHOOK_FAILED` | 200* | Webhook HTTP 4xx/5xx (평가 실패로 처리) |
| `SIGNAL_EVALUATION_ERROR` | 200* | Signal 평가 중 예외 (해당 Signal만 FAIL 처리) |

\* 실제 API는 200으로 응답하고, snapshot/test_result 내 `signal_result`에 실패 상태 기록.

---

## 3. 엣지 케이스 및 동작

### 3.1 Live View

| 케이스 | 동작 |
|--------|------|
| 스냅샷 0건 | agents 목록 빈 배열, Empty State UI |
| 에이전트 30개 초과 | List View 권장, API는 그대로 목록 반환 |
| 삭제된 에이전트 | `is_deleted: true`, 목록에서 제외 옵션(쿼리) |
| 동일 System Prompt 재호출 | 기존 agent_id 재사용, 스냅샷만 추가 |
| trace_id 없음 | 수동 연결만 가능, 자동 화살표 없음 |

### 3.2 Test Lab

| 케이스 | 동작 |
|--------|------|
| 캔버스 박스 0개 | Empty State, Run API 호출 시 `VALIDATION_NO_START_BOX` |
| Input Data 없는 박스만 있음 | [▶ Test] 비활성화, Run 시 `VALIDATION_NO_START_BOX` |
| 시작 박스에 Input Data 0건 | Run 시 `VALIDATION_EMPTY_INPUT_DATA` |
| System Prompt / Model 미설정 | Run 시 `VALIDATION_MISSING_*` |
| 순환 참조 (A→B→C→A) | 엣지 저장 시 검증 가능 시 `VALIDATION_CIRCULAR_REF` (선택) |
| 병렬 후 합류 | order_number 동일한 엣지 여러 개 → 모두 완료 후 다음 단계 |
| 동일 박스로 여러 엣지 (같은 order) | 병렬로 처리 |

### 3.3 Load Test Data

| 케이스 | 동작 |
|--------|------|
| Live View 스냅샷 0건 | 빈 목록, "No snapshots" 메시지 |
| CSV 컬럼 매핑 불일치 | `VALIDATION_CSV_COLUMN_MISMATCH`, details에 필요한 필드 명시 |
| CSV 인코딩 오류 | 400, `VALIDATION_CSV_INVALID_ENCODING` |
| CSV 행 0건 | 400 또는 경고 후 빈 배열 반환 (정책 결정) |

### 3.4 Webhook Signal

| 케이스 | 동작 |
|--------|------|
| Webhook 타임아웃 | 해당 호출의 signal_result.webhook = { status: "FAIL", reason: "timeout" } |
| Webhook 4xx/5xx | status: "FAIL", reason: "http_error", details에 status_code |
| Webhook 응답 형식 다름 | 그대로 저장 (raw), Fail 판정은 설정된 조건으로만 |
| Webhook 미설정 (Signal 비활성화) | Webhook 평가 스킵 |

---

## 4. 재시도 / 폴백 규칙

| 대상 | 재시도 | 폴백 |
|------|--------|------|
| API 5xx | 클라이언트: 최대 2회 exponential backoff | 사용자에게 "일시 오류" 안내 |
| API 429 | Retry-After 헤더 있으면 해당 초 후 1회 재시도 | Rate limit 안내 |
| Webhook Signal | 재시도 없음 (1회 실패 = 해당 건 FAIL) | signal_result에 실패 기록 |
| LLM 호출 (테스트 실행 중) | 백엔드 정책 (예: 1회 재시도) | test_result에 error_message 기록 |

---

## 5. 클라이언트 권장 처리

### 5.1 Run Test 전 검증 (프론트)

- 시작 박스 존재 여부 (Input Data 있는 박스 ≥ 1)
- 해당 박스에 System Prompt, Model 설정 여부
- Input Data 건수 > 0

위 미충족 시 Run 버튼 비활성화 또는 클릭 시 경고.

### 5.2 에러 메시지 표시

- `VALIDATION_*`: 폼 필드 옆 또는 토스트로 메시지 표시
- `NOT_FOUND_*`: "해당 리소스를 찾을 수 없습니다" + 새로고침 유도
- `SIGNAL_*`: 결과 상세에 "Signal 평가 실패" 표시, raw/ reason 노출

---

## 6. 구현용 세부 정의

### 6.1 에러 응답 상세 (message / details)

구현 시 아래 문구와 details 구조를 사용하면 클라이언트 처리와 i18n에 유리함.

| 코드 | message (영문) | details 예시 |
|------|----------------|--------------|
| `NOT_FOUND_AGENT` | Agent not found. | `{ "agent_id": "hash_xxx" }` |
| `NOT_FOUND_SNAPSHOT` | Snapshot not found. | `{ "snapshot_id": "snap_xxx" }` |
| `VALIDATION_AGENT_DELETED` | Agent has been deleted. | `{ "agent_id": "hash_xxx" }` |
| `VALIDATION_CONNECTION_DUPLICATE` | Connection already exists between these agents. | `{ "source_agent_id": "...", "target_agent_id": "..." }` |
| `VALIDATION_CONNECTION_SELF` | Source and target cannot be the same. | `{ "agent_id": "..." }` |
| `NOT_FOUND_CANVAS` | Canvas not found. | `{ "canvas_id": "canvas_xxx" }` |
| `NOT_FOUND_BOX` | Box not found in this canvas. | `{ "canvas_id": "...", "box_id": "box_xxx" }` |
| `NOT_FOUND_TEST_RUN` | Test run not found. | `{ "test_run_id": "run_xxx" }` |
| `VALIDATION_NO_START_BOX` | No box with input data to start the test. | `{ "canvas_id": "..." }` |
| `VALIDATION_EMPTY_INPUT_DATA` | Start box has no input data rows. | `{ "box_id": "box_xxx" }` |
| `VALIDATION_MISSING_SYSTEM_PROMPT` | Start box has no system prompt. | `{ "box_id": "box_xxx" }` |
| `VALIDATION_MISSING_MODEL` | Start box has no model selected. | `{ "box_id": "box_xxx" }` |
| `VALIDATION_CIRCULAR_REF` | Edges form a cycle; chain cannot be ordered. | `{ "edge_ids": ["e1","e2","e3"] }` |
| `VALIDATION_EDGE_INVALID_BOX` | Edge references a box not in this canvas. | `{ "edge_id": "...", "source_or_target": "source" \| "target", "box_id": "..." }` |
| `VALIDATION_CSV_COLUMN_MISMATCH` | CSV must have a column mappable to input. | `{ "required_field": "input", "detected_columns": ["a","b"] }` |
| `VALIDATION_CSV_INVALID_ENCODING` | CSV encoding could not be detected. | `{}` |
| `VALIDATION_CSV_EMPTY` | CSV has no data rows. | `{ "row_count": 0 }` |

### 6.2 API별 검증 순서 (백엔드)

**POST /test-lab/run**

1. `canvas_id` 존재 여부 → `NOT_FOUND_CANVAS`
2. `start_box_id`가 해당 캔버스의 박스인지 → `NOT_FOUND_BOX`
3. 해당 박스에 `input_data_ids` 길이 > 0 → `VALIDATION_EMPTY_INPUT_DATA`
4. 해당 박스에 `system_prompt` 비어 있지 않음 → `VALIDATION_MISSING_SYSTEM_PROMPT`
5. 해당 박스에 `model` 비어 있지 않음 → `VALIDATION_MISSING_MODEL`
6. (선택) 엣지 위상 정렬 가능 여부(순환 없음) → `VALIDATION_CIRCULAR_REF`
7. 통과 시 실행

**PUT /test-lab/canvases/{id}** (boxes/edges 저장)

1. `canvas_id` 존재 → `NOT_FOUND_CANVAS`
2. 모든 `edges`의 `source`, `target`이 `boxes`의 `id`에 존재 → `VALIDATION_EDGE_INVALID_BOX` (첫 번째 오류 엣지 기준)
3. (선택) 순환 참조 여부 → `VALIDATION_CIRCULAR_REF`
4. 통과 시 저장

**POST /live-view/connections**

1. `source_agent_id` ≠ `target_agent_id` → `VALIDATION_CONNECTION_SELF`
2. 두 agent_id가 프로젝트에 존재(삭제되지 않음) → `NOT_FOUND_AGENT` / `VALIDATION_AGENT_DELETED`
3. 동일 (source, target) 연결 없음 → `VALIDATION_CONNECTION_DUPLICATE`
4. 통과 시 생성

**POST /test-lab/import-csv**

1. 파일 존재 및 크기 제한 → 400 generic 또는 `VALIDATION_CSV_*`
2. 인코딩 감지 (UTF-8 등) → `VALIDATION_CSV_INVALID_ENCODING`
3. 헤더 파싱 후 `input`(또는 매핑된 필드) 존재 → `VALIDATION_CSV_COLUMN_MISMATCH`
4. 데이터 행 수 > 0 → `VALIDATION_CSV_EMPTY` (정책에 따라 0행 허용 시 스킵)
5. 통과 시 import_id 및 행 수 반환

### 6.3 Signal 실패 시 저장 형식 (signal_result)

구현 시 snapshot/test_result의 `signal_result` JSONB에 아래 형태로 기록.

**Webhook 타임아웃**

```json
{
  "webhook": {
    "status": "FAIL",
    "reason": "timeout",
    "timeout_ms": 5000,
    "raw": null
  }
}
```

**Webhook HTTP 실패**

```json
{
  "webhook": {
    "status": "FAIL",
    "reason": "http_error",
    "http_status": 500,
    "raw": null
  }
}
```

**Webhook 성공 (응답 그대로 저장)**

```json
{
  "webhook": {
    "status": "SAFE",
    "reason": null,
    "raw": { "pass": true, "score": 0.9, "reason": "OK" }
  }
}
```

**일반 Signal 평가 예외**

```json
{
  "length_change": { "status": "SAFE", "value": 0.1 },
  "custom_rubric": {
    "status": "FAIL",
    "reason": "evaluation_error",
    "detail": "Evaluator model returned invalid JSON"
  }
}
```

- `status`: `"SAFE"` \| `"FAIL"` \| `"NEEDS_REVIEW"` (정책에 따라)
- 하나라도 FAIL이면 해당 스냅샷/테스트 결과는 `is_worst = true`로 저장

### 6.4 상수 및 한계값

| 항목 | 값 | 비고 |
|------|-----|------|
| Webhook 타임아웃 기본값 | 5000 ms | Signal 설정에서 변경 가능 |
| Webhook 최대 타임아웃 | 30000 ms | |
| CSV 최대 파일 크기 | 10 MB | |
| CSV 최대 행 수 (한 번에) | 10000 | 초과 시 400 또는 청크 업로드 정책 |
| Run Test 동기 대기 최대 | 300000 ms (5분) | 초과 시 202 + polling 권장 |
| 클라이언트 5xx 재시도 | 최대 2회 | exponential backoff: 1s, 2s |
| 클라이언트 429 재시도 | 1회 | `Retry-After` 초 후 |

### 6.5 엣지 케이스 처리 흐름 (프론트)

| 케이스 | 프론트 동작 |
|--------|-------------|
| GET agents → 빈 배열 | Empty State UI, "No agents yet" 메시지 |
| GET snapshots → 빈 배열 | "No snapshots" + 기간/필터 안내 |
| GET test-lab/results → 빈 배열 | "No results yet. Run a test." |
| Run 클릭 시 start_box에 input_data 없음 | 버튼 비활성화(이미 적용) 또는 클릭 시 토스트: "Load input data for the start box." |
| Run 응답 400 VALIDATION_* | 토스트/인라인에 `error.message` 표시, 필요 시 `details.box_id`로 해당 박스 포커스 |
| Run 응답 202 | 결과 페이지로 이동 또는 polling `GET .../runs/{id}` until status=completed/failed |
| Webhook 실패(signal_result 내) | 결과 상세에서 해당 행에 "Signal: Webhook failed (timeout)" 등 표시, `raw` 접기/펼치기 |

### 6.6 순환 참조 검사 (의사코드)

```text
1. edges로 방향 그래프 구성 (source → target).
2. 위상 정렬 시도 (Kahn 또는 DFS).
3. 정렬 결과 노드 수 < 전체 노드 수 → 순환 있음 → VALIDATION_CIRCULAR_REF.
4. 정렬 성공 시 order_number 순서대로 실행 순서 결정.
```

---

*이 문서는 API_REFERENCE.md Section 4 및 API_SPEC.md와 함께 사용됩니다.*
