# Service Level Objectives (SLO) and Error Budgets

## Objectives
- Availability (HTTP 2xx/3xx): 99.9% monthly
- Login latency (P95): < 500ms
- API proxy latency (P95): < 800ms
- Error rate: < 1% (5xx)

## Error Budgets
- Availability budget: 43m per month of allowable downtime
- Burn alerts:
  - Warning: 20% budget consumed
  - Critical: 50% budget consumed

## Monitoring
- Availability: `api_requests_total` / status_code buckets
- Login latency: `login_latency_seconds` (P95)
- Proxy latency: `api_request_duration_seconds` filtered by proxy routes
- Error rate: `errors_total`

## Alerting
- Critical:
  - Availability below target for 10m window
  - Error rate > 5% for 5m
  - Circuit breaker open (proxy) sustained 2m
- Warning:
  - Error rate > 2% for 10m
  - Latency P95 above target for 10m

## Review Cadence
- Weekly: error budget consumption, top incidents
- Monthly: adjust SLOs if consistently overachieved or missed
