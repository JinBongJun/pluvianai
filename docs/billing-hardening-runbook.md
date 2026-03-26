# Billing Hardening Runbook (Paddle)

## Scope
- Webhook reliability: DLQ + retry API + idempotency
- Subscription consistency: hourly reconciliation
- API contract: stable error codes for checkout/webhook/retry
- Ops visibility: webhook metrics and investigation order

## API Contract
- `POST /api/v1/billing/checkout`
  - success: `200 { data: { session_id, url } }`
  - failure: `503 { error: { code: "BILLING_CHECKOUT_UNAVAILABLE", ... } }`
- `POST /api/v1/billing/webhook`
  - success: `200 { data: { status, event_id, event_type, ... } }`
  - invalid request/signature/payload: `400 { error: { code: "BILLING_WEBHOOK_INVALID", ... } }`
- `POST /api/v1/billing/webhook/retry/{event_id}`
  - success: `200 { data: { status, event_id?, event_type? } }`
  - not found: `404 { error: { code: "BILLING_EVENT_NOT_FOUND", ... } }`
- `POST /api/v1/billing/reconcile?limit=200`
  - success: `200 { data: { status, checked, fixed, failed } }`

## Monitoring
- Metric: `billing_webhook_events_total{result,event_type}`
- Watch:
  - `result="error"` spike
  - `result="duplicate"` unusual increase
- Logs:
  - reject logs: missing/invalid signature, invalid payload
  - process logs: `event_id`, `event_type`, `status`

## Incident Triage Order
1. Signature validation failures (`BILLING_WEBHOOK_INVALID`)
2. `event_id` duplication (`duplicate`)
3. DLQ failures (retry by `event_id`)
4. Subscription mismatch (run reconcile endpoint/manual job)

## Recovery
- Retry one failed event:
  - `POST /api/v1/billing/webhook/retry/{event_id}`
- Bulk consistency repair:
  - `POST /api/v1/billing/reconcile?limit=500`

## Production Policy Checklist (Paddle-facing)
- Public docs:
  - Terms
  - Privacy
  - Refund/Cancellation policy
- Checkout disclosure:
  - price, billing period, auto-renewal visible pre-payment
- Subscription UX:
  - cancellation path easy to find
  - trial/discount end conditions clearly shown
- Security:
  - hosted checkout only
  - webhook signature verification enabled
- Data:
  - minimum data collection
  - deletion/correction request process documented
