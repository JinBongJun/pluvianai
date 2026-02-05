# AgentGuard 설계 대화 요약

*Last Updated: 2026-02-02* (4번 한 번에 하나만 실행 반영 - §14.8)

---

## 1. 프로젝트 개요

AgentGuard는 LLM/Agent의 안전성과 신뢰성을 테스트하고 모니터링하는 서비스입니다.

### 핵심 기능
- **Live View**: SDK로 캡처한 LLM 호출을 실시간 모니터링
- **Test Lab**: 다양한 조건으로 LLM 테스트 실험

---

## 2. Live View 설계

### 2.1 Agent Box
- System Prompt 기준으로 자동 그룹핑
- 이름: System Prompt 첫 20자 (Settings에서 수정 가능)
- **한 Live View 캔버스당 박스 최대 30개**까지만 시각화 (추가 트래픽은 `snapshots`에만 기록)

### 2.2 Box 클릭 시 상세 패널 (탭 구조)
| 탭 | 내용 |
|---|------|
| Prompt | System Prompt 표시 |
| Metrics | 통계 (호출 수, 성공률, 평균 응답시간 등) |
| Snapshots | 모든 호출 기록 |
| Worst | Signal 실패한 호출들 |
| Settings | 이름 변경, Signal 설정, 삭제, Test Lab 복사 |

### 2.3 삭제 동작
- 삭제 시 Snapshot 유지/삭제 선택 가능
- 같은 System Prompt 호출 시 자동 재생성

### 2.4 화살표 (Live View)
- 시각화 용도 (실제 실행과 무관)
- trace() 사용 시 자동 생성
- trace() 없으면 수동으로 그리기 가능
- 경고문: "이 화살표는 실제 흐름과 다를 수 있습니다" (dismiss 가능)

---

## 3. Test Lab 설계

### 3.1 시작 화면 (Empty State)
- Import from Live View
- Start from scratch
- Upload CSV

### 3.2 박스 생성 & draw.io 스타일 연결 (React Flow 사용)
**박스 생성:**
- 좌측 툴바의 **[□]** 버튼을 한 번 클릭하면, **현재 보이는 캔버스 뷰포트의 중앙**에 기본 크기(예: 280×160)의 새 박스가 생성된다.
- 박스를 선택하면 모서리/가장자리에 리사이즈 핸들이 나타나 **자유롭게 크기를 조정**할 수 있으며, 최소 크기(예: 200×100)를 유지한다.
- 한 Test Lab 캔버스당 박스는 **최대 30개**까지만 생성 가능하며, 31번째부터는 생성이 막히고 안내 메시지를 띄운다.

**연결 (draw.io 스타일):**
1. 기본: 모서리 리사이즈 핸들
2. Hover: 4방향 연결 핸들 (▲▼◀▶)
3. 드래그하여 연결
4. 연결 완료 시 순서 번호 입력

### 3.3 순서 번호 규칙
- 화살표 머리 **위**에 숫자 표시
- **같은 숫자 = 병렬 실행**
- **다른 숫자 = 순차 실행** (번호 순)
- 각 화살표는 독립된 선 (분기/합류 없음)

### 3.4 입력 데이터 구분
| 구분 | 용도 | 예시 |
|------|------|------|
| **Input Data** | 테스트 시작용 | 질문들, 테스트 케이스 |
| **Additional Data** | 추가 첨부용 | 이미지, 코드 파일, 문서 |

### 3.5 테스트 버튼 활성화 규칙
```
✅ 활성화 = Input Data + System Prompt + Model (필수 3개)
❌ 비활성화 = Input Data 없음 (Additional Data만 있어도 안 됨)
```
- 그룹 박스 없음 (삭제됨)
- 각 박스에 테스트 버튼 있음
- Input Data 있는 박스 = 시작점 (자동 결정)

### 3.6 박스 설정 패널
**연결 정보 (Connections):**
- Input from: 어디서 입력 받는지
- Output to: 어디로 출력 가는지

**필수 설정:**
- Model (필수)
- System Prompt (필수)

**입력:**
- Input Data: 테스트 시작용 (Snapshots, CSV, Manual)
- Additional Data: 추가 파일 (이미지, 코드 등)

### 3.7 Test Data 로딩
- Live View Snapshots에서 가져오기
- 이전 Test Results에서 가져오기
- CSV 업로드 (컬럼 매핑 UI)
- 수동 입력

### 3.8 테스트 결과
- 리스트 뷰 + 페이지네이션
- Live View 응답과 나란히 비교 (시각적)
- 버튼: [💾 Save All], [Export CSV ▼], [⚠️ Mark Fails as Worst]

---

## 4. Signal 설정 (평가 기준)

### 4.1 Signal 종류 (13개)

**📏 Rule-based:**
- Length Change (±%)
- Keyword Check (태그 스타일)
- JSON Schema (기본/고급)
- Regex Pattern (프리셋 제공)

**📐 Metric-based:**
- ROUGE Score (Reference Text 필요)
- Semantic Similarity (Reference Text 필요)
- Token Limit
- Cost Limit
- Latency Limit

**🤖 LLM-as-Judge:**
- Custom Rubric (템플릿/파일 업로드)
- Factual Accuracy
- Safety Check

**💻 Custom Code:**
- Webhook

### 4.2 기본 Signal (0-config)
- Length Change: ±50%
- Latency Limit: 30초

### 4.3 Webhook 설정 (단순화)
- 응답은 변환 없이 **raw JSON**으로 `signal_result`에 저장
- Fail 판정 조건만 선택:
  - pass/passed = false
  - result/status = "fail"
  - score < threshold
  - HTTP status != 200
  
**Webhook raw 표시:**
- Snapshot/Worst 목록에서는 `Webhook: { "result": "FAIL", "reason": "..."... }`처럼 **앞부분만 잘라서 한 줄로 표시**한다.
- 옆의 `View raw ▸`를 클릭하면 **우측 패널/모달에서 전체 JSON을 pretty-print로 보여주고, [Copy JSON] 버튼**을 제공한다.
- Fail 여부 계산에는 위 조건만 사용하고, raw는 디버깅/근거 확인용으로만 활용한다.

---

## 5. Agent Trajectory (자동 화살표)

### 5.1 SDK 사용법
```python
import agentguard

client = agentguard.wrap(openai)

# 순차 실행
with agentguard.trace("request-123"):
    r1 = client.chat.completions.create(...)
    r2 = client.chat.completions.create(...)

# 병렬 실행
with agentguard.trace("request-456") as t:
    r1 = client.chat.completions.create(...)
    with t.parallel():
        r2 = client.chat.completions.create(...)
        r3 = client.chat.completions.create(...)
    r4 = client.chat.completions.create(...)
```

### 5.2 Graceful Degradation
| SDK 사용 | 결과 |
|----------|------|
| trace() 사용 | 자동 화살표 + 병렬 표시 |
| trace() 미사용 | 개별 Snapshot만 (수동 화살표 가능) |
| wrap() 미사용 | 캡처 안 됨 |

---

## 6. 데이터베이스 구조

### 6.1 snapshots (Live View)
```sql
- id, project_id, agent_id
- trace_id, parent_span_id, span_order, is_parallel  -- Trajectory
- system_prompt, user_message, model, model_settings
- response, latency_ms, tokens_used, cost
- signal_result, is_worst, worst_status
- created_at
```

### 6.2 test_results (Test Lab)
```sql
- id, project_id, agent_id, test_run_id
- step_order, parent_step_id, is_parallel  -- Chain/Parallel
- input, system_prompt, model
- response, latency_ms, tokens_used, cost
- signal_result, is_worst, worst_status
- baseline_snapshot_id, baseline_response  -- 비교용
- created_at
```

### 6.3 저장 구조 (단순화)
- Live View: snapshots 테이블
- Test Lab: test_results 테이블
- Worst: is_worst 플래그로 구분 (별도 테이블 없음)
- 박스별 필터링: agent_id로

---

## 7. 글로벌 UI 구조

### 7.1 상단 네비게이션
```
[AG Logo] [Org/Project 브레드크럼] [🔍 Search ⌘K] [ⓘ Help] [👤 User] [🔔]
```

### 7.2 좌측 툴바 (Test Lab)
```
[:::] 메뉴
[□] 박스 생성
[+] 줌 인
[-] 줌 아웃
[⛶] 캔버스 중앙
[↩] Undo
[↪] Redo
```

### 7.3 우측 책갈피 탭
```
┃ Live View ┃  ← 활성 탭 (더 튀어나옴)
┃ Test Lab  ┃
┃ Snapshots ┃
```
- 전환 시 애니메이션
- Test Only 모드면 Live View 숨김
- **Snapshots 탭**은 해당 프로젝트의 모든 `snapshots`를 박스 수와 무관하게 테이블로 보여주는 **전체 로그 뷰** 역할을 한다.

### 7.4 우측 상단 버튼
- Live View: [Copy All to Test Lab]
- Test Lab: (없음 - 박스 생성은 좌측 툴바에서)

---

## 8. 사용 모드

### 8.1 프로젝트 생성 시 선택
- **Full Mode**: Live View + Test Lab (SDK 필요)
- **Test Only**: Test Lab만 (SDK 불필요)

### 8.2 Playground
- 삭제됨 (Test Only로 대체)

---

## 9. 주요 결정 사항

| 항목 | 결정 |
|------|------|
| Agent 이름 | System Prompt 첫 20자 (수정 가능) |
| Live/Test Lab 박스 수 | 한 캔버스당 최대 30개 박스만 시각화/생성 (추가 호출은 snapshots에만 기록) |
| Snapshots 뷰 | Live/Test Lab 옆에 **Snapshots 탭**을 두고, 프로젝트의 모든 `snapshots`를 테이블로 조회 |
| Hide vs Delete | Delete만 (자동 재생성됨) |
| Worst 저장 | 별도 테이블 없이 is_worst 플래그 |
| Python Function Signal | 삭제 (Webhook으로 대체) |
| expected_output | 삭제 (Signal + 시각적 비교) |
| 화살표 스타일 | draw.io + React Flow |
| 병렬 표시 | 같은 순서 번호 (화살표 머리 위) |
| Webhook 응답 | raw JSON으로 저장, 목록에서는 앞부분만 표시 + `View raw ▸`로 전체 뷰어 제공 |
| **Test Lab Group Box** | **삭제** (불필요) |
| **테스트 버튼 규칙** | Input Data + System Prompt + Model 있을 때만 활성화 |
| **입력 구분** | Input Data (시작용) vs Additional Data (추가 첨부) |
| **시작점 결정** | Input Data 있는 박스 = 시작점 (자동) |

---

## 10. 기술 스택 (예정)

| 영역 | 기술 |
|------|------|
| Frontend | React, React Flow |
| Backend | Python (FastAPI) |
| Database | PostgreSQL |
| SDK | Python (agentguard) |

---

## 11. 참고 라이브러리

### React Flow (화살표/캔버스)
```
- GitHub 20k+ stars
- MIT 라이선스
- smoothstep 엣지 = 직각 화살표
- npm install reactflow
```

---

## 12. 보안 설계 대화 요약 (2026-02-02)

### 12.1 질의 내용
- DETAILED_DESIGN 기준 **보안이 어떻게 되어 있는지**, **보안 수준**, **GitHub 라이브러리 참고 여부** 확인 요청

### 12.2 파악 결과 (문서 vs 실제 코드)
- **문서(SECURITY_GUIDE / DETAILED_DESIGN)**: JWT, bcrypt, AES-256-GCM, RBAC, GDPR/SOC2 등 기술 스택은 명시되어 있었으나, **Rate Limiting·Brute Force·Security Headers**는 상세 기술 없음
- **실제 코드**: 해당 기능들이 **이미 구현됨**
  - **Rate Limiting**: `backend/app/middleware/rate_limit.py` — 분당 60 요청, IP 기준, Redis
  - **Brute Force Protection**: `backend/app/services/brute_force_protection.py` — 지수적 백오프(3→1분, 5→5분, 10→15분, 15→1시간), 20회 이상 시 CAPTCHA
  - **Security Headers**: `backend/app/middleware/security_middleware.py` — HSTS, CSP, X-Frame-Options, X-Content-Type-Options 등
- **2FA/MFA**: 문서·코드 모두 **미구현** (추가 예정으로 정리)

### 12.3 출시 가능성 논의
- **그대로 출시**: Rate Limiting 없으면 DDoS 등에 취약하다고 판단 → **위험**
- **실제 구현 확인 후**: Rate Limiting·Brute Force·Security Headers가 이미 있음 → **스타트업/개발자 대상 MVP 출시는 현재 보안 수준으로 가능**
- **엔터프라이즈 출시**: SOC2 + 2FA 필요

### 12.4 DETAILED_DESIGN 보안 섹션 업데이트
- **Section 6. Security Design** 대폭 확장:
  - 6.1 인증/인가 (JWT, bcrypt, RBAC) + **2FA/MFA 예정** (TOTP, QR 코드, 복구 코드 10개)
  - 6.2 Rate Limiting & Brute Force Protection (구체 수치·코드 참고)
  - 6.3 Security Headers
  - 6.4 데이터 암호화 (TLS, AES-256-GCM)
  - 6.5 Data Ownership, 6.6 API Key, 6.7 테넌트 격리, 6.8 입력 검증, 6.9 규정 준수, 6.10 보안 모니터링
- **Section 7. 구현 현황**:
  - 7.1 완료: 보안 9개 항목 명시 (JWT, bcrypt, RBAC, Rate Limiting, Brute Force, Security Headers, 암호화, API Key, Audit Log)
  - 7.3 예정: 2FA/MFA, SOC2 Type 1, 보안 대시보드, IP Whitelist

### 12.5 2FA/MFA 계획 (문서 반영)
- **방식**: TOTP (Google Authenticator / Authy 호환)
- **플로우**: Settings → Security → Enable 2FA → QR 코드 + 6자리 코드 검증 → 복구 코드 10개 발급
- **구현 위치**: `backend/app/services/mfa_service.py` (예정), pyotp 사용 예정

---

## 13. API Key · 모델 · Custom 대화 요약 (2026-02-02)

### 13.1 적용 범위 통일
- **Replay·테스트 설정** 등 언급 시 = **Test Lab에서 박스 선택했을 때 나오는 우측 설정**만 의미. 별도 Replay 페이지가 아님.
- 모델 선택·Custom·API Key 입력은 **Test Lab 박스 설정**에서만 사용.

### 13.2 API Key 구분
| 구분 | 용도 | 등록 위치 |
|------|------|-----------|
| **AgentGuard API Key** | SDK로 AgentGuard 연결 시 인증. `agentguard.init(api_key="ag_xxx")` → 호출이 Live View/API Calls에 캡처·표시 | Settings → API Keys (구현됨) |
| **LLM Provider API Key** | Test Lab에서 실제 LLM 호출(OpenAI/Anthropic/Google) 시 사용. 프로젝트별 BYOK | 프로젝트 설정 → LLM API Keys (백엔드만, 프론트 예정) |

- Provider당 키 하나면 해당 Provider의 **모든 모델** 호출 가능. 모델은 요청 시점에 선택.

### 13.3 최종 모델 목록 (DETAILED_DESIGN §5.4.0 반영)
- **OpenAI**: gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-4, gpt-3.5-turbo, o1-preview, o1-mini (표시 이름으로 드롭다운 노출)
- **Anthropic**: claude-3-5-sonnet, claude-3-5-haiku, claude-3-opus, claude-3-sonnet, claude-3-haiku
- **Google**: gemini-1.5-pro, gemini-1.5-flash, gemini-1.0-pro, gemini-pro
- **Custom**: 목록에 없는 모델 또는 **OpenAI·Anthropic·Google이 아닌 Provider**(Mistral, Cohere 등) 사용 시

### 13.4 Custom (목록에 없는 모델 / 다른 Provider)
- **Custom** 선택 시 사용자가 **API Key**(필수) + **Model ID**(필수) + **Base URL**(선택) 입력·등록.
- 테스트 실행 시 **그 API Key**로 요청하고, 사용자 **튜닝 프롬프트·인풋 프롬프트·중간 데이터**로 호출해 결과 생성.
- **Model ID**도 필수: Provider API는 요청 시 `model` 값을 요구하므로, Custom이어도 모델 ID 없으면 호출 불가.
- 잘못 입력 시(잘못된 API Key, 존재하지 않는 Model ID 등) **실행 시 오류**로 처리하고, 사용자 친화 메시지로 표시 (예: "API key is invalid", "Model not found").

### 13.5 테스트 시나리오 추가 (§8.11)
- **T33**: Custom 선택 후 잘못된 API Key(또는 빈 키) 넣고 [▶ Test] 실행 → 실행 시 오류, "API key is invalid" 등 표시.
- **T34**: Custom 선택 후 올바른 API Key + 존재하지 않는 Model ID 넣고 실행 → 실행 시 오류, "Model not found" 등 표시.
- **T35**: Custom 선택 후 API Key / Model ID 중 하나라도 비어 있는 상태에서 [▶ Test] → 유효성 검사 또는 실행 시 오류, "API Key and Model ID are required for Custom." 등 안내.

### 13.6 DETAILED_DESIGN 반영 사항
- §5.4.0: 지원 모델 목록, Custom = API Key + Model ID + Base URL(선택), 잘못 입력 시 실행 시 오류 문구 추가. 적용 범위 = Test Lab 박스 선택 시 우측 패널만.
- §6.6: AgentGuard API Key vs LLM Provider Key 구분, 프론트/백엔드 구현 여부 명시.
- §8.11: Custom (API Key · Model ID) · 실행 시 오류 테스트 T33–T35 추가. §8.12 기타로 T36–T37 번호 정리.

---

## 14. 서비스 제한 논의 요약

### 14.1 배경
테스트 실행·데이터 보관·CSV 임포트 등에 플랜별 한도를 두어 서비스 부담 방지 및 공정 사용을 목표로 함.

### 14.2 총 호출 수 계산
- **식**: `테스트 1회 총 호출 수 = 인풋 개수 × 체인 스텝 수 × repeat_count`
- 예: 인풋 10, 스텝 3, repeat 2 → 60 calls

### 14.3 반영된 한도 (subscription_limits.py · DETAILED_DESIGN §2.10)
| 제한 | Free | Indie | Startup | Pro | Enterprise |
|------|------|-------|---------|-----|------------|
| input_prompts_per_test | 50 | 200 | 500 | 1,000 | 5,000 (협의) |
| repeat_count_per_test | 10 | 50 | 100 | 300 | 1,000 (협의) |
| csv_import_row_limit | 200 | 500 | 1,000 | 2,000 | 10,000 (협의) |
| total_calls_per_single_test | 1,000 | 5,000 | 50,000 | 200,000 | 1,000,000 (협의) |
| concurrent_tests_per_project | 1 | 2 | 3 | 5 | 10 (협의) |

### 14.4 문서·구현 반영
- **subscription_limits.py**: 위 5개 키 플랜별 추가 완료.
- **DETAILED_DESIGN.md**: §2.10 테스트 실행 제한 및 최적화(개요, 계산식, 표, UI/UX), §7.1 완료(플랜별 제한 정의), §7.3 예정(TTL/삭제 스케줄러, UI 예상 호출·한도 경고, 동시 테스트 큐/스케줄링).
- **테스트 시나리오 (§8.12)**: 한도 초과 시 **프론트 경고** 검증용 시나리오 추가. T38(인풋 한도), T39(Repeat count 한도), T40(CSV 행 한도), T41(예상 호출 수·총 호출 한도), T42(동시 테스트 한도). 기존 §8.12 기타 → §8.13으로 이동.

### 14.5 1번 플랜 한도 노출 결정
- **결정**: 테스트 관련 한도 5개를 `GET /api/v1/subscription`(현재 구독) 및 `GET /api/v1/subscription/plans`(전체 플랜)의 응답 `limits`에 포함하여 프론트에 노출.
- **키 이름**: snake_case 유지 (`input_prompts_per_test`, `repeat_count_per_test`, `csv_import_row_limit`, `total_calls_per_single_test`, `concurrent_tests_per_project`).
- **수정 위치**: `SubscriptionService.get_user_plan()` 의 `limits` 구성, `GET /subscription/plans` 응답의 `limits` 구성.
- **DETAILED_DESIGN 반영**: §2.10에 "한도 노출 (API)" 소절 추가, §7.3 예정에 "한도 API 노출" 항목 추가.

### 14.6 2번 Org plan_type 5단계 통일 결정
- **결정**: Organization `plan_type`을 Subscription과 동일하게 5단계(`free`, `indie`, `startup`, `pro`, `enterprise`)로 통일.
- **반영**: (1) 백엔드: `Organization` 모델 주석, `OrgCreate` 스키마 패턴, GET org 응답 `plan_limits`(indie/startup 추가, calls/cost 값 설정). (2) 프론트: `lib/schemas.ts` OrganizationSchema `plan_type` enum, `lib/api.ts` PlanType·normalizePlan. (3) DETAILED_DESIGN §7.1 완료에 "Organization plan_type 5단계 통일" 항목 추가.

### 14.7 3번 한도 검증 (Replay/Regression) 결정
- **결정**: Replay·Regression 실행 전 `input_prompts_per_test`, `total_calls_per_single_test` 검사. 초과 시 HTTP 403 + detail 및 선택적 code (`LIMIT_INPUTS_PER_TEST`, `LIMIT_TOTAL_CALLS_PER_TEST`).
- **반영**: (1) DETAILED_DESIGN §2.10 "한도 검증 (백엔드)" 소절 추가, §7.1 완료에 한도 검증 항목 추가. (2) 백엔드: Replay `POST /replay/{project_id}/run`, Regression `POST /projects/{project_id}/regression/test`에 한도 검증 로직 및 테스트 추가.
- **테스트 내용 문서화**: DETAILED_DESIGN §2.10 "한도 검증 (백엔드)"에 자동 테스트 내용 추가 — Unit `tests/unit/test_test_limits.py`(한도 이하 통과, 인풋/호출 초과 시 403·code 검증), Integration `tests/integration/test_api_test_limits.py`(Replay·Regression 한도 초과 요청 시 403 및 code/limit/requested 검증). CONVERSATION_SUMMARY §14.7에 위 테스트 내용 반영.

### 14.8 4번 한 번에 하나만 실행 (동시 테스트 = 1) 결정
- **결정**: 전 플랜 **한 번에 하나만** 테스트 실행. 유료라도 여러 개 동시 실행 시 과부하 우려로 **전부 1로 통일**. 적용 단위 **사용자당** (다른 프로젝트에서 동시 실행 불가). 테스트는 하나 끝난 뒤 다음 실행.
- **UI**: 실행 중이면 **다른 박스/ [▶ Test] 전부 비활성화** — 다른 테스트 스타트 막기.
- **반영**: (1) `subscription_limits.py` 전 플랜 `concurrent_tests_per_project` = 1. (2) DETAILED_DESIGN §2.10 플랜별 표·문단·UI/UX·T42·§7.3 예정 수정. CONVERSATION_SUMMARY §14.8 추가.

### 14.9 오류 시 사용자용 설명 (모든 경우)
- **결정**: 한도·검증 등 규격 외 행동으로 403/400 등이 나올 때 **코드만 보여주지 말고, 왜 오류가 났는지 설명을 반드시 노출**하여 사용자 혼란을 줄인다.
- **반영**: (1) 백엔드 `http_exception_handler`: `detail`이 dict이고 `message` 키가 있으면 `error.message`에 해당 문자열을 넣고, `error.details`에 code/limit/requested 등 전달. 응답으로 사용자용 문장이 노출되도록 함. (2) DETAILED_DESIGN §2.10 "실패 시"·"한도 초과 시"에 **오류 시 사용자용 설명** 원칙 추가 — 모든 한도·검증 오류에 적용.

---

*이 문서는 설계 대화 내용을 요약한 것입니다.*
*상세 설계는 DETAILED_DESIGN.md를 참고하세요.*
