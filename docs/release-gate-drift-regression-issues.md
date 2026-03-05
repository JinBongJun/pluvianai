# Release Gate: Drift & Regression — 문제점 종합 문서

CTO·UI/UX 관점에서 Drift/Regression 관련 코드·흐름을 점검한 결과를 정리한 문서입니다.

---

## 1. 백엔드 로직 / 데이터 정합성

### 1.1 [Critical] Live View에서 2 trace 선택 시 결과가 1 run만 나오는 버그 ✅ 완료

- **파일:** `backend/app/api/v1/endpoints/release_gate.py`, `frontend/components/release-gate/NodeAndDataPickerModal.tsx`
- **위치:** Drift 분기, `all_trace_ids` 설정 (약 458–471라인)
- **원인:**  
  `all_trace_ids`를 “여러 trace”로 채우는 조건이  
  `(target_dataset_ids or payload.use_recent_snapshots) and snapshot_ids_to_use`  
  로만 되어 있음. Live View 로그에서 **`snapshot_ids`만** 보내고 `use_recent_snapshots`/`dataset_ids`를 안 보내면 이 조건이 **거짓**이 되어  
  `all_trace_ids = [trace_id]`(첫 스냅샷 1개의 trace만) 사용.
- **결과:** 사용자가 서로 다른 trace 2개를 선택해도 Result에는 Run 1개만 표시됨.
- **수정 방향:** Drift 모드이고 `snapshot_ids_to_use`가 있으면 **항상** 해당 스냅샷들로 distinct `trace_id`를 조회해 `all_trace_ids`를 채우기.  
  조건을 `if snapshot_ids_to_use:` 로 바꾸고, 그 안에서 기존 `snapshots_for_traces` 쿼리로 `all_trace_ids` 설정.  
- **추가 (프론트):** 데이터 선택 모달에서 **trace별 1행**만 표시하도록 변경. 이전에는 스냅샷 단위로 나열돼 같은 trace의 스냅 2개를 고르면 결과가 1 run만 나왔음.
- **추가 (백엔드 2차):** Drift 평가 단위를 `trace` 집계에서 `선택된 snapshot 행` 기준으로 변경. 이제 **선택 1개 = run 1개**로 계산되어 사용자 선택 개수와 결과 run 개수가 일치.

### 1.2 [Critical] Drift 응답의 `run_results`에 `trace_id` 누락 ✅ 완료

- **파일:** `backend/app/api/v1/endpoints/release_gate.py`
- **위치:** Drift 응답에서 `run_results` 생성 (약 670–687라인)
- **원인:** `drift_runs`를 복사해 `run_results`를 만들 때 **`trace_id`를 넣지 않음**.
- **결과:** 프론트가 `run_results`를 우선 사용하면 행 클릭 시 스냅샷을 찾지 못해 Result 상세 모달이 열리지 않음.
- **수정 방향:**  
  - 백엔드: 각 run 객체에 `"trace_id": r.get("trace_id")` 추가.  
  - 또는 프론트에서 테이블/상세용으로 `drift_runs ?? run_results` 사용 (1.2는 프론트로 우회 가능).

### 1.3 [Medium] Regression 경로에서 `snapshot_ids`만 있을 때 baseline_steps 범위

- **설명:** `snapshot_ids`로 여러 trace의 스냅샷을 보냈을 때, `trace_id`/`baseline_trace_id`는 **첫 스냅샷** 기준으로만 설정됨.  
  Regression은 단일 trace 기준 로직이라 현재는 영향이 제한적이지만, Drift와의 일관성·다중 trace 확장 시 재검토 필요.

### 1.4 [Low] `evaluation_mode: "stability"` 미구현 ✅ 완료 (4.5 툴팁으로 대체)

- **설명:** 스키마에는 `"stability"`가 있으나 실제 분기/로직 없음.  
  사용하지 않는다면 제거하거나, "준비 중" 등으로 명시하는 것이 좋음.

---

## 2. 프론트엔드 — 결과 표시 / 상세

### 2.1 [Critical] Result 테이블·상세가 Drift/Regression 둘 다 제대로 동작하지 않음 ✅ 완료

- **파일:** `frontend/app/organizations/[orgId]/projects/[projectId]/release-gate/page.tsx`
- **원인:**  
  - **Drift:** 테이블이 `run_results` 우선 → `trace_id` 없음 → 행 클릭 시 `byTrace`를 찾지 못해 모달 미표시.  
  - **Regression:** run 객체에 `trace_id` 없음. 상세 로직이 `run.trace_id`만 사용 → 모달 미표시.
- **수정 방향:**  
  1. 테이블/복사용 배열: `(result.drift_runs ?? result.run_results ?? [])` 로 통일.  
  2. 스냅샷 resolve 시: `traceId = run.trace_id ?? result?.trace_id` 로 fallback 해서 Regression(단일 trace)에서도 상세 열리게.

### 2.2 [Medium] Result 행 인라인 확장이 PASS일 때 비어 보임 ✅ 완료

- **위치:** Result 테이블 행 확장 블록 (약 1597–1625라인)
- **원인:** PASS이고 `eval_elements_passed`/`eval_elements_failed`/`violations`가 없으면 확장 영역에 거의 아무 내용 없음.
- **수정 방향:** 확장 시 최소 한 줄이라도 표시 (예: "All checks passed." 또는 "Passed: 0 · Failed: 0").

### 2.3 [Medium] “클릭하면 상세” 안내 부족 ✅ 완료

- **설명:** Result 테이블 행이 클릭 가능·확장 가능하다는 시각/텍스트 힌트가 없음.
- **수정 방향:** 테이블 위에 "Click a run row to see details" 문구 또는 행에 chevron 등 추가.

### 2.4 [Medium] Copy summary 배열 불일치 ✅ 완료

- **위치:** 약 1558라인, `const runs = result.run_results ?? result.drift_runs ?? [];`
- **문제:** 테이블은 (수정 후) `drift_runs ?? run_results`를 쓰는데, Copy summary는 `run_results` 우선 → Drift일 때 복사 내용이 테이블과 다를 수 있음.
- **수정 방향:** `const runs = result.drift_runs ?? result.run_results ?? [];` 로 통일.

### 2.5 [Low] History 탭 Run 상세에서 “Click a row for more detail (coming soon)”

- **위치:** History Run detail, "Tested data" (Regression) (약 2591라인)
- **설명:** Regression run에 대해 Validate 탭과 동일한 SnapshotDetailModal 스타일 상세가 없고, "coming soon"만 있음.
- **수정 방향:** Regression run도 (가능하면) 동일한 상세 모달 또는 상세 뷰로 통일.
- **상태:** ✅ 완료 (문구 변경 및 drift_runs/run_results 통일)

---

## 3. 저장·로딩 성능

### 3.1 [Critical] Eval 저장이 오래 걸림 (부분 완료)

- **원인 1 (백엔드):**  
  GET `/live-view/agents/{id}/settings` 가 로그상 **4~10초** 소요.  
  단순 조회인데 지연이 커서, 인증/권한/DB/인덱스 등 원인 추적 필요.
- **원인 2 (프론트):**  
  Save 후  
  - `mutateSettings()` → GET settings (SWR 키 `agent-log-settings`)  
  - `globalMutate(agent-eval-runtime)` → 해당 키 refetch  
  - `onSaveSuccess` → `globalMutate(['release-gate-agent-settings', ...])` → GET settings 한 번 더  
  → **같은 설정을 서로 다른 SWR 키로 2~3번 연속 refetch** 되며, 느린 GET이 그대로 2~3번 호출됨.
- **수정 방향:**  
  - 백엔드: GET settings 구간별 시간 로깅, `(project_id, system_prompt_hash)` 복합 인덱스 검토.  
  - 프론트: agent 설정을 한 SWR 키로 통일하거나 Save 후 refetch 1회로 제한.  
  - PATCH 응답에 최신 `diagnostic_config`가 오면 그걸로 캐시 갱신(낙관적 업데이트) 후 불필요한 GET 생략 또는 1회로 제한.
- **상태:** 프론트 SWR 키 통일(3.2) 완료. 백엔드 GET settings 1초 초과 시 `get_agent_settings slow` 로그 추가.

### 3.2 [Medium] Agent settings SWR 키 이중화 ✅ 완료

- **설명:**  
  - AgentEvaluationPanel: `["agent-log-settings", projectId, agentId]`  
  - Release-gate 페이지: `['release-gate-agent-settings', projectId, agentId]`  
  → 동일 agent settings를 두 키로 fetch → Save 시 양쪽 invalidate → GET 2회.
- **수정 방향:** 한 키로 통일하거나, 한쪽이 다른 쪽 데이터를 구독하도록 해 GET 1회로 축소.

### 3.3 [Low] AgentEvaluationPanel 초기 로딩 ✅ 완료

- **설명:** `draft`가 null일 때 Clock 스피너만 보이고, 로딩이 길어지면 체감 대기 시간이 김.
- **수정 방향:** 스켈레톤 또는 섹션별 로딩 상태로 체감 개선.

---

## 4. UI/UX 일관성·명확성

### 4.1 [High] “run” vs “trace” 용어 혼재 ✅ 완료

- **현상:**  
  - 모달: "Trace 8e279a2c...", "2 runs".  
  - Baseline: "2 runs selected" (스냅샷 2개일 수 있음).  
  - Result: "Run 1", "1 / 1 runs" (trace 기준 1 run).  
  → 사용자가 “run”이 스냅샷인지 trace인지, 선택 개수와 결과 개수 차이를 이해하기 어려움.
- **수정 방향:**  
  - 라벨/툴팁에서 "run = one trace (conversation)" 또는 "run = one evaluation unit" 정의.  
  - "2 traces selected → 1 run in result (same conversation)" 같은 짧은 설명을 필요한 곳에 추가.
- **상태:** ✅ 완료 (Baseline/Drift에 "Each run = one trace (conversation)" 툴팁 추가)

### 4.2 [High] Drift vs Regression 레이아웃 이원화 ✅ 완료

- **설명:**  
  - **Regression:** 3-column (Baseline data | Config + Run | Result).  
  - **Drift (및 비-Regression):** Step 1–2–3 (Select agent → Select dataset → Validate Configuration).  
  → 같은 Validate 탭인데 모드에 따라 완전히 다른 UI. 노드/데이터 선택 방식·위치가 달라 혼란 가능.
- **수정 방향:**  
  - 가능하면 데이터 선택(Recent vs Dataset)과 Run/Result 영역을 한 가지 레이아웃으로 통일하거나,  
  - 모드 전환 시 “지금 선택 방식이 바뀐다”는 안내 추가.

### 4.3 [Medium] Run 버튼 문구 불일치 ✅ 완료

- **현상:**  
  - 3-column: "Run re-evaluation" (Drift) / "Run" (Regression).  
  - Steps 레이아웃: "Validate Configuration".  
  → 같은 액션인데 문구가 달라 일관성 부족.
- **수정 방향:** 모드별로 하나의 규칙으로 통일 (예: Drift는 "Run re-evaluation", Regression은 "Run", 또는 공통 "Validate").

### 4.4 [Medium] 에러 메시지 표시 위치 중복 ✅ 완료

- **설명:** Validate 영역에 `error` 표시 블록이 두 군데(3-column 영역, steps 영역) 있어, 같은 `error` state가 두 번 보일 수 있음.
- **수정 방향:** 에러는 한 곳에만 표시하거나, 레이아웃별로 하나씩만 두고 동일 state 공유.

### 4.5 [Low] Stability 탭 비활성화 안내 없음 ✅ 완료

- **설명:** Stability 버튼이 disabled이지만 이유/예정 안내 없음.
- **수정 방향:** 툴팁에 "Coming soon" 또는 짧은 설명 추가.

### 4.6 [Low] Result 클리어 문구와 동작

- **설명:** "Changing node or data clears this" 문구는 있음.  
  노드/데이터 변경 시 `setResult(null)`로 결과 클리어됨.  
  “데이터 2개 넣었는데 1개만 나온다”는 위 1.1 버그와 별개.

---

## 5. 데이터·상태 흐름

### 5.1 [Low] `snapshotIds` vs `runSnapshotIds` 동기화

- **설명:** 모달 Confirm → `snapshotIds` 갱신 → useEffect로 `runSnapshotIds` 동기화.  
  Baseline 체크박스는 `runSnapshotIds`만 변경. Validate 시 `payload.snapshot_ids = runSnapshotIds.length ? runSnapshotIds : snapshotIds`.  
  현재 로직상 전달 개수는 맞고, 1 run만 나오는 현상은 백엔드 1.1 때문.

### 5.2 [Low] History에서 drift_runs / run_results 혼용 ✅ 완료

- **설명:** 어떤 블록은 `drift_runs ?? run_results`, 어떤 블록은 `drift_runs`만 사용.  
  “현재 결과와 동일한 run 목록”을 보여주려면 drift_runs 우선으로 통일하는 것이 일관됨.

---

## 6. 에러 처리·엣지 케이스

### 6.1 [Medium] Export JSON 실패 시 사용자 피드백 없음 ✅ 완료

- **위치:** Export JSON 버튼 onClick (약 2272–2286, 2523–2535라인)
- **설명:** `catch { ... }` 에서 에러를 무시하여, 실패 시 사용자에게 알림 없음.
- **수정 방향:** toast 또는 인라인 메시지로 "Export failed" 등 표시.

### 6.2 [Low] Validate 실패 시 `result`만 null로 두고 부분 에러 메시지 ✅ 완료

- **설명:** `setError(...)`, `setResult(null)` 로 처리됨.  
  네트워크/5xx 등에 대한 재시도 안내나 복구 제안은 없음.
- **수정 방향:** 필요 시 "Retry" 버튼 또는 안내 문구 추가.
- **상태:** ✅ 완료 ("Check your configuration or try again." + "Dismiss & retry" 버튼 추가)

### 6.3 [Low] `report_id` 타입

- **설명:** 프론트 타입은 `report_id: string`. 백엔드는 `report.id` (UUID 문자열) 반환.  
  비교 시 `String(result.report_id)` 사용하면 안전 (이미 일부 사용 중).

### 6.4 [Medium] Eval 비활성화 시에도 설정 입력 편집 가능 ✅ 완료

- **설명:** Required Keywords/Fields 등 토글이 꺼져 있어도 내부 입력(KEYWORDS, JSON FIELDS)이 편집 가능했음.
- **수정:** SignalCard 확장 영역에 `!isEnabled` 시 `pointer-events-none opacity-60` 적용해 비활성화 시 입력 불가.

### 6.5 [Medium] Eval 필수 필드 빈칸으로 Save 가능 ✅ 완료

- **설명:** Required Keywords/Fields 활성화 후 키워드·JSON 필드 모두 비워둔 채 Save 가능했음.
- **수정:** Save 전 검증 — Required 활성 시 둘 중 하나 이상 필수, Format Contract 활성 시 Required Sections 필수. 실패 시 `saveError` 메시지 표시.

### 6.6 [Medium] Saving 중에도 Validate 버튼 활성화 ✅ 완료

- **설명:** Eval 설정 저장 중에 Validate 버튼이 활성화되어 동시 요청으로 꼬일 수 있음.
- **수정:** AgentEvaluationPanel에 `onSaveStart`/`onSaveEnd` 추가, Release Gate에서 `savingEval` 상태로 Validate 버튼 비활성화 및 "Saving…" 표시.

### 6.7 [Low] Copy summary가 "Passed" 수준으로만 표시 ✅ 완료

- **설명:** Copy summary가 너무 단순해 붙여넣기 시 정보가 부족함.
- **수정:** 타임스탬프, 총 run 수·Passed/Failed 개수·Pass rate, Run별 PASS/FAIL + trace_id 앞 8자 + 실패 시 요약 한 줄 포함하도록 개선.

### 6.8 [Medium] Eval 변경 후 저장 안 해도 Validate 가능해 반영 혼선 ✅ 완료

- **설명:** 사용자가 Eval 설정(예: min chars)만 바꾸고 저장하지 않은 상태에서도 Validate를 눌러, "설정이 반영 안 된다"는 혼선이 발생.
- **수정:** `AgentEvaluationPanel`에서 dirty 상태를 부모에 전달하고, Release Gate에서 dirty 상태일 때 Validate를 비활성화하며 "Save first" 안내를 표시.

---

## 7. 기타 / 세부

### 7.1 [Low] Regression 시 `repeat_runs` 고정

- **설명:** `repeat_runs: 1` 로 고정 전달.  
  여러 번 돌리는 옵션이 있으면 UI에 반영하고, 없으면 1이 기본임을 툴팁 등으로 명시 가능.

### 7.2 [Low] History pagination

- **설명:** Previous/Next로 `historyOffset`/`historyLimit` 기반 페이지네이션 있음.  
  "showing 1–20" 등 표시도 있음. 추가 이슈 없음.

### 7.3 [Low] ReleaseGateResult 타입과 drift run_results

- **설명:** `ReleaseGateRunResult`에 `trace_id?: string` 있음.  
  백엔드가 drift용 `run_results`에 `trace_id`를 넣지 않아서, 타입과 실제 응답이 다를 수 있음.  
  백엔드 수정(1.2) 또는 프론트에서 drift_runs 우선 사용으로 정합성 확보.

---

## 8. 우선순위 요약

| 우선순위 | 항목 | 분류 |
|----------|------|------|
| **P0** | 1.1 Live View 2 trace 선택 시 1 run만 나오는 백엔드 조건 수정 | Backend |
| **P0** | 1.2 Drift 시 run_results에 trace_id 포함 또는 프론트 drift_runs 우선 | Backend or Frontend |
| **P0** | 2.1 Result 상세: drift_runs 우선 + traceId fallback (result.trace_id) | Frontend |
| **P1** | 3.1 Eval Save: GET settings 지연 원인 조사 및 refetch 1회화/낙관적 업데이트 | Backend + Frontend |
| **P1** | 3.1 백엔드 GET /settings 4~10초 원인 분석 및 인덱스/쿼리 최적화 | Backend |
| **P1** | 4.1 Run vs trace 용어 정리 및 짧은 설명 | UX Copy |
| **P1** | 4.2 Drift vs Regression 레이아웃/플로우 일관성 검토 | UX |
| **P2** | 2.2 Result 인라인 확장 시 PASS일 때 최소 문구 표시 | Frontend |
| **P2** | 2.3 "Click row for detail" 힌트 | Frontend |
| **P2** | 2.4 Copy summary 배열 drift_runs ?? run_results 통일 | Frontend |
| **P2** | 3.2 Agent settings SWR 키 통일 | Frontend |
| **P2** | 4.3 Run 버튼 문구 통일 | UX |
| **P2** | 4.4 에러 표시 한 곳으로 정리 | UX |
| **P2** | 6.1 Export 실패 시 사용자 피드백 | Frontend |
| **P3** | 2.5 History Regression run 상세 "coming soon" 해소 | Frontend |
| **P3** | 4.5 Stability 툴팁 | UX |
| **P3** | 3.3 AgentEvaluationPanel 로딩 스켈레톤 | Frontend |
| **P3** | 5.2 History drift_runs 일관 사용 | Frontend |
| **P3** | 1.4 stability 모드 제거 또는 명시 | Backend |

---

## 9. 수정 시 권장 순서

1. **백엔드 1.1** — `snapshot_ids_to_use`만 있을 때도 Drift에서 distinct trace_ids 사용.  
2. **프론트 2.1** — 테이블/상세용 `drift_runs ?? run_results` + `traceId = run.trace_id ?? result?.trace_id`.  
3. **백엔드 1.2 또는 프론트 2.1 유지** — run_results에 trace_id 넣거나, 프론트에서 drift_runs만 사용.  
4. **3.1** — Save 후 refetch 1회화 + (선택) 낙관적 업데이트, 백엔드 GET 최적화.  
5. **4.1, 4.2** — 용어 정리, 레이아웃/플로우 일관성.  
6. 나머지 P2/P3를 여유에 맞춰 적용.

---

*문서 버전: 1.0. 최종 점검 기준: release-gate page, release_gate.py, AgentEvaluationPanel, NodeAndDataPickerModal, 관련 API 타입.*
