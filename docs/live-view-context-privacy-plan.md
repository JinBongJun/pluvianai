# Live View — 컨텍스트·프라이버시 개선 계획

> **목표**: 사용자(통합 팀)가 **허용·전송한 범위 안에서만** 스냅샷에 남기고, Live View에서 **툴 입출력**뿐 아니라 **튜닝·RAG·문서/코드·엔드유저 입력**까지 **동일한 프라이버시 규칙**으로 노출한다.  
> **전제**: “스냅샷에 전부 저장”이 아니라 **고객이 ingest/SDK로 넘긴 만큼만** 저장·표시한다.

**관련 문서**: [`TOOL_EVENTS_SCHEMA.md`](./TOOL_EVENTS_SCHEMA.md), [`SCHEMA_SPEC.md`](./SCHEMA_SPEC.md), [`release-gate-tool-io-grounding-plan.md`](./release-gate-tool-io-grounding-plan.md), [`live-view-ingest-field-matrix.md`](./live-view-ingest-field-matrix.md), [`live-view-trust-data-collection.md`](./live-view-trust-data-collection.md)

**빠른 이동**: §11 저장/표시 데이터 모델 · §12 상세 구현(Phase별 파일) · §13 마일스톤 · §14 테스트 · §15 범위 밖 · [ingest 관측](./ops-ingest-observability.md)

---

## 1. 원칙

| 원칙 | 설명 |
|------|------|
| 저장 = 전송 | 서버에 없는 필드는 UI에도 없음. SDK/설정으로 보내지 않거나 마스킹해 보내면 스냅샷에도 없거나 빈칸·요약 수준. |
| 표시 = 저장 + 정책 | 프로젝트/테넌트 정책과 서버 redaction(`tool_timeline_redaction_version` 등)을 UI와 문서에서 일치. |
| 툴 구분 | `tool_call` 인자(`tool_args`) / `tool_result` / `action`(부수 효과) 구분 유지. |

---

## 2. 현재 상태 (요약)

- **툴 타임라인**: `trajectory_steps` 또는 `payload.tool_events` 기반으로 `tool_args`·`tool_result` 표시 ([`live_view.py`](../backend/app/api/v1/endpoints/live_view.py), [`ToolTimelinePanel`](../frontend/components/tool-timeline/ToolTimelinePanel.tsx)).
- **Release Gate**: `tool_evidence`·recorded/simulated/missing·베이스라인 연동은 별도 트랙에서 진행됨.

**갭**: 요청 본문의 **시스템/유저 메시지 외 컨텍스트**(긴 코드·문서·RAG 청크)를 Live View에서 **구조적으로 드러내는 패널**, ingest와 **1:1로 매핑되는 프라이버시 스위치** 문서화.

---

## 3. Phase 1 — 계약·SDK·ingest (기반)

| 작업 | 산출물 |
|------|--------|
| 데이터 분류 표 | 요청 본문(메시지·첨부·RAG)·툴 이벤트·응답 필드별 **로그 포함 단위** 정의 |
| SDK 옵션 | `init` 또는 별도 옵션으로 본문/첨부/툴 payload **수준 스위치** (예: 사용자 콘텐츠 로깅 on/off, `max_bytes`) — [`sdk/python/README.md`](../sdk/python/README.md) / Node 동기화 |
| 서버 | ingest **상한·검증** 규칙을 문서·코드 주석과 일치 |

**완료 기준**: “안 보내면 UI도 비움”이 **고객-facing 문서**에 한 페이지로 명시.

---

## 4. Phase 2 — Live View UI (표시)

| 작업 | 산출물 |
|------|--------|
| 요청 컨텍스트 패널 | 스냅샷 상세에서 `request_data` 기반 **시스템/유저/도구 정의** + 가능 시 **첨부·RAG 스니펫** 구역 |
| 길이·민감 UX | 긴 코드/문서는 접기, 길이 제한, **“정책상 생략”** vs **“데이터 없음”** 배지 구분 |
| 툴 타임라인 | 기존 패널 유지; 입력이 비었을 때 원인을 **정책** vs **미수집**으로 구분하는 카피 |

**완료 기준**: 샘플 스냅샷(짧은 질문 / 긴 코드 / 툴 호출) 3종에서 기대 레이아웃이 문서와 일치.

---

## 5. Phase 3 — Release Gate 정합

| 작업 | 산출물 |
|------|--------|
| Redaction 일관 | Live View와 Gate attempt 상세에서 **동일한 규칙·버전** 참조 문서화 |
| 비허용 시 | replay 맥락 부족은 기존 provenance·카피로 명확화; **수동 컨텍스트 붙여넣기**는 별 Epic(선택) |

**완료 기준**: `release-gate-tool-io-grounding-plan.md` §와 충돌 없이 상호 링크.

---

## 6. Phase 4 — 관측·운영 (선택)

- **구현됨**: ingest `request_data` **키 지문** 로그(`ingest_request_shape`) — [`ops-ingest-observability.md`](./ops-ingest-observability.md). 본문 미포함 vs 빈 요청 비율은 SIEM에서 `event_type`·`empty_body`로 집계.
- Release Gate 전용 `OPS_RG_*` 알림과는 **이벤트 타입으로 분리** (동 문서 참고).

---

## 7. Phase 5 — 온보딩·엔터프라이즈

| 작업 | 산출물 |
|------|--------|
| 한 페이지 요약 | “우리가 저장하는 것 / 안 하는 것 / 고객이 끄는 것” — 제품 [`/trust`](../frontend/app/trust/page.tsx), 문서 [`live-view-trust-data-collection.md`](./live-view-trust-data-collection.md) |
| 시나리오별 예시 | 동 문서 하단 **예시 JSON** (허용 / 빈 요청 / SDK 마커) |

---

## 8. 우선순위

1. **Phase 1** (계약·SDK·문서) — UI만 먼저 만들면 표시·저장 불일치 발생.
2. **Phase 2** (요청 컨텍스트 패널) — 본 계획의 핵심 사용자 가치.
3. Phase 3 → Phase 4 → Phase 5.

---

## 9. 리스크

- **법무/보안**: “화면에 빈칸”과 “수집하지 않음”을 혼동하지 않게 설정명·카피 통일.
- **성능**: 대용량 본문은 목록/상세 **지연 로딩·접기** 검토.

---

## 10. 체크리스트 (스프린트용)

- [x] Phase 1: 필드 분류표 (`live-view-ingest-field-matrix.md`) + SDK 옵션 + README Security
- [x] Phase 2: 스냅샷 상세 `RequestContextPanel` + `ToolTimelinePanel` 빈 I/O 카피
- [x] Phase 3: Gate·Live View redaction 문서 교차 링크 + `ReleaseGateExpandedView` 주석
- [x] Phase 4: ingest 키 형태 요약 로그 + [`ops-ingest-observability.md`](./ops-ingest-observability.md)
- [x] Phase 5: `live-view-trust-data-collection.md` 예시 JSON + 제품 `/trust` 페이지

---

## 11. 저장·표시 데이터 모델 (구현 기준)

### 11.1 Ingest (API)

- **엔드포인트**: `POST /api/v1/projects/{project_id}/api-calls` — 본문 모델 [`APICallIngestBody`](../backend/app/api/v1/endpoints/api_calls.py): `request_data`, `response_data`, `tool_events` (선택).
- **의미**: OpenAI/Anthropic/Google **요청·응답 JSON**이 그대로 `request_data` / `response_data`에 들어오는 것이 기본. RAG·문서·코드는 보통 `messages[]` 안의 `content`(멀티파트/텍스트) 또는 **앱이 넣은 커스텀 키**로 실림.
- **툴**: [`TOOL_EVENTS_SCHEMA.md`](./TOOL_EVENTS_SCHEMA.md) — `tool_call` / `tool_result` / `action`.

### 11.2 스냅샷 (`snapshots`)

- 모델 [`Snapshot`](../backend/app/models/snapshot.py): `payload` (JSON, 필수), `system_prompt`, `user_message`, `response`, `tool_calls_summary`, `trace_id` 등.
- Live View 상세는 스냅샷 GET 응답에 **`tool_timeline`** + redaction 버전을 포함 ([`live_view.py`](../backend/app/api/v1/endpoints/live_view.py) `_tool_timeline_for_snapshot`, `redact_secrets`).

### 11.3 “있음 / 없음” 판별

| 상태 | 의미 | UI |
|------|------|-----|
| **미수집** | ingest/SDK가 해당 필드를 보내지 않음 | “데이터 없음” 또는 섹션 숨김 |
| **정책상 생략** | 고객이 마스킹·길이 제한·샘플링으로 보내지 않음 | “정책/설정에 따라 생략” 배지 (문구 통일) |
| **서버 redaction** | 저장 후 마스킹 | `…` 또는 버전 배지 + 일부만 표시 |

---

## 12. 상세 구현 계획

### 12.1 Phase 1 — 계약·SDK·ingest

| # | 작업 | 세부 | 산출물 / 파일 |
|---|------|------|----------------|
| 1.1 | **필드 분류표** | `request_data` / `response_data` / `tool_events` / 스냅샷 `payload` 키별로 “표시 대상 / 민감도 / 권장 상한” 표 | `docs/live-view-ingest-field-matrix.md` (신규) 또는 본 문서 부록 |
| 1.2 | **SDK: 로깅 레벨** | `PluvianAI.__init__`에 예: `log_request_bodies: bool = True`, `max_request_body_bytes: Optional[int]`, `sanitize_messages: bool` (기본 True 시 PII 휴리스틱) | [`sdk/python/pluvianai/__init__.py`](../sdk/python/pluvianai/__init__.py), [`sdk/node`](../sdk/node/) 동기화 |
| 1.3 | **SDK: 전송 전 훅** | ingest 직전에 `request_data`/`response_data`를 복사 후 선택적 truncate/hash — **원본은 고객 프로세스에 남지 않도록** 문서에 명시 | README “Security” 절 |
| 1.4 | **서버 상한** | 기존 ingest 한도와 `tool_events` 한도를 문서·에러 메시지와 일치 | `api_calls.py`, 백그라운드 태스크 |
| 1.5 | **환경변수** | `PLUVIANAI_LOG_USER_CONTENT=0` 등 env로 SDK 기본값 오버라이드 | README 표 |

**완료 기준**: Python README에 **복붙 가능한 최소 예시** + **“끄면 무엇이 서버에 안 간다”** 표 1개.

---

### 12.2 Phase 2 — Live View UI

| # | 작업 | 세부 | 산출물 / 파일 |
|---|------|------|----------------|
| 2.1 | **요청 컨텍스트 패널** | `snapshot.payload?.request` 또는 `request_data`에서 복원된 필드 + 스냅샷 컬럼 `system_prompt`/`user_message`와 **중복 시 우선순위** 규칙 문서화 후 UI 단일화 | [`SnapshotDetailModal.tsx`](../frontend/components/shared/SnapshotDetailModal.tsx) 또는 분리 컴포넌트 `RequestContextPanel.tsx` |
| 2.2 | **`messages[]` 렌더** | OpenAI 형식 `messages` 배열이 있으면 **역할별 블록**(system / user / assistant / tool)으로 표시; 긴 content는 접기 + 문자 수 | 동일 |
| 2.3 | **RAG/첨부 휴리스틱** | `payload` 내 일반적 키(`context`, `retrieved_chunks`, `documents`, `attachments`) 탐색 — **스키마 고정 전**에는 “확장 키”로 표시 + raw fallback | 타입-safe unknown 처리 |
| 2.4 | **툴 타임라인 카피** | `tool_args`/`tool_result`가 비었을 때 `execution_source`·provenance와 연계한 **한글/영문 짧은 설명** (정책 vs 미수집) | [`ToolTimelinePanel.tsx`](../frontend/components/tool-timeline/ToolTimelinePanel.tsx) |
| 2.5 | **API 타입** | `GET .../snapshots` 리스트(light 포함)와 `GET .../snapshots/:id` 모두 `request_context_meta` (저장된 payload의 `_pluvianai_*`에서 서버 파생) + UI는 서버 메타 우선; Release Gate 상세는 `getSnapshot`으로 보강 | [`live-view.ts`](../frontend/lib/api/live-view.ts), [`live_view.py`](../backend/app/api/v1/endpoints/live_view.py), [`ReleaseGatePageContent`](../frontend/app/organizations/[orgId]/projects/[projectId]/release-gate/ReleaseGatePageContent.tsx) |

**완료 기준**: 픽스처 스냅샷 3종(짧은 질문 / `messages` 다중 / 툴+긴 user) 스크린샷 또는 스토리북.

---

### 12.3 Phase 3 — Release Gate 정합

| # | 작업 | 세부 |
|---|------|------|
| 3.1 | **문서 링크** | [`release-gate-tool-io-grounding-plan.md`](./release-gate-tool-io-grounding-plan.md) §에 본 문서 §11–12 참조 1줄 |
| 3.2 | **Redaction** | Gate attempt 상세에서 사용하는 tool evidence / 타임라인이 Live View와 **동일 redaction 규칙**을 쓰는지 코드 주석으로 표시 ([`ReleaseGateExpandedView.tsx`](../frontend/app/organizations/[orgId]/projects/[projectId]/release-gate/ReleaseGateExpandedView.tsx)) |
| 3.3 | **(선택) 수동 컨텍스트** | 별 Epic: attempt별 `replay_context_override` API + UI — **본 문서 범위 밖**이면 로드맵만 §5에 유지 |

---

### 12.4 Phase 4 — 관측 (선택)

| # | 작업 | 세부 |
|---|------|------|
| 4.1 | **로그 필드** | ingest 시 `request_data` 키 존재 여부 해시(내용 아님)로 “빈 요청 로깅” 비율 메트릭 — [`ops-ingest-observability.md`](./ops-ingest-observability.md), `api_calls.py` + `ingest_observability.py` |
| 4.2 | **알림** | 기존 `OPS_RG_*`와 혼동 없이 **별도** 게이트가 필요하면 설계만 기록 — 위 문서 § `OPS_RG_*` |

---

### 12.5 Phase 5 — 온보딩

| # | 작업 | 세부 |
|---|------|------|
| 5.1 | **Trust 페이지 초안** | “수집 항목 / 미수집 / 고객 설정” 1페이지 — [`frontend/app/trust/page.tsx`](../frontend/app/trust/page.tsx) |
| 5.2 | **예시 JSON** | 허용·빈·SDK마커 케이스 — [`live-view-trust-data-collection.md`](./live-view-trust-data-collection.md) 하단 |

---

## 13. 마일스톤 제안 (시간 순)

| 마일스톤 | 포함 | 비고 |
|----------|------|------|
| **M1** | 1.1, 1.4, 1.5 문서 + 서버 한도 점검 | UI 변경 없이 계약 고정 |
| **M2** | 1.2, 1.3 SDK + README | 고객이 “끄기” 가능 |
| **M3** | 2.1–2.4 Live View | 가시적 가치 최대 |
| **M4** | 3.1–3.2 Gate 정합 | |
| **M5** | 5.x 온보딩 | |
| **M6** | 4.x 관측 | 여력 시 |

---

## 14. 테스트

| 영역 | 내용 |
|------|------|
| **Backend** | ingest 본문 상한, `tool_events` 개수 상한, 빈 `request_data` 허용 동작 |
| **Frontend** | `SnapshotDetailModal` — `messages` 유무, 긴 텍스트 접기, 툴 타임라인 빈 상태 카피 |
| **SDK (Python)** | mock HTTP로 truncate 후 페이로드 길이 단언 |
| **E2E (선택)** | Playwright: 스냅샷 상세에 “User Input” + “Tool timeline” 노출; 공개 `/trust` 페이지 스모크 (`frontend/tests/trust-page.spec.ts`) |

---

## 15. 범위 밖 (명시)

- **엔드프라이즈 전용 VPC / BYOK**: 본 문서의 Phase 5와 별도 계약.
- **Gate 수동 컨텍스트 붙여넣기 UI**: Epic으로만 언급, 구현은 별 일정.

---

*마지막 업데이트: 2026-03-21*
