# Billing webhook: Prometheus metrics and Grafana alerts

This document complements:

- [`billing-hardening-runbook.md`](./billing-hardening-runbook.md) — triage, DLQ retry, reconcile
- [`billing-webhook-7day-monitoring-template.md`](./billing-webhook-7day-monitoring-template.md) — daily manual checklist
- [`../scripts/check-billing-webhook-metrics.sh`](../scripts/check-billing-webhook-metrics.sh) — CLI error ratio from `/metrics`

## Metric

| Name | Labels | Meaning |
|------|--------|---------|
| `billing_webhook_events_total` | `result`, `event_type` | Counter incremented for each processed Paddle webhook (after processing). |

**`result` values:** `success`, `ignored`, `duplicate`, `error` (see `backend/app/services/billing_service.py`).

**`event_type`:** Paddle event type string, or `unknown` / `config` / `signature` / `payload` for early failures.

## Enable `/metrics` in production

By default, `GET /metrics` is **disabled when `ENVIRONMENT=production`** unless you opt in.

Set:

```bash
EXPOSE_METRICS_ENDPOINT=true
```

Then scrape `https://<api-host>/metrics` from Prometheus (or your collector). Restrict network access (VPC, firewall, or auth sidecar) so the endpoint is not public if possible.

See also: `backend/app/main.py` (`expose_metrics_endpoint`), `backend/app/core/config.py`.

## Application log alerts (no extra infra)

The webhook handler already logs at **error** level when the rolling window ratio of `error` results exceeds `BILLING_WEBHOOK_ERROR_RATIO_THRESHOLD` (default `0.10`).

Environment variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `BILLING_WEBHOOK_ALERT_WINDOW_SECONDS` | `3600` | Rolling window for ratio counters (Redis). |
| `BILLING_WEBHOOK_ERROR_RATIO_THRESHOLD` | `0.10` | Log “Billing webhook error ratio exceeded threshold” when crossed. |
| `BILLING_WEBHOOK_DUPLICATE_RATIO_THRESHOLD` | `0.20` | Same for duplicate ratio (warning). |

Ship these logs to your log platform and **alert on the message** or on `error` count spikes for the billing service.

## PromQL examples (Grafana / Alertmanager)

Adjust job labels and ranges to match your scrape config.

### 1. Error share of webhook volume (5m rate)

Use only when traffic is non-negligible; otherwise ratios can be noisy.

```promql
sum(rate(billing_webhook_events_total{result="error"}[5m]))
/
sum(rate(billing_webhook_events_total[5m]))
```

Suggested alert: **for 10–15m**, ratio **> 0.05** (5%) or **> 0.10** (10%), depending on tolerance.

### 2. Absolute error rate (avoids divide-by-zero sensitivity)

Alert when errors are happening at all, regardless of success volume:

```promql
sum(rate(billing_webhook_events_total{result="error"}[5m])) > 0.01
```

Tune `0.01` (e.g. to `0.001`) for your scale.

### 3. Error count in a sliding window (increases)

```promql
sum(increase(billing_webhook_events_total{result="error"}[15m])) >= 3
```

### 4. Duplicate spike (optional)

```promql
sum(rate(billing_webhook_events_total{result="duplicate"}[5m]))
/
clamp_min(sum(rate(billing_webhook_events_total[5m])), 0.001)
> 0.25
```

## Example PrometheusRule (Kubernetes)

See [`deploy/prometheus/billing-webhook-alerts.example.yml`](../deploy/prometheus/billing-webhook-alerts.example.yml). Copy and adjust for your cluster and notification routing.

## Grafana alert notification

1. Add Prometheus as data source (same URL as your scraper).
2. Create alert rules from the PromQL above, or import the example rule file into Mimir/Cortex if you use them.
3. Route notifications to Slack, email, or PagerDuty.

## When metrics are missing

If `billing_webhook_events_total` does not appear:

1. Confirm `EXPOSE_METRICS_ENDPOINT=true` and deployment rolled out.
2. Curl `/metrics` and search for `billing_webhook_events_total`.
3. Ensure at least one webhook has been processed (counters initialize on first increment; see `initialize_billing_webhook_metrics` in `backend/app/core/metrics.py`).

## Related

- Sentry: `SENTRY_DSN` for backend exceptions (separate from webhook ratio).
- Paddle Dashboard: delivery logs and subscription health for provider-side issues.
