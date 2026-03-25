# PluvianAI PRD: Agent Behavior Validation Infra

**문서 목적**: PluvianAI를 “LLM output 평가 툴”이 아니라 **Agent 행동(툴 호출/순서/인자/궤적) 검증 인프라**로 재정의하고, 1인 운영이 가능한 MVP 범위로 **데이터모델 · API · UI · 수용기준(AC)**을 제시한다.  
**작성 기준**: 현재 레포 코드/스키마( `Trace`, `Snapshot`, `TestRun`, `TestResult`, `Firewall`, `Signals`, `Test Lab` )에 맞춰 “최소 변경”으로 설계한다.

---

## 1) 배경 / 문제 정의

### 시장 공통(레드오션)
- Output quality(정답/유사도/LLM judge), Performance(latency/token/cost), Regression(baseline diff), Observability(trace/span)는 대부분 솔루션이 제공.

### 빈칸(Agent-level 평가)
- **tool call order validation**
- **tool args schema validation**
- **trajectory(다단계) rule validation**
- partial step failure 감지/정책 위반의 정확한 “어느 스텝에서” 표시

### 핵심 가설
“에이전트가 올바르게 행동했는지”를 **규칙 기반으로 재현 가능**하게 검증해 주는 SaaS/infra는 희소하며, 운영팀/보안팀/에이전트 개발팀 모두에게 구매 이유가 된다.

---

## 2) 제품 정체성(One-liner)

> **PluvianAI = Agent Behavior Validation Infra**  
> “LLM output을 점수내는 툴이 아니라, **에이전트가 어떤 도구를 어떤 순서로 어떤 인자로 호출했고 그 결과가 정책을 위반했는지**를 Replay/Regression/CI Gate/Production Guard로 보증하는 시스템”

---

## 3) ICP / JTBD / 성공 지표

### ICP(초기)
- LLM/agent를 **프로덕션 운영 중**이며
- 모델/프롬프트/툴 로직 변경이 “조용히” 품질/보안을 깨뜨릴까 두려워
- 내부적으로 스프레드시트/스크립트/규칙을 만들어 돌리다 유지보수에 지친 팀(2~20명)

### JTBD
- “배포 전에, **에이전트의 행동 규칙이 깨지지 않았음을 증명**하고 싶다.”
- “프로덕션에서 사고가 나면, **실제 트래픽/스냅샷을 즉시 재현**하고 원인을 ‘어느 스텝’인지 특정하고 싶다.”

### 성공 지표(최소)
- **TTV(Time-to-Value)**: SDK/Proxy 연동 후 15분 내 ‘첫 Validation Report’ 생성
- **디버깅 시간**: incident 1건당 “재현→원인 스텝 특정” 시간을 50%+ 단축
- **CI Gate 채택**: 상위 고객의 30%가 PR/배포 파이프라인에 Gate를 붙임

---

## 4) Goals / Non-goals

### Goals (MVP)
- Trace/Run 단위로 **행동 궤적(trajectory)**을 정규화하여 저장
- 규칙 기반 **Tool/Trajectory Validator** 제공
- 결과를 **Report + Run vs Run Diff**로 제공
- Test Lab / Live View에서 “원클릭 재현→검증” 흐름 제공

### Non-goals (초기 스코프 제외)
- LLM-as-judge 기반 고급 품질 평가(후순위)
- 광범위한 observability 플랫폼(로그/메트릭/APM/SLO) 자체 구현
- 완전한 노코드 커스텀 evaluator 빌더(초기는 JSON 규칙 + 빌트인 프리미티브)

---

## 5) 현재 코드에서 활용 가능한 자산(현 상태)

### 이미 있는 것(재사용)
- **그룹 키**: `Trace(id, project_id)` + `Snapshot(trace_id, span_order, parent_span_id, is_parallel)`로 궤적 구조를 담을 수 있음
- **리플레이/테스트 세션**: `TestRun`, `TestResult(step_order, parent_step_id, is_parallel)`
- **캡처**: `/api/v1/proxy/*` 경로에 `APIHookMiddleware`가 캡처/정규화
- **가드**: `FirewallService`(실시간 스캔/차단), `SignalDetectionService`(규칙 기반 신호)
- **Test Lab UX**: ReactFlow 캔버스 + 실행/결과

### 부족한 것(이번 PRD의 핵심)
- “툴 호출”을 **명시적인 Step 엔티티**로 정규화/검증/비교하는 체계
- Rule engine(순서/인자/다단계) + Report + Diff + CI Gate

---

## 6) 핵심 사용자 플로우

### Flow A: Production incident → 재현 → 검증(가장 강한 쐐기)
1. Live View에서 worst/needs_review 발생
2. “Capture to Test Lab”로 스냅샷/트레이스를 캔버스로 복제(이미 유사 기능 존재)
3. 같은 입력/컨텍스트로 Run 실행
4. **Behavior Validation Report** 생성(규칙 위반 위치/스텝)
5. 모델/프롬프트/툴 수정 후 재실행
6. Run vs Run Diff로 “개선/회귀” 확인 → **Certificate 발급**

### Flow B: PR/배포 파이프라인에서 Gate
1. golden/scenario dataset + 규칙 세트 선택
2. CI가 PluvianAI에 “validate baseline vs candidate run” 요청
3. 실패면 build fail(정책 위반/회귀)

---

## 7) 제품 요구사항(Requirements)

## 7.1 Trajectory(행동 궤적) 정규화

### 정의
Trajectory = 한 Trace(또는 TestRun) 내부의 **정렬 가능한 Step들의 시퀀스 + 부모/병렬 관계**

### Step 유형(최소)
- `llm_call`: 모델 호출(요청/파라미터/응답/토큰/비용/지연)
- `tool_call`: 도구 호출(name, args)
- `tool_result`: 도구 결과(result, status)
- `error`: 실패/예외/타임아웃 등

### 정렬/관계(최소)
- `step_order`: 전체 순서(정수)
- `parent_step_id`(또는 `parent_span_id`): 트리 구조
- `is_parallel`: 병렬 플래그

## 7.2 Rule Engine (Behavior Validator)

### Rule scope
- Project-wide rules (기본)
- Agent-scoped rules (특정 agent_id/agent_name)
- Canvas/TestRun-scoped rules (실험별 규칙)

### MVP에서 제공할 규칙 프리미티브(“빈칸”을 찌르는 것만)
1. **Tool order**: 특정 tool 호출의 선후관계/허용 전이(transition)
2. **Tool presence**: 반드시 호출되어야 하는 tool / 금지 tool
3. **Args schema**: tool args의 JSON Schema/필수키/regex/enum 검증
4. **Trajectory constraints**: N스텝 내에 특정 tool 호출 필요, 실패 후 fallback 규칙 등
5. **Partial failure detection**: tool error 발생했는데 성공으로 종료되는 케이스 감지

### Rule format(초기)
- JSON 기반 선언 규칙 (UI는 “JSON 업로드/에디터” 수준)
- 예시는 아래 “Rule 예시” 참고

## 7.3 Report / Diff / Certificate

### Validation Report(필수 출력)
- overall: pass/fail + 점수(옵션)
- violations[]: 규칙 위반 목록
  - `rule_id`, `rule_name`, `severity`
  - `step_ref`(어느 step에서)
  - `evidence`(tool name/args snippet/transition)
  - `human_hint`(수정 가이드)

### Run vs Run Diff(필수)
- violations delta: 증가/감소
- severity delta
- top regressed rules
- “처음 깨진 step” 하이라이트

### Certificate(선택, 하지만 수익화 핵심)
- 기준 run(베이스라인) 대비 후보 run이 규칙을 만족하면 `certificate_id` 발급
- CI/배포 메타데이터(sha, env, actor)를 첨부 가능

---

## 8) 데이터 모델 설계(현재 스키마를 최대한 재사용)

## 8.1 최소 변경 전략(추천)
### 원칙
- Raw payload/replay는 기존 `Snapshot.payload`를 그대로 유지
- “행동 검증”에 필요한 정규화 정보는 **새 테이블**로 분리(검색/성능/표준화)

## 8.2 신규 테이블 제안

### A) `trajectory_steps` (핵심)
- 목적: Trace/TestRun 단위 “정규화 step” 저장
- 컬럼(초안)
  - `id` (uuid string)
  - `project_id` (int, index)
  - `trace_id` (string, index, nullable)  — production flow
  - `test_run_id` (string, index, nullable) — test lab flow
  - `step_order` (int, index)
  - `parent_step_id` (string, nullable)
  - `is_parallel` (bool)
  - `step_type` (enum: llm_call/tool_call/tool_result/error)
  - `agent_id` (string, nullable, index) — `Snapshot.agent_id`와 정렬
  - `agent_name` (string, nullable, index) — SDK header 기반
  - `tool_name` (string, nullable, index)
  - `tool_args` (jsonb, nullable)
  - `tool_result` (jsonb, nullable)
  - `llm_provider`, `llm_model` (nullable)
  - `latency_ms`, `tokens_in`, `tokens_out`, `cost` (nullable)
  - `raw_snapshot_id` (int, nullable) — 필요 시 원본 연결
  - `created_at`

### B) `behavior_rules`
- 목적: 프로젝트/에이전트/캔버스 단위 규칙 저장
- 컬럼(초안)
  - `id` (uuid string)
  - `project_id`
  - `name`, `description`
  - `scope_type` (project/agent/canvas)
  - `scope_ref` (agent_id or canvas_id)
  - `severity_default`
  - `rule_json` (jsonb) — 선언 규칙 본문
  - `enabled`
  - `created_at`, `updated_at`

### C) `behavior_reports`
- 목적: validate 결과 캐시/공유/CI
- 컬럼(초안)
  - `id` (uuid string)
  - `project_id`
  - `trace_id`(nullable) / `test_run_id`(nullable)
  - `baseline_report_id`(nullable) / `baseline_run_ref`(nullable)
  - `status`(pass/fail)
  - `summary_json` (jsonb) — violations count, severity breakdown, score
  - `violations_json` (jsonb) — 상세(초기는 JSONB로 충분)
  - `created_at`

> 대안(더 적은 변경): `Snapshot`에 `event_type/tool_*` 컬럼을 추가해도 되지만, 장기적으로 검색/확장성이 떨어져 신규 테이블이 유리.

---

## 9) 정규화 규격(Behavior Normalization Spec)

### 입력 소스
- Production: `Snapshot.payload` + Proxy/Normalizer가 추출한 tool_calls 정보
- Test Lab: `TestResult` (향후 tool events까지 확장)

### 정규화 규칙(초기)
- tool call이 응답에 포함되는 provider 형태(OpenAI tool_calls, JSON function call 등)를 모두 “tool_call step”으로 변환
- tool 실행 결과를 수집할 수 있으면 “tool_result step”으로 변환(초기에는 tool_result가 없을 수도 있음 → 존재 시만)
- 실패(HTTP 4xx/5xx, timeout)를 “error step”으로 기록

### 필수 보장
- Step은 항상 `step_order`로 총정렬 가능
- step에 최소한 `step_type`과 `evidence`(tool_name 또는 llm_model 등)가 존재

---

## 10) Rule 예시(초기 JSON 규칙)

### 10.1 Tool order (search → read → answer)
```json
{
  "type": "tool_order",
  "name": "Search before Answer",
  "severity": "high",
  "spec": {
    "must_happen_before": [
      {"tool": "web.search", "before_tool": "final_answer"}
    ]
  }
}
```

### 10.2 Args schema validation (tool args must match JSON schema)
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
        "email": {"type": "string", "pattern": "^[^@]+@[^@]+\\.[^@]+$"},
        "org_id": {"type": "string"}
      },
      "additionalProperties": false
    }
  }
}
```

### 10.3 Forbidden tool
```json
{
  "type": "tool_forbidden",
  "name": "No shell exec in prod",
  "severity": "critical",
  "spec": {"tools": ["shell.exec", "os.system"]}
}
```

### 10.4 Multi-step constraint (PII detected → must call redact within 2 steps)
```json
{
  "type": "trajectory_after_signal_requires_tool",
  "name": "Redact after PII",
  "severity": "high",
  "spec": {
    "signal": "pii_detected",
    "within_steps": 2,
    "required_tool": "redact"
  }
}
```

---

## 11) API 설계(초안)

### 11.1 Rules CRUD
- `GET /api/v1/projects/{project_id}/behavior/rules`
- `POST /api/v1/projects/{project_id}/behavior/rules`
- `PUT /api/v1/projects/{project_id}/behavior/rules/{rule_id}`
- `DELETE /api/v1/projects/{project_id}/behavior/rules/{rule_id}`

### 11.2 Validate(핵심)
- `POST /api/v1/projects/{project_id}/behavior/validate`
  - body:
    - `trace_id` 또는 `test_run_id` 중 1개
    - `rule_ids`(optional) / `scope`(optional)
    - `baseline_run_ref`(optional, diff용)
  - response:
    - `report_id`, `status`, `summary`, `violations[]`

### 11.3 Compare (Run vs Run)
- `POST /api/v1/projects/{project_id}/behavior/compare`
  - body: `{ "baseline_test_run_id": "...", "candidate_test_run_id": "...", "rule_ids": [...] }`
  - response: violations delta + severity delta + top regressed

### 11.4 CI Gate(간단)
- `POST /api/v1/projects/{project_id}/behavior/ci-gate`
  - body: baseline/candidate + thresholds(“critical 0개”, “high <= 2개” 등)
  - response: `{ "pass": bool, "exit_code": 0|1, "report_url": "...", "summary": ... }`

---

## 12) UI/UX 요구사항(초기)

### 12.1 Live View
- Agent 패널 탭 추가: **“Behavior”**
  - 최근 trace의 violations 타임라인
  - “Capture to Test Lab” 버튼(이미 유사 흐름) 강화: trace 기반 복제 지원

### 12.2 Test Lab
- 실행 결과 화면에 **“Behavior Report” 섹션**
  - 위반 rule list + 클릭 시 해당 step/노드 highlight
  - baseline run 선택 → **Diff 뷰** 제공
- 규칙 관리 UI(초기): JSON 에디터/업로드 + enable/disable

---

## 13) 수용기준(AC)

### AC-1 (정규화)
- Trace id가 주어지면, 최소 1개 이상의 `trajectory_steps`가 생성되고
- 각 step은 `step_order`로 정렬 가능하며
- tool_calls가 존재하는 케이스에서 `tool_call` step이 최소 1개 생성된다.

### AC-2 (검증)
- `tool_args_schema` 규칙이 위반되면 report에
  - rule id/name
  - 위반한 step_ref
  - 어떤 필드가 왜 실패했는지(evidence)
  가 포함된다.

### AC-3 (Diff)
- baseline 대비 candidate에서 violations가 증가하면 “regressed”로 표시되고,
- 가장 먼저 깨진 step_order가 반환된다.

### AC-4 (CI Gate)
- critical violations가 1개 이상이면 `exit_code=1`을 반환한다.

---

## 14) MVP 일정(1인 기준, 2~4주)

### Week 1: 데이터 정규화 + 최소 validate
- `trajectory_steps` 테이블 + 정규화 배치(스냅샷 → steps)
- `behavior_rules` + `behavior_reports`
- `validate(trace_id)` API

### Week 2: tool args/order 규칙 + 리포트 UI
- `tool_args_schema`, `tool_order`, `tool_forbidden` 3종
- Test Lab 결과 화면에 report 표시(최소)

### Week 3: compare + CI gate
- compare API + Diff UI
- CI gate 엔드포인트/간단 CLI 문서

### Week 4(옵션): “Capture→Validate” 루프 완성
- Live View에서 trace 선택 → validate → test lab 복제/재실행까지 동선 다듬기

---

## 15) 리스크 / 완화

- **Tool result 수집 부재**: 초기에는 tool_result step이 부족할 수 있음  
  → MVP는 tool_call 중심으로 시작, tool_result는 단계적 확대
- **Provider 별 tool_call 스키마 차이**  
  → Normalizer에 provider adapter 층 추가(기존 `DataNormalizer` 연장)
- **Redis Stream 유실/중복**  
  → 정규화는 DB에 들어온 snapshot 기반으로 재실행 가능하게 설계(배치 idempotent)

---

## 16) 가격/패키징 힌트(간단)
- Free: validate 1~2 rules + 최근 N trace
- Pro: CI gate + diff + rule pack
- Enterprise: custom rule pack + self-host/BYOC + audit export

