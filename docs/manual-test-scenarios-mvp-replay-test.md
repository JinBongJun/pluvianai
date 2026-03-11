# Manual Test Scenarios (MVP): Live View + Release Gate (Replay Test)

이 문서는 `docs/mvp-node-gate-spec.md`의 MVP 정의에 맞춰, 브라우저에서 토이 프로젝트로 **수동 검증**할 때 사용하는 체크리스트다.  
**Drift/Regression/Stability 전제 문구는 제거**하고, Release Gate는 **Replay Test 단일 모드** 기준으로만 작성한다.

---

## Goals (Must-haves)

- **Live View 불변성**: 과거 스냅샷의 `eval_checks_result`는 **캡처 시점 기준으로 고정**되어야 한다.
- **N/A 정책**: `not_applicable`은 **중립(Neutral)** 으로 처리하며, 실패 집계에는 포함하지 않는다.
- **데이터 선택 단순화**: Recommended set(자동 Worst/Golden 20)은 사용하지 않고, **Saved datasets + Live View 최근 로그(Last N/개별 선택)** 만을 Release Gate 입력으로 사용한다.
- **Dataset 커스텀성**: Clinical Log에서 여러 로그를 한 번에 1개 dataset으로 저장하고, 같은 이름 dataset이 있으면 append할 수 있어야 한다.
- **노드 범위 고정**: dataset은 **single node scope**로 저장/표시/실행되어야 하며, 다른 노드 데이터와 혼합 시 실행 전 차단되어야 한다.
- **UI 문구 정책**: Live View / Release Gate의 사용자 노출 문구는 **영어(English)만** 사용한다.
- **Replay Test**: 후보 설정(모델/프롬프트/JSON/tools)을 적용해 `repeat_runs`(1/10/50/100)로 실행하고 **PASS/FAIL/FLAKY**를 제공한다. JSON 패널은 **model call configuration만** 다루며, snapshot content(user messages/responses)는 여기서 편집하지 않는다.
- **게이트 판정**: `fail_rate`/`flaky_rate`로 PASS/FAIL을 명확히 결정한다(기본 5%/3%).
- **에러 UX**: 실패는 항상 **상단 배너 + 필드 하이라이트**로 즉시 이해 가능해야 한다.
- **Free Tier 한도**: Free 플랜에 대해 **스냅샷·프로젝트·platform replay credits** 월간 한도가 적용되고, 한도 초과 시 403 및 명확한 영어 메시지가 반환·표시된다. Billing/Usage에서 사용량·한도가 노출된다.

---

## Environment / Preconditions

- 테스트용 프로젝트 1개, 노드(agent) 1개 이상
- 해당 노드에 최근 7일 내 스냅샷이 **최소 40개 권장** (부족 시 fallback 동작 확인)
- (권장) OpenAI/Anthropic/Google 키 준비(없어도 “실패 UX” 시나리오로 대체 가능)
- 새 시크릿 창 권장(캐시/세션 영향 최소화)
- **아래 INT(통합) 시나리오를 먼저 수행**하면 프로젝트·노드·스냅샷 전제가 갖춰지며, 이후 A~E 시나리오를 이어서 검증할 수 있다.

---

## INT. SDK 통합 → 첫 데이터 노출 검증

사용자가 **자기 코드(또는 n8n/MCP/LangChain 등)에 우리 서비스를 연동**한 뒤, 첫 호출이 대시보드에 올바르게 나타나는지 검증한다. 이 단계를 통과한 뒤에만 A(Live View 불변성)·B(데이터 선택)·C(Release Gate) 시나리오를 의미 있게 테스트할 수 있다.

### 통합 유형(소스) 전제

데이터가 우리에게 오는 **경로**는 사용자가 무엇으로 앱을 만들었는지에 따라 다르다. 테스트 시 “이번 검증의 통합 유형”을 정하고, 해당 경로로 데이터가 들어온 뒤 **동일한 기준**(Live View 노드·Clinical Log·상세·Release Gate)으로 검증한다.

| 통합 유형 | 데이터가 우리에게 오는 방식 | 비고 |
|-----------|-----------------------------|------|
| **SDK (Python)** | 앱에서 `pluvianai.init()` 후 OpenAI 호출 → SDK가 `POST /api/v1/api-calls` 전송 | 현재 구현됨 |
| **SDK (Node)** | Node에서 `pluvianai.init()` 후 OpenAI 호출 → 동일 API 전송 | 현재 구현됨 |
| **n8n** | n8n 워크플로에서 HTTP Request 등으로 우리 API 호출, 또는 (있다면) 전용 노드 | 전용 노드 없으면 사용자가 직접 API 호출 구현 |
| **MCP** | MCP 서버/클라이언트가 우리 API로 전송하는 루트를 둔 경우 | 우리 쪽 MCP 어댑터 구현 여부에 따름 |
| **LangChain** | LangChain 앱 안에서 우리 SDK 사용 시 → SDK와 동일 경로; callback만 쓰면 우리 API 직접 호출 | SDK 사용 시 Python/Node와 동일 |
| **기타 (직접 API)** | curl/스크립트 등으로 `POST /api/v1/api-calls` 직접 호출 | payload 포맷만 맞으면 동일 검증 가능 |

**공통**: 어떤 통합 유형이든, 데이터가 한 번 우리 API로 들어온 뒤에는 동일한 `project_id`·`agent_id` 기준으로 Live View·Release Gate·상세가 **같은 방식**으로 노출된다. 아래 단계는 “데이터가 들어오기까지”의 전제를 만드는 절차다.

### INT-1. 사전 준비 (대시보드)

1. 로그인 후 **조직**·**프로젝트** 생성.
2. 해당 프로젝트 **Settings > API Keys**에서 **API 키** 생성.
3. **Project ID** 확인(URL 또는 설정 화면).

### INT-2. 사용자 코드에 연동

1. **SDK (Python)**: `pip install pluvianai` → `import pluvianai` → `pluvianai.init(api_key="...", project_id=123)` (또는 env: `PLUVIANAI_API_KEY`, `PLUVIANAI_PROJECT_ID`).
2. **SDK (Node)**: `npm install pluvianai` → `pluvianai.init({ apiKey: "...", projectId: 123 })` (또는 env).
3. 로컬/자체 백엔드 사용 시 `PLUVIANAI_API_URL`로 API URL 지정.
4. **n8n / MCP / LangChain 등** 다른 빌더를 쓰는 경우: 해당 환경에서 우리 API(`POST /api/v1/api-calls`)를 호출하도록 설정하거나, 공식 연동이 있으면 해당 가이드대로 구성한다.

### INT-3. 호출 발생

1. 해당 앱(또는 SDK README Quick Start 스크립트)에서 **OpenAI(또는 지원 LLM) 호출 1~2회** 실행.
2. SDK 사용 시 호출은 자동으로 `POST /api/v1/api-calls`로 전송된다. n8n/MCP/기타는 해당 경로로 1회 이상 전송되도록 실행한다.

### INT-4. 백엔드 수신 확인

1. **옵션 A**: 같은 프로젝트의 `GET /api/v1/projects/{id}/snapshots`(또는 list snapshots API)로 방금 보낸 호출이 스냅샷으로 들어왔는지 확인.
2. **옵션 B**: 백엔드 로그/DB에서 해당 `project_id`로 snapshot 또는 api_call 레코드가 생성되었는지 확인.

### INT-5. 프론트엔드(Live View) 반영 확인

1. 해당 조직·프로젝트 → **Live View** 이동.
2. **노드(에이전트)** 가 1개 이상 표시되는지 확인(agent_id 또는 agent_name 기준).
3. 노드 선택 후 **Clinical Log(LOG 탭)** 에 방금 보낸 호출이 **스냅샷 1개 이상**으로 보이는지 확인.
4. 스냅샷 한 개 클릭 시 **상세**(요청/응답 등)가 열리는지 확인.

Expected:
- **INT-4**: 백엔드에 해당 호출이 스냅샷/API call로 수신된다.
- **INT-5**: Live View에 노드가 보이고, Clinical Log에 스냅샷이 표시되며, 상세에서 내용이 노출된다. (목표: “5분 안에 첫 데이터가 대시보드에 보인다”.)
- 이 단계를 통과한 뒤 **A(Live View)·B(Data selection)·C(Release Gate)·REC-4~REC-7** 시나리오를 이어서 검증한다.

### 통합 유형별 참고

- **SDK (Python/Node)**: INT-2에서 init, INT-3에서 LLM 1회 호출 → INT-4·INT-5로 수신·노출 확인.
- **n8n**: 워크플로에서 우리 API 호출 노드 설정 후 1회 실행 → 동일하게 INT-4·INT-5 확인.
- **MCP**: (구현된 경우) MCP 경로로 1회 전송 후 INT-4·INT-5 확인.
- **LangChain**: 우리 SDK 사용 시 SDK 시나리오와 동일; callback만 사용 시 “우리 API 호출” 성공 여부 및 INT-4·INT-5 확인.

---

## A. Live View (Clinical Log) 불변성 / Eval 저장

### LV-1. Eval 카드 “추가 합성 금지” (불변성)

1. Live View > Evaluation에서 `Empty`만 ON, 나머지 OFF 후 Save.
2. 스냅샷 3개 생성 → 각 스냅샷 상세에서 Eval 카드가 `Empty`만 보이는지 확인.
3. Evaluation에서 `Latency`를 ON 후 Save.
4. **저장 이전** 스냅샷 상세 재확인.
5. **저장 이후** 새 스냅샷 1~2개 생성 후 상세 확인.

Expected:
- 저장 이전 스냅샷: 기존 카드만 표시(새 카드 “추가 합성” 없음)
- 저장 이후 스냅샷: `Empty + Latency` 표시

### LV-2. N/A 중립 집계 일관성

1. N/A가 발생 가능한 체크를 ON(예: JSON/Format/Required 등 상황에 따라).
2. N/A가 나오도록 스냅샷을 생성하거나, 기존 스냅샷에서 N/A가 표시되는 케이스를 찾는다.
3. Clinical Log 요약/상태(FLAGGED/HIGH RISK 등)와 상세에서 N/A 표시를 확인한다.

Expected:
- UI에서 상태 라벨은 N/A로 유지 가능
- “실패 집계”가 필요한 곳(필터/요약/게이트)에서도 N/A는 fail로 포함되지 않는다

### LV-3. Save → 즉시 반영 (캐시 전파)

1. Evaluation 설정을 저장한다.
2. 새로고침 없이 Clinical Log/Evaluation 화면에서 반영 확인.
3. 곧바로 Release Gate로 이동하여 같은 노드 기준 기본 상태 확인.

Expected:
- 저장 후 “한참 뒤에야 반영” 같은 지연이 재발하지 않는다.

### LV-4. Dataset 저장(선택 Export) 동작

1. Clinical Log에서 Export(선택 모드)로 스냅샷 여러 개를 선택한다.
2. “Save”를 눌러 dataset 이름을 입력하고 저장한다.
3. 입력한 이름과 같은 dataset이 이미 있을 때, 새 dataset이 추가 생성되지 않고 기존 dataset에 로그가 append되는지 확인한다.
4. Release Gate에서 dataset 선택 UI를 열어, 저장/append된 dataset이 같은 노드 범위에서 보이는지 확인한다.

Expected:
- 선택한 로그 여러 개가 **한 개의 named dataset**으로 저장된다.
- 같은 이름 저장 시 기존 dataset에 로그가 append되고 중복 로그는 추가되지 않는다.
- 저장/append 직후 Live View Data 탭과 Release Gate 모달 목록이 즉시 갱신된다.

### LV-5. 상세 페이지 Eval 표시 (중요)

Eval은 캡처 시점에 저장된 값만 사용하므로, 상세에서 정확히 표시되는지 반드시 확인한다.

1. **Evaluation 설정이 ON인 상태**에서 새 스냅샷을 1~2개 생성한다(토이 프로젝트 권장).
2. Clinical Log(LOG 탭)에서 방금 생성한 스냅샷 한 개를 클릭해 상세 모달을 연다.
3. 상세 모달의 **Evaluation** 섹션에 설정한 체크 항목별 카드(Empty, Latency 등)가 **저장된 결과(pass/fail/not_applicable)** 와 함께 보이는지 확인한다.
4. Data 탭으로 이동한 뒤, Saved datasets에서 스냅샷 한 개를 클릭해 상세를 연다.
5. 동일하게 Evaluation 섹션에 카드가 표시되는지 확인한다.
6. **저장된 평가가 없는 스냅샷**(예: 예전에 저장된 로그)의 상세를 연다.
7. 이때 **“No eval result for this snapshot.”** 문구가 보이거나, 평가 섹션이 비어 있음을 명확히 안내하는지 확인한다.

Expected:
- 새로 저장된 스냅샷 상세에서는 Evaluation 카드가 **항상** 표시된다(LOG 탭/Data 탭 공통).
- 평가가 없는 스냅샷에서는 “설정에 평가가 없다”가 아니라 “이 스냅샷에 저장된 평가가 없다”로 구분되어 표시된다.
- 아이콘/라벨이 Evaluation 탭과 일관되게 보인다.

### LV-6. 로딩 시간

1. Live View에서 노드를 선택한 뒤 **Clinical Log(LOG 탭)** 로 전환한다.
2. “Decoding Neural Logs...” 등 로딩 문구가 뜨는 경우, **과도하게 길지 않은지**(예: 수 초 이내에 목록 표시) 확인한다.
3. **Data 탭**으로 전환한다.
4. “Loading datasets...” 로딩이 끝나고, Saved datasets가 **합리적 시간 내**에 표시되는지 확인한다.
5. 노드를 바꾼 뒤 다시 LOG/Data 탭을 열어, 이전 데이터가 유지되다가 새 데이터로 전환되는지(깜빡임 최소) 확인한다.

Expected:
- LOG 탭: 스냅샷 목록이 수 초 이내에 로드된다(limit에 따라 다를 수 있음).
- Data 탭: Saved datasets가 과도한 대기 없이 표시된다.
- 노드 전환 시 keepPreviousData 등으로 이전 화면이 잠깐 유지된 뒤 갱신된다.
- Saved datasets에서 개별 로그 삭제 시 목록이 즉시 갱신되고(낙관적 UI), “Delete all” 시 한 번의 배치 삭제로 처리된다.

### LV-7. Settings: 노드별 API key override + 프로젝트 기본 fallback

1. Live View에서 노드 A를 선택하고 Settings 탭을 연다.
2. Provider API Keys에서 노드 provider를 확인한다.
3. 노드 A에 provider key를 저장한다.
4. 같은 provider를 쓰는 노드 B를 열어 상태를 확인한다.
5. 노드 B에도 다른 key를 저장한다(override).
6. Release Gate에서 노드 A/B를 각각 선택해 실행 가능 여부(차단/허용)가 올바른지 확인한다.
7. 노드 A key를 삭제하고, 프로젝트 기본 key가 있을 때 fallback으로 계속 실행 가능한지 확인한다.

Expected:
- key는 provider 기준이지만 **노드별 override가 우선** 적용된다.
- 노드별 key가 없으면 **프로젝트 기본 key**가 사용된다.
- 노드별 key 저장/삭제 후 상태 배지(Registered/Not registered)와 차단 메시지가 즉시 갱신된다.

### LV-8. Settings: 노드 이름 변경

1. Settings 탭에서 Display name을 변경하고 Save를 클릭한다.
2. 사이드 패널 타이틀/노드 라벨(캔버스, 드롭다운 등)에 변경된 이름이 반영되는지 확인한다.
3. 페이지 새로고침 후에도 변경 이름이 유지되는지 확인한다.

Expected:
- Save 직후 UI에 새 이름이 반영된다.
- 새로고침 후에도 변경 이름이 유지된다.
- 빈 값 저장 시 에러 메시지가 표시되고 저장되지 않는다.

### LV-9. Settings: 노드 삭제

1. Settings 탭에서 Remove node를 클릭한다.
2. 확인 단계에서 Cancel 동작을 먼저 확인한다(삭제되지 않아야 함).
3. Confirm remove를 눌러 실제 삭제를 진행한다.
4. Live View 캔버스/사이드패널에서 해당 노드가 사라지고, 패널이 닫히는지 확인한다.
5. Release Gate의 노드 선택 목록에서도 제거된 노드가 즉시 또는 새로고침 후 보이지 않는지 확인한다.

Expected:
- Cancel 시 삭제되지 않는다.
- Confirm 시 노드가 삭제되고 관련 화면에서 즉시 제거된다.
- 삭제된 노드에 대해 더 이상 Settings/Release Gate 실행을 시도할 수 없다.

---

## B. Data selection (Saved datasets / Live View logs)

### REC-1. Save selected logs into a new dataset

1. In Live View **Clinical Log**, select a node that already has several recent logs.
2. Click **SAVE** in the Clinical Log header to enter select mode.
3. Select 3+ rows from the same node (use row checkboxes).
4. Click **SAVE (N)** in the select-mode toolbar.
5. In the **Save logs to datasets** modal:
   - Leave existing datasets unselected.
   - Enter a new dataset name (e.g. `refund-edge-cases`).
   - Click **Save to datasets**.
6. While staying on Clinical Log, confirm that:
   - A success toast appears (e.g. `Saved N logs to new dataset "refund-edge-cases".`).
   - Select mode is turned off and all row selections are cleared.
7. Open Live View **Data** tab for the same node and locate the **Saved datasets** section.
8. Verify:
   - A new dataset row appears with the given name.
   - The log count equals the number of logs you just saved.

Expected:
- One save action creates **one named dataset** for the selected logs.
- The dataset is visible immediately in the same node's Data tab.
- Clinical Log selection state is reset cleanly after a successful save.

### REC-2. Append selected logs to existing datasets (playlist-style)

1. Ensure at least one dataset already exists for the node (e.g. from REC-1).
2. In Live View **Clinical Log**, enter select mode and choose a different set of 3+ logs (same node).
3. Click **SAVE (N)**.
4. In the **Save logs to datasets** modal:
   - Check one or more existing datasets (e.g. `refund-edge-cases`).
   - Optionally **also** enter a new dataset name to create a second dataset at the same time.
5. Click **Save to datasets**.
6. Open the **Data** tab and verify:
   - For each selected existing dataset, the log count increased by the number of **new** logs (no duplicates).
   - If a new name was entered, an additional dataset row was created with the selected logs.
7. Re-open Release Gate “Select node & data” modal and confirm that:
   - All affected datasets are listed under Saved datasets.
   - Dataset log counts match the Data tab.

Expected:
- A single save action can append logs to one or more existing datasets and optionally create a new dataset.
- Duplicated snapshot IDs are not added twice to the same dataset.
- Release Gate and Live View Data show consistent dataset names and counts.

### REC-3. Rename dataset in Data tab

1. In Live View **Data** tab, click **Rename** on a saved dataset.
2. Enter a new English name and save.
3. Re-open Release Gate “Select node & data” modal and verify the renamed label is shown.

Expected:
- Rename is persisted and reflected in both Live View and Release Gate.
- Empty label save clears custom name and falls back to dataset ID-style display.

### REC-4. Node-scope isolation (required)

1. Prepare datasets under two different nodes (A and B) in the same project:
   - Node A: create at least one dataset from its own logs.
   - Node B: create at least one **differently named** dataset from its own logs.
2. Open Live View **Data** tab for node A:
   - Verify **Saved datasets** only lists node A datasets.
3. Switch to node B and repeat step 2 for node B.
4. Open Release Gate for node A and open “Select node & data” modal:
   - Verify only node A datasets appear in the Saved datasets tab.
5. Attempt a negative test (cross-node misuse), 예:
   - Using API or DevTools, call Release Gate validate with `node=NodeA` and a dataset ID that belongs to node B.
   - Or try to manually pass snapshot IDs from node B into a dataset for node A.

Expected:
- UI lists (Saved datasets, Release Gate data picker) are strictly node-scoped.
- Cross-node dataset or snapshot usage is blocked with a clear error code/message
  (e.g. `dataset_agent_mismatch` / `dataset_snapshot_agent_mismatch` in API, surfaced as English error in UI).

### REC-5. Saved datasets / Live View logs consistency and details

1. **Saved datasets as source**
   - In Release Gate “Select node & data” modal, choose one or more datasets created via REC-2.
   - Confirm and run validation.
   - Verify:
     - The **Selected cases** / input count in baseline & results matches the sum of chosen dataset sizes.
     - The summary clearly indicates data source as “Saved datasets”.
2. **Live View logs (Last N / manual selection) as source**
   - In the same modal, switch to **Live View logs** tab.
   - Try both:
     - Last 10/25/50/100 options.
     - Manual selection of specific logs.
   - Run validation and verify:
     - The input count matches the Last N or manual selection.
     - Data source label shows “Live View logs”.
3. **Detail consistency**
   - From Live View, open snapshot detail for a sample log used in a run.
   - From Release Gate run results, open the corresponding snapshot/log detail.

Expected:
- Data source selection (Saved datasets vs Live View logs) is reflected accurately in baseline and run output.
- Snapshot details (eval, payload, meta, timestamps) are consistent between Live View and Release Gate.

### REC-6. English-only copy audit (required)

1. Review all user-facing labels/messages in:
   - Live View Clinical Log save flow
   - Live View Data tab dataset actions
   - Release Gate “Select node & data” flow
2. Trigger success/failure toasts for save, create dataset, rename, and run-block cases.

Expected:
- All user-facing copy is English-only (no mixed Korean text in UI/toasts/tooltips/errors).

### REC-7. Behavior diff in run result

1. Run Release Gate with a dataset or snapshots that include at least one snapshot with tool calls (so baseline has a non-empty tool sequence).
2. After the run completes, expand one run (e.g. "Run 1") in the result card.
3. Check that a **"Behavior change"** block is shown when the run has tool-call data.
4. Verify the **human-readable band**: label is one of **Stable** (green), **Minor change** (amber), or **Major change** (rose), and the one-line summary **"Tool call pattern changed by X%."** is displayed.

Expected:
- **Behavior change** shows: one-line summary ("Tool call pattern changed by X%."), band label (Stable / Minor change / Major change), Sequence distance, Tool divergence (%).
- Band is derived from tool divergence: 0–5% Stable, 5–20% Minor change, >20% Major change.
- **Baseline** line: ordered tool names from the original snapshot (e.g. `search → lookup → answer`).
- **Run** line: ordered tool names from the replay result.
- If baseline or run has no tool calls, the corresponding sequence line shows "—" or empty; metrics still appear (e.g. distance ≥ 0).
- With repeat_runs=3 or 5, each run (Run 1, Run 2, …) has its own behavior_diff when expanded.

---

## C. Release Gate: Replay Test (단일 모드)

### RG-1. 기본 플로우 (노드 선택 → Data 선택 → Run)

1. Release Gate로 이동한다.
2. 노드를 고른다.
3. “Select node & data”에서 Saved datasets 또는 Live View logs를 선택한다.
4. `repeat_runs=1`(기본)으로 Run 실행.

Expected:
- 선택한 데이터 소스 기준으로 실행 가능하다.

### RG-2. repeat_runs (1 / 10 / 50 / 100)

1. Run 버튼 옆 드롭다운에서 1x, 10x, 50x, 100x 선택 가능한지 확인.
2. 50x 또는 100x 선택 시 경고 문구(비용/시간) 및 드롭다운 내 해당 옵션 빨간 칸 표시 확인.
3. 동일 데이터로 `repeat_runs=1`, 10, 50, 100 각각 실행해 결과 행·시도 수가 N과 일치하는지 확인.

Expected:
- `repeat_runs=1`에서는 FLAKY가 발생하지 않는다(항상 PASS 또는 FAIL)
- N이 늘어나면 동일 케이스에서도 FLAKY가 관측될 수 있다

### RG-3. 케이스 분류 PASS/FAIL/FLAKY

repeat_runs = N일 때:
- PASS: N/N pass
- FAIL: N/N fail
- FLAKY: \(0 < passed\_runs < N\)

Expected:
- 결과 표에서 케이스별 상태가 위 정의대로 표기된다.
- attempts 패턴(예: ●●●)이 PASS/FAIL 혼합을 직관적으로 보여준다.

### RG-4. Gate verdict (fail_rate / flaky_rate) + Strictness UI

1. **라벨·설명**: Step 3이 "Strictness"로 표시되고, "Strict = fewer failures allowed; lenient = some failure or flakiness OK." 한 줄 설명이 보이는지 확인.
2. **프리셋**: Strict / Normal / Lenient / Custom 네 가지 버튼이 보이고, 호버 시 툴팁에 각각 Fail·Flaky %(Strict 5%/1%, Normal 5%/3%, Lenient 10%/5%, Custom은 "Set your own...")가 표시되는지 확인.
3. **기본값**: Normal 선택 시 Fail 5%, Flaky 3%로 실행되는지 확인. (Custom이 아닐 때는 % 입력란은 숨겨져 있음.)
4. **프리셋 전환**: Strict → Normal → Lenient 순으로 클릭 시, Run 시 사용되는 값이 각각 5%/1%, 5%/3%, 10%/5%로 적용되는지 확인.
5. **Custom**: Custom 클릭 시에만 Fail %·Flaky % 입력란이 나타나는지 확인. 입력란에서 값을 변경 후 Run 시 해당 값이 적용되는지 확인.
6. **판정 로직**: `fail_rate = (# FAIL 케이스) / total`, `flaky_rate = (# FLAKY 케이스) / total`, PASS iff `fail_rate<=fail_rate_max` AND `flaky_rate<=flaky_rate_max`.

Expected:
- Strictness UI가 위 동작대로 표시·전환되며, Run payload의 fail_rate_max/flaky_rate_max가 선택된 프리셋 또는 Custom 입력값과 일치한다.

### RG-5. 여러 데이터 + 반복 실행 시 평가 결과 표시 검증 (필수)

여러 개의 스냅샷을 선택하고 Repeat Runs(1x/10x/50x/100x)를 사용했을 때, 결과 테이블·요약·게이지에 **평가가 올바르게 뜨는지** 검증한다.

1. **데이터 선택**
   - Release Gate에서 노드를 선택한 뒤, “Select node & data”로 **스냅샷 여러 개**를 선택한다(Last 10/25/50/100 또는 개별 선택).
   - 선택한 스냅샷 개수(N)를 확인한다.

2. **반복 실행**
   - **Repeat Runs**를 **10x**로 두고 Run 실행한다.
   - 실행이 끝날 때까지 대기한다.

3. **결과 테이블**
   - 결과 테이블에 **행 수 = 선택한 스냅샷 개수(N)** 인지 확인한다(1행 = 1케이스).
   - 각 행에 **시도 패턴**이 **repeat_runs 수**(예: 10) 만큼 표시되는지 확인한다.
   - 각 행의 **PASS/FAIL/FLAKY** 라벨이, 해당 케이스의 N번 시도 결과(전부 성공 → PASS, 전부 실패 → FAIL, 일부만 성공 → FLAKY)와 일치하는지 확인한다.

4. **요약·게이지**
   - 상단 요약 또는 게이지에 **총 케이스 수**, **fail_rate**, **flaky_rate**(또는 통과/실패/플라키 개수)가 표시되는지 확인한다.
   - **Gate verdict**(PASS/FAIL)가 설정한 `fail_rate_max`, `flaky_rate_max` 기준으로 기대대로인지 확인한다.

5. **Export / Copy**
   - Export JSON 또는 Copy를 실행한 뒤, 내려받은 내용(또는 클립보드)에 **repeat_runs**, **총 run 수**(N × repeat_runs), **케이스별 pass/fail/flaky** 정보가 포함되어 있는지 확인한다.

Expected:
- **테이블**: 선택한 스냅샷 개수만큼 행이 있고, 각 행에 repeat_runs만큼 시도 표시 및 해당 케이스의 PASS/FAIL/FLAKY가 정확히 표시된다.
- **요약·게이지**: fail_rate, flaky_rate, Gate verdict가 계산과 일치하고 올바르게 표시된다.
- **Export/Copy**: repeat_runs·총 run 수·케이스별 상태가 빠짐없이 포함된다.

### RG-6. Result UI: 케이스 펼치기·시도 목록·시도 상세 (필수)

Release Gate Run 실행 후 **Result 패널**에서 Gate verdict, 케이스별 k/N passed, 펼침 시 시도(attempt) 목록, 시도 클릭 시 eval·behavior diff 상세가 올바르게 동작하는지 검증한다.

1. **전제**
   - 노드·데이터를 선택한 뒤 Repeat Runs를 **10x** 이상(또는 50x/100x)으로 두고 Run 실행한다.
   - 결과가 정상 반환된 상태에서 Result 패널을 확인한다.

2. **Gate Pass / Gate Fail 상단 표시**
   - Result 패널 **맨 위**에 **Gate Pass** 또는 **Gate Fail** 배너가 표시되는지 확인한다.
   - (선택) fail_rate, flaky_rate 퍼센트가 배너 옆 또는 아래에 표시되는지 확인한다.

3. **케이스 행: k/N passed · 펼치기**
   - 결과 테이블에서 **한 행 = 한 케이스(스냅샷)** 인지 확인한다.
   - 각 행에 **run** 번호, **eval**(PASS/FAIL), **passed** 컬럼에 **k/N passed**(예: 7/10 passed, 24/50 passed) 형식이 표시되는지 확인한다.
   - 각 행 오른쪽에 **chevron**(▼/▲) 아이콘이 있는지 확인한다.
   - **행 클릭** 시 해당 케이스가 **펼쳐지거나 접히는지** 확인한다(다른 행 클릭 시 이전 행은 접히고 새 행만 펼쳐져도 됨).

4. **펼침 시 시도(attempt) 목록**
   - 케이스 행을 펼쳤을 때 **그 아래**에 시도 목록이 **드롭다운** 형태로 나타나는지 확인한다.
   - 시도 목록 테이블에 **#**(Run 번호), **status**(Pass/Fail), **latency**(ms), **behavior**(Stable/Minor/Major), **eval**(요약) 컬럼이 있는지 확인한다.
   - **시도 개수**가 repeat_runs(예: 10, 50, 100)와 일치하는지 확인한다.
   - 목록이 길 경우(50·100) **스크롤**로 전부 볼 수 있는지 확인한다.

5. **시도 행 클릭 시 상세**
   - 시도 목록에서 **한 시도 행을 클릭**하면 해당 행이 강조(선택)되고, **그 아래**에 **Attempt N detail** 블록이 나타나는지 확인한다.
   - 상세 블록에 **Eval**: Passed 룰 목록, Failed 룰 목록이 표시되는지 확인한다.
   - 상세 블록에 **Behavior change**: Stable/Minor/Major 뱃지, tool divergence %, sequence distance, **Baseline** 시퀀스 vs **Run** 시퀀스(툴 이름 순서)가 표시되는지 확인한다.
   - (있을 경우) **violations** 요약이 표시되는지 확인한다.
   - 같은 시도 행을 다시 클릭하면 상세가 **접히는지** 확인한다.

6. **attempts가 없는 경우**
   - repeat_runs=1 이거나 레거시 응답처럼 **attempts** 배열이 비어 있는 케이스에서 행을 펼쳤을 때, "No per-attempt breakdown for this run." 등 안내 문구가 표시되는지 확인한다.

Expected:
- Result 상단에 Gate Pass/Fail이 명확히 보이고, 케이스 행에 k/N passed와 chevron이 있다.
- 펼치면 시도 목록(#, status, latency, behavior, eval)이 나오며, 시도 행 클릭 시 해당 시도의 eval·behavior diff 상세가 아래에 표시된다.
- 100개 시도까지 스크롤로 전부 확인 가능하다.

### RG-7. History retention + hard delete

Release Gate history는 스냅샷과 동일한 plan-based retention을 따른다.

1. **전제 준비**
   - 테스트 프로젝트 owner plan을 확인한다:
     - Free = 7 days
     - Pro = 30 days
     - Enterprise = 365 days
   - DB fixture 또는 admin helper로, 해당 프로젝트에 아래 두 row를 만든다:
     - retention 밖의 **release-gate history** (`BehaviorReport.summary_json.release_gate` 존재)
     - retention 밖의 **general behavior report** (`summary_json.release_gate` 없음)
2. **History API / UI 확인**
   - `GET /api/v1/projects/{project_id}/release-gate/history` 를 호출하거나 Release Gate > HISTORY 탭을 연다.
   - retention 밖의 release-gate row가 보이지 않는지 확인한다.
3. **Scheduled cleanup 실행**
   - data lifecycle cleanup 스케줄러를 기다리거나, 동일 cleanup job을 수동 실행한다.
4. **삭제 검증**
   - DB에서 retention 밖 release-gate row가 실제로 삭제되었는지 확인한다.
   - retention 밖 general behavior report row는 그대로 남아 있는지 확인한다.

Expected:
- Release Gate HISTORY 탭과 API는 retention window 밖 row를 반환하지 않는다.
- scheduled cleanup 이후 retention 밖 release-gate row는 DB에서 실제로 사라진다.
- 일반 behavior report는 purge 대상이 아니므로 삭제되지 않는다.

---

## D. Candidate Overrides (모델/프롬프트/JSON/tools)

### OVR-1. Detected provider/model 값 진위 검증

1. Release Gate에서 노드/데이터를 선택한다.
2. Baseline Data 영역의 `Detected provider`, `Detected model id`를 확인한다.
3. 같은 노드의 최신 스냅샷(또는 baseline으로 사용된 스냅샷) 메타와 값이 일치하는지 확인한다.
4. Run 후 export JSON(또는 run detail)에서 `original_model`, `replay_model`, `replay_provider` 값을 확인한다.

Expected:
- `Detected provider/model`은 단순 UI 장식이 아니라 선택된 데이터 기준으로 계산된 값과 일치한다.
- override를 사용하지 않은 run에서는 감지값 기반으로 실행된 흔적이 run 결과 메타에 남는다.

### OVR-2. Model override (Change model 버튼) 동작

1. Candidate Overrides에서 `Change model` 버튼을 누른다.
2. Provider 섹션(OpenAI/Anthropic/Google) 탭이 보이는지 확인한다.
3. 각 provider 탭에서 preset 모델을 선택한다.
4. 선택 후 모델 표시값이 즉시 변경되는지 확인한다.
5. `Use detected`를 눌러 감지 모델로 복귀되는지 확인한다.

Expected:
- provider별 모델 목록이 노출되고 선택 즉시 모델 값이 반영된다.
- platform-provided model override에서는 개인 provider key가 없어도 실행 전 key 차단이 발생하지 않는다.
- override 활성 상태에서는 run payload에 `new_model` + `replay_provider`가 포함된다.
- detected 복귀 시 `new_model`/`replay_provider` override 없이 실행된다.

### OVR-2a. Anthropic pinned-only 목록 + Pinned/Custom 배지/경고

Release Gate는 재현성을 위해 Anthropic preset 목록을 **pinned(버전 고정) 모델만** 노출한다. Custom 입력은 Advanced escape hatch로 유지하되 경고/배지를 통해 “비교 가능성”을 명확히 한다.

1. Candidate Overrides에서 `Change model`(또는 Model settings 섹션)으로 들어간다.
2. **Anthropic** 탭을 선택한다.
3. preset 목록에 `YYYYMMDD`로 끝나는 **pinned 모델만** 보이는지 확인한다. (예: `claude-sonnet-4-20250514`)
4. pinned 모델 하나를 클릭해 선택한다.
5. 상단의 Model settings 영역(또는 선택된 모델 표시)에 **Pinned** 배지가 보이는지 확인한다.
6. 같은 화면에서 **Custom model ID (Advanced)** 입력란에 날짜가 없는 모델(또는 `latest`)을 입력한다(예: `claude-opus-4-6`).
7. Custom 입력 후 **Custom** 배지와 노란 경고(“pinned 권장”)가 보이는지 확인한다.
8. 설정을 닫고 노드 카드(Release Gate node summary)의 “Model mode” 요약이 pinned일 때는 `Pinned override`, custom일 때는 `Custom override`로 보이는지 확인한다.

Expected:
- Anthropic preset list는 pinned 모델만 노출한다(레거시/alias/`latest`는 기본 목록에서 제외).
- pinned 선택 시 **Pinned** 배지, custom 입력 시 **Custom** 배지 + 경고가 표시된다.
- 노드 카드 요약(Model mode)이 pinned/custom을 구분해 표시한다.

### OVR-2b. Anthropic pinned-only 서버 강제(Production) + Escape hatch

Production 환경에서는 Anthropic override에 대해 **서버가 pinned-only를 강제**한다. (클라이언트 변조/직접 API 호출 우회 방지)

1. **Precondition**
   - 서버 `ENVIRONMENT=production`
   - `RELEASE_GATE_ALLOW_CUSTOM_MODELS`는 기본값(False)로 둔다.
   - 테스트 계정은 superuser가 아니어야 한다.
2. Release Gate에서 Model override를 활성화하고 provider를 Anthropic으로 둔다.
3. Custom model id에 **날짜가 없는 Anthropic 모델**을 입력한다(예: `claude-opus-4-6`).
4. Run을 실행한다.

Expected:
- API는 **422**를 반환하고, UI는 `release_gate_requires_pinned_model` 기반으로
  “pinned Anthropic model id(YYYYMMDD)가 필요” 배너를 표시한다.

Escape hatch 확인:
1. 같은 조건에서 **superuser 계정**으로 실행하면 차단되지 않아야 한다.
2. 또는 서버에 `RELEASE_GATE_ALLOW_CUSTOM_MODELS=true`를 설정하면 차단되지 않아야 한다.

### OVR-3. System prompt override

1. System prompt를 변경 후 실행.
2. 결과가 의미 있게 바뀌는지(또는 적어도 요청이 반영되는지) 확인.

Expected:
- payload에 system prompt override가 반영된다.

### OVR-4. Request JSON / tools overrides

1. tools를 1개 추가해 실행(OpenAI tools 형식 등).
2. 잘못된 JSON(파싱 불가)을 넣고 실행.

Expected:
- 정상 JSON이면 실행된다.
- JSON 파싱 실패 시 배너 + 해당 입력 강조로 즉시 피드백.

### OVR-5. Cross-provider (canonical step)

1. baseline이 OpenAI 형식 tools를 가진 케이스에서 다른 provider(Anthropic/Google)로 replay를 시도한다.
2. platform-provided model override 모드에서 개인 provider key 없이 실행해 본다.
3. detected 모델 모드로 되돌린 뒤(Use detected), key 미등록 상태에서 실행해 본다.

Expected:
- platform-provided model override 모드에서는 개인 key 미등록이어도 실행된다.
- detected 모델 모드에서는 key 미등록 시 실행 전 차단된다.
- 성공하면 **canonical step 레이어**로 replay 응답에서 tool_call이 추출되어, 정책(BehaviorRule) 검사가 동일 기준으로 적용된다.
- 실패하면 “payload schema/compatibility” 류의 메시지가 명확히 표시된다.

### OVR-6. 경고/차단 메시지 경우의 수 (적재적소 검증)

| ID | 조건 | 예상 위치 | Expected |
|---|---|---|---|
| WARN-1 | detected 모드 + provider key 미등록 | Candidate Overrides 하단 경고 박스(`role=status`) + Run 비활성 | `Run blocked: ... key is not registered ...` 문구 노출 및 실행 차단 |
| WARN-2 | platform 모드 + provider key 미등록 | key 경고 박스 없음 | key 관련 차단 없음, 실행 가능 |
| WARN-3 | platform 모드 + 모델 미선택(빈 `new_model`) | Run 버튼 tooltip + 실행 시 상단 에러 배너(`role=alert`) | `Run blocked: select a model id ...` 문구 노출 |
| WARN-4 | provider 식별 불가(메타 부족) + detected 모드 | Candidate Overrides 하단 경고 박스(`role=status`) | `provider could not be detected ...` 문구 노출 및 실행 차단 |
| WARN-5 | Request JSON 파싱 실패 | Request JSON 입력 하단 에러 텍스트 | `Invalid JSON` 또는 `Must be a JSON object` 노출 |
| WARN-6 | Tool parameters JSON 파싱 실패 | 실행 시 상단 에러 배너(`role=alert`) | `Tool "<name>": parameters must be valid JSON.` 노출 |
| WARN-7 | backend `provider_resolution_failed` | 상단 에러 배너(`role=alert`) | snapshot provider 식별 실패 메시지 노출 |
| WARN-8 | backend `missing_provider_keys` (detected) | 상단 에러 배너(`role=alert`) | 누락 provider 목록 포함 차단 메시지 노출 |
| WARN-9 | agent/data 미선택 | Run 비활성 + 버튼 하단 안내 문구 | `Select agent and dataset to run.` 노출 |

검증 포인트:
- 같은 의미의 경고가 상/하단에 중복 노출되지 않아야 한다.
- detected/platform 모드 전환 시 경고 조건이 즉시 바뀌어야 한다.
- 모든 차단 메시지는 사용자가 다음 행동(키 등록, 모델 선택, 데이터 선택)을 바로 이해할 수 있어야 한다.

---

## E. 결과/리포트 (최소)

### REP-1. Copy/Export

1. 결과 요약을 Copy한다.
2. Export(JSON 등)를 실행한다.

Expected:
- 요약에는 최소: verdict, totals, fail_rate, flaky_rate, thresholds, sample failure reasons가 포함
- Export 실패 시 사용자에게 실패 피드백이 보인다

### REP-2. Evidence (대표 근거)

Expected:
- Top failed rules(또는 top failing eval elements)
- 대표 실패 케이스 링크(3~5개 수준)

---

## OVR. Canonical Step 레이어 검증

Canonical step 레이어 및 관련 정책 동작을 프로덕션 수준으로 점검하기 위한 테스트·검증 항목이다. 구현 반영 후 아래 항목으로 회귀/수동 검증을 수행한다.

### OVR-C1. Argument 파싱 안정성 (`parse_tool_args`)

**대상:** `backend/app/utils/tool_calls.py` — `parse_tool_args`

| # | 시나리오 | 입력 | 기대 결과 |
|---|----------|------|-----------|
| C1.1 | dict 입력 | `{"a": 1}` | 그대로 `{"a": 1}` 반환, 예외 없음. |
| C1.2 | valid JSON string | `'{"x": 2}'` | `{"x": 2}` 반환, 예외 없음. |
| C1.3 | invalid JSON string | `'not json'`, `'{'` | 예외 없이 `{"_raw": "<입력값>", "_invalid": True}` 반환. |
| C1.4 | JSON이지만 dict 아님 | `'[1,2]'`, `'"s"'` | 예외 없이 `{"_raw": "<입력값>", "_invalid": True}` 반환. |
| C1.5 | None / 숫자 등 | `None`, `123` | 예외 없이 `{}` 반환 (또는 팀 정한 fallback). |

### OVR-C2. 정책: `_invalid` / `_raw` 처리 (`_validate_tool_args_schema`)

**대상:** `backend/app/api/v1/endpoints/behavior.py` — `_validate_tool_args_schema`

| # | 시나리오 | 기대 결과 |
|---|----------|-----------|
| C2.1 | step의 `tool_args`에 `_invalid: true` 존재 | 해당 step은 일반 스키마 검사(required/extras)를 하지 않고, 전용 violation 1건 기록: 메시지에 "could not be parsed" 포함, evidence에 `raw` 포함. |
| C2.2 | `tool_args`에 `_raw`, `_invalid`만 있고 스키마에 `additionalProperties: false` | `_raw`, `_invalid`는 extra 필드로 세지 않음 → extras 위반으로 잘못 걸리지 않음. |

### OVR-C3. Provider shape 추론 (`_detect_provider`)

**대상:** `backend/app/core/canonical.py` — `_detect_provider`, `response_to_canonical_tool_calls`

| # | 시나리오 | 기대 결과 |
|---|----------|-----------|
| C3.1 | `provider_hint="openai"` + 실제 body는 Google shape | hint 우선 → `"openai"`, OpenAI 추출기 사용. |
| C3.2 | `provider_hint="anthropic"` + 실제 body는 OpenAI shape | hint 우선 → `"anthropic"`, Anthropic 추출기 사용. |
| C3.3 | hint 없음, body에 `choices[0].message` 존재 | `"openai"` 반환. |
| C3.4 | hint 없음, body에 `candidates[0].content.parts` 존재 (choices 없음) | `"google"` 반환. |
| C3.5 | hint 없음, body에 top-level `content[]`이고 첫 블록 `type`이 `text` 또는 `tool_use` (choices/candidates 없음) | `"anthropic"` 반환. |
| C3.6 | hint 없음, 알 수 없는 shape (위 셋 중 어느 것도 아님) | `"unknown"` 반환. |
| C3.7 | `provider == "unknown"`일 때 `response_to_canonical_tool_calls` | 예외 없이 `[]` 반환. |

### OVR-C4. Tool call ID Dedup (스트리밍 중복 제거)

**대상:** `backend/app/core/canonical.py` — `_extract_openai` / `_extract_anthropic`의 id 수집, `_dedup_tool_calls_by_id`, `response_to_canonical_tool_calls`

| # | 시나리오 | 기대 결과 |
|---|----------|-----------|
| C4.1 | OpenAI 응답에 동일 `id`를 가진 tool_call이 여러 번 포함 (스트리밍 합친 payload 등) | canonical tool_calls 리스트에는 해당 id 기준으로 1개만 존재. |
| C4.2 | Anthropic 응답에 동일 `id`의 tool_use 블록이 여러 번 포함 | canonical tool_calls 리스트에는 해당 id 기준으로 1개만 존재. |
| C4.3 | id가 없는 항목만 있는 경우 (예: Google) | (name, arguments) 등 fallback 키로 dedup, 순서 유지. |

### OVR-C5. Canonical step 최소 1개 (llm_call) / steps 비어있음

**대상:** `response_to_canonical_steps`, `_run_behavior_validation`

| # | 시나리오 | 기대 결과 |
|---|----------|-----------|
| C5.1 | tool_call이 0개인 응답을 `response_to_canonical_steps`에 넣음 | 최소 1개 step: `step_type: "llm_call"`, 그 다음 tool_call step 없음. |
| C5.2 | `_run_behavior_validation(rules, steps=[])` 호출 | 예외 없이 동작, `status_out="pass"`, `step_count=0`, `violations=[]` 등 합리적 요약 반환. |

### OVR-C6. Canonical step 스키마 고정

**대상:** `response_to_canonical_steps` 반환 구조, `docs/mvp-node-gate-spec.md` 문서

| # | 시나리오 | 기대 결과 |
|---|----------|-----------|
| C6.1 | `response_to_canonical_steps` 반환 step 하나 검사 | `step_order`, `step_type`, `tool_name`, `tool_args` 존재; llm_call일 때 `tool_name` null/빈 문자열, `tool_args`는 dict. |
| C6.2 | 스펙 문서 | `mvp-node-gate-spec.md`에 Canonical step 스키마(고정 필드 + 확장 필드) 및 “구조 변경 시 하위 호환 고려” 문구가 명시되어 있음. |

### OVR-C7. 회귀: 기존 동작

| # | 시나리오 | 기대 결과 |
|---|----------|-----------|
| C7.1 | OpenAI 형식 응답 → `response_to_canonical_tool_calls` | 기존과 동일하게 tool_calls 추출 (id dedup 적용 시 중복만 제거). |
| C7.2 | Replay 후보 steps 빌드 후 Gate 검사 | 기존과 동일하게 정책 적용, PASS/FAIL/위반 목록 일관. |
| C7.3 | `tool_args_schema` 규칙으로 정상 dict 검사 | `_invalid` 없는 step은 기존처럼 required/extras 검사만 수행. |

### OVR-S. 보안 시나리오

| # | 시나리오 | 기대 결과 |
|---|----------|-----------|
| S1 | unknown provider 응답 | steps에 `_provider_unknown` → behavior violation, status FAIL. |
| S2 | 동일 id + 다른 name/args | `_id_conflict`, tool_calls=[] → violation, steps는 llm_call 1개 유지. |
| S3 | tool_args str 또는 dict >64KB | `_too_large` violation, FAIL. |
| S4 | Google candidates[0], [1] 모두 tool_calls | 둘 다 steps에 포함. |
| S5 | tool name `" Search  \n"` | canonical `tool_name` `"search"`, allowlist `["search"]`면 PASS. |
| S6 | tool name `"   "` | 정규화 후 "" → violation 또는 step 제외 후 FAIL. |
| S7 | OpenAI 응답에 message 밖 경로에만 tool_calls | 추출되지 않음. |

### 구현 시 실수 방지 체크리스트

구현·코드리뷰 시 확인.

| # | 확인 항목 | 필수 조건 |
|---|-----------|-----------|
| A | unknown/id_conflict/empty name violation 순서 | `_run_behavior_validation`에서 위 violation들이 **맨 앞**에서 추가되고, 그 다음 rule 루프, 그 다음 `status_out = "pass" if len(violations)==0 else "fail"`. |
| B | id_conflict 시 step 개수 | tool_calls=[] 이어도 **llm_call 1개는 유지**. steps가 `[]`가 되지 않음. |
| C | dict size 검사 예외 처리 | `json.dumps(raw_args)`를 try/except로 감싸고, 직렬화 실패 시 _invalid 반환. 예외 전파 금지. |
| D | 정책 spec과 name 정규화 일치 | allowlist/forbidden/order/args_schema에서 사용하는 모든 tool 이름이 **정규화된 값**끼리 비교됨. |

**실행 방법 참고:** `parse_tool_args`, `_detect_provider`, `_validate_and_dedup_tool_calls` 등은 pytest로 단위 테스트 추가 가능. 통합은 Replay 1회 실행 후 Gate 결과·violations 확인, 또는 behavior API에 steps 넣어 검사. 수동은 curl/Postman으로 동일 payload에 hint 유무/잘못된 hint로 canonical 응답 비교.

---

## F. Free Tier Limits (무료 한도)

Free 플랜 한도가 실제로 적용되고, 사용자에게 한도·사용량이 명확히 보이는지 검증한다. 구현 계획은 `docs/mvp-free-tier-limits-implementation-plan.md` 참고.

### F-1. 스냅샷 월간 한도 (snapshots_per_month)

1. **전제**: 테스트용 free 플랜 계정 1개. 해당 계정의 모든 프로젝트에 걸쳐 **이번 달 생성된 스냅샷 수**가 `PLAN_LIMITS["free"]["snapshots_per_month"]`(예: 500)에 도달하거나 초과한 상태를 만든다.  
   - (실제 500개 생성이 어려우면, 한도 값을 임시로 낮춰 두고 테스트 후 복구하거나, 백엔드/DB로 현재 월 사용량을 시드한 뒤 1건만 더 생성해 본다.)
2. **동작**: 새 스냅샷을 생성한다.  
   - 경로: Live View 연동(SDK/proxy)으로 1회 호출 발생, 또는 `POST /api/v1/projects/{id}/snapshots` 등 스냅샷 생성 API 직접 호출.
3. **확인**:  
   - 응답이 **403**이고, 메시지에 free plan 한도 초과·“Upgrade or try again next month” 등이 포함되는지 확인.  
   - 프론트에서는 에러 배너/토스트로 동일 메시지가 노출되는지 확인.

Expected:
- 한도 도달/초과 시 새 스냅샷 생성이 **거부**되고, 403 + 명확한 영어 메시지가 반환·표시된다.

### F-2. 프로젝트 수 한도 (projects)

1. **전제**: free 플랜 계정. 해당 조직(org)의 **프로젝트 수**가 이미 `PLAN_LIMITS["free"]["projects"]`(예: 100)에 도달한 상태.  
   - (실제 100개가 어려우면, 한도를 임시로 1~2로 낮춰 두고 테스트.)
2. **동작**: 같은 조직 아래에 **새 프로젝트 생성** 시도 (UI: New project / API: `POST /organizations/{id}/projects` 등).
3. **확인**:  
   - 응답이 **403**이고, 메시지에 free plan project limit 관련 문구가 포함되는지 확인.

Expected:
- 한도 도달 시 새 프로젝트 생성이 **거부**되고, 403 + 명확한 메시지가 반환된다.

### F-3. Platform replay credits 월간 한도 (platform_replay_credits_per_month)

1. **전제**: free 플랜 계정. **이번 달** 이미 사용한 hosted replay credit 합계가 `PLAN_LIMITS["free"]["platform_replay_credits_per_month"]`(또는 legacy alias `guard_credits_per_month`) 이상인 상태.  
   - (실제 사용량을 쌓기 어려우면, 백엔드에서 해당 user/org의 이번 달 `Usage` 합계를 시드하거나, 한도를 매우 낮게 잡고 Replay 1~2회 실행 후 재시도.)
2. **동작**: Release Gate에서 **Replay 실행** (`model_source = platform`, 즉 플랫폼 제공 키 사용).  
   - 노드·데이터 선택 후 Run.
3. **확인**:  
   - 실행이 **403**으로 거부되고, 메시지에 platform replay credit limit 도달 및 “Use your own provider key” 또는 upgrade 안내가 포함되는지 확인.  
   - 같은 데이터/설정으로 `model_source = byo` 또는 사용자 provider key 연결 상태에서 다시 실행하면 허용되는지 확인.

Expected:
- 플랫폼 키 사용 시 한도 초과면 Replay가 **거부**되고, 영어 메시지가 반환·표시된다. BYOK 실행은 계속 허용된다.

### F-4. 사용량·한도 노출 (Billing/Usage)

1. **전제**: free 플랜 계정. 해당 조직의 Billing(또는 Usage) 페이지 접근 가능.
2. **동작**: 조직 → **Usage & Licensing**(또는 Billing) 페이지로 이동.
3. **확인**:  
   - “Free plan” 또는 동일 의미 문구가 보이는지.  
   - **이번 달 스냅샷 사용량**이 “X / 500”(또는 현재 free 한도 값) 형태로 표시되는지.  
   - **이번 달 platform replay credits 사용량**이 “Y / 1,000”(또는 현재 free 한도 값) 형태로 표시되는지.  
   - 보조 설명으로 “Hosted PluvianAI model usage spends these credits. BYOK runs do not.” 또는 동등한 문구가 보이는지.
   - 한도에 가까우면 경고 스타일, 초과 시 “Limit reached” 등 안내가 보이는지.

Expected:
- Free plan임이 명시되고, **snapshots** 및 **platform replay credits**에 대해 “사용량 / 한도”가 올바르게 표시된다. 한도 도달/초과 시 안내 문구가 노출된다.

### F-5. (선택) 슈퍼유저/마스터 계정 한도 스킵

1. **전제**: 한도 스킵이 구현된 경우, `is_superuser=True`(또는 동등한 마스터 계정) 1개.
2. **동작**: F-1·F-2·F-3과 동일하게, **한도에 도달한 상태**에서 같은 동작(스냅샷 생성, 프로젝트 생성, Replay 실행)을 **슈퍼유저**로 수행.
3. **확인**:  
   - 슈퍼유저는 **한도에 걸리지 않고** 정상 처리되는지.

Expected:
- (구현 시) 슈퍼유저/마스터 계정은 free 한도 체크가 스킵되어, 한도 초과 상태에서도 스냅샷·프로젝트·Replay가 성공한다.

---

## Final MVP Checklist

- [ ] **INT**: 사용자 코드(SDK Python/Node 또는 n8n/MCP/LangChain 등) 연동 후 첫 호출이 백엔드 수신·Live View 노드·Clinical Log·상세에 올바르게 반영된다.
- [ ] 과거 스냅샷 상세에 “새 eval 카드”가 뒤늦게 추가되지 않는다.
- [ ] `not_applicable`이 요약/게이트 집계에서 중립(실패 미포함)으로 처리된다.
- [ ] Clinical Log 저장은 선택 로그를 one named dataset으로 생성하고, 같은 이름 저장 시 append가 동작한다.
- [ ] dataset rename이 Live View와 Release Gate 양쪽에 반영된다.
- [ ] dataset/validation은 single-node scope를 강제하며 cross-node 데이터는 차단된다.
- [ ] Live View / Release Gate의 사용자 노출 문구가 영어로만 표시된다.
- [ ] Release Gate는 Replay Test 단일 모드로 실행된다.
- [ ] `repeat_runs=1`에서 FLAKY가 발생하지 않는다.
- [ ] PASS/FAIL/FLAKY 분류가 정의와 일치한다.
- [ ] Gate verdict가 `fail_rate`/`flaky_rate` 기준으로 결정된다.
- [ ] Baseline Data의 Detected provider/model 값이 실제 선택 데이터/실행 메타와 일치한다.
- [ ] Model override(Change model) 선택값이 run payload/결과에 반영되고, Use detected로 복귀 가능하다.
- [ ] 경고/차단 메시지(WARN-1~WARN-9)가 조건별로 적재적소에 표시되고, 중복 노출되지 않는다.
- [ ] Copy/Export가 일관된 결과를 내보낸다.
- [ ] **로딩**: LOG 탭 / Data 탭 전환 시 목록이 과도한 대기 없이 로드된다.
- [ ] **Eval 표시**: 새로 저장된 스냅샷 상세(LOG·Data 탭 공통)에서 Evaluation 카드가 정상 표시되고, 평가가 없는 스냅샷은 “이 스냅샷에 저장된 평가 없음”으로 구분된다.
- [ ] **Settings-API key**: 노드별 key override가 프로젝트 기본보다 우선 적용되고, key 삭제 시 fallback이 올바르게 동작한다.
- [ ] **Settings-Name**: 노드 이름 변경이 즉시 반영되고 새로고침 후에도 유지된다.
- [ ] **Settings-Delete**: 노드 삭제 Confirm/Cancel 동작이 정상이고 삭제 후 Live View/Release Gate 목록에서 제거된다.
- [ ] **REC-5**: Saved datasets·Live View logs(Last N/개별 선택) 선택 시 baseline·Run·상세에서 정확히 반영되고, 상세에서 eval·payload·메타가 완전히 노출된다.
- [ ] **REC-6**: Save/append/rename/run-block 관련 UI/토스트/오류 문구가 영어로만 노출된다.
- [ ] **REC-7**: Release Gate run 결과에서 run 확장 시 Behavior change(한 줄 요약 "Tool call pattern changed by X%.", Stable/Minor/Major 라벨, sequence distance, tool divergence, Baseline/Run 시퀀스)가 표시된다.
- [ ] **RG-5**: 여러 데이터 선택 + Repeat Runs(1x/10x/50x/100x) 실행 시 결과 테이블(행 수·시도 패턴·PASS/FAIL/FLAKY)·요약·게이지·Export/Copy에 평가가 올바르게 표시된다.
- [ ] **RG-6**: Result UI — Gate Pass/Fail 상단, 케이스 행 k/N passed·chevron, 펼침 시 시도 목록(#·status·latency·behavior·eval), 시도 클릭 시 Attempt detail(eval·behavior diff·violations) 표시 및 100개 시도 스크롤 가능.
- [ ] **OVR (Canonical 레이어)**: OVR-C1~C7(argument 파싱·_invalid 처리·provider 추론·id dedup·최소 llm_call·스키마·회귀) 검증 완료.
- [ ] **OVR-S (보안)**: OVR-S1~S7(unknown FAIL·id 충돌·size 제한·multi-candidate·name 정규화·빈 이름·OpenAI 경로) 및 구현 시 실수 방지 체크리스트 A~D 확인.
- [ ] **F-1**: Free 플랜 스냅샷 월간 한도 도달 시 새 스냅샷 생성이 403으로 거부되고, 명확한 영어 메시지가 반환·표시된다.
- [ ] **F-2**: Free 플랜 프로젝트 수 한도 도달 시 새 프로젝트 생성이 403으로 거부되고, 명확한 메시지가 반환된다.
- [ ] **F-3**: Free 플랜 platform replay credits 월간 한도 도달 시(`model_source = platform`) Replay 실행이 403으로 거부되고, 영어 메시지가 반환·표시된다. 동일 조건의 BYOK 실행은 계속 허용된다.
- [ ] **F-4**: Billing/Usage 페이지에 Free plan 문구 및 이번 달 snapshots·platform replay credits "사용량 / 한도"가 올바르게 표시되고, BYOK 예외 설명과 한도 도달/초과 안내가 노출된다.
- [ ] **F-5 (선택)**: 슈퍼유저/마스터 계정은 한도 체크가 스킵되어 한도 초과 상태에서도 스냅샷·프로젝트·Replay가 성공한다.
- [ ] **G-1**: 랜딩 Pricing 섹션의 Free CTA는 비로그인 시 회원가입/시작 플로우로, 로그인 시 `/organizations` 콘솔로 이동한다.
- [ ] **G-2**: 랜딩 Pricing 섹션의 Pro/Enterprise 버튼은 비활성 상태이며, 클릭해도 업그레이드/결제 동작이 발생하지 않는다.
- [ ] **G-3**: Billing/Usage 페이지에서 Free plan 배지와 snapshots/platform replay credits “사용량 / 한도” 바가 올바르게 표시된다.
- [ ] **G-4**: Billing/Usage 페이지의 플랜 카드 중 Free만 “Current Plan”으로 표시되고, Pro/Enterprise 카드는 “Preview Only” 또는 “Coming soon” 상태로 유지된다.
- [ ] **L-1**: Projects 페이지 검색창에 이름/설명 일부 입력 시 해당 프로젝트만 표시되고, 비우면 전체 복원된다.
- [ ] **L-2**: 필터 아이콘 클릭 시 All / With alerts / No alerts 선택 가능하고, 선택 시 목록이 갱신되며 버튼에 활성 상태가 표시된다.
- [ ] **L-3**: 검색과 필터를 동시에 적용 시 두 조건을 모두 만족하는 프로젝트만 표시된다.
- [ ] **L-4**: 필터 드롭다운이 열린 상태에서 외부 클릭 시 드롭다운만 닫히고 선택된 필터는 유지된다.
- [ ] **L-5**: 프로젝트 카드·리스트에서 알림 0개일 때 "0"이 아닌 "0 ALERTS"로 표시되고, 알림이 있을 때는 "{N} ALERTS"로 일관되게 표시된다.

---

## G. Plans & Billing UI (Free-first)

MVP 단계에서는 **무료 플랜만 실제로 동작**하고, 유료 플랜(Pro/Enterprise)은 UI 상에만 노출되며 비활성 상태여야 한다.

### G-1. 랜딩 페이지 Pricing — Free CTA

1. **전제**: 브라우저에서 `/` 랜딩 페이지 접속 가능.
2. **동작 (비로그인)**:
   - 로컬 스토리지에서 `access_token`을 제거해 비로그인 상태를 만든다.
   - 랜딩 페이지 하단 Pricing 섹션으로 스크롤.
   - **Community / Free** 카드의 “Get started free” 버튼을 클릭.
3. **확인**:
   - 브라우저가 `/login?mode=signup&intent=trial` (또는 동등한 회원가입·시작 경로)로 이동하는지 확인.
4. **동작 (로그인 상태)**:
   - 정상 계정으로 로그인해 `access_token`이 설정된 상태에서 `/` 방문.
   - 같은 버튼 클릭.
5. **확인**:
   - 브라우저가 `/organizations` 콘솔로 이동하는지 확인.

Expected:
- Free CTA는 로그인 여부에 따라 **회원가입/로그인 플로우 또는 콘솔 진입**으로 자연스럽게 연결된다.

### G-2. 랜딩 페이지 Pricing — Paid 플랜 비활성화

1. **전제**: `/` 랜딩의 Pricing 섹션 확인 가능.
2. **동작**:
   - Pro / Enterprise 카드의 CTA 버튼(예: “Join waitlist”, “Contact sales”)에 마우스를 올리고 클릭을 시도.
3. **확인**:
   - 버튼이 시각적으로 비활성(disabled) 상태처럼 보이고(연한 색, not-allowed 커서 등), 클릭해도 **페이지 이동이나 업그레이드 동작이 발생하지 않는다.**

Expected:
- MVP 동안 사용자는 Pricing 섹션에서 **유료 플랜을 활성화할 수 없다**는 것이 명확하다.

### G-3. 조직 Billing/Usage — Free plan 뱃지 + 사용량 바

1. **전제**: free 플랜 계정으로 조직 Billing/Usage 페이지 접근 가능.
2. **동작**:
   - 조직 → `Usage & Licensing`(Billing) 페이지로 이동.
3. **확인**:
   - 상단 또는 Plan Limits 영역에 “Free plan”(또는 동등한 문구) 배지가 보인다.
   - **이번 달 snapshots 사용량**이 “X / N”(N = free 스냅샷 한도) 형태로 바 차트와 함께 표시된다.
   - **Platform replay credits 사용량**이 “Y / M”(M = free hosted replay credit 한도) 형태로 바 차트와 함께 표시된다.
   - BYOK runs do not spend these credits 라는 의미의 설명이 함께 표시된다.

Expected:
- 사용자는 현재가 free 플랜임을 명확히 인지하고, snapshots/platform replay credits에 대해 “이번 달 사용량 / 한도”를 시각적으로 확인할 수 있다.

### G-4. 조직 Billing/Usage — Paid 플랜 카드 읽기 전용

1. **전제**: 동일 Billing 페이지에서 플랜 카드 섹션(Free / Pro / Enterprise)을 볼 수 있다.
2. **동작**:
   - Free 카드 상단의 상태 문구를 확인한다.
   - Pro / Enterprise 카드의 CTA 버튼을 클릭해 본다.
3. **확인**:
   - Free 카드에는 “Current Plan” 등 현재 플랜임을 나타내는 상태가 보인다.
   - Pro / Enterprise 카드에는 preview badge가 보이고, 버튼은 비활성(disabled) 상태이며 클릭해도 업그레이드/결제 동작이 발생하지 않는다.

Expected:
- Billing 페이지는 **free 플랜만 실제로 활성화**되어 있고, 다른 플랜은 단순 미리보기(읽기 전용)로만 노출된다.

---

## H. Profile & Service API Keys

In MVP, users should be able to update their profile name and manage service API keys from a single profile settings page.

### H-1. Set Profile — update full name

1. **Precondition**: Logged-in user can open `/settings/profile`.
2. **Action**:
   - Confirm current email and full name are displayed.
   - Change full name to a new value.
   - Click `Save profile`.
3. **Verify**:
   - Success message is shown.
   - Reload the page and verify the updated full name persists.

Expected:
- Profile updates are saved and reflected after refresh.

### H-2. Service API Key — create and one-time reveal

1. **Precondition**: Logged-in user is on `/settings/profile`.
2. **Action**:
   - In `Service API Keys`, enter a key name (e.g., `Local SDK key`).
   - Click `Create API key`.
3. **Verify**:
   - A newly created key value (starts with `ag_live_`) is shown once.
   - Copy button works (clipboard copy success or equivalent confirmation).
   - The key appears in the registered key list with metadata (name / created timestamp / masked prefix).

Expected:
- Full key value is shown only at creation time and list view remains masked.

### H-3. Service API Key — rename key

1. **Precondition**: At least one API key exists in list.
2. **Action**:
   - Click `Rename` on one key.
   - Update the key name and save.
3. **Verify**:
   - Success message is shown.
   - Updated key name is visible in the list after save.
   - Reload page and confirm the renamed value persists.

Expected:
- API key names are editable and persisted correctly.

### H-4. Service API Key — revoke key

1. **Precondition**: At least one API key exists in list.
2. **Action**:
   - Click `Remove` on one key.
3. **Verify**:
   - Success message is shown.
   - Removed key disappears from list.
   - Any integration using that key fails authentication on next request (if tested end-to-end).

Expected:
- Revoked key is no longer usable and no longer shown as active.

### H-5. Security — change password

1. **Precondition**: Logged-in user is on `/settings/profile`.
2. **Action**:
   - In `Security`, fill in current password, new password, and confirmation.
   - Submit `Change password`.
3. **Verify**:
   - Success message is shown.
   - Log out and attempt login with the old password (should fail).
   - Login with the new password (should succeed).

Expected:
- Password update requires current password and enforces minimum length.

---

## I. Login & Signup Flow (MVP baseline)

### I-1. Signup mode + post-auth redirect

1. **Precondition**: Open `/login?mode=signup&intent=trial`.
2. **Action**:
   - Verify signup form is shown by default.
   - Complete registration with valid values and submit.
3. **Verify**:
   - Registration succeeds.
   - User is redirected to `/organizations` after auto-login.

Expected:
- Signup query mode is respected and successful signup lands in the console.

### I-2. Login with explicit next path

1. **Precondition**: Open `/login?next=/organizations`.
2. **Action**:
   - Sign in with valid credentials.
3. **Verify**:
   - User is redirected to the provided internal path (`/organizations`).

Expected:
- Login redirect logic prioritizes safe internal `next` path.

### I-3. Reauth message handling

1. **Precondition**: Open `/login?reauth=1`.
2. **Action**:
   - Observe the page without submitting.
3. **Verify**:
   - “Please log in again.” message is visible.
   - URL query is cleaned (no persistent `reauth=1` in address bar).

Expected:
- Reauth guidance is shown once and URL is normalized.

---

## J. Admin Access Boundary (MVP baseline)

### J-1. Non-superuser cannot access admin data endpoints

1. **Precondition**: Log in with a regular (non-superuser) account.
2. **Action**:
   - Call `GET /api/v1/admin/stats`.
   - Call `GET /api/v1/admin/users`.
   - Call `GET /api/v1/internal/usage/credits/by-project?month=2026-03`.
3. **Verify**:
   - All requests are rejected with `403`.

Expected:
- Admin and internal usage endpoints are not accessible to regular users.

### J-2. Non-superuser cannot execute high-risk admin mutations

1. **Precondition**: Log in with a regular (non-superuser) account.
2. **Action**:
   - Call `POST /api/v1/admin/init-db`.
   - Call `POST /api/v1/admin/generate-sample-data?project_id=<id>`.
   - Call `POST /api/v1/admin/upgrade-user-subscription?...`.
3. **Verify**:
   - All requests are rejected with `403`.

Expected:
- Database/bootstrap and subscription mutation endpoints are strictly operator-only.

---

## K. Project Role Boundary (Owner/Admin/Member/Viewer)

### K-1. Member/Viewer cannot mutate project settings

1. **Precondition**: Test project has at least one non-owner user (`member` or `viewer` role).
2. **Action**:
   - Attempt `PATCH /api/v1/projects/{project_id}` as non-owner/non-admin.
   - Attempt `DELETE /api/v1/projects/{project_id}` as non-owner/non-admin.
3. **Verify**:
   - Requests are rejected with `403`.

Expected:
- Project update/delete remains owner/admin (or owner-only where defined).

### K-2. Member/Viewer cannot manage project members

1. **Precondition**: Same project and non-owner/non-admin account.
2. **Action**:
   - Attempt add/update/remove member via:
     - `POST /api/v1/projects/{project_id}/members`
     - `PATCH /api/v1/projects/{project_id}/members/{user_id}`
     - `DELETE /api/v1/projects/{project_id}/members/{user_id}`
3. **Verify**:
   - All requests are rejected with `403`.

Expected:
- Team management is restricted to owner/admin.

### K-3. Member/Viewer cannot delete behavior datasets

1. **Precondition**: Existing behavior dataset in project and non-owner/non-admin account.
2. **Action**:
   - Call `POST /api/v1/projects/{project_id}/behavior-datasets/{dataset_id}/delete`.
3. **Verify**:
   - Request is rejected with `403`.

Expected:
- Destructive dataset deletion is restricted to owner/admin.

### K-4. Member/Viewer cannot mutate Live View agent config/log sets

1. **Precondition**: Non-owner/non-admin account has project read access.
2. **Action**:
   - Attempt:
     - `PATCH /api/v1/projects/{project_id}/live-view/agents/{agent_id}/settings`
     - `DELETE /api/v1/projects/{project_id}/live-view/agents/{agent_id}`
     - `POST /api/v1/projects/{project_id}/live-view/agents/{agent_id}/saved-logs`
     - `POST /api/v1/projects/{project_id}/live-view/agents/{agent_id}/saved-logs/batch-delete`
     - `DELETE /api/v1/projects/{project_id}/live-view/agents/{agent_id}/saved-logs`
3. **Verify**:
   - All mutation requests are rejected with `403`.

Expected:
- Live View write operations are restricted to owner/admin.

### K-5. Member/Viewer cannot create/delete project-scoped provider keys

1. **Precondition**: Non-owner/non-admin account has project read access.
2. **Action**:
   - Attempt:
     - `POST /api/v1/projects/{project_id}/user-api-keys`
     - `DELETE /api/v1/projects/{project_id}/user-api-keys/{key_id}`
3. **Verify**:
   - Both mutation requests are rejected with `403`.
   - `GET /api/v1/projects/{project_id}/user-api-keys` still returns list data (read allowed).

Expected:
- Provider key mutations are restricted to owner/admin while read remains collaboration-friendly.

### K-6. Non-superuser cannot request sample data on project creation

1. **Precondition**: Logged in as regular (non-superuser) account.
2. **Action**:
   - Call `POST /api/v1/projects` with body including `generate_sample_data: true`.
3. **Verify**:
   - Request is rejected with `403`.
   - Error detail indicates sample-data generation is operator-only.

Expected:
- Sample-data bootstrap behavior is explicit and cannot be silently requested by normal users.

---

## L. Projects list (Search & Filter)

Organization Projects page (`/organizations/{orgId}/projects`) provides client-side search and an alerts filter. Verify that both work and combine correctly.

### L-1. Search by name or description

1. **Precondition**: Organization has at least two projects with distinct names (and optionally descriptions).
2. **Action**:
   - Go to **Organizations** → select an org → **Projects** (or `/organizations/{orgId}/projects`).
   - In the search bar, type part of one project’s name.
3. **Verify**:
   - List updates (after short debounce) to show only projects whose name or description contains the query (case-insensitive).
   - Clearing the search restores the full list.

Expected:
- Search filters projects by name/description; empty query shows all.

### L-2. Filter by alerts (dropdown)

1. **Precondition**: Same Projects page; at least one project with open alerts and one without (if available).
2. **Action**:
   - Click the **filter icon** (funnel) to the right of the search bar.
   - Confirm a dropdown opens with options: **All projects**, **With alerts**, **No alerts**.
   - Select **With alerts**.
3. **Verify**:
   - Dropdown closes and the list shows only projects that have at least one open alert.
   - The filter button shows an active state (e.g. green border or highlight).
   - Select **No alerts** and confirm only projects with zero alerts are shown.
   - Select **All projects** (or **Clear filters** when visible) and confirm the full list returns.

Expected:
- Filter options apply correctly; active filter is visible; Clear/All restores full list.

### L-3. Search and filter combined

1. **Precondition**: Multiple projects, some with alerts and some without.
2. **Action**:
   - Set filter to **With alerts**.
   - Enter a search term that matches only one of the projects that have alerts.
3. **Verify**:
   - List shows only projects that satisfy both: (a) name/description matches search, and (b) have alerts.
   - Changing search or filter updates the list accordingly.

Expected:
- Search and filter work together (AND logic).

### L-4. Filter dropdown closes on outside click

1. **Precondition**: Filter dropdown is open.
2. **Action**: Click somewhere outside the dropdown (e.g. on the page background or another control).
3. **Verify**: The dropdown closes without changing the current filter selection.

Expected:
- Click-outside closes the dropdown; selected filter remains in effect.

### L-5. Alert count label (0 vs N ALERTS)

1. **Precondition**: Organization has at least one project with zero open alerts (and optionally one with alerts > 0).
2. **Action**:
   - Open the Projects page (grid view). Find a project card that has no open alerts.
   - Switch to list view (table) and find the same project’s row.
3. **Verify**:
   - **Grid card**: The card shows a badge with **"0 ALERTS"** (green/success style), not a bare "0".
   - **List view**: In the "Active Alerts" column, the cell shows **"0 ALERTS"** (with green dot), not a standalone "0".
   - If a project has open alerts, both card and list show **"{N} ALERTS"** (e.g. "3 ALERTS") in the appropriate style.

Expected:
- Zero-alert projects display "0 ALERTS" (not "0") in both grid and list. Alert count is always labeled as "ALERTS".

---

## Evidence Capture Guide (버그 제출 시)

- 화면 캡처
  - **INT**: 통합 유형(SDK/n8n/MCP/LangChain 등), API 수신 확인(로그 또는 list snapshots 응답), Live View 노드·Clinical Log 스냅샷·상세 표시
  - Saved dataset save/append/rename 전후 화면
  - Candidate overrides(모델 모드/키 입력)
  - 결과 요약 + 결과 테이블(FLAKY 포함 시 attempts 패턴)
  - 에러 배너 + 필드 강조(실패 케이스)
  - **로딩**: “Decoding Neural Logs…” / Data 탭 로딩이 길게 지속될 때 화면·경과 시간
  - **Eval**: 상세 모달에서 Evaluation 섹션(카드 표시 여부, “No eval…” 문구)
  - **REC-4**: Node A/B dataset 분리 표시 및 cross-node 차단 메시지
  - **REC-5**: Saved datasets 목록 일치, Confirm 후 baseline, Run 결과, 상세(Eval·payload·메타) 노출
  - **REC-6**: Save/append/rename/run-block 문구 영어 표기 검증 캡처
  - **REC-7**: Run 확장 시 Behavior change 블록(한 줄 요약, Stable/Minor/Major 라벨, 메트릭, Baseline/Run 시퀀스) 캡처
  - **RG-5**: 여러 스냅샷 선택 + 3x 실행 후 결과 테이블(행 수·시도 패턴·PASS/FAIL/FLAKY), 요약·게이지(fail_rate·flaky_rate·verdict), Export/Copy 내용
  - **F (Free Tier Limits)**: F-1 스냅샷 한도 초과 시 403 응답·에러 메시지; F-2 프로젝트 한도 초과 시 403·메시지; F-3 platform replay credits 한도 초과 시 platform run 거부 + BYOK 허용 확인; F-4 Billing/Usage 페이지의 Free plan·snapshots/platform replay credits 사용량·한도 표시 및 BYOK 예외 안내
  - **H (Profile & Service API Keys)**: profile name update before/after refresh, password change result, one-time API key reveal, key rename persistence, key list masked prefix, key revoke result
  - **I (Login & Signup Flow)**: signup mode rendering, successful post-auth redirect, reauth message visibility, normalized URL after query handling
  - **J (Admin Access Boundary)**: non-superuser calls to `/admin/*` and `/internal/usage/*` return 403 for both read and mutation endpoints
  - **K (Project Role Boundary)**: member/viewer mutation attempts (project update/delete, team management, behavior dataset deletion, Live View mutations, project user API key mutations) return 403; non-superuser sample-data create flag returns 403
  - **L (Projects list)**: search bar filters by name/description; filter dropdown (All / With alerts / No alerts) and combined search+filter; filter button active state; dropdown closes on outside click; alert count shows "0 ALERTS" / "{N} ALERTS" (not bare "0") in grid and list
- 실행 메타
  - `project_id`, `agent_id`
  - 사용 데이터: dataset/live-view logs + snapshot_ids 개수
  - `repeat_runs`, threshold 값
  - provider/model + API key 사용 여부(값은 마스킹)

