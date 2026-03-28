#!/bin/bash
# Release Gate soak runner (Linux/macOS)
# Runs qualification suite repeatedly and records durations.

set -euo pipefail

ITERATIONS="${1:-20}"
LOG_DIR="${LOG_DIR:-logs/soak}"
COOLDOWN_SEC="${COOLDOWN_SEC:-65}"
PYTEST_ARGS="${PYTEST_ARGS:-tests/integration/test_release_gate_preflight_guards.py tests/integration/test_release_gate_overrides_and_export.py tests/integration/test_release_gate_async_jobs.py tests/unit/test_release_gate_model_policy.py tests/unit/test_live_eval_service.py -q}"

mkdir -p "$LOG_DIR"
TS="$(date +%Y%m%d-%H%M%S)"
LOG_PATH="$LOG_DIR/release-gate-soak-$TS.log"
SUMMARY_PATH="$LOG_DIR/release-gate-soak-$TS-summary.txt"

echo "Release Gate soak started at $(date -Iseconds)" | tee "$LOG_PATH" >/dev/null
echo "Iterations: $ITERATIONS" >> "$LOG_PATH"
echo "CooldownSec: $COOLDOWN_SEC" >> "$LOG_PATH"
echo "Args: $PYTEST_ARGS" >> "$LOG_PATH"

failures=0
durations=()

for i in $(seq 1 "$ITERATIONS"); do
  start="$(date +%s)"
  echo "[$(date -Iseconds)] Iteration $i/$ITERATIONS started" >> "$LOG_PATH"

  if (cd backend && python -m pytest -c pytest-ci.ini $PYTEST_ARGS) >> "$LOG_PATH" 2>&1; then
    end="$(date +%s)"
    elapsed="$((end - start))"
    durations+=("$elapsed")
    echo "[$(date -Iseconds)] Iteration $i passed (duration=${elapsed}s)" >> "$LOG_PATH"
  else
    end="$(date +%s)"
    elapsed="$((end - start))"
    durations+=("$elapsed")
    failures=$((failures + 1))
    echo "[$(date -Iseconds)] Iteration $i failed (duration=${elapsed}s)" >> "$LOG_PATH"
  fi

  if [ "$i" -lt "$ITERATIONS" ] && [ "${COOLDOWN_SEC:-0}" -gt 0 ]; then
    echo "[$(date -Iseconds)] Cooldown ${COOLDOWN_SEC}s before next iteration" >> "$LOG_PATH"
    sleep "$COOLDOWN_SEC"
  fi
done

sorted="$(printf '%s\n' "${durations[@]}" | sort -n)"
count="${#durations[@]}"
sum=0
for d in "${durations[@]}"; do
  sum=$((sum + d))
done
avg="$(awk -v s="$sum" -v c="$count" 'BEGIN { if (c==0) print 0; else printf "%.2f", s/c }')"
p95_index=$(( (95 * count + 99) / 100 ))
if [ "$p95_index" -lt 1 ]; then p95_index=1; fi
p95="$(printf '%s\n' "$sorted" | sed -n "${p95_index}p")"
max="$(printf '%s\n' "$sorted" | tail -n 1)"

cat > "$SUMMARY_PATH" <<EOF
Release Gate soak summary
started_at=$(date -Iseconds)
iterations=$ITERATIONS
failures=$failures
avg_seconds=$avg
p95_seconds=${p95:-0}
max_seconds=${max:-0}
log=$LOG_PATH
EOF

echo "Soak complete. Summary: $SUMMARY_PATH"
if [ "$failures" -gt 0 ]; then
  exit 1
fi
