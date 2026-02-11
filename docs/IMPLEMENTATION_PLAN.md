# Synpira 구현 계획 (Implementation Plan)

> **기준 문서**: [DETAILED_DESIGN.md](DETAILED_DESIGN.md)  
> 이 문서는 설계를 **차례대로 구현**하기 위한 세밀한 태스크 목록이다. 각 항목은 DETAILED_DESIGN의 해당 절(§)과 대응한다.

---

## 목차

1. [Phase 0: 기반 점검](#phase-0-기반-점검)
2. [Phase 1: DB 스키마](#phase-1-db-스키마)
3. [Phase 2: Live View](#phase-2-live-view)
4. [Phase 3: Signal Engine](#phase-3-signal-engine)
5. [Phase 4: Worst Prompt Set](#phase-4-worst-prompt-set)
6. [Phase 5: Test Lab (백엔드)](#phase-5-test-lab-백엔드)
7. [Phase 6: Test Lab (프론트)](#phase-6-test-lab-프론트)
8. [Phase 7: Replay·Regression 연동](#phase-7-replayregression-연동)
9. [Phase 8: Human-in-the-loop](#phase-8-human-in-the-loop)
10. [Phase 9: 테스트 실행 제한·운양](#phase-9-테스트-실행-제한운양)
11. [Phase 11: Advanced Agent Governance & Cycles](#phase-11-advanced-agent-governance--cycles)
12. [Phase 12: Granular Data Governance & Evaluation](#phase-12-granular-data-governance--evaluation)
13. [Phase 13: 확장 (추후)](#phase-13-확장-추후)
14. [의존관계·순서 요약](#의존관계순서-요약)

---

## Phase 0: 기반 점검

**목표**: 이미 구현된 부분이 설계와 일치하는지 확인.

| # | 태스크 | 설계 참조 | 비고 |
|---|--------|-----------|------|
| 0.1 | Proxy → Capture/Forward/Store 흐름 확인 | §1 시스템 아키텍처 | |
| 0.2 | `projects`, `organizations`, 인증/멤버십 테이블 존재 확인 | §3 | |
| 0.3 | `snapshots` 테이블 기본 구조 확인 (최소: id, project_id, system_prompt, user_message, model, response, created_at) | §3.1 | |
| 0.4 | 기존 API: `projects`, `auth`, `proxy`, `replay` 엔드포인트 목록 확인 | §4 | |
| 0.5 | §7.1 완료 항목과 실제 코드 일치 여부 점검 (Replay, 한도 검증, BYOK, Settings/API Keys) | §7.1 | |

---

## Phase 1: DB 스키마

**목표**: DETAILED_DESIGN §3 DDL과 현재 스키마를 맞춘다.

### 1.1 snapshots

| # | 태스크 | 설계 참조 |
|---|--------|-----------|
| 1.1.1 | `agent_id` 컬럼 추가/확인 | §3.1 |
| 1.1.2 | `trace_id`, `parent_span_id`, `span_order`, `is_parallel` 추가 (Agent Trajectory) | §3.1, §2.9 |
| 1.1.3 | `signal_result` (JSONB), `is_worst`, `worst_status` 추가/확인 | §3.1 |
| 1.1.4 | 마이그레이션 스크립트 작성 및 적용 | |

### 1.2 test_results

| # | 태스크 | 설계 참조 |
|---|--------|-----------|
| 1.2.1 | 테이블 존재 여부 확인, 없으면 생성 | §3.1 |
| 1.2.2 | `test_run_id`, `step_order`, `parent_step_id`, `is_parallel` | §3.1 |
| 1.2.3 | `input`, `system_prompt`, `model`, `response`, `latency_ms`, `tokens_used`, `cost` | §3.1 |
| 1.2.4 | `signal_result`, `is_worst`, `worst_status` | §3.1 |
| 1.2.5 | `baseline_snapshot_id`, `baseline_response` (비교용) | §3.1 |
| 1.2.6 | `source` 또는 동등 필드 (replay / regression / test_lab / chain_test) | §3.1 Live View vs Test Results |

### 1.3 test_runs

| # | 태스크 | 설계 참조 |
|---|--------|-----------|
| 1.3.1 | 테이블 생성/확인: `id`, `project_id`, `name`, `test_type`, `agent_config`, `signal_config` | §3.1 |
| 1.3.2 | `total_count`, `pass_count`, `fail_count`, `created_at` | §3.1 |

### 1.4 test_lab_canvases

| # | 태스크 | 설계 참조 |
|---|--------|-----------|
| 1.4.1 | 테이블 생성: `id`, `project_id`, `name`, `boxes` (JSONB), `connections` (JSONB), `created_at`, `updated_at` | §3.1, §2.2 Test Lab 데이터 구조 |
| 1.4.2 | Box JSONB 스키마: ADDITIONAL_DATA_SPEC.md 참조 (`id`, `label`, `position`, `system_prompt`, `model`, `input_data_ids`, `additional_data`) | §3.1, ADDITIONAL_DATA_SPEC.md |

### 1.5 기타 테이블

| # | 태스크 | 설계 참조 |
|---|--------|-----------|
| 1.5.1 | `live_view_connections` (source_agent_name, target_agent_name 등) | §3.1 |
| 1.5.2 | `signal_configs` (project_id, name, signal_type, params, severity, enabled) | §3.1 |
| 1.5.3 | `replay_runs`, `reviews`, `agent_display_settings` 등 §3에 정의된 테이블 확인/생성 | §3 |

---

## Phase 2: Live View

**목표**: §2.1 Live View — 스냅샷을 에이전트(박스) 단위로 노출.

### 2.1 API

| # | 태스크 | 엔드포인트 | 설계 참조 |
|---|--------|------------|-----------|
| 2.1.1 | Live View 에이전트 목록 | `GET /api/v1/projects/{id}/live-view/agents` | §4.1 |
| 2.1.2 | 에이전트 설정 조회 | `GET /api/v1/projects/{id}/live-view/agents/{agent_id}/settings` | §4.1 |
| 2.1.3 | 에이전트 설정 수정 | `PATCH /api/v1/projects/{id}/live-view/agents/{agent_id}/settings` | §4.1 |
| 2.1.4 | 에이전트 삭제(숨김) | `DELETE /api/v1/projects/{id}/live-view/agents/{agent_id}` | §4.1 |
| 2.1.5 | Live View 연결 목록 | `GET /api/v1/projects/{id}/live-view/connections` | §4.1 |
| 2.1.6 | Live View 연결 생성 | `POST /api/v1/projects/{id}/live-view/connections` | §4.1 |
| 2.1.7 | Live View 연결 삭제 | `DELETE /api/v1/projects/{id}/live-view/connections/{conn_id}` | §4.1 |
| 2.1.8 | 스냅샷 목록 (필터: agent_id, is_worst, 기간, 페이지네이션) | `GET /api/v1/projects/{id}/snapshots` | §4.1 |

### 2.2 에이전트 감지

| # | 태스크 | 설계 참조 |
|---|--------|-----------|
| 2.2.1 | 스냅샷 → 에이전트(박스) 그룹핑 규칙 정의 (예: agent_id from SDK, 또는 system_prompt 해시 등) | §2.1, §2.9 |
| 2.2.2 | `GET /live-view/agents` 응답 생성: 스냅샷 집계로 박스 목록 반환 | §2.1 |

### 2.3 Live View 프론트

| # | 태스크 | 설계 참조 |
|---|--------|-----------|
| 2.3.1 | 프로젝트 화면에 Live View 탭 (북마크 탭 중 하나) | §5.1.2, §8.2 |
| 2.3.2 | Live View 캔버스: 박스 목록/배치 표시 | §2.1 |
| 2.3.3 | 박스 클릭 시: 해당 에이전트의 스냅샷 목록 또는 최근 응답 미리보기 | §2.1 |
| 2.3.4 | [Copy All to Test Lab] 버튼 (Live View에 박스가 있을 때) | §5.1.6 |
| 2.3.5 | 박스별 [Copy to Test Lab] | §5 |
| 2.3.6 | Live View 박스 최대 30개 제한, 초과 시 배너 + [View Snapshots] | §8.3 T8 |

---

## Phase 3: Signal Engine

**목표**: §2.6 Signal Detection — 응답 품질을 규칙/메트릭으로 평가.

### 3.1 시그널 설정 저장

| # | 태스크 | 설계 참조 |
|---|--------|-----------|
| 3.1.1 | `signal_configs` CRUD 서비스 | §3.1 |
| 3.1.2 | 기본 5개 시그널 정의 (Length Change, Latency Limit, Token Limit, Cost Limit, JSON Schema) 및 기본값 | §2.6 기본 5개 시그널 |
| 3.1.3 | Zero-config: 설정 없을 때 기본 5개 자동 적용 | §2.6 기본 5개 시그널 적용 방식 |

### 3.2 SignalEngine 서비스

| # | 태스크 | 설계 참조 |
|---|--------|-----------|
| 3.2.1 | `SignalEngine.evaluate(original, new, config) -> SignalResult` 인터페이스 | §2.6 |
| 3.2.2 | Length Change 체크 (±N% 임계값) | §2.6 Signal Details |
| 3.2.3 | Latency Limit 체크 | §2.6 |
| 3.2.4 | Token Limit 체크 | §2.6 |
| 3.2.5 | Cost Limit 체크 | §2.6 |
| 3.2.6 | JSON Schema 체크 (필수 필드, 유효성) | §2.6 |
| 3.2.7 | SignalResult: status (safe / needs_review / critical), details (각 시그널별 passed/failed) | §2.6 |

### 3.3 API

| # | 태스크 | 엔드포인트 | 설계 참조 |
|---|--------|------------|-----------|
| 3.3.1 | 기본 시그널 구성 조회 | `GET /api/v1/projects/{id}/signal-config/default` | §4.1 |
| 3.3.2 | 에이전트별 시그널 설정 조회 | `GET /api/v1/projects/{id}/live-view/agents/{agent_id}/signal-config` | §4.1 |
| 3.3.3 | 에이전트별 시그널 설정 저장 | `PUT /api/v1/projects/{id}/live-view/agents/{agent_id}/signal-config` | §4.1 |

### 3.4 Replay 연동

| # | 태스크 | 설계 참조 |
|---|--------|-----------|
| 3.4.1 | Replay 실행 시 각 응답에 SignalEngine 호출 | §2.3 Replay 실행 로직 |
| 3.4.2 | 결과를 스냅샷 또는 test_results의 `signal_result` 필드에 저장 | §3.1 |
| 3.4.3 | ReplayResult 집계: safe_count, needs_review_count, critical_count | §2.3 결과 집계 |

---

## Phase 4: Worst Prompt Set

**목표**: §2.7 Worst Prompt Set — 실패/위험 케이스 수집·노출.

### 4.1 Worst 판별·저장

| # | 태스크 | 설계 참조 |
|---|--------|-----------|
| 4.1.1 | 시그널 결과가 critical 실패일 때 `is_worst = true` 설정 (스냅샷 또는 test_results) | §2.7 |
| 4.1.2 | test_results에 대해 mark-worst API로 사용자 지정 Worst 표시 | §4.1 |
| 4.1.3 | worst_status: null / unreviewed / fixed / golden | §3.1 |

### 4.2 Worst 조회 API

| # | 태스크 | 설계 참조 |
|---|--------|-----------|
| 4.2.1 | Live View Worst: snapshots WHERE is_worst = true AND agent_id = ? | §3.1 주석 |
| 4.2.2 | Test Lab Worst: test_results WHERE is_worst = true AND agent_id = ? | §3.1 주석 |
| 4.2.3 | 프로젝트/에이전트별 Worst 목록 API (기존 worst_prompts 엔드포인트와 통합 또는 확장) | §4.1 |

### 4.3 Alerts 연동

| # | 태스크 | 설계 참조 |
|---|--------|-----------|
| 4.3.1 | Live View에서 새 Worst 발생 시 알림 생성 | §5.1.1, §8.7 T19 |
| 4.3.2 | 🔔 클릭 → Alerts 패널, 항목 클릭 시 해당 프로젝트 → Live View → 해당 박스/Worst로 이동 | §5.1.1, §8.7 T20 |
| 4.3.3 | Test Lab에서 Worst 발생 시에는 🔔 알림 안 함 (Test Results 내에서만 확인) | §8.7 T21 |

### 4.4 UI

| # | 태스크 | 설계 참조 |
|---|--------|-----------|
| 4.4.1 | Live View 박스별 "Worst N건" 표시 | §2.7 |
| 4.4.2 | Worst 전용 뷰 또는 스냅샷 필터 (is_worst=true) | §2.7 |

---

## Phase 5: Test Lab (백엔드)

**목표**: §2.2 Test Lab, §2.5 Chain Testing — 캔버스·실행·결과 API.

### 5.1 캔버스 API

| # | 태스크 | 엔드포인트 | 설계 참조 |
|---|--------|------------|-----------|
| 5.1.1 | 캔버스 목록 | `GET /api/v1/projects/{id}/test-lab/canvases` | §4.1 |
| 5.1.2 | 캔버스 생성 | `POST /api/v1/projects/{id}/test-lab/canvases` | §4.1 |
| 5.1.3 | 캔버스 수정 (boxes, connections) | `PUT /api/v1/projects/{id}/test-lab/canvases/{canvas_id}` | §4.1 |

### 5.2 실행 API

| # | 태스크 | 엔드포인트 | 설계 참조 |
|---|--------|------------|-----------|
| 5.2.1 | 단일/체인 테스트 실행 | `POST /api/v1/projects/{id}/test-lab/run` | §4.1 |
| 5.2.2 | 실행 전 한도 검증 (§2.10: input_prompts_per_test, total_calls_per_single_test 등) | §2.10 |
| 5.2.3 | 실행 결과 조회 | `GET /api/v1/projects/{id}/test-lab/runs/{run_id}` | §4.1 |

### 5.3 체인 실행 서비스

| # | 태스크 | 설계 참조 |
|---|--------|-----------|
| 5.3.1 | 캔버스 connections로 박스 실행 순서 결정 (토폴로지 정렬) | §2.5 Chain Test Flow |
| 5.3.2 | 박스별 LLM 호출 (BYOK: 프로젝트/박스 설정의 API Key 사용) | §2.5 |
| 5.3.3 | 단계별 입력/출력 저장, 다음 박스 입력으로 이전 출력 전달 | §2.5 |
| 5.3.4 | 각 단계에 Signal 평가 적용, test_results에 signal_result 저장 | §2.5, §3.1 |
| 5.3.5 | test_runs에 run 메타데이터 저장 (test_type, total_count, pass_count, fail_count) | §3.1 |

### 5.4 결과·테스트 데이터 API

| # | 태스크 | 엔드포인트 | 설계 참조 |
|---|--------|------------|-----------|
| 5.4.1 | 테스트 결과 목록 | `GET /api/v1/projects/{id}/test-lab/results` | §4.1 |
| 5.4.2 | 결과 저장 | `POST /api/v1/projects/{id}/test-lab/results/save` | §4.1 |
| 5.4.3 | Worst로 표시 | `POST /api/v1/projects/{id}/test-lab/results/mark-worst` | §4.1 |
| 5.4.4 | CSV Import (테스트 입력) | `POST /api/v1/projects/{id}/test-lab/import-csv` | §4.1, §8.4 |

### 5.5 외부 액션 (Dry run)

| # | 태스크 | 설계 참조 |
|---|--------|-----------|
| 5.5.1 | Test Lab 실행 시 tool/function call은 실행하지 않고, "호출 + 내용"만 결과에 포함 (추후 SDK/훅 연동 시 구현) | §2.5.1 |

---

## Phase 6: Test Lab (프론트)

**목표**: §5 Frontend, §8 테스트 시나리오 — Test Lab 캔버스·실행·결과 UI.

### 6.1 캔버스·진입

| # | 태스크 | 설계 참조 |
|---|--------|-----------|
| 6.1.1 | Test Lab 탭 클릭 시 "Choose how to start" 없이 바로 빈 캔버스 표시 | §2.2, §8.1 T1 |
| 6.1.2 | 상단 [Add Box], [Arrow Mode], 좌측 툴바 (□, +, -, ⛶, ↩, ↪) | §2.2, §8.1 T2, T5 |
| 6.1.3 | 박스 없을 때: □ 클릭 시 뷰포트 중앙에 박스 1개 생성 | §8.1 T3 |
| 6.1.4 | 박스 리사이즈, 연결 핸들 (▲▼◀▶) Hover 시 표시 | §8.1 T4 |
| 6.1.5 | 북마크 탭: Live View \| Test Lab \| Snapshots 항상 표시 | §8.2 T6 |

### 6.2 박스·연결

| # | 태스크 | 설계 참조 |
|---|--------|-----------|
| 6.2.1 | 박스 설정 패널: 이름, 모델, 시스템 프롬프트, Input 데이터 | §2.2 Box Edit Modal, §5.4 |
| 6.2.2 | Arrow Mode: 박스 간 연결 생성, connections 저장 | §2.2 |
| 6.2.3 | Test Lab 박스 최대 30개, 31번째 추가 시 차단 + 메시지 | §8.3 T9 |

### 6.3 Load Test Data

| # | 태스크 | 설계 참조 |
|---|--------|-----------|
| 6.3.1 | Load Test Data 모달: From Upload CSV / Manual 등 | §8.4 |
| 6.3.2 | CSV: Input 컬럼 매핑 필수, 매핑 없으면 [Import] 비활성 | §8.4 T10 |
| 6.3.3 | 유효 행만 Import, "N valid rows, M skipped" 메시지 | §8.4 T11 |
| 6.3.4 | [Download Template]: input 컬럼만 있는 샘플 CSV | §8.4 T12 |
| 6.3.5 | Manual Input: 최소 1줄, 여러 줄 = 여러 input | §8.5 T14, T15 |
| 6.3.6 | 박스에 "Current: N inputs" 표시 | §8.4 T13 |

### 6.4 실행·결과

| # | 태스크 | 설계 참조 |
|---|--------|-----------|
| 6.4.1 | [▶ Test] 버튼: Run API 호출, 로딩/에러 처리 | §2.2 |
| 6.4.2 | 결과 화면: 스텝별 입력/출력, 시그널 통과 여부, 소요 시간 | §2.5 Chain Test UI |
| 6.4.3 | Worst 표시, mark-worst 액션 | §2.7 |
| 6.4.4 | Copy from Live View: [Copy All to Test Lab], 박스별 [Copy to Test Lab] | §2.2, §5 |
| 6.4.5 | Snapshots 탭: 프로젝트 전체 snapshots 뷰 (필터·페이지네이션) | §8.2 T7 |

### 6.5 기타 UX

| # | 태스크 | 설계 참조 |
|---|--------|-----------|
| 6.5.1 | 튜닝 프롬프트 여러 문장 = 하나의 블록으로 저장·전달 | §8.6 T17 |
| 6.5.2 | Input Data insert 필드 (한 행 = input + 선택적 insert) | §8.6 T18 |
| 6.5.3 | Test Lab 박스에서 Custom 모델 선택 시 API Key 유효성 검사, 오류 시 사용자 친화 메시지 | §8 T33 |

---

## Phase 7: Replay·Regression 연동

**목표**: §2.3, §2.4와 test_results·source 정리.

| # | 태스크 | 설계 참조 |
|---|--------|-----------|
| 7.1 | Replay 실행 결과를 test_results 또는 replay_runs + 스냅샷에 signal_result 저장하는지 확인 | §2.3 |
| 7.2 | 모델 변경 테스트: Replay 시 target_model, repeat_count, signal_config 반영 | §2.3 |
| 7.3 | 프롬프트 변경 테스트: 새 system_prompt로 실행, 결과 비교 | §2.4 |
| 7.4 | test_results.source (또는 동등)로 replay / regression / test_lab / chain_test 구분 | §3.1 |
| 7.5 | Regression(Test Run) API와 Test Lab run API 한도 검증 일관 적용 | §2.10 |

---

## Phase 8: Human-in-the-loop

**목표**: §2.8 Review — NEEDS_REVIEW 처리.

| # | 태스크 | 설계 참조 |
|---|--------|-----------|
| 8.1 | NEEDS_REVIEW 상태 저장 및 조회 (signal_result.status 또는 별도 필드) | §2.6, §2.8 |
| 8.2 | Review 대기 목록 API | §2.8 |
| 8.3 | 결정(OK / Worst로 저장 등) 후 verdict, reviewer_id, reviewed_at 저장 | §3.1 reviews 테이블 |
| 8.4 | Review UI: NEEDS_REVIEW 항목 목록, OK + [Save decision] 시 통과 처리 | §8.8 T24 |
| 8.5 | Decision OK 저장 시 is_worst 아님으로 반영 | §8.8 T24 |

---

## Phase 9: 테스트 실행 제한·운영

**목표**: §2.10 테스트 실행 제한 및 최적화.

| # | 태스크 | 설계 참조 |
|---|--------|-----------|
| 9.1 | `GET /subscription`, `GET /subscription/plans` 응답에 `limits` (테스트 관련 5개) 포함 | §2.10, §7.3 |
| 9.2 | SubscriptionService.get_user_plan() 및 GET /plans에서 limits 구성 | §2.10 |
| 9.3 | UI: 테스트 실행 전 예상 호출 수, 한도 초과 시 경고, [▶ Test] 비활성화 | §7.3 |
| 9.4 | 한 번에 하나만 실행: 사용자당 동시 1개, 실행 중이면 새 실행 403 | §2.10, §7.3 |
| 9.5 | UI: 실행 중일 때 다른 박스 [▶ Test] 비활성화 | §7.3 |
| 9.6 | Replay, Test Lab run, Regression 호출 시 한도 검증 위치에서 403 + 사용자용 설명 | §2.10 |

---

---

## Phase 11: Advanced Agent Governance & Cycles

**목표**: 복잡한 에이전트 아키텍처(루프, 중첩 호출) 시각화 및 제어.

| # | 태스크 | 설계 참조 | 비고 |
|---|--------|-----------|------|
| 11.1 | 에이전트 노드 포트 분리 (Request/Response) | §2.2 | 완료 (바이올렛/시안) |
| 11.2 | 루프백(Back-Edge) 시각화 및 MAX 설정 | §2.7 | 완료 (빨간 점선) |
| 11.3 | 라우터(Router) 다이아몬드 노드 구현 | §2.5 | 완료 |
| 11.4 | 승인(Approval) HITL 노드 구현 | §2.8 | 완료 |
| 11.5 | 라운드 스태퍼(Round Stepper) UI 구현 | §2.5 | 완료 |

---

## Phase 12: Granular Data Governance & Evaluation

**목표**: 노드별/라운드별 정밀 데이터 관리 및 평가.

| # | 태스크 | 설계 참조 | 비고 |
|---|--------|-----------|------|
| 12.1 | 노드별 Golden/Worst 데이터 저장소 구축 | §2.7 | 계획 중 |
| 12.2 | 실행 컨텍스트 격리 및 라운드 태깅 (`{round_id: N}`) | §2.9 | 계획 중 |
| 12.3 | 인스펙터 내 Diff View (라운드 비교) 구현 | §5 | 계획 중 |
| 12.4 | 컨텍스트 익스플로러 (로컬 변수 조회) 구현 | §5 | 계획 중 |

---

## Phase 13: 확장 (추후)

**목표**: 우선순위 낮은 기능·확장.

| # | 태스크 | 설계 참조 |
|---|--------|-----------|
| 10.1 | Agent Trajectory (§2.9): trace_id/parent_span_id로 Live View 화살표 자동 생성 | §2.9 |
| 10.2 | 외부 액션 Tool 처리 (§2.5.1): Live View에 호출 시점/결과, Test Lab Dry run 호출+내용 표시, SDK/훅 설계 | §2.5.1 |
| 10.3 | 데이터 TTL/삭제 스케줄러 (data_retention_days) | §7.3 |
| 10.4 | 커스텀 Signal 추가 UI, LLM-as-Judge 시그널 확장 | §2.6, §7.3 |
| 10.5 | CI/CD 연동 | §7.3 |
| 10.6 | 2FA/MFA, SOC2, 실시간 보안 대시보드, IP Whitelist 등 | §7.3 |

---

## 의존관계·순서 요약

```
Phase 0 (기반 점검)
    ↓
Phase 1 (DB 스키마)
    ↓
Phase 2 (Live View)  ←── 사용자가 "어디서 무슨 호출이 있었는지" 확인
    ↓
Phase 3 (Signal Engine)  ←── "이 응답이 기준 대비 괜찮은지" 판단
    ↓
Phase 4 (Worst Set)  ←── "문제 케이스가 어디서 얼마나 있는지" 인지
    ↓
Phase 5 (Test Lab 백엔드)  ←── 캔버스·실행·결과 API (Phase 3 Signal 사용)
    ↓
Phase 6 (Test Lab 프론트)  ←── 실험 UI
    ↓
Phase 7 (Replay·Regression 정리)
    ↓
Phase 8 (Human-in-the-loop)
    ↓
Phase 9 (한도·동시 실행)
    ↓
Phase 10 (확장)
```

**권장 진행**: Phase 0 → 1 → 2 → 3 → 4 → 5 → 6 순으로 구현하면, 먼저 Live View·Signal·Worst로 가치를 보여주고, 이어서 Test Lab으로 실험 경험을 완성할 수 있다.

---

*Last updated: 설계 문서 DETAILED_DESIGN.md 기준.*
