# 모니터링 가이드

AgentGuard는 Prometheus와 Grafana를 사용하여 애플리케이션 메트릭을 수집하고 시각화합니다.

## 🚀 빠른 시작

### 로컬 개발 환경

```bash
# 모니터링 스택 시작
docker-compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d

# 접속
# Prometheus: http://localhost:9090
# Grafana: http://localhost:3001 (admin/admin)
```

### 프로덕션 환경

프로덕션에서는 별도의 Prometheus/Grafana 인스턴스를 사용하거나 클라우드 서비스를 활용하세요:
- **Grafana Cloud**: 무료 플랜 제공
- **Datadog**: 통합 모니터링
- **New Relic**: APM 및 메트릭

## 📊 수집되는 메트릭

### API 메트릭

- `api_requests_total`: 총 API 요청 수 (method, endpoint, status_code별)
- `api_request_duration_seconds`: API 요청 지속 시간 (히스토그램)
- `api_request_size_bytes`: 요청 크기
- `api_response_size_bytes`: 응답 크기

### 데이터베이스 메트릭

- `db_queries_total`: 총 데이터베이스 쿼리 수
- `db_query_duration_seconds`: 쿼리 실행 시간
- `db_connection_pool_size`: 연결 풀 크기
- `db_connection_pool_active`: 활성 연결 수

### 캐시 메트릭

- `cache_operations_total`: 캐시 작업 수 (hit/miss/error)
- `cache_operation_duration_seconds`: 캐시 작업 시간

### 비즈니스 메트릭

- `active_users`: 활성 사용자 수
- `active_projects`: 활성 프로젝트 수
- `llm_api_calls_total`: LLM API 호출 수
- `llm_api_call_cost_usd`: LLM API 호출 비용
- `quality_score`: 품질 점수 분포

### 에러 메트릭

- `errors_total`: 총 에러 수 (type, endpoint별)

## 🔍 메트릭 엔드포인트

백엔드 서버의 `/metrics` 엔드포인트에서 Prometheus 형식의 메트릭을 제공합니다:

```bash
curl http://localhost:8000/metrics
```

## 📈 Grafana 대시보드

### 기본 대시보드

1. **AgentGuard Overview**: 전체 시스템 개요
   - API 요청률
   - 응답 시간 (p95, p99)
   - 에러율
   - 활성 사용자/프로젝트

### 커스텀 대시보드 생성

Grafana UI에서 직접 대시보드를 생성하거나 JSON 파일로 관리할 수 있습니다.

## 🚨 알림 설정

### Prometheus Alertmanager

```yaml
# monitoring/prometheus/alerts.yml
groups:
  - name: agentguard
    rules:
      - alert: HighErrorRate
        expr: rate(errors_total[5m]) > 0.1
        for: 5m
        annotations:
          summary: "High error rate detected"
      
      - alert: HighLatency
        expr: histogram_quantile(0.95, rate(api_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        annotations:
          summary: "High API latency detected"
```

### Grafana 알림

Grafana UI에서 직접 알림 규칙을 설정할 수 있습니다:
1. 대시보드 패널 → 알림 설정
2. 조건 설정 (예: 에러율 > 10%)
3. 알림 채널 연결 (Slack, Email 등)

## 🔧 설정

### Prometheus 설정

`monitoring/prometheus/prometheus.yml`에서 스크랩 설정을 수정할 수 있습니다:

```yaml
scrape_configs:
  - job_name: 'agentguard-backend'
    scrape_interval: 5s
    metrics_path: '/metrics'
    static_configs:
      - targets: ['backend:8000']
```

### Grafana 설정

`monitoring/grafana/provisioning/` 디렉토리에서 데이터 소스와 대시보드를 관리합니다.

## 📚 추가 리소스

- [Prometheus 공식 문서](https://prometheus.io/docs/)
- [Grafana 공식 문서](https://grafana.com/docs/)
- [Prometheus Client Python](https://github.com/prometheus/client_python)

---

**모니터링을 통해 애플리케이션의 건강 상태를 실시간으로 파악하세요!** 📊
