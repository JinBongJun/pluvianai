### 목적

이 문서는 `docs/mvp-node-gate-spec.md`(정의/스펙)과 **같이 보면서** 구현을 “한 항목씩 체크”하기 위한 **실행 체크리스트**다.  
각 항목은 **변경 파일/엔드포인트/완료 기준(acceptance)**을 포함한다.

---

### 구현 원칙(스파게티 방지 룰)

- **단일 책임**: UI/상태/요청 payload/결과 파싱/표 렌더링 로직을 한 컴포넌트에 몰아넣지 않는다.
- **중복 금지**: 같은 판단 로직(FAIL/FLAKY 분류, threshold 적용, 모델 provider 추론 등)은 “한 곳”에만 둔다.
- **타입이 진실**: API 응답/요청 타입(`frontend/lib/api.ts`)과 백엔드 스키마(`ReleaseGateValidateRequest`)는 항상 동기화한다.
- **깨끗한 데이터 흐름**:
  - “선택(Recommended/Recent/Dataset) → snapshot_ids 확정 → Replay Test 실행 → 결과 렌더” 단방향 흐름 유지
  - 임시 state는 최소화하고, 파생값은 `useMemo`로 계산한다.
- **죽은 코드 제거**: 모드 제거/엔드포인트 변경 후, 남은 탭/분기/타입은 즉시 삭제한다(유령 기능 금지).
- **가시성 있는 실패**: 실패는 “배너 + 필드 하이라이트”로 표면화하고, 내부만 파고들어야 보이는 에러는 금지.

---

### A. 데이터 선택 (Saved datasets / Live View 로그)

#### A-0. 기준 확정(스펙 동기화)

- [x] `docs/mvp-node-gate-spec.md`에서 Recommended set(Worst 20 + Golden 20, last 7 days) 자동 구성을 제거하고, **Saved datasets + Live View 최근 로그(Last N/개별 선택)** 를 데이터 선택의 기본 단위로 사용.

#### A-1. 백엔드/프론트: Saved datasets / Live View 로그 기반 선택

- [x] Live View에서 스냅샷 여러 개를 선택해 dataset으로 저장하고, Release Gate 모달에서 해당 dataset을 동일하게 불러올 수 있다.
- [x] Release Gate 모달에서 Live View logs(Last 10/25/50/100 또는 개별 선택)를 사용해 스냅샷을 직접 선택할 수 있다.
- [x] Release Gate 메인에서 선택된 스냅샷 개수 및 데이터 출처가 baseline과 결과 요약에 일관되게 반영된다.
- [x] 상세 페이지(Release Gate 결과 링크, Live View LOG/Data 탭)에서 eval·payload·메타 정보가 동일하게 보인다.

---

### B. Release Gate = Replay Test 단일 모드로 통합

#### B-1. 백엔드: 요청 스키마/모드 통합

- [x] `backend/app/api/v1/endpoints/release_gate.py`
  - `evaluation_mode`(regression/stability/drift) 제거 또는 `"replay_test"`로 고정
  - `repeat_runs`는 1/10/50/100 (기본 1, Run 옆 드롭다운; 50/100 빨간 칸·경고)
  - Gate verdict threshold는 **failed_run_ratio_max 기반에서** 아래로 전환:
    - `fail_rate_max`
    - `flaky_rate_max`
- [x] 완료 기준
  - drift/stability/regression 분기 코드가 사라지고 **단일 실행 경로**만 남는다.

#### B-2. 백엔드: 케이스 단위 PASS/FAIL/FLAKY 계산

- [x] “케이스 = snapshot_id”로 고정
- [x] repeat_runs = N에 대해:
  - PASS: N/N pass
  - FAIL: N/N fail
  - FLAKY: \(0 < passed\_runs < N\)
- [x] Gate verdict:
  - `fail_rate = (# FAIL) / total`
  - `flaky_rate = (# FLAKY) / total`
  - PASS iff `fail_rate <= fail_rate_max` AND `flaky_rate <= flaky_rate_max`
- [x] 완료 기준
  - FLAKY가 FAIL로 뭉개지지 않고 **결과 테이블과 요약 수치에 독립**으로 나온다.

#### B-3. 백엔드: 응답 스키마(요약 + per-case + 증거)

- [x] `frontend/lib/api.ts`와 합의된 형태로 응답을 고정
  - 최소: `case_results[]`(snapshot_id, pass/fail/flaky, attempts[])
  - 요약: `fail_rate`, `flaky_rate`, `total_inputs`, `failed_inputs`, `flaky_inputs`
  - verdict: `pass`, `exit_code`
  - evidence: 대표 실패 rule/샘플 이유
- [x] 완료 기준
  - 프론트에서 “모드별 분기 파싱”이 필요 없고, **단일 렌더 코드**로 표시 가능

#### B-4. Release Gate History retention + purge

- [x] `backend/app/api/v1/endpoints/release_gate.py`
  - `GET /projects/{project_id}/release-gate/history` 는 프로젝트 플랜 retention(`data_retention_days`) 안의 항목만 반환한다.
  - 응답에 `retention_days` 를 포함해 UI에서 "Recent N days" 문구를 표시할 수 있다.
- [x] `backend/app/services/data_lifecycle_service.py`
  - expired snapshot cleanup와 별도로, **expired release-gate history**(`BehaviorReport` with `summary_json.release_gate`)를 hard-delete 한다.
  - **Safety rule**: 일반 behavior report는 삭제 대상이 아니며, release-gate row만 purge 한다.
- [x] `backend/app/services/scheduler_service.py`
  - daily lifecycle cleanup job에서 snapshot cleanup + release-gate history purge를 함께 실행한다.
- [x] 완료 기준
  - Free/Pro/Enterprise retention(7/30/365일)에 따라 오래된 release-gate history가 조회되지 않는다.
  - 스케줄러 실행 후 retention 밖 release-gate history row는 DB에서 실제로 삭제된다.
  - 일반 behavior report는 retention purge 대상에서 제외된다.

---

### C. Candidate Overrides(모델/프롬프트/JSON/tools) + API key

#### C-1. “Original vs Custom” 모델 토글 유지(스펙 부합)

- [x] `frontend/app/.../release-gate/page.tsx`
  - Original: baseline 모델 정보 읽기 전용
  - Custom: ModelSelector로 모델 입력(Original preset 숨김)
- [x] 완료 기준
  - Custom 모드에서 dropdown에 **Original Model 항목이 절대 나오지 않음**

#### C-1a. Anthropic pinned-only preset + Pinned/Custom 가드레일

- [ ] `frontend/app/organizations/[orgId]/projects/[projectId]/release-gate/ReleaseGatePageContent.tsx`
  - `REPLAY_PROVIDER_MODEL_LIBRARY.anthropic`는 **pinned(YYYYMMDD) 모델만** 기본 노출한다.
- [ ] `backend/app/api/v1/endpoints/release_gate.py`
  - production에서 Anthropic override에 대해 **pinned-only(YYYYMMDD) 강제**.
  - 예외: superuser 또는 `RELEASE_GATE_ALLOW_CUSTOM_MODELS=true`.
- [ ] `frontend/app/organizations/[orgId]/projects/[projectId]/release-gate/ReleaseGateConfigPanel.tsx`
  - Custom model id 입력은 `Advanced`로 표기한다.
  - Anthropic에서 pinned가 아닌(또는 `latest`) 모델 id를 입력하면 **경고 배너 + Custom 배지**가 표시된다.
  - pinned Anthropic id를 선택하면 **Pinned 배지**가 표시된다.
- [ ] `frontend/app/organizations/[orgId]/projects/[projectId]/release-gate/ReleaseGateExpandedView.tsx` + `frontend/components/live-view/AgentCardNode.tsx`
  - 노드 카드 요약(Model mode)이 pinned/custom을 구분해 `Pinned override` / `Custom override`로 표시된다.
- [ ] 완료 기준
  - Anthropic preset 목록에 레거시/alias/`latest` 모델이 보이지 않는다.
  - pinned 선택/ custom 입력 시 배지/경고가 기대대로 노출되고, 노드 카드 요약이 일관되게 표시된다.

#### C-2. API key 입력(런 전용)

- [x] UI: “API key (optional)” 단일 입력
- [x] Payload: `replay_api_key`로 전달(필요 시 `replay_provider`도)
- [x] 완료 기준
  - API key 오류가 나면, 결과 테이블 깊숙한 곳이 아니라 **상단 배너 + 입력 하이라이트**로 즉시 보인다.

#### C-3. JSON payload = config-only (계약 고정)

- [ ] 백엔드
  - `ReleaseGateValidateRequest.replay_overrides`에는 **config-only 필드만** 허용한다.
    - MUST drop/ignore disallowed keys: `messages`, `message`, `user_message`, `response`, `responses`, `input`, `inputs`, `trace_id`, `agent_id`, `agent_name`.
    - snapshot content(유저 입력/응답/trace 메타)는 항상 스냅샷에서만 읽고, overrides로는 절대 바꾸지 않는다.
  - (선택) UI 지원용으로 `baseline_request`, `candidate_request_preview`를 응답에 포함할 경우, 둘 다 **display-only**이며 실행 로직은 여전히 snapshot + overrides에서 직접 파생한다.
- [ ] 프론트엔드
  - Release Gate JSON 패널은 baseline payload에서 content 필드(messages/user_message/response/trace_id 등)를 제거한 **config-only JSON**만 보여준다.
  - 사용자가 JSON을 편집해도 content 필드는 다시 저장되지 않으며, replay 시 snapshot content는 항상 스냅샷에서만 가져온다.
  - Config 편집 UI는 model/system prompt/sampling/tools 같은 설정을 **폼 + JSON(preview/advanced)** 한 군데에서만 수정하게 하고, 카드/다른 패널에서는 읽기 전용 요약만 보여준다.
- [ ] 완료 기준
  - 서로 다른 `user_message`를 가진 스냅샷 여러 개를 선택해도 JSON 패널 내용은 동일한 설정 JSON으로 재사용 가능하며, user input/response 본문은 어디에서도 노출되지 않는다.
  - Replay 테스트를 여러 번 실행해도 snapshot content가 Request JSON 패널/Export/Copy에 섞여 들어가지 않는다.

---

### D. Release Gate UI/리포트(최소)

#### D-1. 화면 구조 단순화

- [x] 탭 제거: Regression/Stability/Drift → **Replay Test 1개**
- [x] repeat_runs 선택: 1 / 10 / 50 / 100 (Run 옆 드롭다운, 50/100 경고)
- [x] **Strictness**(구 threshold): 라벨 "Strictness" + 한 줄 설명. 프리셋 Strict / Normal / Lenient / Custom(툴팁에 Fail·Flaky %). Custom 선택 시에만 Fail %·Flaky % 입력란 노출.
- [x] 완료 기준
  - 사용자가 “노드 선택 → Run”만으로 결과를 확인할 수 있다.

#### D-2. 결과 테이블

- [x] 케이스별 PASS/FAIL/FLAKY 표시
- [x] attempts 패턴 표시(●●● 같은 시각화)
- [x] Copy/Export(최소 1개)
- [x] **Result UI: 케이스 펼치기·시도 목록·시도 상세** — Result 상단 Gate Pass/Fail, 케이스 행 k/N passed·chevron, 펼침 시 시도 목록(#·status·latency·behavior·eval), 시도 클릭 시 Attempt detail(eval·behavior diff·violations). 수동 검증: RG-6.
- [x] 완료 기준
  - “대표 근거(Top failed rules + 샘플 실패 링크)”가 항상 보인다.

---

### E. Live View → Gate 진입 CTA (흐름 완성)

- [x] Live View에서 “이 노드 Recommended set으로 Gate 실행” CTA
  - 노드 선택만 하고 바로 Release Gate로 이동(Recommended 기본 적용)
- [x] 완료 기준
  - Live View → Release Gate 전환이 “관측 → 데이터 생성 → 게이트” 흐름을 끊지 않는다.

---

### F. Canonical step (cross-provider 행동 검사)

- [x] **백엔드: provider 응답 → canonical step 정규화**
  - `app/core/canonical.py`: `response_to_canonical_steps`, `response_to_canonical_tool_calls_summary`
  - OpenAI(`tool_calls`), Anthropic(`content[].tool_use`), Google(`functionCall`) → 동일 step 구조
  - Replay 결과·trace·test run step 빌드 시 이 레이어 사용(`release_gate`, `behavior`, `live_eval_service`)
- [x] 완료 기준
  - snapshot=OpenAI, replay=Anthropic/Google인 경우에도 tool_call step이 추출되어 정책 위반이 동일 기준으로 판정된다.

---

### G. 테스트/안정성 체크(수동 QA)

- [x] `docs/manual-test-scenarios-mvp-replay-test.md`에 Replay Test 기반으로 시나리오 정리(모드 통합 반영)
- [x] 최소 시나리오
  - Recommended set 40개가 정상 로드되는지
  - repeat_runs 1/10/50/100에서 PASS/FAIL/FLAKY 분류가 정확한지
  - API key 오류/모델 입력 오류가 UI에서 즉시 드러나는지
  - Export/Copy가 일관된 결과를 내는지

---

### H. 리팩터링/정리(스파게티 방지 마지막 관문)

- [x] 모드/엔드포인트/타입 변경 후, 아래 잔재 제거
  - [x] Recommended set 선정에서 `not_applicable`을 FAIL로 간주하지 않도록 정합화
    - `backend/app/api/v1/endpoints/release_gate.py`
      - Worst: explicit FAIL 포함 케이스만
      - Golden: FAIL 없음 + PASS 최소 1개 케이스만
  - [x] Live Eval 집계에서 `not_applicable`을 failed 카운트에서 제외
    - `backend/app/services/live_eval_service.py`
  - [x] Live Eval 체크는 11개만 지원 (empty, latency, status_code, refusal, json, length, repetition, required, format, leakage, tool). tokens/cost 체크는 제거됨.
  - [x] Release Gate 결과 UI 문구에서 “N/A를 gate fail로 간주” 오해 문구 제거
    - `frontend/app/organizations/[orgId]/projects/[projectId]/release-gate/page.tsx`
  - [x] 불필요한 mode 타입/탭 UI/분기/unused state 제거(replay_test 단일 경로 기준)
    - `backend/app/api/v1/endpoints/release_gate.py`
    - `frontend/app/organizations/[orgId]/projects/[projectId]/release-gate/page.tsx`
  - [x] drift/stability 관련 Release Gate API/타입 잔재 제거(더 이상 쓰지 않는 경우)
    - `frontend/lib/api.ts`의 Release Gate 타입/필드 기준 정합
- [x] “한 번만 정의” 체크
  - [x] PASS/FAIL/FLAKY 표시 분기를 단일 helper(`getRunCaseStatus`)로 통합
    - `frontend/app/organizations/[orgId]/projects/[projectId]/release-gate/page.tsx`
  - [x] threshold 적용/정규화 로직을 단일 helper(`normalizeGateThresholds`)로 통합
    - preset 선택, 수동 입력, validate payload 생성에서 공통 사용
  - [x] result table row mapping 로직 단일화
    - `getResultRuns`, `extractReportRunRows`로 current/history 파싱 분기 통합
- [x] 완료 기준
  - `frontend/lib/api.ts` 타입과 백엔드 응답이 1:1로 맞고,
  - 프론트에서 결과 파싱을 위해 `any`/임시 분기가 남아있지 않다.

---

### I. Account Surface Open + Billing Lockdown

- [x] `SET PROFILE` 실동작 페이지 추가
  - `frontend/app/settings/profile/page.tsx`
  - profile 조회/수정(`GET/PATCH /settings/profile`) 연결 완료
  - 비밀번호 변경(`PATCH /settings/password`) UI 연결 완료
- [x] Service API key 관리 UI 연결
  - 생성/목록/삭제/이름 수정(`GET/POST/PATCH/DELETE /settings/api-keys`) 연결
  - 생성 직후 full key 1회 노출 + 이후 목록에서는 마스킹 prefix만 표시
- [x] Billing 관련 관리자 엔드포인트 잠금 보강
  - `backend/app/api/v1/endpoints/admin.py`
    - `POST /admin/upgrade-user-subscription` → superuser만 허용
    - `POST /admin/init-db` → superuser만 허용
- [x] 완료 기준
  - 일반 사용자 기준으로 plan 변경/DB 마이그레이션 트리거 같은 고위험 동작이 API로 노출되지 않는다.
  - 사용자 관점에서는 프로필 수정 + SDK/API key 발급이 실제 동작한다.

#### I-1. 표준 계정 기능 중 MVP 범위 밖(Out-of-scope for now)

- **비로그인 상태 비밀번호 재설정(“비밀번호 찾기”)**
  - 일반 SaaS: 이메일 링크 기반 reset 플로우 (`/auth/password-reset-request` + `/auth/password-reset-confirm` 류)
  - 현재: 로그인 상태에서의 비밀번호 변경만 제공. reset 플로우는 P2 이후로 미룬 상태.
- **이메일 주소 검증(Email verification)**
  - 일반 SaaS: 가입 후 이메일 인증 필수, 미인증 계정 제한.
  - 현재: 초기 베타에서는 가입 즉시 사용 가능. 이메일 검증은 추후 외부 사용자 확대 시점에 도입.
- **소셜 로그인/SSO (Google/GitHub/SAML 등)**
  - 일반 B2B: 회사 도메인/IdP 기반 로그인.
  - 현재: 이메일+패스워드만 제공. 실제 팀 단위 온보딩이 늘어나면 SSO를 별도 페이즈로 도입.
- **2FA/MFA (OTP/SMS/Authenticator)**
  - 일반: 보안 민감 환경에서 필수에 가까움.
  - 현재: 브루트포스 방지/로그인 시큐리티는 구현되어 있으나, MFA는 초기 스코프 밖.
- **사용자 셀프 계정 삭제(탈퇴)**
  - 일반: 내 계정/데이터 삭제 요청 플로우.
  - 현재: 내부/초기 베타 단계에서는 운영자 수동 처리 가정. 정책/법적 요구 정리 후 구현 예정.
- **이메일 초대 기반 팀 온보딩**
  - 일반: Org OWNER/ADMIN이 이메일로 멤버 초대 → 링크 수락 시 가입.
  - 현재: Org/Project/Role 모델은 있으나, 이메일 초대/수락 플로우는 아직 구현하지 않음.
- **Self-serve Billing (카드 결제/영수증/Tax 정보 관리)**
  - 일반: Stripe 등과 연동된 자가 결제/업그레이드.
  - 현재: Free plan만 실동, 유료 플랜/결제는 잠겨 있음. 과금 전략 안정화 후 별도 페이즈에서 도입.
- **고급 알림·세션 관리**
  - 예: 이메일 알림 세부 설정, 세션 목록/강제 로그아웃, 프로필 이미지/타임존 설정 등.
  - 현재: 핵심 기능(MVP Node Gate, Live View, Release Gate)과 직접 연결되지 않는 편의 기능으로, 후순위로 둠.

---

### J. Auth UX Baseline Alignment

- [x] `frontend/app/login/page.tsx` 로그인/회원가입 흐름 정리
  - signup query mode(`?mode=signup`) 진입 유지
  - 재인증 안내(`?reauth=1`, `?session_expired=1`) 1회 메시지 + URL 정리
  - post-auth redirect를 안전한 내부 `next` 경로 우선으로 통일(기본 `/organizations`)
- [x] 인증 가드 공통화
  - `frontend/hooks/useRequireAuth.ts` 추가
  - 프로젝트 settings 계열 및 `/settings/profile`에서 중복 localStorage 체크 제거 후 공통 훅 사용
  - `frontend/components/layout/OrgLayout.tsx`에서도 공통 인증 가드 사용
- [x] 수동 테스트 시나리오 반영
  - `docs/manual-test-scenarios-mvp-replay-test.md`
  - `I. Login & Signup Flow (MVP baseline)` 섹션 추가

---

### K. Org/Project Layout Responsibility Cleanup

- [x] Project settings 공통 레이아웃 셸 분리
  - `frontend/components/layout/ProjectSettingsShell.tsx` 추가
  - 공통 구조(OrgLayout + ProjectTabs + 페이지 헤더)는 셸에서 담당
- [x] settings 하위 페이지를 데이터 중심으로 단순화
  - `frontend/app/organizations/[orgId]/projects/[projectId]/settings/page.tsx`
  - `frontend/app/organizations/[orgId]/projects/[projectId]/settings/general/page.tsx`
  - `frontend/app/organizations/[orgId]/projects/[projectId]/settings/notifications/page.tsx`
  - `frontend/app/organizations/[orgId]/projects/[projectId]/settings/api-keys/page.tsx`
- [x] 완료 기준
  - settings 하위 페이지에서 중복 레이아웃 코드가 제거되고, 페이지 파일은 주로 데이터 로딩/폼 로직에 집중한다.

---

### L. RBAC Boundary Hardening (Admin/Internal)

- [x] 관리자 전용 엔드포인트 권한 검사 표준화
  - `backend/app/core/permissions.py`의 `require_admin(...)`를 재사용
  - 적용:
    - `backend/app/api/v1/endpoints/admin.py`
    - `backend/app/api/v1/endpoints/internal_usage.py`
    - `backend/app/api/v1/endpoints/admin/users.py`
    - `backend/app/api/v1/endpoints/admin/stats.py`
    - `backend/app/api/v1/endpoints/admin/impersonation.py`
- [x] admin mutation 경계 강화
  - `POST /admin/generate-sample-data`를 superuser-only로 제한
- [x] 보안/테스트 문서 반영
  - `SECURITY.md`에 admin hardening baseline 업데이트
  - `docs/manual-test-scenarios-mvp-replay-test.md`에 `J. Admin Access Boundary` 추가

---

### M. Role Matrix Baseline (Project Scope)

- [x] Project role boundary 문서화
  - `SECURITY.md`에 owner/admin/member/viewer baseline 추가
  - 권한 체크 기준: `check_project_access(..., required_roles=[...])`
- [x] Destructive route role 강화
  - `POST /projects/{project_id}/behavior-datasets/{dataset_id}/delete` → owner/admin required
  - 파일: `backend/app/api/v1/endpoints/projects.py`
- [x] admin-only sample data 경로와 충돌 정리
  - project create 시 `generate_sample_data` 자동 호출은 superuser 요청에서만 수행
- [x] 수동 테스트 시나리오 반영
  - `docs/manual-test-scenarios-mvp-replay-test.md`에 `K. Project Role Boundary` 추가

---

### N. Endpoint Access Matrix (Operational Reference)

- [x] 엔드포인트 권한 매트릭스 문서 추가
  - `docs/mvp-endpoint-access-matrix.md`
  - auth/settings/organization/project/admin/internal 범위의 MVP 권한 기준 정리
- [x] 보안 문서와 연결
  - `SECURITY.md`에서 access matrix를 canonical reference로 링크

---

### O. Access Gap Backlog (Priority)

- [x] 권한 갭 백로그 문서 생성
  - `docs/mvp-endpoint-access-gap-list.md`
  - P1/P2/P3 우선순위로 권한 갭 및 권장 조치 정리
- [x] P1 갭 2건 폐쇄
  - Live View mutation(설정/삭제/saved-logs write) → owner/admin 제한
    - `backend/app/api/v1/endpoints/live_view.py`
  - Project user API key mutation(create/delete) → owner/admin 제한
    - `backend/app/api/v1/endpoints/user_api_keys.py`
  - 관련 문서 동기화:
    - `docs/mvp-endpoint-access-matrix.md`
    - `docs/mvp-endpoint-access-gap-list.md`
    - `docs/manual-test-scenarios-mvp-replay-test.md` (`K-4`, `K-5`)
- [x] 잔여 갭 마무리(P2/P3)
  - Organization write 권한 정책을 MVP owner-only로 명시 고정 (`G-3`)
  - admin/internal 권한 보호 스타일 중앙화 완료 (`G-4`)
  - non-superuser의 `generate_sample_data=true` 요청은 명시적 403로 변경 (`G-6`)
  - RBAC 통합 테스트 baseline 추가 (`G-5`)
    - `backend/tests/integration/test_api_rbac_boundaries.py`

