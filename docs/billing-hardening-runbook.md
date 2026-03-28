# Billing Hardening Runbook (Paddle)

See also: `docs/subscription-commercial-readiness-plan.md` for the full product, enforcement, UX, test, and policy hardening plan.

## Scope
- Webhook reliability: DLQ + retry API + idempotency
- Subscription consistency: hourly reconciliation
- API contract: stable error codes for checkout/webhook/retry
- Ops visibility: webhook metrics and investigation order

## API Contract
- `POST /api/v1/billing/checkout`
  - success: `200 { data: { session_id, url } }`
  - invalid plan (not Starter/Pro after normalization): `400 { error: { code: "BILLING_CHECKOUT_INVALID_PLAN", ... } }`
  - failure: `503 { error: { code: "BILLING_CHECKOUT_UNAVAILABLE", ... } }`
- `POST /api/v1/billing/webhook`
  - success: `200 { data: { status, event_id, event_type, ... } }`
  - invalid request/signature/payload: `400 { error: { code: "BILLING_WEBHOOK_INVALID", ... } }`
- `POST /api/v1/billing/webhook/retry/{event_id}` (superuser only; CSRF for cookie auth)
  - success: `200 { data: { status, event_id?, event_type? } }`
  - not found: `404 { error: { code: "BILLING_EVENT_NOT_FOUND", ... } }`
- `POST /api/v1/billing/reconcile?limit=200` (superuser only; CSRF for cookie auth)
  - success: `200 { data: { status, checked, fixed, failed } }`

## Monitoring
- Metric: `billing_webhook_events_total{result,event_type}`
- Watch:
  - `result="error"` spike
  - `result="duplicate"` unusual increase
- Logs:
  - reject logs: missing/invalid signature, invalid payload
  - process logs: `event_id`, `event_type`, `status`

### Quick Metric Check Commands
- Linux/macOS:
  - `./scripts/check-billing-webhook-metrics.sh`
- Windows PowerShell:
  - `powershell -ExecutionPolicy Bypass -File scripts/check-billing-webhook-metrics.ps1`
- Optional thresholds:
  - `WARN_ERROR_RATIO=0.05 ./scripts/check-billing-webhook-metrics.sh`
  - `powershell -ExecutionPolicy Bypass -File scripts/check-billing-webhook-metrics.ps1 -WarnErrorRatio 0.05`

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

## 7-Day Operational Verification

Run this checklist daily for at least 7 consecutive days:

1. collect webhook metric snapshot and error ratio
2. verify no unresolved failed webhook event exceeds SLA window
3. run targeted retry for failed event IDs
4. run reconcile if paid-status mismatch is reported
5. record root cause category for each incident (signature, provider outage, payload, duplicate, internal)

Template:
- `docs/billing-webhook-7day-monitoring-template.md`

## Real Event Verification

Before trusting the 7-day table, force at least one real Paddle event in the chosen environment (sandbox or live):

1. trigger one checkout flow that should emit a billing event
2. confirm backend logs show `event_id`, `event_type`, and final result
3. re-run webhook metrics checker and verify `billing_webhook_events_total` changed from the prior snapshot
4. if counts do not change, inspect:
   - webhook delivery status in Paddle
   - backend webhook signature/config
   - retry / reconcile path

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
