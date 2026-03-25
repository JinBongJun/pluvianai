## MVP Usage Credits — Implementation Checklist

### 0. Goal

- **What**: Implement `GuardCredit` tracking + basic limits with minimal complexity.
- **Why**: Get real usage data during beta, cap worst-case cost, and be ready to plug into Paddle later.

---

### 1. Phase 1 — Logging Only (No Limits Yet)

**Objective**: For every Release Gate replay, record how many credits were used (per org/project/run), without blocking anything.

- **1.1 Model → factor config**
  - Create a single config source (e.g. `CREDITS_MODEL_FACTORS`) that maps:
    - `(provider, model_name)` → `factor`
    - With sensible defaults, e.g.:
      - Unknown model: `factor = 1`
      - Providers: `"openai" | "anthropic" | "google"` only for now.
  - Requirements:
    - Easy to update without touching business logic.
    - Short comments for high-cost models (why they’re 6x / 10x).

- **1.2 Credit calculation utility**
  - Function signature (Python):
    - `calculate_credits(provider: str, model: str, input_tokens: int, output_tokens: int) -> int`
  - Logic:
    - `total_tokens = input_tokens + output_tokens`
    - `total_k = max(1, math.ceil(total_tokens / 1000))`  *(avoid zero-credit tiny calls)*
    - `factor = get_model_factor(provider, model)`
    - `credits = total_k * factor`
  - Success criteria:
    - Unit tests for a few model-factor combinations.
    - Zero behavior change for existing Replay logic except returning additional metadata.

- **1.3 Hook into Replay**
  - Where:
    - After each provider call in `ReplayService` (where we already have provider, model, token usage, snapshot).
  - Data needed:
    - `org_id` / `project_id`
    - `provider`, `model`
    - `input_tokens`, `output_tokens`
  - Output:
    - Returned replay result includes `used_credits` (for debugging / logs).
    - Internal `UsageRecord` ready to be persisted.

- **1.4 `usage_records` persistence**
  - Minimal schema (SQLAlchemy model rough idea):
    - `id`
    - `org_id`, `project_id`
    - `run_id` (Release Gate run identifier)
    - `provider`, `model`
    - `input_tokens`, `output_tokens`, `total_tokens`
    - `model_factor`
    - `used_credits`
    - `recorded_at` (UTC)
  - MVP behavior:
    - Best-effort insert; **do not** break user flows if write fails (log error instead).
    - No aggregation yet — raw rows only.

**Exit criteria for Phase 1**

- For any Release Gate run, we can answer:
  - “How many credits did this run consume?”
  - “Which models/providers are contributing most credits?”
  - “Per org, how many credits have we consumed this month (manually via SQL)?”

---

### 2. Phase 2 — Aggregation + Internal Dashboard

**Objective**: Make it easy for *us* to see cost risk and user behavior; still no hard blocking for customers.

- **2.1 Monthly aggregation job**
  - Simple cron/periodic task or on-demand admin endpoint:
    - Group by `(org_id, billing_month)`:
      - `SUM(used_credits)`
      - `SUM(total_tokens)`
      - Breakdown by `provider` and major model groups (Standard/Plus/Premium/Ultra).
  - Store in:
    - Either a materialized view, or
    - A `usage_monthly_summary` table with:
      - `org_id`, `billing_month`
      - `total_credits`, `total_tokens`
      - `openai_credits`, `anthropic_credits`, `google_credits`

- **2.2 Simple admin UI / debug endpoint**
  - Goal:
    - At a glance, see:
      - Top 20 orgs by monthly credits.
      - Which models are eating the most credits.
  - Can be:
    - A bare JSON endpoint (`/internal/usage/summary`) + temporary frontend table, or
    - Even a CLI script for now.

**Exit criteria for Phase 2**

- We can:
  - Identify “heavy users” and “heavy models”.
  - Simulate “What if we charged $X / credit?” for different plans.

---

### 3. Phase 3 — Soft / Hard Caps (Platform Key Only)

**Objective**: Protect against runaway costs from *platform-provided keys*, while allowing BYO keys to keep working.

- **3.1 Cap policy (config)**
  - Config structure (per org or per plan type):
    - `soft_cap_credits` (e.g. 20,000 / month for beta)
    - `hard_cap_credits` (e.g. 25,000 / month for beta)
  - For MVP:
    - Global default caps for all orgs (no per-plan logic yet).

- **3.2 Where to enforce**
  - Checkpoint:
    - Before starting a Release Gate run that uses **platform key**:
      - Look up current month `used_credits_platform` for that org.
  - Behavior:
    - If `>= soft_cap`:
      - Allow run but show warning banner / include warning in API response.
    - If `>= hard_cap`:
      - Block run **only for platform keys**:
        - Return well-structured error: `platform_usage_cap_reached`.
      - If BYO key is present:
        - Allow run (since cost is on the user).

- **3.3 UX copy (short)**
  - Near model selection / run button:
    - “Free beta: platform-provided models include up to N credits per month. Heavy usage may be rate-limited.”
  - When blocked:
    - “You’ve reached the free beta platform usage limit for this month.  
       Connect your own provider API key or wait for the next billing cycle.”

**Exit criteria for Phase 3**

- Worst-case scenario (someone creating a looping workflow with platform keys) is contained by:
  - Caps per org per month.
  - Clear UX about why runs are blocked and how to proceed (BYO or wait).

---

### 4. Phase 4 — Ready for Billing Integration

**Objective**: Make it trivial to plug `used_credits` into Paddle or any billing provider.

- **4.1 Stable identifiers**
  - Ensure each org has:
    - `org_id` (internal)
    - `billing_customer_id` / `subscription_item_id` (for Paddle, when ready).

- **4.2 Reporting contract**
  - Define and freeze a minimal interface:
    - `get_monthly_usage(org_id, billing_month) -> total_credits`
    - Or per-subscription-item if we need multiple line items.

- **4.3 Test scenarios (manual)**
  - 1) Light user:
    - Runs a few Release Gates with Standard models only.
  - 2) Heavy user:
    - Mix of Standard / Premium models, crossing soft cap but not hard cap.
  - 3) Abuser:
    - Keeps hammering platform model until hard cap is hit → platform runs blocked, BYO still allowed.

At this point, billing integration becomes:

- “Once per billing cycle, send `total_credits` to Paddle as usage for that subscription item.”

---

- **Paddle 연동 시 해야 할 것·체크리스트·사용량 반영 방식**: `docs/mvp-usage-credits-and-pricing-plan.md` **§7. Paddle 연동 계획 (정식 출시 시)** 참고.

### 5. Phase 5 — Plans & Billing UI (Free-first)

**Objective**: Run the product in a **“free plan only”** mode during MVP, while preparing a clear path to later enable Pro/Enterprise self-serve billing.

- **5.1 Landing page pricing (marketing UI)**
  - **현재 (MVP)**:
    - `/` 랜딩의 Pricing 섹션은 다음을 만족해야 한다.
      - Community(Free) 카드 CTA:
        - 비로그인: `/login?mode=signup&intent=trial` 로 이동.
        - 로그인: `/organizations` 콘솔로 이동.
      - Pro / Enterprise 카드 CTA:
        - 시각적으로 표시되지만 **비활성(disabled)** 상태.
        - “Coming soon”, “Contact sales” 정도의 카피만 노출, 실제 결제/업그레이드 동작 없음.
  - **나중 (정식 출시)**:
    - Pro 카드 CTA를 Paddle/Stripe Checkout 으로 연결:
      - 예: `/billing/upgrade?plan=pro` → 백엔드에서 Paddle 세션 생성 → 리다이렉트.
    - Enterprise 카드는 `mailto:`·문의 폼 등으로 연결.

- **5.2 앱 내부 Billing / Usage 화면**
  - **현재 (MVP)**:
    - 조직별 `Usage & Licensing` 페이지:
      - 상단: “Free plan” 배지 + Free 플랜 설명 한 줄.
      - 중간: 이번 달 **snapshots / GuardCredits “사용량 / 한도”** 바 차트.
      - 하단의 플랜 카드(Free / Pro / Enterprise)는 **모두 읽기 전용**:
        - Free: “Current License”.
        - Pro / Enterprise: 버튼은 disabled, “Coming Soon” 등의 문구만.
      - 실제 plan 변경 API 호출은 없음.
  - **나중 (정식 출시)**:
    - Pro 카드 클릭 시:
      - 백엔드 `POST /subscription/upgrade` → Paddle/Stripe Checkout 세션 생성.
      - 성공 시 `Subscription(plan_id="pro")` 업데이트, `PLAN_LIMITS["pro"]` 기반으로 한도 상향.
    - Enterprise 카드는 영업/보안 리뷰 프로세스로 연결(수동 on‑boarding).

- **5.3 백엔드 연동 포인트 요약 (미래 작업용)**
  - `Subscription` / `SubscriptionService`:
    - 현재는 `plan_id="free"` 위주로 동작; Pro/Enterprise 활성화 시:
      - 업그레이드/다운그레이드 API 추가.
      - `PLAN_LIMITS`에 맞춰 GuardCredits / snapshots / projects 한도 자동 적용.
  - Auditing:
    - plan 변경 시 AuditLog 레코드 남기기 (누가, 언제, 어떤 플랜으로 변경했는지).

- **5.4 수동 테스트 시나리오 (추가)**
  - **P1. 랜딩 Pricing CTA**
    - 비로그인 상태:
      - `/` → Pricing 섹션 → “Get started free” 클릭 → `/login?mode=signup&intent=trial` 로 이동.
    - 로그인 상태:
      - `/` → Pricing 섹션 → “Get started free” 클릭 → `/organizations` 로 이동.
  - **P2. Paid 플랜 비활성화**
    - Pricing 섹션의 Pro / Enterprise 카드 버튼:
      - 시각적으로 구분되지만 클릭 시 아무 동작도 하지 않고, 커서/opacity 등으로 비활성 상태로 보인다.
  - **P3. Billing 페이지 플랜 카드**
    - 조직 Billing 화면에서:
      - Free 카드: “Current License” 뱃지/버튼이 보이고, 클릭해도 추가 동작 없음.
      - Pro / Enterprise 카드: “Coming soon” (또는 동등한 문구), 버튼 disabled.
  - **P4. 실제 과금/플랜 변경 부재 확인**
    - 위 시나리오 중 어느 것도 Subscription/결제 상태를 바꾸지 않는지(데이터베이스·Paddle/Stripe 콘솔에서) 확인.

