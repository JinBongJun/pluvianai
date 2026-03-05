## MVP Usage & Pricing Plan (Draft)

### 0. 목적

- **목표 시점**: 지금 ~ 4월 전(콘텐츠/토이 프로젝트 기간) → 이후 정식 출시 전까지.
- **핵심 요구사항**
  - 코드 변경은 **단순한 구조**로 유지할 것.
  - **플랫폼 키(내 API 키)** 로는 **저가 모델만** 열어 두고, 비용 리스크를 최소화할 것.
  - 지금부터 **토큰 사용량 데이터를 체계적으로 쌓아두고**, 나중에 Paddle 같은 결제 시스템에 쉽게 연결할 수 있을 것.

---

### 1. 기본 개념: GuardCredit

- 모든 모델/프로바이더(OpenAI, Anthropic, Google)를 **공통 단위인 `GuardCredit`** 로 환산한다.
- 크레딧 계산식(런 1회에 대해):

  \[
  \text{used\_credits} = \text{total\_tokens\_in\_K} \times \text{model\_factor}
  \]

  - `total_tokens_in_K` = (입력 토큰 + 출력 토큰) / 1,000
  - `model_factor` = 모델별 가중치 (저가 1x, 중간 2~3x, 고가 5~10x 등)

- **중요한 점**:  
  - 내부 코드에서는 **달러 가격을 직접 계산하지 않고**, `used_credits`만 누적한다.
  - Paddle/결제 시스템과 통합할 때는 **“이번 달 조직이 쓴 총 크레딧 수”** 만 넘기면 된다.

---

### 2. 모델 그룹 및 factor 초안

> 정확한 가격은 각 콘솔(OpenAI, Anthropic, Google) 기준으로 조정 가능.  
> 아래는 **MVP용 대략적인 그룹/가중치** 초안이다.

#### 2.1 OpenAI

- **Standard (저가, 플랫폼 무료 허용 후보)** – `factor = 1`
  - `gpt-4.1-nano`
  - `gpt-4.1-mini`
  - `gpt-4o-mini`
- **Plus (중간 가격)** – `factor = 3`
  - `o3-mini`
  - `o4-mini`
- **Premium (고가, BYO 또는 유료 플랜 한정)** – `factor = 6`
  - `gpt-4.1`
  - `gpt-4o`
- **Ultra (매우 고가, 기본적으로 잠금)** – `factor = 10`
  - `o1`
  - `o3-pro` (있다면)

#### 2.2 Anthropic

- **Standard** – `factor = 1`
  - Haiku 3.x / 4.x 계열
- **Premium** – `factor = 6`
  - Sonnet 계열
- **Ultra** – `factor = 10`
  - Opus/고급 reasoning 계열 (도입 시)

#### 2.3 Google (Gemini)

- **Standard** – `factor = 1`
  - Gemini Flash 계열 (2.0/2.5/Flash 등)
- **Premium** – `factor = 5`
  - Gemini Pro 계열

> 나중에 모델이 늘어나면, **“모델 이름 → factor” 맵핑 테이블 한 곳만 수정**하면 된다.

---

### 3. Phase별 전략

#### 3.1 Phase 1 — 지금 ~ 4월 전 (콘텐츠/토이 프로젝트 기간)

**목표**

- Reddit, Indie Hackers 등에 올릴 **토이 프로젝트/워크플로우 콘텐츠**로 유입.
- 실제 사용자들이 **자기 도메인의 프로토타입을 Release Gate에서 직접 테스트**해 보도록 유도.
- 이 기간 동안 **비용 리스크는 최소**, 대신 **사용량 데이터와 도메인 인사이트를 최대한 수집**.

**정책**

- **플랫폼 키(내 API 키)로 허용하는 모델**
  - OpenAI: `gpt-4.1-nano`, `gpt-4.1-mini`, `gpt-4o-mini`, `o3-mini`, `o4-mini`
  - Anthropic: Haiku 계열
  - Google: Gemini Flash 계열
- **비싼 모델은 기본 잠금 또는 BYO 전용**
  - `gpt-4o`, `gpt-4.1`, `o1`, Sonnet, Gemini Pro 등은:
    - 옵션 A: “Connect your own provider key to use this model”
    - 옵션 B: 나중에 유료 플랜에서만 풀릴 “Premium” 태그

**사용량 한도(Soft/Hard Cap)**

- 조직(org) 기준:
  - **Soft cap**: 월 `20,000 GuardCredits` (예: 1K 토큰 × factor 1 기준 대략 2,000K = 2M 토큰 수준)
  - **Hard cap**: Soft cap + `5,000 GuardCredits` 초과 시 해당 월 더 이상 플랫폼 키 사용 불가
    - BYO 키는 계속 허용 (비용은 사용자가 부담).
- UI 표기(대략):
  - “This month: 12,400 / 20,000 credits used (platform key usage).”
  - “MVP 기간에는 과금되지 않지만, 베타 안정성을 위해 월 사용량 상한이 있습니다.”

**콘텐츠 전략과 연결**

- n8n / MCP / LangChain 등의 튜토리얼에서:
  - “이 워크플로우를 만든 뒤, Pluvian Release Gate로 **gpt-4.1-mini / Gemini Flash** 기준 회귀 테스트를 돌려보자” 식으로 안내.
  - 예제는 **항상 Standard/Plus 모델**을 사용하도록 구성 → 비용 안전.

#### 3.2 Phase 2 — 4월 이후 ~ 정식 출시 직전

**목표**

- Usage/모델/도메인별 데이터로 **실제 평균 사용량·비용 프로파일링**.
- 내부적으로 **요금제 시뮬레이션**(구독/초과 과금) 돌려보기.
- Admin/운영자용 **Usage 대시보드** 구축.

**해야 할 일(요약)**

- `GuardCredit` 집계 데이터로:
  - org별 월 사용량 분포
  - 모델 그룹(Standard/Plus/Premium/Ultra)별 비중
  - 한 run 당 평균 크레딧
  - “Heavy user” 상위 10% 프로파일
- 이 데이터를 기반으로:
  - “Starter/Pro/Team 플랜에 월 **포함 크레딧**을 얼마로 잡을지”
  - 초과분 단가를 **원가 대비 3~5배 선**에서 정할지 확정.

#### 3.3 Phase 3 — 정식 출시 (Paddle 연동)

**요금제 구조 초안**

- Starter: 월 $49, **20k 크레딧 포함**
- Pro: 월 $199, **200k 크레딧 포함**
- Enterprise: 커스텀 (수백 k ~ 수백만 크레딧)
- 초과분: 예를 들어 `1 GuardCredit = $0.0005` 수준으로 책정  
  → 원가(cheap 모델 기준) 대비 대략 3~5배 마진을 남기도록 factor/단가 조정.

**Paddle 연동 개념**

- 내부 시스템:
  - `usage_records` 테이블에서 org + month 기준 `SUM(used_credits)` 계산.
  - 각 org에 연결된 `subscription_item_id` 를 알고 있다고 가정.
- Paddle:
  - Billing API에 “이번 청구 주기 동안의 usage(used_credits)” 만 보고.
  - Paddle 측 플랜에 “포함 크레딧 + 초과 크레딧 단가”를 정의.

이렇게 하면:

- 코드 쪽은 **여전히 토큰 × factor → 크레딧**만 알고 있고,
- 결제 시스템은 **해당 크레딧 수에 가격만 곱해 청구**한다.

---

### 4. 구현 관점 체크리스트

> 실제 코드는 나중에 구현하되, 어디에 어떤 모듈/필드를 둘지 미리 정리해 두기 위한 체크리스트.

#### 4.1 모델 → factor 맵핑

- 위치 후보:
  - `backend/app/core/` 아래에 `pricing.py` 또는 `credits.py` 같은 작은 모듈 추가.
- 인터페이스 예시:
  - `get_model_factor(provider: str, model: str) -> int`
  - 제공되지 않는 모델은 기본값 `factor = 1` 또는 에러로 처리.

#### 4.2 크레딧 계산 로직 삽입 위치

- **Replay 실행 결과를 이미 모으는 곳**에 한 번만 삽입:
  - `backend/app/services/replay_service.py`
  - `backend/app/api/v1/endpoints/release_gate.py`
- 필요한 정보:
  - provider (`replay_provider`)
  - 실제 호출에 사용된 model 이름
  - usage 정보(입력/출력 토큰 수) — 제공되는 응답/메타데이터에서 추출.

#### 4.3 usage_records 저장 스키마 (초안)

- 테이블 이름 예시: `usage_records`
- 필드 초안:
  - `id`
  - `org_id`
  - `project_id`
  - `run_id` (Release Gate run 기준)
  - `provider`
  - `model`
  - `total_tokens` (int, input+output)
  - `model_factor` (int)
  - `used_credits` (int 또는 float)
  - `recorded_at` (timestamp)

#### 4.4 한도(Soft/Hard Cap) 체크 위치

- Release Gate run 시작 전:
  - org의 **이번 달 누적 `used_credits`** 를 조회.
  - Soft cap 초과 시 경고 메시지, Hard cap 초과 시 플랫폼 키 기반 Run 거절.
  - BYO 키 사용 시에는 cap 체크를 완화하거나 별도 정책을 둘 수 있음.

---

### 5. UI/UX 관점 요약

- **모델 선택 영역**
  - Standard / Plus / Premium / Ultra **뱃지** 및 툴팁:
    - “Standard — included in platform usage”
    - “Premium — high-cost model; may consume credits faster”
  - Premium/Ultra 모델은:
    - MVP 기간: “Requires your own provider API key” 또는 비활성화.
    - 정식 출시 이후: 상위 플랜 또는 초과 과금 안내.

- **Usage 표시**
  - 조직/프로젝트 설정 또는 상단 HUD에:
    - “This month: 12,400 / 20,000 credits used (platform key).”
  - Soft cap 근처에서 경고:
    - “You are nearing the free beta usage limit. Heavy usage may be rate-limited.”

---

### 6. 정리

- **지금(4월 전까지)**:
  - 플랫폼 키로는 **저가 모델만 제공**.
  - 비싼 모델은 **BYO 또는 잠금**.
  - 모든 실행에서 **토큰 × factor → GuardCredit** 을 계산·저장해 **Usage 데이터**를 쌓는다.
- **이후(정식 출시 전/후)**:
  - 이 Usage 데이터를 기반으로 **플랜별 포함 크레딧과 초과 단가**를 정하고,
  - Paddle 같은 결제 시스템에는 **“이번 달 org별 사용한 GuardCredit 수”** 만 넘기는 구조로 정리한다.

이 문서를 기준으로, 추후에:

- 실제 factor 값 튜닝
- usage_records 스키마/엔드포인트 설계
- Paddle 상품/플랜 정의

를 점진적으로 확정하면 된다.

