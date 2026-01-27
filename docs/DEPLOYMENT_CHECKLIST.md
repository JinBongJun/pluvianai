# Phase 3 배포 체크리스트

이 문서는 Phase 3 기능을 프로덕션 환경에 배포하기 전에 확인해야 할 사항들을 정리합니다.

## 배포 전 확인 사항

### 1. 환경 변수 설정

#### 필수 환경 변수

- [ ] `DATABASE_URL`: PostgreSQL 연결 문자열
- [ ] `REDIS_URL`: Redis 연결 문자열
- [ ] `SECRET_KEY`: JWT 토큰 서명 키 (강력한 랜덤 문자열)
- [ ] `CORS_ORIGINS`: 프론트엔드 도메인 (프로덕션 URL)

#### Stripe 관련 (결제 기능 사용 시)

- [ ] `STRIPE_SECRET_KEY`: Stripe Secret Key (라이브 모드)
- [ ] `STRIPE_WEBHOOK_SECRET`: Stripe 웹훅 서명 비밀
- [ ] `STRIPE_PRICE_ID_INDIE`: Indie 플랜 Price ID
- [ ] `STRIPE_PRICE_ID_STARTUP`: Startup 플랜 Price ID
- [ ] `STRIPE_PRICE_ID_PRO`: Pro 플랜 Price ID
- [ ] `STRIPE_PRICE_ID_ENTERPRISE`: Enterprise 플랜 Price ID

#### 선택적 환경 변수

- [ ] `ENABLE_FREE_PLAN_HARD_LIMIT`: Free 플랜 hard limit 활성화 (기본값: False)
- [ ] `SENTRY_DSN`: 에러 추적 (Sentry)
- [ ] `RESEND_API_KEY`: 이메일 발송 (Resend)
- [ ] `SLACK_WEBHOOK_URL`: Slack 알림

자세한 내용은 [Stripe 설정 가이드](./guides/STRIPE_SETUP.md)를 참조하세요.

---

### 2. 데이터베이스 마이그레이션

- [ ] 모든 Alembic 마이그레이션이 적용되었는지 확인
  ```bash
  alembic current
  alembic history
  ```
- [ ] 최신 마이그레이션 적용
  ```bash
  alembic upgrade head
  ```
- [ ] 마이그레이션 롤백 계획 수립 (필요 시)

#### 주요 마이그레이션 확인

- [ ] `3d76fd2727c9_add_pii_patterns_table.py`: PII 패턴 테이블
- [ ] `cc72308b5ff8_add_user_agreements_table.py`: 사용자 동의 테이블
- [ ] `1d1641415d6e_add_referral_fields_to_users.py`: 레퍼럴 필드

---

### 3. Redis 설정

- [ ] Redis 서버가 실행 중인지 확인
- [ ] Redis 연결 문자열이 올바른지 확인
- [ ] Redis 메모리 제한 설정 확인
- [ ] Redis 지속성 설정 확인 (RDB/AOF)

#### Redis Stream 확인

- [ ] Stream Processor가 정상 실행되는지 확인
- [ ] Stream 키 패턴 확인: `snapshot:stream:{project_id}`
- [ ] 배치 처리 간격 확인 (기본: 1초)

---

### 4. Stripe 설정 확인

#### Stripe 계정

- [ ] Stripe 계정이 라이브 모드로 전환되었는지 확인
- [ ] 라이브 모드 API 키가 설정되었는지 확인

#### Stripe Products & Prices

- [ ] 각 플랜(Indie, Startup, Pro, Enterprise)에 대한 Price가 생성되었는지 확인
- [ ] Price ID가 환경 변수에 올바르게 설정되었는지 확인

#### Stripe Webhooks

- [ ] 웹훅 엔드포인트가 프로덕션 URL로 설정되었는지 확인
- [ ] 다음 이벤트가 구독되어 있는지 확인:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- [ ] 웹훅 서명 비밀(`STRIPE_WEBHOOK_SECRET`)이 설정되었는지 확인

#### 테스트

- [ ] 테스트 결제가 성공하는지 확인
- [ ] 웹훅 이벤트가 정상 수신되는지 확인
- [ ] 구독 상태가 올바르게 업데이트되는지 확인

자세한 내용은 [Stripe 설정 가이드](./guides/STRIPE_SETUP.md)를 참조하세요.

---

### 5. 백엔드 서비스 확인

#### 핵심 서비스

- [ ] Stream Processor가 백그라운드에서 실행 중인지 확인
- [ ] Scheduler Service가 실행 중인지 확인
  - 데이터 수명 주기 정리 (매일 4시 UTC)
  - 월간 사용량 리셋 (매월 1일 1시 UTC)
- [ ] Billing Service가 정상 작동하는지 확인

#### API 엔드포인트

- [ ] `/api/v1/billing/checkout`: Stripe 체크아웃 세션 생성
- [ ] `/api/v1/billing/webhook`: Stripe 웹훅 처리
- [ ] `/api/v1/billing/usage`: 사용량 조회
- [ ] `/api/v1/billing/limits`: 플랜 제한 조회
- [ ] `/api/v1/subscription/upgrade`: 구독 업그레이드

---

### 6. 프론트엔드 확인

#### 환경 변수

- [ ] `NEXT_PUBLIC_API_URL`: 백엔드 API URL
- [ ] 기타 프론트엔드 환경 변수 확인

#### 주요 기능

- [ ] 사용량 대시보드가 정상 표시되는지 확인
- [ ] 업그레이드 버튼이 Stripe 체크아웃으로 연결되는지 확인
- [ ] Free 플랜 제한 UI가 정상 표시되는지 확인
- [ ] Trust Center 페이지가 접근 가능한지 확인

---

### 7. 보안 확인

- [ ] `SECRET_KEY`가 강력한 랜덤 문자열인지 확인
- [ ] CORS 설정이 프로덕션 도메인으로 제한되었는지 확인
- [ ] HTTPS가 활성화되었는지 확인
- [ ] API 키가 환경 변수로 관리되고 있는지 확인
- [ ] 민감한 정보가 코드에 하드코딩되지 않았는지 확인

---

### 8. 모니터링 설정

#### 에러 추적

- [ ] Sentry DSN이 설정되었는지 확인
- [ ] Sentry 환경이 `production`으로 설정되었는지 확인

#### 로깅

- [ ] 로그 레벨이 적절히 설정되었는지 확인
- [ ] 로그가 적절한 위치에 저장되는지 확인

#### 메트릭

- [ ] Health check 엔드포인트가 작동하는지 확인 (`/health`)
- [ ] 메트릭 수집이 설정되었는지 확인 (선택사항)

---

### 9. 성능 확인

- [ ] 데이터베이스 연결 풀이 적절히 설정되었는지 확인
- [ ] Redis 연결이 안정적인지 확인
- [ ] API 응답 시간이 적절한지 확인
- [ ] 배치 처리 성능이 적절한지 확인

---

### 10. 백업 및 복구

- [ ] 데이터베이스 백업 전략이 수립되었는지 확인
- [ ] 백업 복구 절차가 문서화되었는지 확인
- [ ] Redis 데이터 백업 전략 확인 (필요 시)

---

## 배포 후 확인 사항

### 즉시 확인

- [ ] 서비스가 정상적으로 시작되었는지 확인
- [ ] Health check 엔드포인트가 200 응답을 반환하는지 확인
- [ ] 데이터베이스 연결이 정상인지 확인
- [ ] Redis 연결이 정상인지 확인

### 기능 확인

- [ ] 사용자 인증이 정상 작동하는지 확인
- [ ] 프로젝트 생성/조회가 정상 작동하는지 확인
- [ ] Snapshot 저장이 정상 작동하는지 확인
- [ ] 사용량 추적이 정상 작동하는지 확인

### 결제 확인

- [ ] 테스트 결제가 성공하는지 확인
- [ ] 웹훅 이벤트가 정상 수신되는지 확인
- [ ] 구독 상태 업데이트가 정상 작동하는지 확인

### 모니터링

- [ ] 에러 로그에 이상이 없는지 확인
- [ ] 성능 메트릭이 정상 범위인지 확인
- [ ] 사용자 활동이 정상적으로 기록되는지 확인

---

## 롤백 계획

배포 중 문제가 발생할 경우:

1. **즉시 롤백**
   - 이전 버전으로 코드 롤백
   - 데이터베이스 마이그레이션 롤백 (필요 시)
   - 환경 변수 롤백 (필요 시)

2. **문제 확인**
   - 로그 확인
   - 에러 메시지 분석
   - 모니터링 데이터 확인

3. **수정 및 재배포**
   - 문제 수정
   - 테스트 환경에서 검증
   - 재배포

---

## 연락처 및 리소스

- **Stripe 지원**: [Stripe 지원 센터](https://support.stripe.com)
- **문서**: [docs/](./README.md)
- **Stripe 설정 가이드**: [docs/guides/STRIPE_SETUP.md](./guides/STRIPE_SETUP.md)

---

**작성일**: 2026-01-26  
**최종 업데이트**: 2026-01-26
