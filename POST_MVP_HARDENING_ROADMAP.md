## Post-MVP Hardening Roadmap

이 문서는 **현재 베타/초기 프로덕션 기준으로 “필수는 다 한 뒤”**, 다음 단계에서 진행할 하드닝·스케일업 작업을 정리한 TODO 리스트입니다.

### 1. 운영/신뢰성 레벨업 (스케일 단계)

- **SLO·알람 튜닝**
  - 현재 `ops_alerting` 기반 알림은 베이스라인 상태.
  - 실제 트래픽 패턴과 장애 사례를 1–2개월 이상 관찰한 뒤:
    - SLO(예: p95 latency, error rate, Release Gate 실패율) 정의·문서화.
    - 알림 임계값/쿨다운/집계 윈도우를 SLO에 맞게 재튜닝.
    - “노이즈 알람” / “놓친 알람” 사례를 수집해 룰 조정.

- **Release Gate / Live View 부하 테스트 & 장시간 런 안정성 검증**
  - 목적: replay / live-streaming 경로가 **고 QPS + 장시간(수십 분~수 시간)** 상황에서도 메모리/커넥션/잡 상태가 안정적인지 확인.
  - 해야 할 일:
    - 간단한 부하 테스트 시나리오 작성 (e.g. `locustfile.py` 확장 또는 k6 도입).
    - Live View 노드 수·트래픽량, Release Gate 반복 실행 수(repeat_runs) 스케일 업 시 메트릭/로그 확인.
    - 장시간(예: 1–2h) Replay job을 돌려 job poller·취소 플로우·메모리 사용량·DB 부하를 관측.
    - 결과를 BLUEPRINT/운영 문서에 캡처(“검증된 한계치” + “권장 사용 범위”).

- **백업/복구 드릴 (운영 연습)**
  - 백업 스크립트/정책은 이미 존재하지만, 실제 **복구 시나리오 리허설**은 별도로 수행해야 함.
  - 해야 할 일:
    - “가장 중요한 데이터/테이블이 무엇인지”를 기준으로 RPO/RTO 가설 정의.
    - 별도 테스트 DB에 백업 덤프를 복원해, 앱을 해당 DB에 연결해보는 end-to-end 복구 드릴 실행.
    - 복구 절차를 runbook 형태로 문서화 (명령어, 예상 소요 시간, 롤백 전략).

### 2. 테스트·품질 자동화

- **핵심 시나리오 일부를 자동 E2E로 승격 (CI에서 실행)**
  - 현재 `docs/manual-test-scenarios-mvp-replay-test.md` 기반 수동 시나리오가 잘 정리되어 있음.
  - 해야 할 일:
    - 가장 중요한 플로우(INT-6 해피패스, Live View/Release Gate 단일 노드 기본 플로우, 무료 한도 차단 몇 개)를 골라 Cypress/Playwright/pytest+Playwright 등으로 자동화.
    - CI에서 최소 smoke 세트만 실행(전체 시나리오가 아니라 “배포 전 회귀 방지용 핵심”에 집중).

- **Replay / Release Gate 계약(Contract) 테스트**
  - 목적: Release Gate·Replay 응답 스키마가 바뀔 때, 프론트/레포트 뷰가 깨지지 않도록 가드레일 마련.
  - 해야 할 일:
    - `ReleaseGateResult`, `ReleaseGateRunResult` 등 타입/스키마에 대한 고정된 샘플 JSON을 `backend/tests/fixtures` 또는 `frontend` 쪽 계약 테스트로 보관.
    - 백엔드에서 응답 스키마 변경 시, 이 샘플에 대해 JSON schema / pydantic / snapshot 테스트를 돌려 breaking change 조기 감지.
    - 프론트(ReleaseGateExpandedView) 쪽은 최소한 “주요 필드가 없을 때 graceful degrade 하는지”를 스냅샷 테스트나 storybook-level 테스트로 커버.

### 3. 보안·신뢰 심화 (SOC2 / 엔터프라이즈 단계)

- **조직 단위 감사 로그 + Admin 툴링**
  - 현재: 역할/권한 모델과 주요 403/에러 메시지는 정리되어 있으나, **감사/운영자 관점의 뷰**는 최소화 상태.
  - 해야 할 일:
    - 중요한 행위(조직/프로젝트 생성·삭제, 멤버 초대/제거, API 키 생성/폐기, Release Gate 실행 등)에 대한 audit log 스키마·보존 정책 재검토.
    - 간단한 Admin UI 또는 내부 전용 페이지로 감사 로그를 조회/필터링할 수 있는 뷰 제공.

- **내부 운영자 액세스 통제 정책**
  - 어떤 상황에서 운영자가 고객 데이터/로그에 접근 가능한지, 어떤 인증 수단(god-mode, impersonation, 긴급 모드 등)을 사용하는지에 대한 정책 정리.
  - 최소:
    - “누가 / 언제 / 어떤 이유로” 고객 워크스페이스를 열람했는지 남기는 메커니즘.
    - 운영 권한을 가진 계정/토큰의 수를 줄이고, 주기적으로 검토하는 절차.

- **계정/인증 옵션 확장 (비밀번호/SSO)**
  - 현재 이메일+비밀번호 기반 기본 로그인만 있는 상태에서, 엔터프라이즈를 위한 SSO 옵션(예: Google, Okta, SAML 등)은 다음 단계에서 도입.
  - 도입 시 고려:
    - 조직 단위 IdP 연동 모델(SLO, Just-in-time provisioning).
    - MFA 옵션 여부.

- **비즈니스 연속성·보안 문서화**
  - 이미 `/terms`, `/privacy`, `/security`에 MVP 수준 설명이 있으나, SOC2 레벨을 목표로 할 경우:
    - RTO/RPO, 백업 정책, 장애 대응 절차, 데이터 위치·서브프로세서 목록 등을 좀 더 formal한 문서(“Trust Center”)로 정리.
    - 고객/고객사 엔지니어가 질문할 때 바로 링크로 답변 가능한 형태로 유지.

