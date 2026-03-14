# GPT 5.4 Agent Test Execution Runbook

이 문서는 `docs/manual-test-scenarios-mvp-replay-test.md`를
**GPT 5.4 에이전트 모드**로 실제 수행할 때 사용하는 실행 가이드다.

목표는 단순 체크가 아니라, 각 섹션을 에이전트가 직접 실행하고:

- 브라우저 + 백엔드 기준으로 검증하고,
- PASS / FAIL / PARTIAL을 남기고,
- 증거(스크린샷/요청/응답)를 모으고,
- 발견된 문제를 바로 수정 후보로 연결하는 것이다.

---

## 1) 기본 운영 원칙

- 한 번에 문서 전체를 몰아서 돌리지 말고 **라운드 단위**로 나눈다.
- 각 라운드는:
  - 실행
  - 결과 요약
  - 버그/개선점 정리
  - 수정
  - 재테스트
  순서로 닫는다.
- 각 라운드마다 에이전트에게 아래를 반드시 요구한다:
  - 어떤 시나리오를 실행했는지
  - 실제로 무엇을 눌렀고 어떤 요청을 보냈는지
  - 기대값 대비 무엇이 맞고 틀렸는지
  - 다음 수정 포인트가 프론트/백엔드/문서 중 어디인지

---

## 2) 사전 준비

- 테스트용 프론트엔드 URL 1개
- 테스트용 백엔드 API URL 1개
- 테스트용 조직/프로젝트 최소 2세트
  - `Org A / Project A`
  - `Org B / Project B`
- 테스트 계정 최소 5개
  - owner
  - admin
  - member
  - viewer
  - non-member
- 캡처 저장 위치 1개
  - 예: `evidence/2026-03-09-round1/`

권장:

- 토이 프로젝트 하나에 snapshot 30~50개 적재
- 대용량 테스트용 프로젝트 하나에 snapshot 수백 개 이상 적재
- analytics/PostHog 확인 가능한 테스트 환경 준비

---

## 3) 추천 실행 라운드

### Round 1. 온보딩 + 핵심 제품 플로우

- `INT`
- `A`
- `B`
- `C`
- `D`
- `E`

목표:

- 첫 데이터가 대시보드에 안정적으로 보이는지
- Live View / Release Gate 핵심 UX가 깨지지 않는지

### Round 2. 가격/계정/기본 권한

- `F`
- `G`
- `H`
- `I`

목표:

- Free tier 한도
- Billing/Usage 노출
- Profile / API key
- 로그인/회원가입 UX

### Round 3. 권한 경계 + 신뢰 표면

- `J`
- `K`
- `L`
- `M`

목표:

- admin / non-admin 경계
- project role 경계
- project list UX
- legal / trust / role UX

### Round 4. 보안 / 복원력 / 프라이버시

- `N`

목표:

- 세션 만료
- 멀티 테넌트 격리
- 브루트포스 / CAPTCHA
- XSS / 입력 sanitization
- 대용량 응답성
- analytics redaction

### Round 5. 운영 알림

- `OPS`

목표:

- 운영 알림이 실제 운영 관점에서 actionable 한지 확인

---

## 4) 에이전트에게 공통으로 줄 프롬프트 템플릿

아래 프롬프트는 섹션 이름만 바꿔서 재사용한다.

```text
너는 지금부터 QA 엔지니어 + 풀스택 엔지니어 역할을 동시에 맡는다.

목표:
- `docs/manual-test-scenarios-mvp-replay-test.md` 문서의 `{{섹션 이름}}` 시나리오들을
  실제 브라우저와 백엔드 기준으로 수행하고,
  각 시나리오별 PASS / FAIL / PARTIAL과 근거를 남기고,
  발견된 문제를 수정 가능한 형태로 정리하는 것.

환경 정보:
- 프론트엔드 URL: {{FRONTEND_URL}}
- 백엔드 URL: {{BACKEND_URL}}
- 테스트 계정:
  - owner: {{OWNER_EMAIL}}
  - admin: {{ADMIN_EMAIL}}
  - member: {{MEMBER_EMAIL}}
  - viewer: {{VIEWER_EMAIL}}
  - non-member: {{NON_MEMBER_EMAIL}}
- 기본 테스트 리소스:
  - orgId: {{ORG_ID}}
  - projectId: {{PROJECT_ID}}

작업 방식:
1. 먼저 이번에 실행할 시나리오 ID 목록을 정리한다.
2. 각 시나리오마다 아래 형식으로 결과를 남긴다.
   - Scenario
   - Precondition
   - Action
   - Verify
   - Result: PASS / FAIL / PARTIAL
3. FAIL 또는 PARTIAL이 있으면 아래 형식으로 정리한다.
   - severity: blocker / high / medium / low
   - layer: frontend / backend / docs / product decision
   - summary
   - suggested fix
4. 마지막에 섹션 전체 총평을 남긴다.
   - SMB production baseline 기준: OK / Warning / Blocked

주의:
- 가능하면 브라우저 액션과 API 확인을 함께 사용한다.
- 민감정보(token, password, api key, raw secret)가 노출되면 반드시 지적한다.
- 에러 메시지는 사용자 관점에서 충분히 이해 가능한지도 평가한다.
```

---

## 5) 라운드별 권장 프롬프트

### Prompt A. Round 1 (`INT` + `A` + `B` + `C` + `D` + `E`)

```text
`docs/manual-test-scenarios-mvp-replay-test.md`의 `INT`, `A`, `B`, `C`, `D`, `E`를 순서대로 수행해라.

우선순위:
- 신규 사용자가 첫 데이터까지 도달 가능한지
- Live View / Release Gate 핵심 플로우가 끊기지 않는지
- 결과 상세, dataset 저장/append, repeat run 판정이 기대대로 동작하는지

특히 집중해서 볼 것:
- empty/loading/error/access-denied 상태
- Evaluation 결과 불변성
- dataset append / node scope 분리
- Release Gate 결과 요약 / flaky 판정 / 상세 비교

각 실패는 "기능 버그 / UX 혼란 / 문서 불일치" 중 하나로 분류해라.
```

### Prompt B. Round 2 (`F` + `G` + `H` + `I`)

```text
`docs/manual-test-scenarios-mvp-replay-test.md`의 `F`, `G`, `H`, `I`를 수행해라.

우선순위:
- free tier 한도 초과 시 서버 응답과 UI 메시지가 일관된지
- Billing/Usage 화면이 실제 정책을 오해 없이 설명하는지
- API key 생성/노출/삭제 UX가 안전한지
- 로그인/회원가입 플로우가 자연스럽고, 인증 오류 메시지가 적절한지

각 실패는 "보안 / 과금 신뢰 / UX / 문서" 중 하나로 분류해라.
```

### Prompt C. Round 3 (`J` + `K` + `L` + `M`)

```text
`docs/manual-test-scenarios-mvp-replay-test.md`의 `J`, `K`, `L`, `M`를 수행해라.

우선순위:
- 관리자 전용 경로와 일반 사용자 경로가 명확히 분리되는지
- project role(owner/admin/member/viewer) 경계가 실제로 지켜지는지
- 조직/프로젝트 탐색 UX가 자연스러운지
- legal / privacy / security / role explainer가 서비스 신뢰를 해치지 않고 잘 노출되는지

각 실패는 "권한 버그 / UX 혼란 / trust copy 문제 / 정보 구조 문제" 중 하나로 분류해라.
```

### Prompt D. Round 4 (`N`)

```text
`docs/manual-test-scenarios-mvp-replay-test.md`의 `N. Security / Resilience / Privacy Hardening`을 전부 수행해라.

우선순위:
- N-1 세션/토큰 만료 후 재인증 흐름
- N-2 cross-org / cross-project 접근 차단
- N-3 brute-force / CAPTCHA 차단과 복구
- N-4 XSS / unsafe HTML 입력 처리
- N-5 대용량 데이터 환경에서 응답성
- N-6 analytics payload 민감정보 redaction

추가 요구:
- 각 시나리오마다 브라우저 관찰 결과와 API 수준 관찰 결과를 함께 남겨라.
- "이 항목이 SMB 프로덕션에서 필수 수정인지, 아니면 후속 개선인지"를 같이 표시해라.
- 보안상 민감한 노출이 있으면 severity를 최소 high 이상으로 판단해라.
```

### Prompt E. Round 5 (`OPS`)

```text
`docs/manual-test-scenarios-mvp-replay-test.md`의 `OPS` 섹션을 수행해라.

우선순위:
- 실제 장애/열화 시 알림이 발생하는지
- 중복 알림이 과도하지 않은지
- 복구 알림이 있는지
- alert payload만 보고도 운영자가 바로 triage를 시작할 수 있는지

각 실패는 "모니터링 갭 / alert noise / 운영 실행성 부족" 중 하나로 분류해라.
```

---

## 6) 에이전트 실행 후 사람이 할 일

- 결과를 바로 믿고 끝내지 말고, 아래만 빠르게 확인한다:
  - blocker / high 이슈가 실제로 재현 가능한지
  - evidence가 충분한지
  - 수정 레이어 지정이 맞는지
- 수정 후에는 같은 프롬프트로 **re-test only** 라운드를 돌린다.

예시:

```text
방금 FAIL/PARTIAL이 나온 항목만 다시 테스트해라.
기존 결과와 비교해서:
- 해결됨
- 부분 해결
- 여전히 재현됨
으로만 요약해라.
새로운 회귀가 생기면 별도로 표시해라.
```

---

## 7) 최소 성공 기준

아래 기준을 만족하면 1차 테스트 라운드를 통과한 것으로 본다.

- Round 1에서 blocker 없음
- Round 2에서 billing/auth/key 관련 high 없음
- Round 3에서 권한 경계 blocker 없음
- Round 4에서 보안/격리/민감정보 노출 blocker 없음
- Round 5에서 운영 알림이 최소 한 번은 성공적으로 검증됨

권장:

- blocker/high는 수정 후 동일 라운드를 다시 돌린다.
- medium/low는 별도 backlog로 넘기되, 사용자 신뢰를 해치는 항목은 우선순위를 올린다.

