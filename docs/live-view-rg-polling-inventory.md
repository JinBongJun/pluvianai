# Live View & Release Gate — 폴링·SWR·429 인벤토리

**목적:** [`frontend-refactoring-implementation-plan.md`](./frontend-refactoring-implementation-plan.md) Phase 0.2–0.3 산출물. 리팩터 시 **키 문자열·밀리초 값**을 바꾸지 않도록 참조한다.

---

## 1. Live View — 타이밍 상수

| 상수 | 값 (ms) | 파일 | 용도 |
|------|---------|------|------|
| `LIVE_VIEW_BASE_POLL_MS` | 10_000 | `live-view/liveViewPolling.constants.ts` | 에이전트 목록 폴링 기본 주기 |
| `LIVE_VIEW_MAX_POLL_MS` | 60_000 | 동일 | SSE 실패/백오프·429 시 상한 |
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

## 4. 관련 설계 문서

- [rate-limit-heavy-endpoints-design.md](./rate-limit-heavy-endpoints-design.md)
- [mvp-realtime-pipeline-implementation-plan.md](./mvp-realtime-pipeline-implementation-plan.md)
