# Stripe 설정 가이드

이 가이드는 AgentGuard에서 Stripe 결제 시스템을 설정하는 방법을 설명합니다.

## 목차

1. [Stripe 계정 생성](#1-stripe-계정-생성)
2. [환경 변수 설정](#2-환경-변수-설정)
3. [웹훅 엔드포인트 설정](#3-웹훅-엔드포인트-설정)
4. [테스트 모드 설정](#4-테스트-모드-설정)
5. [프로덕션 모드 전환](#5-프로덕션-모드-전환)
6. [문제 해결](#6-문제-해결)

---

## 1. Stripe 계정 생성

1. [Stripe 웹사이트](https://stripe.com)에 접속하여 계정을 생성합니다.
2. 대시보드에서 **개발자** > **API 키**로 이동합니다.
3. 테스트 모드와 라이브 모드의 API 키를 확인합니다.

---

## 2. 환경 변수 설정

다음 환경 변수들을 설정해야 합니다:

### 필수 환경 변수

```bash
# Stripe Secret Key (테스트 모드: sk_test_..., 라이브 모드: sk_live_...)
STRIPE_SECRET_KEY=sk_test_...

# Stripe Webhook Secret (웹훅 설정 후 생성됨)
STRIPE_WEBHOOK_SECRET=whsec_...

# Stripe Price IDs (각 플랜별로 생성 필요)
STRIPE_PRICE_ID_INDIE=price_...
STRIPE_PRICE_ID_STARTUP=price_...
STRIPE_PRICE_ID_PRO=price_...
STRIPE_PRICE_ID_ENTERPRISE=price_...
```

### Price ID 생성 방법

1. Stripe 대시보드에서 **제품** > **가격**으로 이동합니다.
2. **가격 추가**를 클릭합니다.
3. 각 플랜에 맞는 가격을 설정합니다:
   - **Indie**: $19/월
   - **Startup**: $59/월
   - **Pro**: $199/월
   - **Enterprise**: $499/월
4. **구독** 모드를 선택하고 월간 빈도를 설정합니다.
5. 생성된 Price ID를 복사하여 환경 변수에 설정합니다.

---

## 3. 웹훅 엔드포인트 설정

Stripe 웹훅은 구독 상태 변경을 실시간으로 받기 위해 필요합니다.

### 3.1 웹훅 엔드포인트 URL

프로덕션 환경:
```
https://your-api-domain.com/api/v1/billing/webhook
```

로컬 테스트 (Stripe CLI 사용):
```
stripe listen --forward-to localhost:8000/api/v1/billing/webhook
```

### 3.2 Stripe 대시보드에서 웹훅 설정

1. Stripe 대시보드에서 **개발자** > **웹훅**으로 이동합니다.
2. **엔드포인트 추가**를 클릭합니다.
3. 엔드포인트 URL을 입력합니다.
4. 수신할 이벤트를 선택합니다:
   - `checkout.session.completed` (필수)
   - `customer.subscription.updated` (권장)
   - `customer.subscription.deleted` (권장)
5. **엔드포인트 추가**를 클릭합니다.
6. 생성된 **서명 비밀**을 복사하여 `STRIPE_WEBHOOK_SECRET` 환경 변수에 설정합니다.

---

## 4. 테스트 모드 설정

### 4.1 테스트 카드 사용

Stripe 테스트 모드에서는 다음 테스트 카드를 사용할 수 있습니다:

- **성공**: `4242 4242 4242 4242`
- **실패**: `4000 0000 0000 0002`
- **3D Secure**: `4000 0025 0000 3155`

만료일: 미래의 아무 날짜 (예: 12/34)  
CVC: 아무 3자리 숫자 (예: 123)

### 4.2 로컬 테스트 (Stripe CLI)

로컬 환경에서 웹훅을 테스트하려면 Stripe CLI를 사용합니다:

```bash
# Stripe CLI 설치 (이미 설치되어 있다면 생략)
# macOS: brew install stripe/stripe-cli/stripe
# Windows: scoop install stripe

# Stripe CLI 로그인
stripe login

# 웹훅 이벤트 리스닝 (로컬 서버로 포워딩)
stripe listen --forward-to localhost:8000/api/v1/billing/webhook

# 테스트 이벤트 트리거
stripe trigger checkout.session.completed
```

### 4.3 테스트 플로우 확인

1. 프론트엔드에서 업그레이드 버튼 클릭
2. Stripe 체크아웃 페이지에서 테스트 카드 입력
3. 결제 완료 후 성공 페이지로 리다이렉트 확인
4. 백엔드 로그에서 웹훅 이벤트 수신 확인
5. 사용자 구독 상태 업데이트 확인

---

## 5. 프로덕션 모드 전환

### 5.1 라이브 모드 활성화

1. Stripe 대시보드에서 **라이브 모드로 전환**을 클릭합니다.
2. 라이브 모드의 **Secret Key**를 복사합니다.
3. 환경 변수 `STRIPE_SECRET_KEY`를 라이브 키로 업데이트합니다.

### 5.2 라이브 모드 Price ID 생성

1. 라이브 모드에서 각 플랜에 대한 Price를 생성합니다.
2. 생성된 Price ID를 환경 변수에 업데이트합니다.

### 5.3 라이브 모드 웹훅 설정

1. 라이브 모드에서 웹훅 엔드포인트를 추가합니다.
2. 프로덕션 URL을 사용합니다: `https://your-api-domain.com/api/v1/billing/webhook`
3. 라이브 모드의 웹훅 서명 비밀을 환경 변수에 설정합니다.

### 5.4 최종 확인 사항

- [ ] 라이브 모드 Secret Key 설정됨
- [ ] 라이브 모드 Price ID 설정됨
- [ ] 라이브 모드 웹훅 엔드포인트 설정됨
- [ ] 웹훅 서명 비밀 설정됨
- [ ] 테스트 결제 성공 확인
- [ ] 웹훅 이벤트 수신 확인

---

## 6. 문제 해결

### 6.1 일반적인 오류

#### "Stripe not available"
- `STRIPE_SECRET_KEY`가 설정되지 않았거나 잘못되었습니다.
- 환경 변수를 확인하고 서버를 재시작합니다.

#### "No Stripe price ID for plan"
- 해당 플랜의 `STRIPE_PRICE_ID_*` 환경 변수가 설정되지 않았습니다.
- Stripe 대시보드에서 Price ID를 확인하고 환경 변수를 설정합니다.

#### "Invalid signature" (웹훅)
- `STRIPE_WEBHOOK_SECRET`이 잘못되었거나 웹훅 엔드포인트가 변경되었습니다.
- Stripe 대시보드에서 웹훅 서명 비밀을 다시 확인합니다.

### 6.2 로그 확인

웹훅 이벤트 처리 로그는 다음 위치에서 확인할 수 있습니다:

```python
# 백엔드 로그에서 확인
logger.info(f"Stripe webhook processed successfully: {event_type}")
logger.error(f"Stripe webhook error: {error}")
```

### 6.3 Stripe 대시보드에서 확인

1. **결제** > **결제 내역**: 결제 성공/실패 확인
2. **고객**: 고객 정보 및 구독 상태 확인
3. **개발자** > **웹훅**: 웹훅 이벤트 로그 확인
4. **개발자** > **로그**: API 호출 로그 확인

---

## 추가 리소스

- [Stripe 공식 문서](https://stripe.com/docs)
- [Stripe API 참조](https://stripe.com/docs/api)
- [Stripe 웹훅 가이드](https://stripe.com/docs/webhooks)
- [Stripe 테스트 카드](https://stripe.com/docs/testing)

---

**작성일**: 2026-01-26  
**최종 업데이트**: 2026-01-26
