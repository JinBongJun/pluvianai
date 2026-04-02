# Release Gate Performance Hardening Plan (2026-04)

이 문서는 Release Gate 실제 처리시간 단축과 운영 안정성 강화를 함께 달성하기 위한 단계별 계획이다.

---

## 1) 현재 상태 요약

- Release Gate는 async job + background runner 구조를 사용한다.
- web / worker 분리 방향은 맞지만, 실제 한 번의 run wall-clock time은 아직 길다.
- 원인:
  - job runner는 큐에서 job을 하나씩 claim한다.
  - 한 job 내부에서 `repeat_runs`는 순차 실행이다.
  - snapshot replay는 병렬이지만 외부 LLM latency와 provider rate limit 영향이 크다.
- 기존 `docs/load-test-capacity-baseline-2026-03.md`는 Live View + ingest 기준이며, Release Gate 전용 baseline은 아직 없다.

---

## 2) 목표

### 1차 목표

- Release Gate 한 번 실행 시 실제 wall-clock time 단축
- queue wait time / execution time / total completion time 분리 관측
- web / ingest / release-gate-worker 역할 충돌 제거

### 2차 목표

- usage 중복 차감 방지
- cancel / retry / resume / reconnect 시 상태 일관성 유지
- concurrency 조정이 코드 수정 없이 가능하도록 설정 외부화
- 병렬화 후에도 provider 429 폭증 없이 안정 운영

---

## 3) 비목표

- Live View + ingest 전체 부하 baseline 대체
- Release Gate 아키텍처 전면 재작성
- 무제한 병렬화

---

## 4) 구현 원칙

1. 역할 분리 먼저, 성능 튜닝은 그 다음
2. 계측 먼저, 병렬화는 나중
3. concurrency는 설정 기반으로 외부화
4. 작은 단계로 rollout
5. idempotency 보호 후 병렬화

---

## 5) 단계별 계획

### Phase 1. 서비스 역할 명확화

목표:

- `pluvianai`: web/API 전용
- `skillful-peace`: ingest worker 유지
- `worker`: Release Gate worker 전용

작업:

- `SERVICE_ROLE`이 `web`, `ingest worker`, `release gate worker`를 명시적으로 구분하도록 정리
- Railway 서비스별 역할 문서화
- web에서는 `RELEASE_GATE_JOB_RUNNER_ENABLED=false`
- Release Gate worker는 `python -m app.workers.release_gate_worker`

완료 기준:

- 각 서비스 로그 첫 줄만 보고 역할 식별 가능
- web과 worker가 같은 Release Gate job runner를 동시에 돌리지 않음

### Phase 2. Release Gate 전용 계측 추가

목표:

- 실제 병목을 숫자로 본다

추가 지표:

- `queued_at -> started_at`
- `started_at -> finished_at`
- `total_duration_ms`
- `run_idx`별 `batch_wall_ms`
- provider별 latency
- retry / 429 count
- tool-followup 유무
- `snapshot_count`, `repeat_runs`, concurrency 설정값

완료 기준:

- queue wait / execution / total을 분리해서 볼 수 있음
- provider / replay 단계 병목을 추정 가능

### Phase 3. concurrency 설정 외부화

목표:

- 코드 수정 없이 Railway에서 안전하게 튜닝

후보 설정:

- `RELEASE_GATE_REPLAY_MAX_CONCURRENCY`
- `RELEASE_GATE_MAX_PARALLEL_REPEATS`
- `RELEASE_GATE_JOB_RUNNER_POLL_INTERVAL_MS`

완료 기준:

- 설정 미지정 시 현재 동작과 동일
- 안전 기본값 유지
- 환경별 조정 가능

### Phase 4. worker scale-out

목표:

- 다중 사용자 / 다중 job 상황에서 queue 대기시간 단축

작업:

- Release Gate worker 인스턴스 2개 이상 실험
- queue wait time 변화 관측
- duplicate claim / race 여부 확인

완료 기준:

- 동시 run 시 queue wait 감소
- 중복 claim 없음

### Phase 5. `repeat_runs` 제한 병렬화

목표:

- 단일 run wall-clock time 단축

원칙:

- `repeat_runs` 전체를 무제한 병렬화하지 않음
- `max_parallel_repeats=2` 정도의 제한 병렬화부터 시작
- snapshot-level concurrency와 합산 총량을 제어

완료 기준:

- 동일 `snapshots/repeat_runs` 조건에서 total duration 감소
- 429 비율 급증 없음
- 결과 저장 / report ordering / progress 표시 안정

### Phase 6. idempotency / race hardening

목표:

- 성능 개선 중에도 usage, result, cancel 흐름이 꼬이지 않게 보호

보호 포인트:

- usage 차감은 job당 1회
- result persist는 1회
- duplicate finalize 차단
- cancel race 방지
- lease expiry 후 재claim 시 중복 실행 방지

완료 기준:

- worker 재시작 / 재claim 시 중복 차감 없음
- canceled job이 succeeded로 뒤집히지 않음

---

## 6) 테스트 계획

### A. 플랫폼 baseline

- 기존 `docs/load-test-capacity-baseline-2026-03.md` 유지
- 용도: Live View + ingest 운영선 검증

### B. Release Gate baseline

신규 문서:

- `docs/release-gate-capacity-baseline-2026-04.md`

추천 매트릭스:

- snapshots: `5 / 20 / 50`
- repeat_runs: `1 / 3 / 10`
- worker count: `1 / 2`
- replay concurrency: `10 / 25 / 50`

기록 항목:

- queue wait
- execution duration
- total duration
- p50 / p95
- 429 count
- failure rate
- provider breakdown

---

## 7) 구현 순서

1. Phase 1 역할 정리
2. Phase 2 계측 추가
3. Phase 3 설정 외부화
4. Phase 4 worker scale-out
5. Phase 5 `repeat_runs` 제한 병렬화
6. Phase 6 idempotency 강화
7. Release Gate baseline 문서화

---

## 8) 현재 권장 운영 상태

- `pluvianai`: web/API 전용
- `skillful-peace`: ingest worker
- `worker`: Release Gate worker 전용

권장 원칙:

- web은 job enqueue, status read, SSE만 담당
- ingest worker는 snapshot / api-call ingest만 담당
- Release Gate worker는 queued Release Gate job 실행만 담당

---

## 9) 한 줄 결론

현재는 worker 분리까지는 되어 있지만, 실제 처리시간 병목은 아직 job 내부 실행 전략에 더 가깝다. 가장 안전한 장기 방향은 `역할 분리 -> 계측 -> 설정화 -> scale-out -> 제한 병렬화` 순서다.
