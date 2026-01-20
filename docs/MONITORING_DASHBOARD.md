# Monitoring Dashboard Guide

## Key Metrics
- Traffic: `api_requests_total`, `api_request_duration_seconds`
- Auth security: `login_attempts_total`, `brute_force_blocks_total`, `account_lockouts_total`, `risk_based_auth_challenges_total`, `password_policy_rejections_total`, `login_latency_seconds`
- Resilience: `retry_attempts_total`, `circuit_breaker_open_total`, `circuit_breaker_state`, `db_connection_failures_total`, `cache_connection_failures_total`
- Errors: `errors_total`

## Suggested Alerts
- Auth:
  - brute_force_blocks_total increases rapidly
  - login_attempts_total outcome=blocked spikes
  - account_lockouts_total > baseline
- Resilience:
  - circuit_breaker_open_total increments
  - retry_attempts_total surges with errors_total
  - db_connection_failures_total > 0
  - cache_connection_failures_total > 0
- Performance:
  - login_latency_seconds P95 > 1s
  - api_request_duration_seconds P95 > target

## Dashboards
1) **Auth Security**
   - Login attempts by outcome/reason
   - Brute force blocks over time
   - RBA challenges over time
   - Password policy rejections
   - Login latency (P50/P95)

2) **Resilience**
   - Retry counts by service
   - Circuit breaker state and opens
   - DB/cache failure counts
   - Error totals by endpoint

3) **Performance**
   - API latency histogram/P95/P99
   - API traffic by endpoint/status
   - DB query duration

## Threshold Hints (starting points)
- login_latency_seconds P95: warn 0.8s, crit 1.5s
- api_request_duration_seconds P95: set per endpoint; start 1s warn / 2s crit
- brute_force_blocks_total: alert on sudden slope over baseline
- circuit_breaker_open_total: alert on any increment; page if sustained >2m

## Runbooks (brief)
- Auth spike: check brute_force_blocks_total vs login_attempts_total; enable CAPTCHA if needed.
- Circuit open: inspect upstream status; consider scaling or fallback; verify cache/DB connectivity.
- Latency high: check DB/caching, recent deploys, traffic spikes; roll back if needed.

