# 전체 구현 검토 및 수정 계획

## 발견된 문제점들

### 1. 랜딩 페이지 - 미완성 링크들 ❌
- Footer의 Documentation, API Reference, Support 링크가 `href="#"`로 되어있음
- About, Blog, Contact 링크도 `href="#"`로 되어있음
- Social media 링크들(Github, Twitter, LinkedIn)도 `href="#"`로 되어있음
- Pricing 섹션이 언급되지만 실제 구현이 있는지 확인 필요

### 2. 이메일 서비스 - 실제 구현 없음 ❌
- `backend/app/services/alert_service.py`의 `_send_email()` 메서드가 TODO 주석만 있음
- SMTP 또는 SendGrid/AWS SES 연동이 필요
- 환경 변수 설정이 없음

### 3. Alert 자동 트리거 - 없음 ❌
- `detect_cost_anomalies()`는 Alert를 생성하지만 자동 호출 안 됨
- Drift 감지 시 Alert가 자동으로 생성되지 않음
- 백그라운드 작업/스케줄러가 없음

### 4. Webhook 자동 트리거 - 없음 ❌
- Webhook 테스트 기능만 있음
- Drift 감지, Cost spike, Alert 생성 시 Webhook을 자동 호출하는 로직이 없음

### 5. Drift 감지 시 Alert 생성 - 없음 ❌
- `DriftEngine.detect_drift()`는 DriftDetection만 저장
- Alert를 생성하지 않음

---

## 수정 계획

### 우선순위 1: 이메일 서비스 구현
1. SMTP 설정 추가 (config.py)
2. 이메일 서비스 구현 (alert_service.py)
3. 환경 변수 문서화

### 우선순위 2: Alert 자동 트리거
1. Webhook 자동 트리거 서비스 생성
2. Drift 감지 시 Alert 생성 로직 추가
3. Cost spike Alert는 이미 생성하지만, Webhook 호출 추가 필요

### 우선순위 3: 백그라운드 작업
1. 정기적으로 Drift 감지 및 Cost anomaly 감지 실행
2. Alert 생성 후 Webhook/Email 자동 발송

### 우선순위 4: 랜딩 페이지 수정
1. Footer 링크들 처리 (임시 페이지 또는 #으로 유지)
2. Social media 링크 처리
