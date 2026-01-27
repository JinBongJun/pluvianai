# 🔧 AgentGuard 운영 가이드

> **목표**: 로깅, 메트릭, 모니터링, 알림, 워커, 재해 복구 등 운영에 필요한 모든 정보

---

## 📋 목차

1. [로깅 전략](#1-로깅-전략)
2. [메트릭 수집 및 모니터링](#2-메트릭-수집-및-모니터링)
3. [알림 시스템](#3-알림-시스템)
4. [워커 프로세스 관리](#4-워커-프로세스-관리)
5. [재해 복구 (Disaster Recovery)](#5-재해-복구-disaster-recovery)
6. [백업 전략](#6-백업-전략)
7. [헬스 체크 및 Status Page](#7-헬스-체크-및-status-page)
8. [용량 계획](#8-용량-계획)
9. [확장성 전략](#9-확장성-전략)
10. [캐싱 전략](#10-캐싱-전략)
11. [고객 지원 프로세스](#11-고객-지원-프로세스)
12. [재무 관리](#12-재무-관리)

---

## 1. 로깅 전략

### 1.1 로그 레벨 전략

**로그 레벨 정의**:
- `DEBUG`: 개발/디버깅 정보 (프로덕션에서 비활성화)
- `INFO`: 일반 정보 (요청/응답, 비즈니스 이벤트)
- `WARNING`: 경고 (예상 가능한 문제)
- `ERROR`: 에러 (처리 가능한 예외)
- `CRITICAL`: 치명적 에러 (시스템 중단 필요)

**환경별 로그 레벨**:
- 개발: `DEBUG`
- 스테이징: `INFO`
- 프로덕션: `WARNING`

**구현**:
```python
# backend/app/core/logging.py
import logging
import sys
from app.core.config import settings

def setup_logging():
    log_level = logging.DEBUG if settings.is_development else logging.WARNING
    
    logging.basicConfig(
        level=log_level,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler('logs/agentguard.log')
        ]
    )
```

### 1.2 구조화된 JSON 로깅

**구조화된 로그 형식**:
```json
{
  "timestamp": "2026-01-01T00:00:00Z",
  "level": "INFO",
  "logger": "app.api.projects",
  "message": "Project created",
  "context": {
    "user_id": 1,
    "project_id": 123,
    "request_id": "req_1234567890"
  }
}
```

**구현**:
```python
# backend/app/core/logging.py
import json
import logging

class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_data = {
            "timestamp": self.formatTime(record),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "context": getattr(record, "context", {})
        }
        return json.dumps(log_data)
```

### 1.3 로그 수집 및 저장

**로그 수집 도구**:
- **로컬 개발**: 파일 기반 로깅
- **프로덕션**: ELK Stack (Elasticsearch, Logstash, Kibana) 또는 Loki

**로그 보관 정책**:
- 개발: 7일
- 스테이징: 30일
- 프로덕션: 90일

**로그 압축 및 아카이빙**:
- 30일 후 압축
- 90일 후 S3 Glacier로 아카이브

### 1.4 로그 보안

**PII 마스킹**:
```python
# backend/app/core/logging.py
import re

def mask_pii(text: str) -> str:
    # 이메일 마스킹
    text = re.sub(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', '[EMAIL]', text)
    # 카드번호 마스킹
    text = re.sub(r'\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b', '[CARD]', text)
    # API Key 마스킹
    text = re.sub(r'sk-[A-Za-z0-9]+', '[API_KEY]', text)
    return text
```

**로그 접근 제어**:
- 로그는 관리자만 접근 가능
- 로그 접근 이력 기록
- 로그 암호화 저장

**로그 무결성 검증**:
- 로그 해시 값 저장
- 로그 수정 감지

---

## 2. 메트릭 수집 및 모니터링

### 2.1 메트릭 정의

**비즈니스 메트릭**:
- 가입 수 (Signups)
- 전환율 (Free → Pro)
- 이탈율 (Churn Rate)
- 월간 반복 수익 (MRR)

**기술 메트릭**:
- 응답 시간 (Response Time)
- 에러율 (Error Rate)
- 처리량 (Throughput)
- 리소스 사용량 (CPU, Memory, Disk)

**사용자 메트릭**:
- 일일 활성 사용자 (DAU)
- 월간 활성 사용자 (MAU)
- 세션 길이 (Session Length)

### 2.2 Prometheus 메트릭 수집

**메트릭 엔드포인트**:
```
GET /metrics
```

**메트릭 예시**:
```python
# backend/app/core/metrics.py
from prometheus_client import Counter, Histogram, Gauge

# 카운터
http_requests_total = Counter(
    'http_requests_total',
    'Total HTTP requests',
    ['method', 'endpoint', 'status']
)

# 히스토그램
http_request_duration_seconds = Histogram(
    'http_request_duration_seconds',
    'HTTP request duration',
    ['method', 'endpoint']
)

# 게이지
active_users = Gauge(
    'active_users_total',
    'Number of active users'
)
```

**메트릭 수집 주기**:
- 기본: 15초
- 중요 메트릭: 5초

**메트릭 보관 기간**:
- 1분 해상도: 15일
- 5분 해상도: 90일
- 1시간 해상도: 1년

### 2.3 Grafana 대시보드

**대시보드 구성**:
1. **개요 대시보드**: 전체 시스템 상태
2. **비즈니스 대시보드**: 가입, 전환, 수익
3. **기술 대시보드**: 응답 시간, 에러율, 처리량
4. **사용자 대시보드**: DAU, MAU, 세션

**대시보드 예시**:
- 응답 시간: P50, P95, P99
- 에러율: 5분 평균
- 처리량: 초당 요청 수

### 2.4 알림 규칙

**임계값 정의**:
- 응답 시간 P95 > 1초: 경고
- 에러율 > 1%: 경고
- 에러율 > 5%: 치명적
- CPU 사용률 > 80%: 경고
- 메모리 사용률 > 90%: 경고

**알림 채널**:
- Slack: 모든 알림
- Email: 치명적 알림
- PagerDuty: 긴급 알림

**알림 중복 방지**:
- 같은 알림은 5분 내 1회만 전송
- 알림 그룹화

---

## 3. 알림 시스템

### 3.1 알림 채널 관리

**이메일 서비스: Resend**

AgentGuard는 **Resend**를 이메일 전송 서비스로 사용합니다.

**Resend 설정**:
1. Resend 계정 생성: https://resend.com
2. API 키 발급: 대시보드 → API Keys → Create API Key
3. 도메인 인증 (선택사항):
   - 프로덕션: 자체 도메인 인증 (예: `onboarding@agentguard.ai`)
   - 개발/테스트: `onboarding@resend.dev` 사용 가능
4. 환경 변수 설정:
   ```bash
   RESEND_API_KEY=re_xxxxxxxxxxxxx
   EMAIL_FROM=onboarding@yourdomain.com
   EMAIL_FROM_NAME=AgentGuard
   ```

**Resend 장점**:
- 무료 티어: 월 3,000건 (초기 테스트에 충분)
- 간단한 API: 개발자 친화적
- 빠른 전송: 실시간 알림에 적합
- 도메인 인증 간단: DNS 설정만으로 가능

**채널 설정**:
```python
# backend/app/services/email_service.py
import resend
from app.core.config import settings

class EmailService:
    def __init__(self):
        if settings.RESEND_API_KEY:
            resend.api_key = settings.RESEND_API_KEY
        self.from_email = settings.EMAIL_FROM or "onboarding@resend.dev"
        self.from_name = settings.EMAIL_FROM_NAME or "AgentGuard"
    
    async def send_alert_email(
        self, 
        to: str, 
        subject: str, 
        html_content: str
    ) -> dict:
        """Send alert email via Resend"""
        try:
            params = {
                "from": f"{self.from_name} <{self.from_email}>",
                "to": [to],
                "subject": subject,
                "html": html_content,
            }
            email = resend.Emails.send(params)
            return {"status": "sent", "id": email["id"]}
        except Exception as e:
            logger.error(f"Failed to send email: {str(e)}")
            return {"status": "failed", "error": str(e)}

# backend/app/services/notification_service.py
class NotificationService:
    def __init__(self):
        self.channels = {
            'slack': SlackChannel(),
            'email': EmailService(),  # Resend 사용
            'pagerduty': PagerDutyChannel()
        }
    
    def send(self, message: str, level: str, channels: List[str]):
        for channel_name in channels:
            channel = self.channels.get(channel_name)
            if channel:
                channel.send(message, level)
```

**채널 우선순위**:
- 경고: Slack
- 치명적: Slack + Email + PagerDuty

### 3.2 알림 템플릿

**이메일 템플릿 (Resend HTML)**:
```html
<!-- backend/app/templates/email/alert.html -->
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; }
        .alert { padding: 20px; border-left: 4px solid #ef4444; background: #fef2f2; }
        .level-critical { border-color: #ef4444; }
        .level-high { border-color: #f59e0b; }
        .level-medium { border-color: #3b82f6; }
    </style>
</head>
<body>
    <div class="alert level-{{ level }}">
        <h1>AgentGuard Alert</h1>
        <p><strong>Level:</strong> {{ level }}</p>
        <p><strong>Project:</strong> {{ project_name }}</p>
        <p><strong>Message:</strong> {{ message }}</p>
        <p><strong>Time:</strong> {{ timestamp }}</p>
        <p><a href="{{ dashboard_url }}">View in Dashboard</a></p>
    </div>
</body>
</html>
```

**이메일 전송 예시**:
```python
# backend/app/services/email_service.py
from app.templates.email import render_alert_email

async def send_alert_email(alert: Alert, user_email: str):
    html_content = render_alert_email(
        level=alert.severity,
        project_name=alert.project.name,
        message=alert.message,
        timestamp=alert.created_at.isoformat(),
        dashboard_url=f"https://app.agentguard.ai/projects/{alert.project_id}/alerts"
    )
    
    email_service = EmailService()
    result = await email_service.send_alert_email(
        to=user_email,
        subject=f"AgentGuard Alert: {alert.title}",
        html_content=html_content
    )
    return result
```

**Slack 메시지 템플릿**:
```json
{
  "text": "AgentGuard Alert",
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Level:* {{ level }}\n*Message:* {{ message }}"
      }
    }
  ]
}
```

### 3.3 알림 규칙 엔진

**조건부 알림**:
```python
# backend/app/services/alert_service.py
class AlertService:
    def check_conditions(self, metric_name: str, value: float):
        rules = self.get_rules(metric_name)
        for rule in rules:
            if rule.condition(value):
                self.send_alert(rule, value)
```

**알림 빈도 제한**:
- 같은 알림은 5분 내 1회만 전송
- 알림 그룹화 (같은 타입의 알림을 하나로 묶음)

### 3.4 알림 전달 보장

**재시도 전략**:
- 최대 3회 재시도
- 지수 백오프 (1초, 2초, 4초)

**전달 실패 처리**:
- 전달 실패 시 로그 기록
- 관리자에게 알림

**전달 상태 추적**:
- 전달 상태 저장 (pending, sent, failed)
- 전달 시간 기록

---

## 4. 워커 프로세스 관리

### 4.1 워커 프로세스 관리

**워커 시작/중지**:
```python
# backend/app/workers/manager.py
class WorkerManager:
    def start_worker(self, worker_name: str):
        process = multiprocessing.Process(
            target=self.run_worker,
            args=(worker_name,)
        )
        process.start()
        return process
    
    def stop_worker(self, process: multiprocessing.Process):
        process.terminate()
        process.join()
```

**워커 헬스 체크**:
```python
# backend/app/workers/health.py
class WorkerHealth:
    def check_health(self, worker_name: str) -> bool:
        # 워커 프로세스 상태 확인
        # 작업 큐 상태 확인
        # 리소스 사용량 확인
        return is_healthy
```

**워커 스케일링**:
- 작업 큐 길이에 따라 자동 스케일링
- 최소 워커 수: 1
- 최대 워커 수: 10

### 4.2 작업 큐 시스템

**작업 큐 선택**: Redis + Celery

**Celery 설정**:
```python
# backend/app/core/celery.py
from celery import Celery

celery_app = Celery(
    'agentguard',
    broker='redis://localhost:6379/0',
    backend='redis://localhost:6379/0'
)

celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
)
```

**작업 우선순위**:
- 높음: 실시간 알림
- 중간: 배치 처리
- 낮음: 아카이빙

### 4.3 작업 실패 처리

**재시도 전략**:
```python
# backend/app/workers/tasks.py
@celery_app.task(bind=True, max_retries=3)
def archive_snapshot(self, snapshot_id: int):
    try:
        # 아카이빙 로직
        pass
    except Exception as exc:
        # 지수 백오프로 재시도
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)
```

**Dead Letter Queue**:
- 최대 재시도 후 실패한 작업은 DLQ로 이동
- 관리자가 수동으로 처리

### 4.4 작업 모니터링

**작업 상태 추적**:
```python
# backend/app/workers/monitor.py
class TaskMonitor:
    def get_task_status(self, task_id: str):
        task = celery_app.AsyncResult(task_id)
        return {
            "task_id": task_id,
            "status": task.status,
            "result": task.result,
            "traceback": task.traceback
        }
```

**작업 진행률**:
```python
# backend/app/workers/tasks.py
@celery_app.task(bind=True)
def process_batch(self, items: List[int]):
    total = len(items)
    for i, item in enumerate(items):
        # 처리 로직
        self.update_state(
            state='PROGRESS',
            meta={'current': i + 1, 'total': total}
        )
```

---

## 5. 재해 복구 (Disaster Recovery)

### 5.1 RTO (Recovery Time Objective)

**목표 복구 시간**: 4시간

**복구 시간 구성**:
- 장애 감지: 5분
- 원인 분석: 30분
- 복구 실행: 2시간
- 검증: 1시간
- 트래픽 전환: 30분

### 5.2 RPO (Recovery Point Objective)

**목표 데이터 손실 허용 범위**: 1시간

**백업 주기**:
- 데이터베이스: 1시간마다 증분 백업
- 전체 백업: 매일

### 5.3 백업 복구 절차

**복구 절차**:
1. 장애 확인 및 격리
2. 백업 선택 (RPO 기준)
3. 백업 복구
4. 데이터 검증
5. 서비스 재개

**복구 테스트**:
- 월 1회 복구 테스트
- 복구 시간 측정
- 복구 절차 문서 업데이트

### 5.4 재해 복구 시나리오

**데이터베이스 장애**:
1. 읽기 전용 복제본으로 전환
2. 백업에서 복구
3. 트래픽 복구

**Redis 장애**:
1. Fail-silent 로직 활성화 (Snapshot 저장 포기)
2. Redis 복구
3. 정상 동작 확인

**전체 지역 장애**:
1. 다른 지역으로 전환
2. 데이터 복제
3. DNS 전환

---

## 6. 백업 전략

### 6.1 데이터베이스 백업

**백업 주기**:
- 전체 백업: 매일 02:00 UTC
- 증분 백업: 1시간마다

**백업 보관**:
- 일일 백업: 7일
- 주간 백업: 4주
- 월간 백업: 12개월

**백업 저장소**:
- S3 Standard (최근 백업)
- S3 Glacier (오래된 백업)

### 6.2 백업 복구 테스트

**테스트 주기**: 월 1회

**테스트 절차**:
1. 백업 선택
2. 테스트 환경에 복구
3. 데이터 검증
4. 결과 문서화

### 6.3 백업 보관 정책

**보관 기간**:
- 개발: 7일
- 스테이징: 30일
- 프로덕션: 1년

**보관 위치**:
- 최근 백업: S3 Standard
- 오래된 백업: S3 Glacier

---

## 7. 헬스 체크 및 Status Page

### 7.1 헬스 체크 엔드포인트

**기본 헬스 체크**:
```
GET /health
```

**응답**:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-01T00:00:00Z"
}
```

**상세 헬스 체크**:
```
GET /health/detailed
```

**응답**:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-01T00:00:00Z",
  "checks": {
    "database": "healthy",
    "redis": "healthy",
    "s3": "healthy"
  }
}
```

### 7.2 Status Page

**외부 Status Page**: statuspage.io

**상태 표시**:
- Operational: 정상
- Degraded Performance: 성능 저하
- Partial Outage: 부분 장애
- Major Outage: 전체 장애

**업데이트 주기**: 실시간

---

## 8. 용량 계획

### 8.1 리소스 모니터링

**모니터링 메트릭**:
- CPU 사용률
- 메모리 사용률
- 디스크 사용률
- 네트워크 대역폭

**임계값**:
- CPU: 80%
- 메모리: 90%
- 디스크: 85%

### 8.2 스케일링 전략

**수평 확장**:
- 트래픽 증가 시 인스턴스 추가
- 자동 스케일링 (CPU > 80% 시)

**수직 확장**:
- 리소스 부족 시 인스턴스 크기 증가
- 수동 스케일링

### 8.3 용량 예측

**예측 모델**:
- 과거 데이터 기반 선형 회귀
- 계절성 고려

**예측 주기**: 월 1회

---

## 9. 확장성 전략

### 9.1 수평 확장 전략

**서버 인스턴스 추가**:
- 트래픽 증가 시 자동 스케일링
- 로드 밸런서를 통한 트래픽 분산
- 상태 없는 서버 설계 (Stateless)

**자동 스케일링 정책**:
```yaml
# Kubernetes HPA (Horizontal Pod Autoscaler)
minReplicas: 2
maxReplicas: 10
targetCPUUtilizationPercentage: 70
targetMemoryUtilizationPercentage: 80
```

**로드 밸런서 설정**:
- Round-robin 기본 알고리즘
- 헬스 체크 기반 트래픽 라우팅
- 세션 어피니티: 필요시 Sticky Session

### 9.2 수직 확장 전략

**리소스 증설 기준**:
- CPU 사용률 > 80% (지속 5분)
- 메모리 사용률 > 90% (지속 5분)
- 디스크 I/O > 80% (지속 5분)

**인스턴스 타입 업그레이드**:
- 개발: t3.small (2 vCPU, 2GB RAM)
- 스테이징: t3.medium (2 vCPU, 4GB RAM)
- 프로덕션: t3.large (2 vCPU, 8GB RAM) → t3.xlarge (4 vCPU, 16GB RAM)

### 9.3 데이터 샤딩 전략

**샤딩 키 선택**:
- `project_id` 기반 샤딩
- 같은 프로젝트의 데이터는 같은 샤드에 저장

**샤딩 전략**:
- **Range Sharding**: project_id 범위별 분할
- **Hash Sharding**: project_id 해시값 기반 분할

**샤딩 마이그레이션**:
- 제로 다운타임 마이그레이션
- Dual-write 전략 (기존 + 새 샤드에 동시 쓰기)
- 점진적 읽기 전환

### 9.4 읽기 전용 복제본

**읽기/쓰기 분리**:
- Master: 쓰기 전용
- Replica: 읽기 전용 (최대 3개)

**복제 지연 처리**:
- 최대 복제 지연: 1초
- 복제 지연 감지 시 Master로 자동 전환
- Eventually Consistent 읽기 허용

**구현**:
```python
# backend/app/core/database.py
from sqlalchemy import create_engine

# Master (쓰기)
master_engine = create_engine(MASTER_DATABASE_URL)

# Replica (읽기)
replica_engines = [
    create_engine(REPLICA_DATABASE_URL_1),
    create_engine(REPLICA_DATABASE_URL_2),
    create_engine(REPLICA_DATABASE_URL_3),
]

def get_read_db():
    # Round-robin으로 Replica 선택
    return next(replica_engines)

def get_write_db():
    return master_engine
```

---

## 10. 캐싱 전략

### 10.1 캐시 키 전략

**캐시 키 네이밍**:
```
{resource_type}:{identifier}:{version}
```

**예시**:
- `user:1:profile`
- `project:123:settings`
- `snapshot:456:data`

**캐시 키 버전 관리**:
- 스키마 변경 시 버전 증가
- 자동 캐시 무효화

### 10.2 TTL 설정

**캐시별 TTL**:
- 사용자 프로필: 1시간
- 프로젝트 설정: 30분
- 스냅샷 데이터: 5분
- 통계 데이터: 10분

**구현**:
```python
# backend/app/core/cache.py
CACHE_TTL = {
    'user_profile': 3600,  # 1시간
    'project_settings': 1800,  # 30분
    'snapshot_data': 300,  # 5분
    'stats': 600,  # 10분
}
```

### 10.3 캐시 무효화 전략

**이벤트 기반 무효화**:
- 데이터 변경 시 관련 캐시 자동 무효화
- 태그 기반 일괄 무효화

**구현**:
```python
# backend/app/core/cache.py
def invalidate_cache(pattern: str):
    """패턴에 맞는 모든 캐시 키 삭제"""
    keys = redis_client.keys(pattern)
    if keys:
        redis_client.delete(*keys)

def invalidate_user_cache(user_id: int):
    """사용자 관련 모든 캐시 무효화"""
    invalidate_cache(f"user:{user_id}:*")
    invalidate_cache(f"project:*:owner:{user_id}")
```

### 10.4 캐시 히트율 목표

**목표 히트율**:
- 사용자 프로필: > 90%
- 프로젝트 설정: > 85%
- 스냅샷 데이터: > 70%
- 통계 데이터: > 80%

**모니터링**:
- 캐시 히트율 메트릭 수집
- 히트율 저하 시 알림

### 10.5 캐시 계층 구조

**L1 캐시 (In-Memory)**:
- 애플리케이션 메모리
- 매우 빠른 접근
- 제한된 용량

**L2 캐시 (Redis)**:
- 분산 캐시
- 빠른 접근
- 큰 용량

**L3 캐시 (Database)**:
- 영구 저장소
- 느린 접근
- 무제한 용량

---

## 11. 고객 지원 프로세스

### 11.1 티켓 시스템

**지원 티켓 플랫폼**: Zendesk 또는 Intercom

**티켓 분류**:
- **기술 지원**: 버그, 통합 문제
- **계정 관리**: 결제, 플랜 변경
- **기능 문의**: 사용법, 기능 요청
- **긴급 이슈**: 서비스 중단, 보안 문제

**우선순위**:
- **P0 (긴급)**: 서비스 중단, 보안 문제 (1시간 내 응답)
- **P1 (높음)**: 주요 기능 장애 (4시간 내 응답)
- **P2 (보통)**: 일반 문의 (24시간 내 응답)
- **P3 (낮음)**: 기능 요청 (72시간 내 응답)

### 11.2 지원 채널

**이메일 지원**:
- support@agentguard.ai
- 응답 시간: 영업일 기준 24시간 내

**채팅 지원** (Pro/Enterprise):
- Intercom 또는 Crisp
- 실시간 채팅
- 응답 시간: 영업일 기준 1시간 내

**커뮤니티 포럼**:
- Discord 또는 GitHub Discussions
- 커뮤니티 기반 지원
- 공식 응답: 48시간 내

### 11.3 지원 프로세스

**티켓 처리 절차**:
1. 티켓 접수 및 분류
2. 우선순위 할당
3. 담당자 배정
4. 조사 및 해결
5. 고객 응답
6. 티켓 종료 및 피드백 수집

**에스컬레이션**:
- P0 티켓: 즉시 기술 팀 리더에게 에스컬레이션
- 해결 시간 초과: 상위 관리자에게 에스컬레이션
- 반복 이슈: 제품 팀에 피드백

### 11.4 SLA 정의

**응답 시간 SLA**:
- P0 (긴급): 1시간 내
- P1 (높음): 4시간 내
- P2 (보통): 24시간 내
- P3 (낮음): 72시간 내

**해결 시간 SLA**:
- P0 (긴급): 4시간 내
- P1 (높음): 24시간 내
- P2 (보통): 5일 내
- P3 (낮음): 14일 내

### 11.5 지식 베이스

**FAQ 섹션**:
- 자주 묻는 질문
- 단계별 가이드
- 트러블슈팅 가이드

**튜토리얼**:
- Quick Start 가이드
- 기능별 튜토리얼
- 비디오 가이드

**문서화**:
- API 문서
- SDK 문서
- 통합 가이드

---

## 12. 재무 관리

### 12.1 비용 추적 시스템

**인프라 비용 추적**:
- AWS 비용: CloudWatch Billing
- 데이터베이스 비용: Railway/Supabase 대시보드
- Redis 비용: ElastiCache 비용 추적

**Judge 비용 추적**:
- LLM API 호출 비용 (OpenAI, Anthropic)
- 월별 Judge 호출 수
- 비용 예측 모델

**구현**:
```python
# backend/app/services/cost_tracking_service.py
class CostTrackingService:
    def track_infrastructure_cost(self, date: str):
        # AWS 비용 추적
        aws_cost = get_aws_cost(date)
        
        # DB 비용 추적
        db_cost = get_database_cost(date)
        
        # Redis 비용 추적
        redis_cost = get_redis_cost(date)
        
        total = aws_cost + db_cost + redis_cost
        return {
            "date": date,
            "aws": aws_cost,
            "database": db_cost,
            "redis": redis_cost,
            "total": total
        }
    
    def track_judge_cost(self, month: str):
        # Judge 호출 비용 추적
        judge_calls = get_judge_calls_count(month)
        cost_per_call = 0.001  # 예시
        return judge_calls * cost_per_call
```

### 12.2 예산 관리

**월별 예산 설정**:
- 인프라 예산: $5,000/월
- Judge 비용 예산: $10,000/월
- 마케팅 예산: $3,000/월

**예산 알림**:
- 50% 소진: 경고 알림
- 80% 소진: 긴급 알림
- 100% 소진: 자동 제한 (필요시)

**구현**:
```python
# backend/app/services/budget_service.py
class BudgetService:
    def check_budget(self, category: str, current_spend: float):
        budget = get_budget(category)
        percentage = (current_spend / budget) * 100
        
        if percentage >= 100:
            send_alert("Budget exceeded", category)
            # 자동 제한 로직
        elif percentage >= 80:
            send_alert("Budget warning", category)
        elif percentage >= 50:
            send_warning("Budget alert", category)
```

### 12.3 재무 보고

**월별 재무 리포트**:
- 수익: 구독 수익, 추가 과금
- 비용: 인프라, Judge, 마케팅
- 순이익: 수익 - 비용
- 마진율: (순이익 / 수익) * 100

**구현**:
```python
# backend/app/services/financial_report_service.py
class FinancialReportService:
    def generate_monthly_report(self, month: str):
        revenue = self.get_revenue(month)
        costs = self.get_costs(month)
        net_income = revenue - costs
        margin = (net_income / revenue) * 100 if revenue > 0 else 0
        
        return {
            "month": month,
            "revenue": revenue,
            "costs": costs,
            "net_income": net_income,
            "margin": margin
        }
```

### 12.4 ROI 분석

**고객별 ROI 분석**:
- 고객 수익 (LTV)
- 고객 획득 비용 (CAC)
- ROI: (LTV - CAC) / CAC

**채널별 ROI 분석**:
- 마케팅 채널별 CAC
- 채널별 전환율
- 채널별 ROI

**구현**:
```python
# backend/app/services/roi_analysis_service.py
class ROIAnalysisService:
    def calculate_customer_roi(self, customer_id: int):
        ltv = self.calculate_ltv(customer_id)
        cac = self.get_cac(customer_id)
        roi = (ltv - cac) / cac if cac > 0 else 0
        
        return {
            "customer_id": customer_id,
            "ltv": ltv,
            "cac": cac,
            "roi": roi
        }
```

### 12.5 비용 최적화

**비용 절감 전략**:
- 사용하지 않는 리소스 제거
- Reserved Instance 활용 (AWS)
- 데이터 아카이빙 (S3 Glacier)
- Judge 비용 최적화 (사용자 API Key 연동)

**비용 모니터링**:
- 일일 비용 추적
- 비용 급증 알림
- 비용 예측 모델

---

**작성일**: 2026-01-XX  
**버전**: 1.0.0  
**참고**: [../DETAILED_DESIGN.md](../DETAILED_DESIGN.md) - 메인 아키텍처 문서
