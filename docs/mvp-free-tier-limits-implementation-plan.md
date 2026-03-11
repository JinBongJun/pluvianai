# MVP: 무료로 써보기 + 한도 적용 — 구현 계획

## 0. 목표

- **메시지**: "무료로 써보기" / "Get started free" — 가입하면 free 플랜으로 바로 사용.
- **한도**: free 플랜 한도를 실제로 적용해서, 체험은 넉넉하게 주되 비용·남용은 막기.
- **대상**: 콘텐츠로 유입된 사용자 = 전부 free. (마스터/토이 계정은 별도 처리 가능.)

---

## 1. 현재 상태 정리

### 1.1 이미 있는 것

| 항목 | 위치 | 비고 |
|------|------|------|
| free 플랜 한도 정의 | `backend/app/core/subscription_limits.py` | `projects`, `api_calls_per_month`, `snapshots_per_month`, `data_retention_days` 등 |
| 가입 시 플랜 | `user_service` | Subscription 기본 `plan_id="free"` |
| 플랜/한도 조회 | `SubscriptionService.get_user_plan()` | limits, features 반환 |
| GuardCredit 로깅 | `replay_service` + `Usage` | `metric_name="guard_credits_replay"`, `quantity` 누적 |
| 데이터 보존 | `data_lifecycle_service` | `data_retention_days` 사용 (free=7). Raw snapshots + Release Gate history 모두 동일 retention 적용 |

### 1.2 안 맞는 것 / 비어 있는 것

| 항목 | 내용 |
|------|------|
| `SubscriptionService.check_usage_limit()` | `Usage`에 `metric_type`, `period_start`, `current_usage` 기대하지만, 실제 모델은 `metric_name`, `quantity`, `timestamp`만 있음 → **현재 스키마와 불일치** |
| 스냅샷 생성 시 한도 체크 | 없음. 스냅샷 생성하는 곳에서 `snapshots_per_month` 미적용 |
| 프로젝트 생성 시 한도 | `projects` 한도 적용 여부 불명, 확인 필요 |
| Replay(GuardCredits) 한도 | free 플랜용 **월간 GuardCredit 상한** 없음. 로깅만 하고 차단 로직 없음 |
| 사용자에게 한도 노출 | Billing/Usage 페이지에 "이번 달 X / 한도 Y" 같은 표시 없을 수 있음 |

---

## 2. 구현 단계

### Phase 1 — free 플랜 한도 실제 적용 (백엔드)

**목표**: 스냅샷·프로젝트·(선택) Replay 에서 free 한도를 넘으면 차단하고, 명확한 에러 메시지 반환.

#### 1.1 공통: "현재 사용량 조회" 헬퍼

- **위치**: `SubscriptionService` 또는 새 모듈 `app/core/usage_limits.py`.
- **역할**:
  - **스냅샷**: 해당 user(또는 org 소유자)가 속한 프로젝트들의 "이번 달 생성된 스냅샷 수" 집계.  
    - 예: `COUNT(Snapshot)` where `Snapshot.project_id IN (user's projects)` and `created_at` in current month.
  - **GuardCredits**: `Usage`에서 `metric_name='guard_credits_replay'`, `user_id`(또는 `project_id` → user), `timestamp`가 이번 달인 것의 `SUM(quantity)`.
- **인터페이스 예**:
  - `get_snapshots_count_this_month(db, user_id) -> int`
  - `get_guard_credits_this_month(db, user_id) -> int` (또는 project_id 기준으로 org 단위)
- **free 한도 값**: `PLAN_LIMITS["free"]["snapshots_per_month"]` (현재 500). GuardCredits는 `PLAN_LIMITS["free"]`에 `guard_credits_per_month` 키 추가 (예: 5_000 ~ 10_000, 팀 결정).

#### 1.2 스냅샷 생성 시 한도 적용

- **대상**: 스냅샷을 생성하는 모든 경로.
  - `POST /projects/{id}/snapshots` (live_view), `snapshot_service`에서 생성, `background_tasks`에서 proxy 경로로 생성 등.
- **로직**:
  - 생성 전에, 해당 프로젝트의 소유자(또는 org owner) `user_id`에 대해 `get_snapshots_count_this_month(db, user_id)` 호출.
  - `get_user_plan(user_id)` 로 `snapshots_per_month` 한도 조회.
  - `current + 1 > limit` 이면 **403** + 메시지 예:  
    `"Free plan limit: 500 snapshots per month. You've reached the limit. Upgrade or try again next month."`
- **예외**: `is_superuser` 또는 마스터 계정은 한도 체크 스킵 (선택).

#### 1.3 프로젝트 생성 시 한도 적용

- **대상**: `POST /organizations/{id}/projects` 또는 org에 프로젝트 생성하는 API.
- **로직**: 해당 org의 프로젝트 수가 `PLAN_LIMITS["free"]["projects"]` 이상이면 생성 거부 + 403.  
  (현재 free는 100이라 MVP에서 걸릴 가능성 낮지만, 일관성을 위해 적용.)

#### 1.4 GuardCredits (Replay) 한도 적용

- **설정**: `subscription_limits.py`의 `"free"`에 `"guard_credits_per_month": 10_000` (또는 팀이 정한 값) 추가.
- **대상**: Release Gate replay를 실행하는 엔드포인트 (예: `run_batch_replay` 진입 전).
- **로직**:
  - 이번 달 이미 사용한 GuardCredits: `get_guard_credits_this_month(db, user_id)` (또는 org 단위).
  - 이번 run에서 예상 사용량은 "실행 후 로깅된 값"이므로, **실행 전**에는 대략 추정하거나, **실행 후**에만 검사할 수 있음.  
    - **권장**: 실행 **전**에 "이번 달 사용량 >= cap"이면 **실행 거부**.  
    - "이번 run까지 포함하면 초과"는 실행 후 다음 run에서 막는 방식으로 단순화 가능.
  - 초과 시 403 + 메시지:  
    `"Free plan monthly GuardCredit limit reached. Connect your own API key for more runs, or try again next month."`
- **BYO 키**: 사용자가 자신의 API 키로 replay 하는 경우에는 플랫폼 비용이 없으므로, **한도에서 제외**하거나 **별도 상한**으로 두는 것이 좋음. (기존 mvp-usage-credits-implementation-checklist Phase 3와 동일 사상.)

#### 1.5 (선택) API 호출 한도

- `api_calls_per_month`는 proxy/ingest 경로에서 "호출 1건"을 세고, 월별 합이 한도 초과면 거부하는 식으로 구현 가능.  
- MVP에서 비용이 주로 Replay에서 나면 **Phase 1에서는 생략**해도 됨. 나중에 필요 시 추가.

---

### Phase 2 — 사용자에게 "무료 + 한도" 보이기 (프론트/백)

**목표**: 사용자가 자신이 "무료로 써보기" 중이며, 한도가 얼마나 남았는지 알 수 있게 하기.

#### 2.1 백엔드: 현재 사용량 API

- **엔드포인트 예**: `GET /api/v1/me/usage` 또는 `GET /organizations/{id}/usage` (이미 비슷한 것이 있을 수 있음).
- **응답 예**:
  - `plan_type: "free"`
  - `limits: { snapshots_per_month: 500, guard_credits_per_month: 10000, ... }`
  - `usage_this_month: { snapshots: 120, guard_credits: 3200 }`
- **구현**: `SubscriptionService.get_user_plan()` + 위 1.1의 `get_snapshots_count_this_month`, `get_guard_credits_this_month` 조합.

#### 2.2 프론트: Billing / Usage 페이지

- **위치**: 조직별 Billing 또는 Usage 페이지 (이미 Usage Overview가 billing에 통합되어 있음).
- **표시**:
  - "Free plan" 뱃지 또는 문구.
  - "This month: X snapshots / 500", "Y GuardCredits / 10,000" (또는 적용한 한도 값).
  - 한도에 가까우면 경고 스타일, 초과 시 "Limit reached" 메시지 + "Contact us for more" 또는 "Try again next month".
- **랜딩/가입 플로우**: 기존 "Get started free" 유지. 가입 후 첫 대시에서 "You're on the free plan. Limits: …" 한 줄 안내 추가 가능.

---

### Phase 3 — (선택) GuardCredits 소프트/하드 캡 (플랫폼 키만)

- **목표**: 플랫폼이 제공하는 API 키로 Replay 할 때만, 월간 소프트 캡(경고) / 하드 캡(차단) 적용.
- **상세**: 기존 `docs/mvp-usage-credits-implementation-checklist.md`의 **Phase 3**와 동일.
- **순서**: Phase 1에서 free 전역 GuardCredit 상한을 적용한 뒤, "플랫폼 키 vs BYO" 구분만 넣으면 Phase 3로 확장 가능.

---

## 3. 작업 체크리스트 (요약)

- [ ] **1.1** `subscription_limits.py`에 free용 `guard_credits_per_month` 추가 (값 팀 결정).
- [ ] **1.2** 스냅샷 "이번 달 개수" 조회 헬퍼 + 스냅샷 생성 경로에 한도 체크 및 403 응답.
- [ ] **1.3** 프로젝트 생성 시 `projects` 한도 체크.
- [ ] **1.4** Replay 실행 전 GuardCredits 이번 달 사용량 조회 + 한도 초과 시 403 (BYO 키는 예외 처리 검토).
- [ ] **2.1** `GET /me/usage` 또는 org usage API에 `usage_this_month` (snapshots, guard_credits) 포함.
- [ ] **2.2** Billing/Usage 페이지에 Free plan + "X / 한도 Y" 표시 및 한도 도달 시 안내 문구.
- [ ] **(선택)** 마스터/슈퍼유저는 한도 체크 스킵.
- [ ] **(선택)** Phase 3: 플랫폼 키만 소프트/하드 캡.

---

## 4. 참고

- **한도 값**: `backend/app/core/subscription_limits.py`의 `PLAN_LIMITS["free"]`가 단일 소스. 여기만 수정하면 됨.
- **Usage 모델**: `metric_name`, `quantity`, `timestamp` 기준으로 월별 집계해야 함. `SubscriptionService.check_usage_limit()`는 현재 Usage 스키마와 맞지 않으므로, Phase 1에서는 "사용처에서 직접 집계 후 비교" 방식으로 구현하고, 필요 시 나중에 `check_usage_limit`를 현재 스키마에 맞게 수정하거나 새 헬퍼로 대체.
- **GuardCredits 상세**: `docs/mvp-usage-credits-implementation-checklist.md` 및 `docs/mvp-usage-credits-and-pricing-plan.md` 참고.
- **수동 테스트**: `docs/manual-test-scenarios-mvp-replay-test.md`의 **F. Free Tier Limits** 섹션 및 Final MVP Checklist의 F-1~F-5 항목 참고.
