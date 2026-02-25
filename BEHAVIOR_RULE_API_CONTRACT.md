# Behavior Rule API Contract & Frontend Form Mapping

**문서 목적**: Behavior Rule 생성/수정을 위한 백엔드 API 계약과 프론트엔드 폼 필드 매핑 명세서  
**작성일**: 2026-02-17  
**대상**: 프론트엔드 개발자 (안티그래비티)

---

## 1. MVP Rule Schema 1.0 개요

### 1.1 Rule 구조
모든 Behavior Rule은 다음 공통 필드를 가집니다:

```typescript
interface BehaviorRuleCommon {
  id: string;                    // UUID, 생성 시 자동 할당
  project_id: number;            // Path parameter
  name: string;                  // 필수, 1-200자
  description?: string;          // 선택, 최대 1000자
  enabled: boolean;              // 기본값: true
  scope_type: 'project' | 'agent' | 'canvas';  // 기본값: 'project'
  scope_ref?: string;            // scope_type이 'agent'일 때 agent_id, 'canvas'일 때 canvas_id
  severity_default?: 'low' | 'medium' | 'high' | 'critical';
  rule_json: RuleJSON;           // 필수, 규칙 타입별 spec 포함
  created_at: string;            // ISO 8601 datetime
  updated_at?: string;           // ISO 8601 datetime (수정 시)
}
```

### 1.2 Rule JSON 구조
`rule_json` 필드는 다음 구조를 가집니다:

```typescript
interface RuleJSON {
  type: 'tool_forbidden' | 'tool_order' | 'tool_args_schema';
  name?: string;                 // Rule 이름 (중복 가능, UI 표시용)
  severity?: 'low' | 'medium' | 'high' | 'critical';  // rule_json 내부 severity (상위 severity_default보다 우선)
  spec: RuleSpec;                // 타입별 상세 규격
}
```

---

## 2. Rule 타입별 상세 명세

### 2.1 tool_forbidden (금지 도구)

**목적**: 특정 도구의 사용을 금지합니다.

**rule_json 예시**:
```json
{
  "type": "tool_forbidden",
  "name": "No shell exec in prod",
  "severity": "critical",
  "spec": {
    "tools": ["shell.exec", "os.system", "eval"]
  }
}
```

**TypeScript 타입**:
```typescript
interface ToolForbiddenSpec {
  tools: string[];  // 금지할 도구 이름 배열 (최소 1개)
}
```

**검증 로직**:
- `steps` 배열에서 `step_type === 'tool_call'`이고 `tool_name`이 `spec.tools`에 포함된 경우 위반
- 위반 시: `severity`는 `rule_json.severity` 또는 `severity_default` 또는 기본값 `'critical'`

---

### 2.2 tool_order (도구 호출 순서)

**목적**: 특정 도구가 다른 도구보다 먼저 호출되어야 함을 보장합니다.

**rule_json 예시**:
```json
{
  "type": "tool_order",
  "name": "Search before Answer",
  "severity": "high",
  "spec": {
    "must_happen_before": [
      {
        "tool": "web.search",
        "before_tool": "final_answer"
      },
      {
        "tool": "db.query",
        "before_tool": "final_answer"
      }
    ]
  }
}
```

**TypeScript 타입**:
```typescript
interface ToolOrderSpec {
  must_happen_before: Array<{
    tool: string;           // 먼저 호출되어야 하는 도구
    before_tool: string;   // 나중에 호출되어야 하는 도구
  }>;  // 최소 1개
}
```

**검증 로직**:
- 각 `must_happen_before` 항목에 대해:
  - `tool`의 첫 번째 `step_order`가 `before_tool`의 첫 번째 `step_order`보다 작아야 함
  - 위반 시: `severity`는 `rule_json.severity` 또는 `severity_default` 또는 기본값 `'high'`

---

### 2.3 tool_args_schema (도구 인자 스키마 검증)

**목적**: 특정 도구의 인자가 JSON Schema를 만족하는지 검증합니다.

**rule_json 예시**:
```json
{
  "type": "tool_args_schema",
  "name": "CreateUser args schema",
  "severity": "critical",
  "spec": {
    "tool": "create_user",
    "json_schema": {
      "type": "object",
      "required": ["email", "org_id"],
      "properties": {
        "email": {
          "type": "string",
          "pattern": "^[^@]+@[^@]+\\.[^@]+$"
        },
        "org_id": {
          "type": "string"
        }
      },
      "additionalProperties": false
    }
  }
}
```

**TypeScript 타입**:
```typescript
interface ToolArgsSchemaSpec {
  tool: string;              // 검증 대상 도구 이름
  json_schema: {
    type: 'object';
    required?: string[];     // 필수 필드 배열
    properties?: Record<string, PropertySchema>;
    additionalProperties?: boolean;  // 기본값: true (허용)
    // 기타 JSON Schema 필드 지원 (pattern, enum, min/max 등)
  };
}

interface PropertySchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  pattern?: string;         // 정규식 (string 타입)
  enum?: any[];            // 허용 값 목록
  minLength?: number;       // string/array 최소 길이
  maxLength?: number;       // string/array 최대 길이
  minimum?: number;         // number 최소값
  maximum?: number;         // number 최대값
  // 기타 JSON Schema 속성
}
```

**검증 로직**:
- `steps` 배열에서 `step_type === 'tool_call'`이고 `tool_name === spec.tool`인 경우:
  - `tool_args`가 `json_schema`를 만족하는지 검증
  - `required` 필드 누락 시 위반
  - `additionalProperties: false`일 때 스키마에 없는 필드 존재 시 위반
  - `pattern`, `enum` 등 속성 위반 시 위반
- 위반 시: `severity`는 `rule_json.severity` 또는 `severity_default` 또는 기본값 `'critical'`

---

## 3. 백엔드 API 계약

### 3.1 List Rules

**Endpoint**: `GET /api/v1/projects/{project_id}/behavior/rules`

**Query Parameters**:
- `enabled?: boolean` (optional) - 필터링: true면 활성화된 규칙만, false면 비활성화된 규칙만
- `scope_type?: 'project' | 'agent' | 'canvas'` (optional) - scope 타입 필터
- `scope_ref?: string` (optional) - scope 참조값 필터 (예: `agent_id`)

**Response (200 OK)**:
```typescript
Array<{
  id: string;
  project_id: number;
  name: string;
  description: string | null;
  scope_type: string;
  scope_ref: string | null;
  severity_default: string | null;
  rule_json: RuleJSON;
  enabled: boolean;
  created_at: string;  // ISO 8601
}>
```

---

### 3.2 Create Rule

**Endpoint**: `POST /api/v1/projects/{project_id}/behavior/rules`

**Request Body**:
```typescript
{
  name: string;                    // 필수, 1-200자
  description?: string;             // 선택, 최대 1000자
  scope_type?: 'project' | 'agent' | 'canvas';  // 기본값: 'project'
  scope_ref?: string;               // 선택, scope_type에 따라 agent_id 또는 canvas_id
  severity_default?: 'low' | 'medium' | 'high' | 'critical';
  rule_json: RuleJSON;              // 필수
  enabled?: boolean;                // 기본값: true
}
```

**Response (201 Created)**:
```typescript
{
  id: string;
  project_id: number;
  name: string;
  description: string | null;
  scope_type: string;
  scope_ref: string | null;
  severity_default: string | null;
  rule_json: RuleJSON;
  enabled: boolean;
  created_at: string;  // ISO 8601
}
```

**에러 응답**:
- `400 Bad Request`: 필수 필드 누락 또는 유효성 검증 실패
- `401 Unauthorized`: 인증 실패
- `403 Forbidden`: ADMIN 또는 OWNER 권한 필요
- `404 Not Found`: 프로젝트 없음

---

### 3.3 Update Rule

**Endpoint**: `PUT /api/v1/projects/{project_id}/behavior/rules/{rule_id}`

**Request Body** (모든 필드 선택):
```typescript
{
  name?: string;                    // 1-200자
  description?: string;             // 최대 1000자
  scope_type?: 'project' | 'agent' | 'canvas';
  scope_ref?: string;
  severity_default?: 'low' | 'medium' | 'high' | 'critical';
  rule_json?: RuleJSON;
  enabled?: boolean;
}
```

**Response (200 OK)**:
```typescript
{
  id: string;
  project_id: number;
  name: string;
  description: string | null;
  scope_type: string;
  scope_ref: string | null;
  severity_default: string | null;
  rule_json: RuleJSON;
  enabled: boolean;
  created_at: string;  // ISO 8601
}
```

**에러 응답**:
- `400 Bad Request`: 유효성 검증 실패
- `401 Unauthorized`: 인증 실패
- `403 Forbidden`: ADMIN 또는 OWNER 권한 필요
- `404 Not Found`: 규칙 없음

---

### 3.4 Delete Rule

**Endpoint**: `DELETE /api/v1/projects/{project_id}/behavior/rules/{rule_id}`

**Response (204 No Content)**: 본문 없음

**에러 응답**:
- `401 Unauthorized`: 인증 실패
- `403 Forbidden`: ADMIN 또는 OWNER 권한 필요
- `404 Not Found`: 규칙 없음

---

### 3.5 Validate Behavior

**Endpoint**: `POST /api/v1/projects/{project_id}/behavior/validate`

**Request Body**:
```typescript
{
  trace_id?: string;              // Production trace ID (trace_id 또는 test_run_id 중 하나 필수)
  test_run_id?: string;            // Test Lab run ID
  rule_ids?: string[];            // 선택: 특정 규칙 ID만 검증 (없으면 활성화된 모든 규칙)
  baseline_run_ref?: string;       // 선택: 비교용 baseline run 참조
}
```

**Response (200 OK)**:
```typescript
{
  report_id: string;
  status: 'pass' | 'fail';
  summary: {
    status: 'pass' | 'fail';
    step_count: number;
    rule_count: number;
    violation_count: number;
    severity_breakdown: {
      critical: number;
      high: number;
      medium: number;
      low: number;
    };
    runtime: {
      steps_with_latency: number;
      avg_latency_ms: number | null;
      max_latency_ms: number | null;
      duration_ms?: number | null;
    };
    target: {
      type: 'trace' | 'test_run';
      trace_id?: string;
      test_run_id?: string;
    };
    run_meta?: {
      run_id: string;
      name: string;
      status: string;
      test_type: string;
      version_tag?: string;
      canvas_id?: string;
      created_at: string;
      total_count: number;
      pass_count: number;
      fail_count: number;
    };
  };
  violations: Array<{
    rule_id: string;
    rule_name: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    step_ref: number;
    message: string;
    evidence: {
      tool?: string;
      before_tool?: string;
      args?: Record<string, any>;
      missing_fields?: string[];
      extra_fields?: string[];
      step_context?: {
        prev: StepInfo | null;
        current: StepInfo | null;
        next: StepInfo | null;
      };
    };
    human_hint?: string;
  }>;
}
```

**에러 응답**:
- `400 Bad Request`: trace_id와 test_run_id가 모두 없음
- `401 Unauthorized`: 인증 실패
- `404 Not Found`: trace 또는 test_run 없음

---

### 3.6 Compare Behavior (Run vs Run)

**Endpoint**: `POST /api/v1/projects/{project_id}/behavior/compare`

**Request Body**:
```typescript
{
  baseline_test_run_id: string;    // 필수: 기준이 되는 test run ID
  candidate_test_run_id: string;   // 필수: 비교 대상 test run ID
  rule_ids?: string[];             // 선택: 특정 규칙 ID만 비교
}
```

**Response (200 OK)**:
```typescript
{
  baseline_run_id: string;
  candidate_run_id: string;
  baseline_summary: {
    status: 'pass' | 'fail';
    step_count: number;
    rule_count: number;
    violation_count: number;
    severity_breakdown: {
      critical: number;
      high: number;
      medium: number;
      low: number;
    };
  };
  candidate_summary: {
    status: 'pass' | 'fail';
    step_count: number;
    rule_count: number;
    violation_count: number;
    severity_breakdown: {
      critical: number;
      high: number;
      medium: number;
      low: number;
    };
  };
  violation_count_delta: number;   // candidate - baseline
  severity_delta: {
    critical: number;              // candidate - baseline
    high: number;
    medium: number;
    low: number;
  };
  top_regressed_rules: Array<{
    rule_id: string;
    rule_name: string;
    baseline_violations: number;
    candidate_violations: number;
    delta: number;                 // candidate - baseline
  }>;
  first_broken_step: number | null; // 가장 먼저 깨진 step_order
  is_regressed: boolean;            // violation_count_delta > 0
}
```

**에러 응답**:
- `400 Bad Request`: 필수 필드 누락
- `401 Unauthorized`: 인증 실패
- `404 Not Found`: baseline 또는 candidate test run 없음

---

### 3.7 CI Gate

**Endpoint**: `POST /api/v1/projects/{project_id}/behavior/ci-gate`

**목적**: CI/CD 파이프라인에서 사용할 수 있는 gate 엔드포인트. Threshold 기반으로 pass/fail 판정.

**Request Body**:
```typescript
{
  baseline_test_run_id?: string;   // 선택: 비교 모드일 때 기준 run
  candidate_test_run_id: string;   // 필수: 검증 대상 run
  rule_ids?: string[];              // 선택: 특정 규칙만 검증
  thresholds?: {
    // 절대값 모드 (baseline 없을 때)
    critical?: number;              // critical violations 최대 허용 개수
    high?: number;
    medium?: number;
    low?: number;
    
    // 비교 모드 (baseline 있을 때) - 증가량 제한
    critical_delta?: number;        // critical violations 증가량 최대 허용
    high_delta?: number;
    medium_delta?: number;
    low_delta?: number;
  };
}
```

**Response (200 OK)**:
```typescript
{
  pass: boolean;                    // Gate 통과 여부
  exit_code: 0 | 1;                // CI에서 사용할 exit code (0: pass, 1: fail)
  report_id: string;                // 생성된 리포트 ID
  report_url: string;               // 리포트 조회 URL
  summary: {
    // validate API와 동일한 summary 구조
  };
  violations: Array<{
    // validate API와 동일한 violations 구조
  }>;
  failure_reasons: string[];       // 실패 시 이유 목록
  thresholds_used: Record<string, number>;  // 사용된 threshold 설정
  compare_mode: boolean;            // 비교 모드 여부
}
```

**사용 예시**:

1. **절대값 모드** (baseline 없음):
```json
{
  "candidate_test_run_id": "run-123",
  "thresholds": {
    "critical": 0,
    "high": 2,
    "medium": 10
  }
}
```
→ critical 0개, high 2개 이하, medium 10개 이하 허용

2. **비교 모드** (baseline 있음):
```json
{
  "baseline_test_run_id": "run-100",
  "candidate_test_run_id": "run-123",
  "thresholds": {
    "critical_delta": 0,
    "high_delta": 1
  }
}
```
→ baseline 대비 critical 증가 0개, high 증가 1개 이하 허용

**에러 응답**:
- `400 Bad Request`: 필수 필드 누락
- `401 Unauthorized`: 인증 실패
- `404 Not Found`: candidate test run 없음

---

### 3.8 Report Export

**Endpoint**: `GET /api/v1/projects/{project_id}/behavior/reports/{report_id}/export`

**Query Parameters**:
- `format: 'json' | 'csv'` (default: `json`)

**Response**:
- `json`: 리포트 전체 메타 + summary + violations JSON
- `csv`: 위반사항 flatten CSV (rule/severity/step/message 기준)

---

## 4. 프론트엔드 폼 필드 매핑

### 4.1 Rule 생성/수정 폼 구조

#### 4.1.1 공통 필드 (모든 Rule 타입)

| 필드명 | 타입 | 필수 | 기본값 | 설명 | UI 컴포넌트 |
|--------|------|------|--------|------|-------------|
| `name` | `string` | ✅ | - | 규칙 이름 (1-200자) | TextInput (required, maxLength=200) |
| `description` | `string` | ❌ | `null` | 규칙 설명 (최대 1000자) | TextArea (maxLength=1000) |
| `scope_type` | `'project' \| 'agent' \| 'canvas'` | ❌ | `'project'` | 규칙 적용 범위 | Select/Dropdown |
| `scope_ref` | `string` | 조건부 | `null` | `scope_type`이 'agent' 또는 'canvas'일 때 필수 | TextInput 또는 Agent/Canvas 선택기 |
| `severity_default` | `'low' \| 'medium' \| 'high' \| 'critical'` | ❌ | `null` | 기본 심각도 | Select/Dropdown |
| `enabled` | `boolean` | ❌ | `true` | 활성화 여부 | Toggle/Switch |
| `rule_json.type` | `'tool_forbidden' \| 'tool_order' \| 'tool_args_schema'` | ✅ | - | 규칙 타입 | Select/Dropdown (템플릿 선택) |
| `rule_json.name` | `string` | ❌ | - | Rule JSON 내부 이름 (UI 표시용) | TextInput |
| `rule_json.severity` | `'low' \| 'medium' \| 'high' \| 'critical'` | ❌ | - | Rule JSON 내부 심각도 (상위 severity_default보다 우선) | Select/Dropdown |

---

#### 4.1.2 tool_forbidden 전용 필드

| 필드명 | 타입 | 필수 | 설명 | UI 컴포넌트 |
|--------|------|------|------|-------------|
| `rule_json.spec.tools` | `string[]` | ✅ | 금지할 도구 이름 배열 (최소 1개) | MultiSelect 또는 TagInput (도구 이름 입력 후 추가) |

**UI 예시**:
```
Rule Type: [tool_forbidden ▼]

Forbidden Tools:
  [shell.exec] [×]
  [os.system] [×]
  [+ Add Tool] [입력 필드]

  입력 예: "eval" → Enter → 태그 추가
```

---

#### 4.1.3 tool_order 전용 필드

| 필드명 | 타입 | 필수 | 설명 | UI 컴포넌트 |
|--------|------|------|------|-------------|
| `rule_json.spec.must_happen_before` | `Array<{tool: string, before_tool: string}>` | ✅ | 순서 제약 배열 (최소 1개) | 동적 리스트 (각 항목: Tool A → Tool B) |

**UI 예시**:
```
Rule Type: [tool_order ▼]

Order Constraints:
  ┌─────────────────────────────────────┐
  │ Tool A: [web.search        ▼]      │
  │ must happen before                  │
  │ Tool B: [final_answer      ▼]      │
  │                              [×]    │
  └─────────────────────────────────────┘
  ┌─────────────────────────────────────┐
  │ Tool A: [db.query          ▼]      │
  │ must happen before                  │
  │ Tool B: [final_answer      ▼]      │
  │                              [×]    │
  └─────────────────────────────────────┘
  [+ Add Constraint]
```

---

#### 4.1.4 tool_args_schema 전용 필드

| 필드명 | 타입 | 필수 | 설명 | UI 컴포넌트 |
|--------|------|------|------|-------------|
| `rule_json.spec.tool` | `string` | ✅ | 검증 대상 도구 이름 | TextInput 또는 Dropdown (도구 목록에서 선택) |
| `rule_json.spec.json_schema` | `object` | ✅ | JSON Schema 객체 | 하이브리드 폼 (간단 필드) + JSON 에디터 (고급) |

**UI 예시 (간단 모드)**:
```
Rule Type: [tool_args_schema ▼]

Target Tool: [create_user ▼]

Schema Definition:
  Mode: [Simple Form ▼] | JSON Editor

  Required Fields:
    [email] [×]
    [org_id] [×]
    [+ Add Required Field]

  Field Properties:
    ┌─────────────────────────────────────┐
    │ Field: [email]                      │
    │ Type: [string ▼]                    │
    │ Pattern: [^[^@]+@[^@]+\\.[^@]+$]   │
    │                              [×]    │
    └─────────────────────────────────────┘
    ┌─────────────────────────────────────┐
    │ Field: [org_id]                      │
    │ Type: [string ▼]                     │
    │                              [×]     │
    └─────────────────────────────────────┘
    [+ Add Field]

  Allow Extra Fields: [✓] (toggle)

  [Switch to JSON Editor]
```

**UI 예시 (JSON 에디터 모드)**:
```
Rule Type: [tool_args_schema ▼]

Target Tool: [create_user ▼]

Schema Definition:
  Mode: Simple Form | [JSON Editor ▼]

  ┌─────────────────────────────────────┐
  │ {                                   │
  │   "type": "object",                 │
  │   "required": ["email", "org_id"],   │
  │   "properties": {                   │
  │     "email": {                      │
  │       "type": "string",             │
  │       "pattern": "^[^@]+@[^@]+\\.." │
  │     },                              │
  │     "org_id": {                     │
  │       "type": "string"              │
  │     }                               │
  │   },                                │
  │   "additionalProperties": false     │
  │ }                                   │
  └─────────────────────────────────────┘

  [Validate JSON] [Switch to Simple Form]
```

---

### 4.2 폼 제출 흐름

#### 4.2.1 Rule 생성

1. 사용자가 Rule Type 선택 (`tool_forbidden`, `tool_order`, `tool_args_schema`)
2. 타입별 전용 필드 표시
3. 공통 필드 + 타입별 필드 입력
4. "Validate" 버튼 클릭 → 클라이언트 측 유효성 검증
5. "Create Rule" 버튼 클릭 → `behaviorAPI.createRule(projectId, payload)` 호출
6. 성공 시: 규칙 목록으로 리다이렉트 또는 모달 닫기
7. 실패 시: 에러 메시지 표시

**Payload 예시 (tool_forbidden)**:
```typescript
{
  name: "No shell exec in prod",
  description: "Prevent execution of shell commands in production",
  scope_type: "project",
  severity_default: "critical",
  rule_json: {
    type: "tool_forbidden",
    name: "No shell exec in prod",
    severity: "critical",
    spec: {
      tools: ["shell.exec", "os.system", "eval"]
    }
  },
  enabled: true
}
```

**Payload 예시 (tool_order)**:
```typescript
{
  name: "Search before Answer",
  description: "Ensure search tools are called before final answer",
  scope_type: "project",
  severity_default: "high",
  rule_json: {
    type: "tool_order",
    name: "Search before Answer",
    severity: "high",
    spec: {
      must_happen_before: [
        { tool: "web.search", before_tool: "final_answer" },
        { tool: "db.query", before_tool: "final_answer" }
      ]
    }
  },
  enabled: true
}
```

**Payload 예시 (tool_args_schema)**:
```typescript
{
  name: "CreateUser args schema",
  description: "Validate create_user tool arguments",
  scope_type: "project",
  severity_default: "critical",
  rule_json: {
    type: "tool_args_schema",
    name: "CreateUser args schema",
    severity: "critical",
    spec: {
      tool: "create_user",
      json_schema: {
        type: "object",
        required: ["email", "org_id"],
        properties: {
          email: {
            type: "string",
            pattern: "^[^@]+@[^@]+\\.[^@]+$"
          },
          org_id: {
            type: "string"
          }
        },
        additionalProperties: false
      }
    }
  },
  enabled: true
}
```

---

#### 4.2.2 Rule 수정

1. 기존 규칙 데이터 로드 (`behaviorAPI.listRules` 또는 개별 조회)
2. 폼에 기존 값 채우기
3. 사용자가 필드 수정
4. "Validate" 버튼 클릭 → 클라이언트 측 유효성 검증
5. "Update Rule" 버튼 클릭 → `behaviorAPI.updateRule(projectId, ruleId, payload)` 호출
6. 성공 시: 규칙 목록으로 리다이렉트 또는 모달 닫기
7. 실패 시: 에러 메시지 표시

**주의**: `updateRule`의 payload는 변경된 필드만 포함하면 됩니다 (PATCH 방식).

---

### 4.3 UI/UX 권장사항

#### 4.3.1 Rule Type 선택
- Rule Type 선택 시 타입별 설명 툴팁 표시:
  - `tool_forbidden`: "특정 도구의 사용을 금지합니다"
  - `tool_order`: "도구 호출 순서를 강제합니다"
  - `tool_args_schema`: "도구 인자의 JSON Schema를 검증합니다"

#### 4.3.2 Validate 버튼
- 폼 하단에 "Validate" 버튼 배치
- 클릭 시 클라이언트 측 유효성 검증 수행:
  - 필수 필드 체크
  - 타입별 spec 유효성 체크
  - JSON Schema 유효성 체크 (tool_args_schema의 경우)
- 검증 결과를 인라인으로 표시 (성공/실패 메시지)

#### 4.3.3 JSON Preview
- 폼 우측 또는 하단에 "JSON Preview" 섹션 추가
- 실시간으로 `rule_json` 객체를 JSON 문자열로 표시
- JSON 에디터 모드 (tool_args_schema)에서는 편집 가능

#### 4.3.4 에러 처리
- 백엔드 에러 응답 시 필드별 에러 메시지 표시
- 네트워크 에러 시 재시도 안내
- 403 Forbidden 시 권한 안내 메시지

---

## 5. 프론트엔드 API 클라이언트 사용법

### 5.1 현재 구현 상태

프론트엔드 `frontend/lib/api.ts`에 `behaviorAPI`가 이미 구현되어 있습니다:

```typescript
export const behaviorAPI = {
  listRules: async (projectId: number, params?: { enabled?: boolean }) => { ... },
  createRule: async (projectId: number, data: {...}) => { ... },
  updateRule: async (projectId: number, ruleId: string, data: {...}) => { ... },
  deleteRule: async (projectId: number, ruleId: string) => { ... },
  listReports: async (projectId: number, params?: {...}) => { ... },
  validate: async (projectId: number, data: {...}) => { ... },
  compare: async (projectId: number, data: {
    baseline_test_run_id: string;
    candidate_test_run_id: string;
    rule_ids?: string[];
  }) => { ... },
  ciGate: async (projectId: number, data: {
    baseline_test_run_id?: string;
    candidate_test_run_id: string;
    rule_ids?: string[];
    thresholds?: {
      critical?: number;
      high?: number;
      medium?: number;
      low?: number;
      critical_delta?: number;
      high_delta?: number;
      medium_delta?: number;
      low_delta?: number;
    };
  }) => { ... },
};
```

### 5.2 사용 예시

```typescript
import { behaviorAPI } from '@/lib/api';

// Rule 생성
const newRule = await behaviorAPI.createRule(projectId, {
  name: "No shell exec",
  description: "Prevent shell execution",
  scope_type: "project",
  severity_default: "critical",
  rule_json: {
    type: "tool_forbidden",
    spec: {
      tools: ["shell.exec", "eval"]
    }
  },
  enabled: true
});

// Rule 수정
await behaviorAPI.updateRule(projectId, ruleId, {
  enabled: false
});

// Rule 삭제
await behaviorAPI.deleteRule(projectId, ruleId);

// Rule 목록 조회
const rules = await behaviorAPI.listRules(projectId, { enabled: true });

// Validate 실행
const validationResult = await behaviorAPI.validate(projectId, {
  test_run_id: "run-123",
  rule_ids: ["rule-1", "rule-2"]
});

// Compare 실행 (Run vs Run)
const compareResult = await behaviorAPI.compare(projectId, {
  baseline_test_run_id: "run-100",
  candidate_test_run_id: "run-123"
});

// CI Gate 실행
const gateResult = await behaviorAPI.ciGate(projectId, {
  candidate_test_run_id: "run-123",
  thresholds: {
    critical: 0,
    high: 2,
    medium: 10
  }
});
```

---

## 6. 검증 및 테스트 체크리스트

### 6.1 클라이언트 측 검증 (프론트엔드)

- [ ] `name` 필수 체크 (1-200자)
- [ ] `description` 최대 길이 체크 (1000자)
- [ ] `scope_type`이 'agent' 또는 'canvas'일 때 `scope_ref` 필수 체크
- [ ] `rule_json.type` 필수 체크
- [ ] `tool_forbidden`: `spec.tools` 배열 최소 1개 체크
- [ ] `tool_order`: `spec.must_happen_before` 배열 최소 1개 체크, 각 항목의 `tool`/`before_tool` 필수 체크
- [ ] `tool_args_schema`: `spec.tool` 필수 체크, `spec.json_schema` 유효성 체크 (JSON Schema 표준 준수)

### 6.2 서버 측 검증 (백엔드)

백엔드는 다음을 검증합니다:
- [x] `name`: 1-200자 (Pydantic `Field(min_length=1, max_length=200)`)
- [x] `description`: 최대 1000자 (Pydantic `Field(max_length=1000)`)
- [x] `scope_type`: enum 체크 (코드상으로는 문자열, 실제 값은 'project'/'agent'/'canvas')
- [x] `rule_json`: 필수, Dict 타입
- [x] 권한 체크: CREATE/UPDATE/DELETE는 ADMIN 또는 OWNER만 가능

---

## 7. 참고 자료

- **PRD**: `PRD_AGENT_BEHAVIOR_VALIDATION.md`
- **백엔드 API**: `backend/app/api/v1/endpoints/behavior.py`
- **백엔드 모델**: `backend/app/models/behavior_rule.py`
- **프론트엔드 API 클라이언트**: `frontend/lib/api.ts` (behaviorAPI 섹션)

---

## 8. 프론트엔드 UI/UX 가이드

### 8.1 Compare 기능 UI

#### 8.1.1 Compare 버튼 위치
- **Test Lab 결과 화면**: 각 Test Run 카드에 "Compare" 버튼 추가
- **Behavior Hub**: 리포트 목록에서 두 리포트 선택 후 "Compare" 버튼 활성화

#### 8.1.2 Compare 모달/페이지 구조

```
┌─────────────────────────────────────────────────┐
│ Compare: Run-100 vs Run-123                     │
├─────────────────────────────────────────────────┤
│                                                 │
│ Baseline: Run-100                              │
│   Status: ✅ PASS                               │
│   Violations: 2 (critical: 0, high: 1, ...)   │
│                                                 │
│ Candidate: Run-123                             │
│   Status: ❌ FAIL                               │
│   Violations: 5 (critical: 1, high: 2, ...)    │
│                                                 │
│ ─────────────────────────────────────────────  │
│                                                 │
│ Delta Summary:                                  │
│   ⚠️  Violations increased by +3                │
│   🔴 Critical: +1 (0 → 1)                      │
│   🟠 High: +1 (1 → 2)                          │
│   🟡 Medium: +1 (1 → 2)                         │
│                                                 │
│ Top Regressed Rules:                            │
│   1. "No shell exec"                            │
│      Baseline: 0 violations                    │
│      Candidate: 1 violation                    │
│      [+1]                                       │
│                                                 │
│   2. "Search before Answer"                     │
│      Baseline: 1 violation                     │
│      Candidate: 2 violations                   │
│      [+1]                                       │
│                                                 │
│ First Broken Step: Step #5                      │
│   [View Step Details]                          │
│                                                 │
│ [View Full Report] [Export Diff]               │
└─────────────────────────────────────────────────┘
```

#### 8.1.3 구현 가이드

**컴포넌트 위치**: `frontend/components/behavior/CompareView.tsx` (신규 생성)

**주요 기능**:
1. 두 Test Run 선택 UI (드롭다운 또는 검색)
2. `behaviorAPI.compare()` 호출
3. Delta 시각화 (증가/감소 색상 구분)
4. Top Regressed Rules 리스트
5. First Broken Step 하이라이트 및 링크

**상태 관리**:
```typescript
const [baselineRunId, setBaselineRunId] = useState<string>('');
const [candidateRunId, setCandidateRunId] = useState<string>('');
const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
const [isLoading, setIsLoading] = useState(false);

const handleCompare = async () => {
  setIsLoading(true);
  try {
    const result = await behaviorAPI.compare(projectId, {
      baseline_test_run_id: baselineRunId,
      candidate_test_run_id: candidateRunId
    });
    setCompareResult(result);
  } catch (error) {
    // 에러 처리
  } finally {
    setIsLoading(false);
  }
};
```

---

### 8.2 CI Gate 기능 UI

#### 8.2.1 CI Gate 설정 UI

**위치**: Test Lab 실행 결과 화면 또는 Behavior Hub 설정 페이지

**UI 구조**:
```
┌─────────────────────────────────────────────────┐
│ CI/CD Gate Configuration                        │
├─────────────────────────────────────────────────┤
│                                                 │
│ Mode: ○ Absolute Threshold  ● Compare Mode     │
│                                                 │
│ Baseline Run: [Select Run ▼]                   │
│                                                 │
│ Thresholds:                                     │
│   Critical: [0] violations                     │
│   High:      [2] violations                    │
│   Medium:    [10] violations                    │
│   Low:       [50] violations                   │
│                                                 │
│ (Compare Mode일 때)                              │
│   Critical Delta: [0] (no increase allowed)    │
│   High Delta:     [1] (max +1 increase)        │
│   Medium Delta:   [5] (max +5 increase)        │
│                                                 │
│ [Test Gate] [Save Configuration]                │
│                                                 │
│ Example CI Script:                               │
│ ┌─────────────────────────────────────────────┐ │
│ │ curl -X POST \                              │ │
│ │   -H "Authorization: Bearer $TOKEN" \       │ │
│ │   -d '{"candidate_test_run_id":"run-123",   │ │
│ │        "thresholds":{"critical":0}}' \      │ │
│ │   $API_URL/behavior/ci-gate                 │ │
│ │                                             │ │
│ │ if [ $? -ne 0 ]; then                       │ │
│ │   echo "Gate failed"                        │ │
│ │   exit 1                                    │ │
│ │ fi                                          │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

#### 8.2.2 CI Gate 실행 결과 UI

**위치**: Test Lab 실행 결과 화면 또는 별도 Gate Results 페이지

**UI 구조**:
```
┌─────────────────────────────────────────────────┐
│ CI Gate Result: Run-123                         │
├─────────────────────────────────────────────────┤
│                                                 │
│ Status: ❌ FAILED                                │
│ Exit Code: 1                                    │
│                                                 │
│ Thresholds Used:                               │
│   Critical: 0 violations (actual: 1) ❌         │
│   High: 2 violations (actual: 2) ✅             │
│                                                 │
│ Failure Reasons:                                │
│   • CRITICAL violations: 1 (threshold: 0)      │
│                                                 │
│ [View Full Report] [View Violations]            │
│                                                 │
│ Report ID: report-abc123                        │
│ Report URL: /behavior?report_id=report-abc123   │
│                                                 │
│ [Copy CI Command] [Download Report]             │
└─────────────────────────────────────────────────┘
```

#### 8.2.3 구현 가이드

**컴포넌트 위치**:
- `frontend/components/behavior/CIGateConfig.tsx` (설정 UI)
- `frontend/components/behavior/CIGateResult.tsx` (결과 표시)

**주요 기능**:
1. Threshold 입력 폼 (Absolute 또는 Compare 모드)
2. `behaviorAPI.ciGate()` 호출
3. Pass/Fail 상태 시각화
4. Failure Reasons 리스트
5. CI 스크립트 예시 표시 및 복사

**상태 관리**:
```typescript
const [mode, setMode] = useState<'absolute' | 'compare'>('absolute');
const [baselineRunId, setBaselineRunId] = useState<string>('');
const [thresholds, setThresholds] = useState({
  critical: 0,
  high: 2,
  medium: 10,
  low: 50
});
const [gateResult, setGateResult] = useState<CIGateResult | null>(null);

const handleRunGate = async (candidateRunId: string) => {
  const result = await behaviorAPI.ciGate(projectId, {
    baseline_test_run_id: mode === 'compare' ? baselineRunId : undefined,
    candidate_test_run_id: candidateRunId,
    thresholds
  });
  setGateResult(result);
};
```

---

### 8.3 리포트 상세 화면 개선

#### 8.3.1 리포트 리스트 개선

**현재**: 리포트 목록에 기본 정보만 표시  
**개선**: Compare 버튼, CI Gate 실행 버튼 추가

```
┌─────────────────────────────────────────────────┐
│ Behavior Reports                                │
├─────────────────────────────────────────────────┤
│                                                 │
│ Report #1 - Run-123                            │
│   Status: ❌ FAIL                                │
│   Violations: 5 (critical: 1, high: 2)         │
│   Created: 2026-02-17 10:30                    │
│   [View] [Compare] [Run CI Gate]              │
│                                                 │
│ Report #2 - Run-100                            │
│   Status: ✅ PASS                                │
│   Violations: 2 (high: 1, medium: 1)          │
│   Created: 2026-02-17 09:15                    │
│   [View] [Compare] [Run CI Gate]              │
│                                                 │
└─────────────────────────────────────────────────┘
```

#### 8.3.2 리포트 상세 화면 개선

**위치**: `frontend/app/organizations/[orgId]/projects/[projectId]/behavior/page.tsx`

**추가 기능**:
1. "Compare with..." 드롭다운 (다른 리포트 선택)
2. "Run CI Gate" 버튼 (현재 리포트 기준)
3. Violations 리스트에 step_context 표시 개선
4. Top Regressed Rules 섹션 (compare 결과가 있을 때)

---

### 8.4 Test Lab 통합

#### 8.4.1 Test Lab 실행 결과 화면

**위치**: `frontend/app/organizations/[orgId]/projects/[projectId]/test-lab/page.tsx`

**추가 버튼**:
- "Validate Run" 버튼 (기존)
- "Compare with Baseline" 버튼 (신규)
- "Run CI Gate" 버튼 (신규)

**UI 배치**:
```
┌─────────────────────────────────────────────────┐
│ Test Run: Run-123                               │
├─────────────────────────────────────────────────┤
│                                                 │
│ [Run Test] [Validate Run] [Compare] [CI Gate]   │
│                                                 │
│ Behavior Validation:                            │
│   Status: ❌ FAIL                                │
│   Violations: 5                                 │
│   [View Report]                                │
│                                                 │
│ Compare:                                        │
│   Baseline: [Select Run ▼]                     │
│   [Compare Now]                                 │
│                                                 │
│ CI Gate:                                        │
│   [Configure Gate] [Run Gate]                  │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

### 8.5 사용자 플로우 예시

#### 플로우 1: Compare 기능 사용
1. Test Lab에서 두 개의 Run 실행 (baseline, candidate)
2. Candidate Run 결과 화면에서 "Compare" 버튼 클릭
3. Baseline Run 선택 드롭다운에서 기준 Run 선택
4. Compare 결과 확인 (Delta, Top Regressed Rules)
5. First Broken Step 클릭하여 상세 확인

#### 플로우 2: CI Gate 설정 및 실행
1. Behavior Hub에서 "CI Gate Configuration" 메뉴 클릭
2. Threshold 설정 (Absolute 또는 Compare 모드)
3. "Test Gate" 버튼으로 테스트 실행
4. CI 스크립트 예시 복사
5. CI/CD 파이프라인에 스크립트 추가
6. PR 생성 시 자동으로 Gate 실행

#### 플로우 3: 리포트 기반 비교
1. Behavior Hub에서 리포트 목록 확인
2. 두 리포트 선택 (체크박스)
3. "Compare Selected" 버튼 클릭
4. Compare 결과 모달에서 상세 확인
5. Export Diff로 결과 저장

---

### 8.6 Behavior > Agents (추천 IA: Agents는 메인 탭이 아니라 Behavior 하위로 흡수)

#### 8.6.1 목적
- **Agents를 독립 메인 섹션으로 두지 않고**, Behavior Hub 안에서 “에이전트별 진입점(인덱스)”으로 제공한다.
- 쐐기(Agent Behavior Validation) 동선을 흐리지 않으면서도, 사용자가 “내 에이전트별로 규칙/리포트/검증”을 빠르게 할 수 있게 만든다.

#### 8.6.2 정보구조(IA)

- **프로젝트 상단 내비(메인 탭)**: `Live View` / `Test Lab` / `Behavior`
- **Behavior Hub 내부 탭**: `Rules` / `Reports` / `Agents`

```mermaid
flowchart TD
  P[Project] --> LV[Live View]
  P --> TL[Test Lab]
  P --> BH[Behavior Hub]

  BH --> BHTabs{Tabs}
  BHTabs --> Rules[Rules]
  BHTabs --> Reports[Reports]
  BHTabs --> Agents[Agents]

  Agents --> AgentDetail[Agent Detail Panel]
  AgentDetail --> AgentRules[Agent-scoped Rules]
  AgentDetail --> AgentActions[Quick Actions]
  AgentActions --> OpenLV[Open Live View (agent filter)]
  AgentActions --> VTrace[Validate latest Trace]
  AgentActions --> VRun[Validate latest Test Run]
```

#### 8.6.3 화면 와이어(텍스트)

**Behavior > Agents 탭 (좌: 리스트 / 우: 상세 패널)**
- 좌측: 에이전트 리스트(실데이터) + 검색/정렬
- 우측: 선택된 agent의 액션 + agent-scope 규칙 링크

권장 카드 필드(목업 KPI 제거, wedge 친화 KPI로 교체):
- Runs: `total`
- Worst: `worst_count`
- Last seen: `last_seen`
- Model: `model` (가능하면)
- Signals: `signals` (가능하면)

#### 8.6.4 “/agents” 라우트 처리
- `/organizations/{orgId}/projects/{projectId}/agents`는 유지하되:
  - **권장**: `/behavior?tab=agents`로 리다이렉트(또는 “이동되었습니다” 안내 화면)
- 상단 내비(`LaboratoryNavbar`)에서 `Agents` 메인 탭은 제거/숨김 권장

---

### 8.7 Behavior > Agents 구현을 위한 최소 API 호출/데이터 매핑

> 원칙: “새로운 Agents 백엔드 엔티티/CRUD”를 만들지 않고, **이미 있는 집계 API + Behavior Rule 스코프(agent)**로 MVP를 완성한다.

#### 8.7.1 Agents 리스트 데이터 소스 (실데이터)
- **API**: `GET /api/v1/projects/{project_id}/live-view/agents`
- **프론트 클라이언트**: `liveViewAPI.getAgents(projectId, limit?)`
- **주요 필드 매핑**
  - `agent_id` → 카드/선택 키
  - `display_name` → 카드 타이틀
  - `model` → 카드 보조 정보
  - `total` → Runs
  - `worst_count` → Worst
  - `last_seen` → Last seen
  - `signals` → (선택) 미니 배지/툴팁

#### 8.7.2 Agent-scoped Rules (핵심: scope_type/ scope_ref)
- **API**: `GET /api/v1/projects/{project_id}/behavior/rules`
  - 서버 필터 파라미터 지원:
    - `scope_type=agent`
    - `scope_ref={agent_id}`
  - 프론트 대체 방식(호환용):
    - `scope_type === 'agent' && scope_ref === agent_id` 클라이언트 필터
- **생성 시 payload 규칙**
  - `scope_type = "agent"`
  - `scope_ref = "{agent_id}"`

#### 8.7.3 Validate latest Trace (agent 기준)
- 목표: 선택된 agent의 최신 trace를 찾아 `behavior/validate` 실행
- **Step 1 (latest trace 찾기)**:
  - **API**: `GET /api/v1/projects/{project_id}/snapshots?agent_id={agent_id}&limit=1&offset=0`
  - **프론트**: `liveViewAPI.listSnapshots(projectId, { agent_id, limit: 1, offset: 0 })`
  - 응답의 첫 item에서 `trace_id`를 사용
- **Step 2 (validate 실행)**:
  - **API**: `POST /api/v1/projects/{project_id}/behavior/validate`
  - body: `{ "trace_id": "<latest_trace_id>" }`

#### 8.7.4 Validate latest Test Run (agent 기준)
- 목표: 선택된 agent의 최신 test_run을 찾아 `behavior/validate` 실행
- **Step 1 (latest run 찾기)**:
  - **API**: `GET /api/v1/projects/{project_id}/test-lab/results?agent_id={agent_id}&limit=1&offset=0`
  - **프론트**: `testLabAPI.listResults(projectId, { agent_id, limit: 1, offset: 0 })`
  - 응답의 첫 item에서 `test_run_id`를 사용
- **Step 2 (validate 실행)**:
  - **API**: `POST /api/v1/projects/{project_id}/behavior/validate`
  - body: `{ "test_run_id": "<latest_test_run_id>" }`

#### 8.7.5 (선택) Open Live View (agent 필터)
- 링크 정책(권장):
  - Live View 라우트에 `?agent_id=...` 쿼리로 전달 (또는 내부 상태로 전달)
- 목적:
  - “관측(스냅샷/trace)” → “검증(behavior validate)”로 이어지는 동선을 짧게 유지

---

### 8.8 제약 및 후속 개선(정직한 MVP 경계)

#### 8.8.1 Agent별 Reports 리스트
현재 `GET /behavior/reports`는 agent_id 필터가 없고, `BehaviorReport`에도 agent_id가 1급 필드로 저장되지 않는다.
- **MVP 권장**: Agents 탭에서는 “최근 리포트 리스트”는 링크/요약 수준으로만 제공하거나 생략
- **v1.1 제안**:
  - (A) `behavior_reports`에 `agent_id`(nullable) 컬럼 추가 + validate 시 대표 agent_id 저장
  - 또는 (B) `GET /behavior/reports?agent_id=...` 필터 지원 (서버에서 steps/violations 기반 조인/추론)

---

## 9. 변경 이력

- **2026-02-17**: 초안 작성 (MVP Rule Schema 1.0 기반)
- **2026-02-17**: Compare API 및 CI Gate API 추가, 프론트엔드 UI/UX 가이드 추가
- **2026-02-17**: Behavior > Agents IA/와이어, 최소 API 매핑(실데이터 기반) 섹션 추가
- **2026-02-17**: Agents 흡수 구현 완료 (메인 탭 제거, `/agents` 리다이렉트, Behavior > Agents 기본 UI, Compare/CI Gate 실행 UI, rules scope 서버 필터 추가)
- **2026-02-18**: Behavior hardening 반영 (`trajectory_steps` 영속화, `behavior_reports.agent_id/ruleset_hash`, reports 필터(agent_id/status), report export(JSON/CSV))
