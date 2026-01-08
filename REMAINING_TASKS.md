# AgentGuard 남은 작업 목록

코드베이스 분석 결과, 실제로 남은 작업들을 정리했습니다.

---

## 🔴 필수 작업 (Must Have)

### 1. Paddle 결제 통합 ⚠️
- **현재 상태**: 구독 관리 로직만 구현, 실제 결제 미연동
- **위치**: `backend/app/api/v1/endpoints/subscription.py`
- **TODO 주석**:
  ```python
  # TODO: Integrate with Paddle API to create checkout
  # TODO: Verify Paddle webhook signature
  # TODO: Handle different webhook event types
  ```
- **필요 작업**:
  - Paddle API 클라이언트 구현
  - 체크아웃 생성 엔드포인트
  - 웹훅 핸들러 (결제 완료, 취소, 환불 등)
  - 웹훅 서명 검증
- **우선순위**: 🔴 **최우선** (수익화 필수)

### 2. 이메일 알림 구현 ⚠️
- **현재 상태**: Slack/Discord만 구현, 이메일 미구현
- **위치**: `backend/app/services/alert_service.py:147-156`
- **TODO 주석**:
  ```python
  # TODO: Implement email sending
  # This would typically use a service like SendGrid, AWS SES, etc.
  ```
- **필요 작업**:
  - 이메일 서비스 선택 (SendGrid, AWS SES, Resend 등)
  - 이메일 템플릿 작성
  - 이메일 전송 로직 구현
  - 환경 변수 설정 (API 키 등)
- **우선순위**: 🔴 **높음** (핵심 알림 채널)

### 3. 인앱 알림 읽음 상태 DB 저장 ⚠️
- **현재 상태**: 인메모리 저장 (프로덕션 부적합)
- **위치**: `backend/app/api/v1/endpoints/notifications.py:36`
- **코드**:
  ```python
  # In-memory notification read status (in production, use database)
  notification_read_status: Dict[int, set] = {}  # user_id -> set of alert_ids
  ```
- **필요 작업**:
  - `NotificationRead` 모델 생성
  - DB 저장 로직으로 변경
  - 마이그레이션 작성
- **우선순위**: 🔴 **높음** (프로덕션 필수)

---

## 🟡 중요 작업 (Should Have)

### 4. PDF 리포트 생성 ⚠️
- **현재 상태**: JSON만 지원, PDF 미구현
- **위치**: `backend/app/api/v1/endpoints/reports.py:177-182`
- **코드**:
  ```python
  else:
      # PDF generation would require additional library like reportlab or weasyprint
      # For now, return JSON
      raise HTTPException(
          status_code=status.HTTP_501_NOT_IMPLEMENTED,
          detail="PDF format not yet implemented"
      )
  ```
- **필요 작업**:
  - PDF 생성 라이브러리 선택 (reportlab, weasyprint 등)
  - PDF 템플릿 작성
  - PDF 생성 로직 구현
- **우선순위**: 🟡 **중간** (편의 기능)

### 5. NotificationSettings 모델 생성 ⚠️
- **현재 상태**: 설정 저장 로직만 있고 모델 없음
- **위치**: `backend/app/api/v1/endpoints/settings.py:360, 383`
- **TODO 주석**:
  ```python
  # TODO: Create NotificationSettings model if needed
  # TODO: Create NotificationSettings model and save settings
  ```
- **필요 작업**:
  - `NotificationSettings` 모델 생성
  - DB 마이그레이션
  - 설정 저장/조회 로직 개선
- **우선순위**: 🟡 **중간** (데이터 영속성)

### 6. UI/UX 디자인 개선 🎨
- **현재 상태**: 기본 기능은 모두 구현, 디자인 개선 필요
- **사용자 요청**: "ui디자인" 개선 필요
- **필요 작업**:
  - Slack/Vercel 스타일 디자인 적용
  - 색상 시스템 정리
  - 타이포그래피 개선
  - 간격 및 레이아웃 정리
  - 애니메이션 추가
  - 반응형 디자인 개선
  - 다크 모드 지원 (선택)
- **우선순위**: 🟡 **중간** (사용자 경험 개선)

---

## 🟢 선택 작업 (Nice to Have)

### 7. 테스트 코드 작성
- **현재 상태**: 테스트 코드 없음
- **필요 작업**:
  - 단위 테스트 (백엔드 서비스)
  - 통합 테스트 (API 엔드포인트)
  - E2E 테스트 (프론트엔드)
  - 테스트 커버리지 80% 이상 목표
- **우선순위**: 🟢 **낮음** (품질 보장)

### 8. 문서화 개선
- **현재 상태**: 기본 문서는 있음
- **필요 작업**:
  - API 문서 자동화 (Swagger 개선)
  - 사용자 가이드 작성
  - 비디오 튜토리얼 (선택)
  - FAQ 작성
- **우선순위**: 🟢 **낮음** (온보딩 개선)

### 9. 모니터링 및 로깅
- **현재 상태**: 기본 로깅만 있음
- **필요 작업**:
  - APM 도구 통합 (Sentry, Datadog 등)
  - 메트릭 수집 (Prometheus)
  - 대시보드 구축 (Grafana)
  - 알림 설정
- **우선순위**: 🟢 **낮음** (운영 안정성)

### 10. 성능 최적화
- **현재 상태**: 기본 최적화는 적용됨
- **필요 작업**:
  - 쿼리 최적화 (N+1 문제 해결)
  - 배치 처리 개선
  - CDN 설정
  - 이미지 최적화
- **우선순위**: 🟢 **낮음** (확장성)

### 11. 보안 강화
- **현재 상태**: 기본 보안은 적용됨
- **필요 작업**:
  - MFA (Multi-Factor Authentication)
  - SSO (Single Sign-On)
  - API 키 로테이션
  - 감사 로그 강화
- **우선순위**: 🟢 **낮음** (엔터프라이즈 기능)

### 12. SDK 배포
- **현재 상태**: SDK 코드는 구현됨, 배포 미완
- **필요 작업**:
  - Python SDK PyPI 배포
  - Node.js SDK npm 배포
  - 버전 관리
  - 문서화
- **우선순위**: 🟢 **낮음** (사용자 편의성)

---

## 📊 작업 우선순위 요약

### Phase 1: 수익화 준비 (필수)
1. ✅ Paddle 결제 통합
2. ✅ 이메일 알림 구현
3. ✅ 인앱 알림 읽음 상태 DB 저장

### Phase 2: 사용자 경험 개선 (중요)
4. ✅ UI/UX 디자인 개선
5. ✅ PDF 리포트 생성
6. ✅ NotificationSettings 모델 생성

### Phase 3: 품질 및 운영 (선택)
7. ✅ 테스트 코드 작성
8. ✅ 문서화 개선
9. ✅ 모니터링 및 로깅
10. ✅ 성능 최적화
11. ✅ 보안 강화
12. ✅ SDK 배포

---

## 💡 사용자가 언급한 작업 확인

### ✅ 사용자 언급 사항
1. **구독 기능** → Paddle 결제 통합 필요 ✅
2. **UI 디자인** → 디자인 개선 필요 ✅
3. **PDF** → PDF 리포트 생성 필요 ✅

### ➕ 추가로 발견된 작업
4. **이메일 알림** → 미구현
5. **인앱 알림 읽음 상태** → 인메모리 저장 (DB 필요)
6. **NotificationSettings 모델** → 모델 없음

---

## 🎯 즉시 시작 가능한 작업

### 가장 빠르게 완료 가능한 작업
1. **NotificationSettings 모델 생성** (1-2시간)
2. **인앱 알림 읽음 상태 DB 저장** (2-3시간)
3. **PDF 리포트 생성** (4-6시간)

### 시간이 더 필요한 작업
1. **Paddle 결제 통합** (1-2일)
2. **이메일 알림 구현** (반나절)
3. **UI/UX 디자인 개선** (지속적, 우선순위에 따라)

---

## 📝 최종 정리

**필수 작업 (3개)**:
- Paddle 결제 통합
- 이메일 알림 구현
- 인앱 알림 읽음 상태 DB 저장

**중요 작업 (3개)**:
- UI/UX 디자인 개선
- PDF 리포트 생성
- NotificationSettings 모델 생성

**선택 작업 (6개)**:
- 테스트 코드, 문서화, 모니터링, 성능 최적화, 보안, SDK 배포

**총 남은 작업**: 12개 (필수 3개 + 중요 3개 + 선택 6개)
