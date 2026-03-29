# Live View & Release Gate — 폴링·SWR·429 인벤토리

**목적:** [`frontend-refactoring-implementation-plan.md`](./frontend-refactoring-implementation-plan.md) Phase 0.2–0.3 산출물. 리팩터 시 **키 문자열·밀리초 값**을 바꾸지 않도록 참조한다.

---

## 1. Live View — 타이밍 상수

| 상수 | 값 (ms) | 파일 | 용도 |
|------|---------|------|------|
| `LIVE_VIEW_BASE_POLL_MS` | 15_000 | `live-view/liveViewPolling.constants.ts` | 에이전트 목록 폴링 기본 주기 |
| `LIVE_VIEW_MAX_POLL_MS` | 90_000 | 동일 | SSE 실패/백오프·429 시 상한 |
| `LIVE_VIEW_FOCUSED_POLL_MS` | 5_000 | 동일 | 노드 선택 시 더 촘촘한 폴링(상한은 `min`으로 캡) |
| `LIVE_VIEW_SWRS_DEDUPE_MS` | 5_000 | 동일 | `useSWR` `dedupingInterval` |
| `LIVE_VIEW_SSE_MUTATE_DEBOUNCE_MS` | 1_000 | 동일 | SSE 이벤트 → `mutateAgents` 디바운스 |
| `LIVE_VIEW_SSE_POLL_BACKOFF_MS` | 30_000 | 동일 | SSE 끊김 후 폴링 완화 구간 |

**429 / Retry-After:** `page.tsx` — `getRateLimitInfo`, `agentsRetryAfterSec`로 폴링 간격 조정(상수와 함께 동작).

**SWR 공통 옵션:** `live-view/liveViewSwr.defaults.ts` — `LIVE_VIEW_SWR_DEFAULT_OPTIONS` (`dedupingInterval`, `revalidateOnFocus: false`). 프로젝트·조직·에이전트 목록에 공유.

**SSE:** `useLiveViewSseRefs` + `useLiveViewSseLifecycle` + `useLiveViewSseCloseWhenHidden` (`live-view/useLiveViewSse*.ts`) — `agents_changed` 시 디바운스된 `mutateAgents`, 탭 숨김 시 연결 종료.

---

## 2. Live View — SWR 키 패턴

| 키 (tuple 첫 요소 기준) | 키 형태 | 소스 파일 |
|-------------------------|---------|-----------|
| 프로젝트 | `["project", projectId]` | `live-view/page.tsx` |
| 조직 | `orgKeys.detail(orgId)` → `["org", orgId]` | `lib/queryKeys` |
| 에이전트 목록 | `["live-view-agents", projectId]` | `live-view/page.tsx` |

SSE 연결 시 해당 훅의 `refreshInterval`이 0이 되고, 폴링은 위 상수로 제어.

---

## 3. Release Gate — SWR 키 패턴 (페이지·훅)

| 키 prefix / 형태 | 소스 |
|------------------|------|
| `["project", projectId]` | `ReleaseGatePageContent.tsx` |
| `orgKeys.detail(orgId)` | 동일 |
| `["release-gate-core-models", projectId]` | 동일 |
| `["release-gate-agents", projectId]` | `useReleaseGateAgents.ts` |
| `["release-gate-recent-snapshots", projectId, agentId, limit]` | `useReleaseGateBaselineSnapshots.ts` |
| `["release-gate-baseline-payloads", projectId, agentId, limit]` | 동일 |
| `["release-gate-history", projectId, status, traceId, datePreset, offset]` | `useReleaseGateHistory.ts` |
| `["release-gate-report", projectId, selectedRunId]` | `ReleaseGatePageContent.tsx` |
| `["agent-eval", projectId, agentId]` | 동일 |
| `["release-gate-live-node-latest", projectId, agentId]` | 동일 |
| 데이터셋·스냅샷 목록 | `useReleaseGateBehaviorDatasets.ts` (프로젝트/에이전트/데이터셋 id 조합) |
| Baseline 타임라인 상세 | `useReleaseGateConfigPanelBaselineToolTimeline.ts` |

**runLocked:** 여러 훅에서 `isPaused: () => runLocked`로 검증 실행 중 재검증 억제.

---

## 4. Release Gate — 실시간 상태 추적

**주 경로:** `useReleaseGateValidateRun.ts`

| 항목 | 값 / 동작 | 비고 |
|------|-----------|------|
| 기본 poll | `BASE_POLL_INTERVAL_MS = 4000` | SSE 미연결 또는 fallback 시 기준 |
| 초기 fast poll | `FAST_POLL_INTERVAL_MS = 3200` | run 시작 직후 짧은 구간 |
| cancel burst | `CANCEL_BURST_INTERVAL_MS = 2000` | cancel 요청 직후만 제한적으로 사용 |
| jitter | `POLL_JITTER_MS_MAX = 900` | 다중 탭 정렬 완화 |
| SSE fallback poll | `SSE_FALLBACK_POLL_MS = 15000` | SSE 연결이 건강할 때의 안전 poll |
| SSE backoff | `SSE_POLL_BACKOFF_MS = 30000` | stream 에러 후 재연결 완화 |

**SSE 엔드포인트:** `GET /api/v1/projects/{projectId}/release-gate/jobs/{jobId}/stream`

**이벤트:** `connected`, `job_updated`

**현재 전략:** Release Gate는 이제 `SSE-first, poll-fallback`.

- SSE가 건강하면 빠른 반복 poll 대신 느린 안전 poll만 유지
- terminal 상태는 SSE 이벤트로 감지하고 `include_result=1` 최종 fetch 1회만 수행
- Redis가 없거나 stream 에러가 나면 기존 polling 경로로 안전하게 폴백

---

## 5. Live View — 에러·재시도 패턴 (Phase 1A.5)

| 구분 | 처리 위치 | 동작 |
|------|-----------|------|
| **401** | `agentsError` `useEffect` | `redirectToLogin` + `getApiErrorCode` / `getApiErrorMessage` |
| **429** | 동일 + `getRateLimitInfo` | `isRateLimitError` → `Retry-After` 기반 `setAgentsPollIntervalMs` (상한 `LIVE_VIEW_MAX_POLL_MS`) |
| **기타 에이전트 오류** | 동일 | 지수적 백오프 `current * 2` (상한 동일) |
| **탭 복귀** | `isPageVisible` `useEffect` | `mutateAgents()` 1회 |

데이터 훅: `useLiveViewCoreData` — project/org/agents SWR 한곳 (`live-view/useLiveViewCoreData.ts`).

---

## 6. 관련 설계 문서

- [rate-limit-heavy-endpoints-design.md](./rate-limit-heavy-endpoints-design.md)
- [mvp-realtime-pipeline-implementation-plan.md](./mvp-realtime-pipeline-implementation-plan.md)
