#!/bin/bash
# Billing webhook metrics quick checker (Linux/macOS)
# Pulls /metrics and prints error ratio for billing_webhook_events_total.

set -euo pipefail

METRICS_URL="${METRICS_URL:-http://localhost:8000/metrics}"
WARN_ERROR_RATIO="${WARN_ERROR_RATIO:-0.05}"

raw="$(curl -fsS "$METRICS_URL")"
lines="$(printf '%s\n' "$raw" | rg '^billing_webhook_events_total\{' || true)"

if [ -z "$lines" ]; then
  echo "billing_webhook_events_total not found in metrics output."
  exit 0
fi

summary="$(printf '%s\n' "$lines" | awk '
BEGIN { total=0; err=0; dup=0; }
{
  value=$NF+0;
  total+=value;
  if ($0 ~ /result="error"/) err+=value;
  if ($0 ~ /result="duplicate"/) dup+=value;
}
END {
  ratio=(total>0)?(err/total):0;
  printf "%.10f %.10f %.10f %.10f\n", total, err, dup, ratio;
}')"

total="$(printf '%s' "$summary" | awk '{print $1}')"
error="$(printf '%s' "$summary" | awk '{print $2}')"
duplicate="$(printf '%s' "$summary" | awk '{print $3}')"
ratio="$(printf '%s' "$summary" | awk '{print $4}')"

echo "billing_webhook_events_total summary"
echo "total=$total error=$error duplicate=$duplicate error_ratio=$ratio"

cmp="$(awk -v r="$ratio" -v t="$WARN_ERROR_RATIO" 'BEGIN { if (r>=t) print 1; else print 0; }')"
if [ "$cmp" -eq 1 ]; then
  echo "ALERT: error_ratio $ratio >= threshold $WARN_ERROR_RATIO"
  exit 1
fi
