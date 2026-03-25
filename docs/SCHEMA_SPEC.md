# PluvianAI API Schema Specification

> **중요**: 이 문서는 프론트엔드와 백엔드 간의 공식 스키마 계약입니다.
> 모든 API 응답은 이 문서를 따라야 합니다.
> 
> 마지막 업데이트: 2026-03-21

---

## 1. 공통 규칙

### 필드 네이밍 컨벤션
- **snake_case** 사용 (예: `total_calls`, `avg_latency_ms`)
- 약어는 소문자로 (예: `ms`, `id`)
- 시간 관련 필드는 `_at` 접미사 (예: `created_at`, `detected_at`)
- 기간 관련 필드는 `_ms` 접미사 (예: `latency_ms`)

### Nullable 규칙
- `null`이 가능한 필드는 명시적으로 `Optional` 또는 `nullable` 표시
- 빈 배열은 `[]`로 반환 (null 아님)
- 빈 객체는 `{}`로 반환 (null 아님)

---

## 2. 핵심 스키마 정의

### 2.1 Project

```typescript
interface Project {
  id: number;           // int, positive
  name: string;         // min 1 char
  description: string | null;
  owner_id: number;     // int, positive
  is_active: boolean;
  role?: 'owner' | 'admin' | 'member' | 'viewer';  // 멤버 조회 시 포함
}
```

### 2.2 APICall

```typescript
interface APICall {
  id: number;
  project_id: number;
  provider: string;           // 'openai', 'anthropic', 'google' 등
  model: string;              // 'gpt-4o', 'claude-3-sonnet' 등
  status_code?: number | null;
  request_tokens?: number | null;
  response_tokens?: number | null;
  latency_ms?: number | null;
  cost?: number | null;       // 계산된 비용 (항상 반환되지 않을 수 있음)
  created_at: string;         // ISO 8601 datetime
  
  // 요청/응답 데이터
  request_data?: unknown | null;
  response_data?: unknown | null;
  
  // 에이전트 체인 추적
  agent_name?: string | null;
  chain_id?: string | null;
  response_text?: string | null;
  error_message?: string | null;
}
```

### 2.2.1 Ingest: optional `tool_events` (API call ingest)

프로젝트에 API 호출을 **ingest**할 때(예: `POST .../projects/{id}/api-calls` 등) 요청 바디에 선택적으로 포함할 수 있는 `tool_events` 배열의 필드 정의·검증 규칙은 **`docs/TOOL_EVENTS_SCHEMA.md`**를 따른다. Live View / Release Gate 타임라인과 맞추기 위한 `kind`, `call_id`, `ts_ms` 등은 해당 문서가 단일 참조(SoT)다. 필드별 민감도·상한 요약은 **`docs/live-view-ingest-field-matrix.md`** 참고.

### 2.3 QualityScore

```typescript
interface QualityScore {
  id: number;
  api_call_id: number;
  project_id: number;
  overall_score: number;              // 0-100
  
  // LLM 기반 점수
  semantic_consistency_score?: number | null;  // 0-100
  tone_score?: number | null;                  // 0-100
  coherence_score?: number | null;             // 0-100
  
  // 규칙 기반 검증
  json_valid?: boolean | null;
  required_fields_present?: boolean | null;
  length_acceptable?: boolean | null;          // 백엔드에만 있음
  format_valid?: boolean | null;               // 백엔드에만 있음
  
  // 상세 정보
  evaluation_details?: unknown | null;
  violations?: unknown | null;                 // 백엔드에만 있음
  
  created_at: string;  // ISO 8601 datetime
}
```

### 2.4 Alert

```typescript
interface Alert {
  id: number;
  project_id: number;
  alert_type: string;                           // 'drift', 'cost_spike', 'error' 등
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  alert_data?: unknown | null;
  is_sent: boolean;
  sent_at?: string | null;                      // ISO 8601 datetime
  notification_channels?: string[] | null;      // ['slack', 'email', 'discord']
  is_resolved: boolean;
  resolved_at?: string | null;                  // ISO 8601 datetime
  resolved_by?: number | null;                  // user_id
  created_at: string;                           // ISO 8601 datetime
}
```

### 2.5 DriftDetection

```typescript
interface DriftDetection {
  id: number;
  project_id: number;
  detection_type: string;                       // 'length', 'structure', 'semantic' 등
  model?: string | null;
  agent_name?: string | null;
  current_value?: number | null;
  baseline_value?: number | null;
  change_percentage: number;
  drift_score: number;                          // 0-100
  severity: 'low' | 'medium' | 'high' | 'critical';
  detected_at: string;                          // ISO 8601 datetime
  
  // 상세 정보
  detection_details?: unknown | null;
  affected_fields?: unknown | null;             // JSON object/array
  baseline_period_start?: string | null;        // ISO 8601 datetime
  baseline_period_end?: string | null;          // ISO 8601 datetime
}
```

---

## 3. 분석 스키마 정의

### 3.1 ChainProfile (체인 프로파일)

> **주의**: 이전 스키마와 완전히 다릅니다. 백엔드 기준으로 통일됨.

```typescript
interface ChainProfile {
  // 핵심 필드
  chain_id: string;
  total_calls: number;           // 총 호출 수
  successful_calls: number;      // 성공 호출 수
  failed_calls: number;          // 실패 호출 수
  success_rate: number;          // 0.0 ~ 1.0 (백분율 아님)
  avg_latency_ms: number;        // 평균 지연 시간 (밀리초)
  total_cost: number;            // 총 비용
  avg_cost_per_call: number;     // 호출당 평균 비용
  
  // 확장 필드 (UI용)
  unique_agents: number;                  // 체인 내 고유 에이전트 수
  total_latency_ms: number;               // 총 지연 시간 (밀리초)
  bottleneck_agent?: string | null;       // 가장 느린 에이전트 이름
  bottleneck_latency_ms: number;          // 병목 에이전트 평균 지연 시간
  agents: AgentStats[];                   // 에이전트별 통계 배열
  first_call_at?: string;                 // 첫 호출 시간 (ISO 8601)
  last_call_at?: string;                  // 마지막 호출 시간 (ISO 8601)
}
```

> **UI 표시 시**: `success_rate * 100`으로 백분율 변환 필요

### 3.2 ChainProfileResponse (체인 프로파일 응답)

```typescript
interface ChainProfileResponse {
  total_chains: number;
  successful_chains: number;
  success_rate: number;          // 0.0 ~ 1.0
  avg_chain_latency_ms: number;
  chains: ChainProfile[];
  message?: string;              // 데이터 없을 때 메시지
}
```

### 3.3 AgentStats (에이전트 통계)

> **주의**: 이전 스키마와 다릅니다. 백엔드 기준으로 통일됨.

```typescript
interface AgentStats {
  agent_name: string;
  total_calls: number;           // 총 호출 수
  successful_calls: number;      // 성공 호출 수
  failed_calls: number;          // 실패 호출 수
  success_rate: number;          // 0.0 ~ 1.0 (백분율 아님)
  avg_latency_ms: number;        // 평균 지연 시간 (밀리초)
}
```

> **UI 표시 시**: `success_rate * 100`으로 백분율 변환 필요

### 3.4 ModelComparison (모델 비교)

```typescript
interface ModelComparison {
  model: string;
  provider: string;
  model_name: string;
  total_calls: number;
  avg_quality_score: number;      // 0-100
  total_cost: number;
  cost_per_call: number;
  avg_cost_per_call: number;      // cost_per_call과 동일
  avg_latency_ms: number;
  avg_latency: number;            // 초 단위 (avg_latency_ms / 1000)
  success_rate: number;           // 백분율 (0-100)
  recommendation_score?: number;  // 0-100
  recommendation?: string;        // 'Highly Recommended', 'Recommended' 등
}
```

### 3.5 CostAnalysis (비용 분석)

```typescript
interface DailyCost {
  date: string;    // 'YYYY-MM-DD' 형식
  cost: number;
}

interface CostAnalysis {
  total_cost: number;
  by_model: Record<string, number>;      // { "gpt-4o": 12.34, ... }
  by_provider: Record<string, number>;   // { "openai": 45.67, ... }
  by_day: DailyCost[];
  average_daily_cost: number;
  cost_trend?: {
    percentage_change: number;
    is_increasing: boolean;
  };
}
```

---

## 4. 조직 스키마 정의

### 4.1 Organization

```typescript
interface Organization {
  id: number;
  name: string;
  type?: string | null;                   // 'personal', 'startup', 'company' 등
  plan_type: 'free' | 'pro' | 'enterprise';
  stats?: OrganizationStats | null;       // 대시보드용 통계 (동적 계산)
}
```

### 4.2 OrganizationStats

```typescript
interface OrganizationStats {
  calls_7d?: number;
  cost_7d?: number;
  alerts_open?: number;
  drift_detected?: boolean;
  projects?: number;
  usage?: {
    calls?: number;
    calls_limit?: number;
    cost?: number;
    cost_limit?: number;
    quality?: number;
  };
  alerts?: Array<{
    project?: string;
    summary?: string;
    severity?: string;
  }>;
}
```

### 4.3 OrganizationProjectStats

```typescript
interface OrganizationProjectStats {
  id: number;
  name: string;
  description?: string | null;
  calls_24h?: number;
  cost_7d?: number;
  quality?: number | null;        // null: 품질 점수 없는 프로젝트
  alerts_open?: number;
  drift_detected?: boolean;
}
```

---

## 5. 페이지네이션

### 5.1 PaginatedResponse

```typescript
interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit?: number;
  offset?: number;
}
```

---

## 6. 변경 이력

| 날짜 | 변경 내용 |
|------|----------|
| 2026-01-31 | 초기 스키마 명세 작성 |
| 2026-01-31 | ChainProfile, AgentStats 백엔드 기준으로 통일 |
| 2026-01-31 | QualityScore에 백엔드 전용 필드 추가 |

---

## 7. 마이그레이션 가이드

### ChainProfile 마이그레이션

| 이전 필드 (제거됨) | 새 필드 |
|-------------------|---------|
| `total_steps` | `total_calls` |
| `unique_agents` | 제거됨 |
| `total_latency` | 제거됨 |
| `avg_latency_per_step` | `avg_latency_ms` |
| `success` (boolean) | 제거됨 (success_rate 사용) |
| `failure_count` | `failed_calls` |
| `bottleneck_agent` | 제거됨 |
| `bottleneck_latency_ms` | 제거됨 |
| `agents` (array) | 제거됨 |

### AgentStats 마이그레이션

| 이전 필드 (제거됨) | 새 필드 |
|-------------------|---------|
| `call_count` | `total_calls` |
| `total_latency_ms` | 제거됨 |
| `failure_count` | `failed_calls` |
| `failure_rate` | `success_rate` (의미 반대) |
| `avg_quality_score` | 제거됨 |
