# MVP Ops Slack Alerts — Implementation Plan

Status: **IMPLEMENTED (MVP baseline)**

## Goal

운영 이슈를 "터지고 나서" 알게 되는 상태에서 벗어나, Slack 채널에서 즉시 감지/분류/복구 확인까지 가능한 최소 관측 세트를 구축한다.

## Implemented Alert Set

1. **Project API degradation (Live View / Release Gate)**
   - Signal: per-project endpoint-group 기준 5xx 비율 + p95 latency
   - Event: `project_api_degraded`, `project_api_recovered`
   - Hook: `LoggingMiddleware` -> `ops_alerting.observe_project_api_request(...)`

2. **Release Gate fail ratio high**
   - Signal: rolling window 내 실패 비율
   - Event: `release_gate_fail_ratio_high`, `release_gate_fail_ratio_recovered`
   - Hook: `release_gate.validate` / webhook 경로에서 `observe_release_gate_result(...)`

3. **LLM provider error burst**
   - Signal: provider + error_code 조합 버스트 카운트
   - Event: `provider_error_burst`, `provider_error_recovered`
   - Hook:
     - Release Gate preflight (`provider_resolution_failed`, `missing_provider_keys`)
     - Replay 실패 케이스(`error_code` 존재 시) 집계

4. **DB error burst (existing, retained)**
   - Signal: DB 예외 클래스별 버스트 카운트
   - Event: `db_error_burst`, `db_error_recovered`
   - Hook: global exception path (`ops_alerting.observe_db_error(...)`)

5. **Meta alert: alert-frequency high**
   - Signal: 동일 event_type이 과도하게 반복 전송됨
   - Event: `ops_alert_frequency_high`
   - Purpose: 임계값 오설정/장애 폭주로 인한 알림 홍수 탐지

## New/Updated Configs

- `OPS_PROJECT_API_WINDOW_SECONDS`
- `OPS_PROJECT_API_MIN_SAMPLES`
- `OPS_PROJECT_API_5XX_RATE_THRESHOLD`
- `OPS_PROJECT_API_P95_MS_THRESHOLD`
- `OPS_RELEASE_GATE_RATIO_WINDOW_SECONDS`
- `OPS_RELEASE_GATE_RATIO_MIN_SAMPLES`
- `OPS_RELEASE_GATE_FAIL_RATIO_THRESHOLD`
- `OPS_PROVIDER_ERROR_WINDOW_SECONDS`
- `OPS_PROVIDER_ERROR_BURST_COUNT`
- `OPS_ALERT_META_WINDOW_SECONDS`
- `OPS_ALERT_META_FREQUENCY_THRESHOLD`

All alerts are routed through `OPS_ALERT_WEBHOOK_URL`.

## Recommended Ops Profile (~1,000 paid users)

아래 값은 현재 코드 경로 기준으로 "너무 민감하지 않으면서도 초동 대응 가능한" 기본 운영 프로파일이다.

```env
OPS_ALERT_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
OPS_ALERT_COOLDOWN_SECONDS=600

OPS_LIVE_VIEW_WINDOW_SECONDS=300
OPS_LIVE_VIEW_5XX_RATE_THRESHOLD=0.05
OPS_LIVE_VIEW_P95_MS_THRESHOLD=3000

OPS_PROJECT_API_WINDOW_SECONDS=300
OPS_PROJECT_API_MIN_SAMPLES=20
OPS_PROJECT_API_5XX_RATE_THRESHOLD=0.05
OPS_PROJECT_API_P95_MS_THRESHOLD=3000

OPS_RELEASE_GATE_WINDOW_SECONDS=600
OPS_RELEASE_GATE_FAILURE_BURST_COUNT=3
OPS_RELEASE_GATE_RATIO_WINDOW_SECONDS=3600
OPS_RELEASE_GATE_RATIO_MIN_SAMPLES=10
OPS_RELEASE_GATE_FAIL_RATIO_THRESHOLD=0.15

OPS_PROVIDER_ERROR_WINDOW_SECONDS=600
OPS_PROVIDER_ERROR_BURST_COUNT=5

OPS_DB_ERROR_WINDOW_SECONDS=300
OPS_DB_ERROR_BURST_COUNT=10

OPS_SNAPSHOT_WINDOW_SECONDS=600
OPS_SNAPSHOT_5XX_RATIO_THRESHOLD=0.20
OPS_SNAPSHOT_ERROR_MIN_SAMPLES=20

OPS_ALERT_META_WINDOW_SECONDS=3600
OPS_ALERT_META_FREQUENCY_THRESHOLD=20
```

### Why these defaults

- `5xx_rate 5%`, `p95 3s`: 사용자 체감 저하가 시작되는 구간을 빠르게 포착
- `Release Gate fail ratio 15%`(1h, min 10): 샘플 수가 낮을 때의 오탐을 줄이면서 품질 저하를 감지
- `provider_error_burst 5/10m`: 키 누락/레이트리밋/모델 불일치 같은 운영성 오류를 조기 감지
- `meta alert 20/h`: 알림 홍수 자체를 별도 장애 신호로 관리

### Rollout order (safe)

1. `.env`에 값 반영 + `OPS_ALERT_WEBHOOK_URL` 설정
2. 배포 후 admin dry-run으로 Slack 수신 확인
3. 48시간 관찰 후 noisy 이벤트만 임계값 완화 (`*_THRESHOLD`, `*_BURST_COUNT`)
4. 1주 후 실제 incident 기준으로 재조정

## Deployment Handoff

### 1) Production `.env` diff draft

아래 블록을 현재 운영 `.env`에 추가/갱신하면 된다.

```env
# Ops Slack webhook
OPS_ALERT_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
OPS_ALERT_COOLDOWN_SECONDS=600

# Live View / project API degradation
OPS_LIVE_VIEW_WINDOW_SECONDS=300
OPS_LIVE_VIEW_5XX_RATE_THRESHOLD=0.05
OPS_LIVE_VIEW_P95_MS_THRESHOLD=3000
OPS_PROJECT_API_WINDOW_SECONDS=300
OPS_PROJECT_API_MIN_SAMPLES=20
OPS_PROJECT_API_5XX_RATE_THRESHOLD=0.05
OPS_PROJECT_API_P95_MS_THRESHOLD=3000

# Release Gate quality/stability
OPS_RELEASE_GATE_WINDOW_SECONDS=600
OPS_RELEASE_GATE_FAILURE_BURST_COUNT=3
OPS_RELEASE_GATE_RATIO_WINDOW_SECONDS=3600
OPS_RELEASE_GATE_RATIO_MIN_SAMPLES=10
OPS_RELEASE_GATE_FAIL_RATIO_THRESHOLD=0.15

# Provider and DB incident burst
OPS_PROVIDER_ERROR_WINDOW_SECONDS=600
OPS_PROVIDER_ERROR_BURST_COUNT=5
OPS_DB_ERROR_WINDOW_SECONDS=300
OPS_DB_ERROR_BURST_COUNT=10

# Snapshot quality guard
OPS_SNAPSHOT_WINDOW_SECONDS=600
OPS_SNAPSHOT_5XX_RATIO_THRESHOLD=0.20
OPS_SNAPSHOT_ERROR_MIN_SAMPLES=20

# Anti-noise meta alert
OPS_ALERT_META_WINDOW_SECONDS=3600
OPS_ALERT_META_FREQUENCY_THRESHOLD=20
```

### 2) Dry-run commands (PowerShell)

사전 준비:
- `BASE_URL`: API 서버 주소
- `ADMIN_BEARER_TOKEN`: 슈퍼유저 JWT

```powershell
$BASE_URL = "https://api.your-domain.com"
$TOKEN = "YOUR_ADMIN_BEARER_TOKEN"
$headers = @{
  "Authorization" = "Bearer $TOKEN"
  "Content-Type"  = "application/json"
}
```

#### A. Project API degradation

```powershell
$body = @{
  event_type = "project_api_degraded"
  project_id = 1
  repeats = 25
  endpoint_group = "release_gate"
  status_code = 500
  duration_ms = 4200
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "$BASE_URL/api/v1/admin/ops-alerts/test" -Headers $headers -Body $body
```

#### B. Release Gate fail-ratio high

```powershell
# 실패 샘플 주입 (fail ratio 상승)
$failBody = @{
  event_type = "release_gate_fail_ratio_high"
  project_id = 1
  repeats = 12
  success = $false
  error_summary = "dry-run fail sample"
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$BASE_URL/api/v1/admin/ops-alerts/test" -Headers $headers -Body $failBody

# 회복 샘플 주입 (recovered 확인)
$okBody = @{
  event_type = "release_gate_fail_ratio_high"
  project_id = 1
  repeats = 12
  success = $true
  error_summary = "dry-run recover sample"
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$BASE_URL/api/v1/admin/ops-alerts/test" -Headers $headers -Body $okBody
```

#### C. Provider error burst

```powershell
$body = @{
  event_type = "provider_error_burst"
  project_id = 1
  repeats = 6
  provider = "openai"
  error_code = "missing_provider_keys"
  error_summary = "dry-run provider error burst"
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "$BASE_URL/api/v1/admin/ops-alerts/test" -Headers $headers -Body $body
```

### 3) Post-check (done criteria)

- Slack 채널에 `project_api_degraded` 알림이 1회 이상 도착
- Slack 채널에 `release_gate_fail_ratio_high` 및 `..._recovered`가 순서대로 도착
- Slack 채널에 `provider_error_burst` 알림 도착
- 동일 이벤트가 과다 반복될 때 `ops_alert_frequency_high`가 도착

## Dry-run Support (Admin)

`POST /api/v1/admin/ops-alerts/test` 에서 신규 시나리오를 직접 발생시켜 Slack 라우팅/포맷/쿨다운 동작을 검증할 수 있다.

Supported dry-run `event_type` (expanded):
- `project_api_degraded`
- `release_gate_fail_ratio_high`
- `provider_error_burst`
- plus existing events (`live_view_api_degraded`, `release_gate_failure_burst`, `db_error_burst`, `snapshot_error_ratio_high`, `custom`)

## Verification

Executed:
- `python -m pytest -q backend/tests/unit/test_ops_alerting_service.py backend/tests/integration/test_admin_ops_alerts_dry_run.py backend/tests/integration/test_release_gate_overrides_and_export.py`

Result:
- `16 passed`

## Recommended Next (Production Hardening)

- Grafana/Datadog 대시보드에 동일 지표를 시각화해 Slack-only 운영 리스크를 줄일 것
- Alert message에 runbook URL/owner 핸들 표준 필드를 추가할 것
- DB pool utilization 전용 계측(활성/대기/타임아웃)을 다음 스프린트에서 별도 훅으로 추가할 것
