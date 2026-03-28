# Billing Webhook 7-Day Monitoring Template

Use this template for daily operational verification.

## Daily Record

| Day | Date (KST/UTC) | total events | error events | duplicate events | error ratio | alerts fired | retry executed | reconcile executed | unresolved > SLA | incident category | action/result |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- | --- |
| 1 | 2026-03-28 / 2026-03-27 | n/a | n/a | n/a | n/a | no | no | no | no | observability_gap | webhook checker executed (`billing_webhook_events_total not found`). Soak completed with cooldown: `logs/soak/release-gate-soak-20260328-015759-summary.txt` (`iterations=20`, `failures=0`, `avg=62.37s`, `p95=68.19s`, `max=69.08s`). |
| 2 |  |  |  |  |  |  |  |  |  |  |  |
| 3 |  |  |  |  |  |  |  |  |  |  |  |
| 4 |  |  |  |  |  |  |  |  |  |  |  |
| 5 |  |  |  |  |  |  |  |  |  |  |  |
| 6 |  |  |  |  |  |  |  |  |  |  |  |
| 7 |  |  |  |  |  |  |  |  |  |  |  |

## Daily Procedure

1. Run metrics checker:
   - Windows: `powershell -ExecutionPolicy Bypass -File scripts/check-billing-webhook-metrics.ps1`
   - Linux/macOS: `./scripts/check-billing-webhook-metrics.sh`
2. Record event counts and ratio.
3. If alert threshold exceeded:
   - retry failed event IDs
   - run reconcile
   - record root cause and result
4. Confirm no unresolved mismatch older than SLA.

## Recording Rules

- Day-1 must include:
  - one webhook metrics check result
  - one soak run reference (`log`/`summary` path)
- Day-2 to Day-7: append one row per day with the same format (do not overwrite previous rows).
- If metrics are unavailable (example: `billing_webhook_events_total not found`), record:
  - `total/error/duplicate/error ratio` as `n/a`
  - incident category as `observability_gap`
  - action/result with remediation status

## Day-2 through Day-7 (same ritual each calendar day)

1. Run webhook checker (paste stdout into `action/result` or attach note).
2. Optional but recommended: short soak smoke (`-Iterations 1` or full `20` with `-CooldownSec 65`) and add summary path to `action/result`.
3. Fill that day’s table row; do not edit previous rows.

**One-liner (Windows, from repo root)**

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-billing-webhook-metrics.ps1; powershell -ExecutionPolicy Bypass -File scripts/run-release-gate-soak.ps1 -Iterations 1 -CooldownSec 65
```

**One-liner (Linux/macOS)**

```bash
./scripts/check-billing-webhook-metrics.sh && COOLDOWN_SEC=65 ./scripts/run-release-gate-soak.sh 1
```

## Sign-off

- [ ] 7 consecutive days completed
- [ ] no uncategorized failures
- [ ] no unresolved mismatch older than SLA
- [ ] support runbook validated with real incident samples (if any)
