# Tech Spec: 결제/구독 플로우 (Paddle 기준)

## 목표
- Paddle 기반 구독 결제를 실제로 동작시키고 상태/권한을 정확히 반영한다.
- 업그레이드/다운그레이드/취소/재구독 시나리오를 안전하게 처리한다.
- Billing 화면에서 실제 상태와 다음 결제일을 확인 가능하게 한다.

## 비목표
- 다중 결제 제공자(Stripe/LemonSqueezy) 동시 지원
- 엔터프라이즈 커스텀 계약/견적 흐름
- 복잡한 프라이스 북/프로모션 로직

## 요구사항
1) Paddle 체크아웃 생성 및 리다이렉트
2) Webhook 서명 검증 + 이벤트별 처리
3) 플랜 매핑(PLAN_PRICING/PLAN_LIMITS ↔ Paddle plan_id)
4) 구독 상태 동기화(active/cancelled/past_due)
5) 취소는 period end 기준으로 반영
6) 재구독/업그레이드/다운그레이드 시나리오 처리
7) 결제 실패/중복 이벤트 idempotent 처리
8) Billing UI에 실제 상태/기간 표시

## 성공 기준
- 실제 결제 완료 후 상태가 active로 반영된다.
- 취소/재구독/업/다운그레이드가 충돌 없이 동작한다.
- Billing 페이지가 실제 상태를 반영한다.
- Webhook 이벤트 재수신에도 상태가 꼬이지 않는다.

## 리스크/가정
- Paddle webhook 서명 검증 로직 필요
- plan_id ↔ plan_type 매핑 테이블 필요
- 사용자 식별 방식(이메일/metadata)에 대한 정책 필요
