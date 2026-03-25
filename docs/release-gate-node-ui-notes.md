## Release Gate Node 카드 요약

- **목적**
  - 한 노드에 대해: _무슨 모델을 어떤 설정으로, 어떤 데이터에_ 돌려볼지 한 화면에서 조절하는 곳.

---

### 1. 화면 구조 (3컬럼)

- **왼쪽: Node 컨텍스트**
  - 현재 모델(`MODEL`) / 시스템 프롬프트 요약(`SYS PROMPT`)
  - Eval checks 상태 (Empty / Latency / JSON validity 등)
  - API key 상태 (Registered / Not registered)

- **가운데: 설정 편집 (`JSON PAYLOAD` + tools)**
  - LLM 호출 설정만 다룸 (sampling, max_tokens, tools, 기타 옵션).
  - **콘텐츠(대화 내용)** 는 스냅샷에서만 오고 여기서는 절대 편집하지 않음.

- **오른쪽: 실행 결과**
  - 현재 Gate 결과(PASS/FAIL, fail_rate, flaky_rate)
  - 케이스별/시도별 breakdown
  - History 탭에서 과거 실행 이력 확인.

> 키보드만으로 왼쪽 → 가운데 → 오른쪽 패널 순서대로 이동 가능하고, 포커스 상태가 분명하게 보이도록 설계한다.

---

### 2. 데이터 소스 & 기본 규칙

- **모델**
  - 기본값: Live View 최신 스냅샷에서 감지한 모델(`runDataModel`).
  - Override를 켜면 사용자가 고른 모델 + provider로 강제.

- **시스템 프롬프트**
  - 스냅샷/노드에 값이 있으면 그대로 보여줌.
  - 없으면: 빈칸 + “Optional system prompt” 스타일 placeholder.

- **JSON 설정 (`requestBody`)**
  - 스냅샷 payload에 있는 설정(temperature, max_tokens, tools 등)만 복사.
  - 아무 설정도 없으면 `{}` 또는 완전 빈 에디터에서 시작해도 됨.

- **Tools**
  - payload에 tools가 있으면 리스트/JSON에 반영.
  - 없으면 “No tools configured”만 보여주고, JSON에는 `tools` 키도 없음.

> 대용량 payload(툴 수십 개, 깊은 config)는 JSON 에디터/undo 성능에 영향을 줄 수 있으므로, 너무 큰 구조는 템플릿 파일이나 코드 쪽에서 관리하는 것을 권장한다.

---

### 3. 실행 / 에러 UX 원칙

- **Run 버튼(Start)은 “안전할 때만” 활성화**
  - 노드 선택 + baseline 데이터 선택이 되어 있고,
  - 필수 설정(모델, API key 등)이 유효할 때만 실행 가능.

- **런을 막아야 하는 상황**
  - API key 없음 / 잘못됨
  - 다른 노드 데이터가 섞인 dataset 선택
  - 모델 override 켰는데 모델 ID 미입력
  - JSON 구조가 명백히 잘못된 경우(예: 툴 파라미터가 invalid JSON)

- **표현 방법**
  - 상단/오른쪽 패널에 에러 메시지 배너.
  - Start 버튼 비활성 + tooltip.
  - 노드 카드 footer에도 짧은 한 줄 가이드(예: “choose baseline data …”).

- JSON 안에 API 키·비밀번호 등 시크릿이 의심되는 패턴이 보이면, Run 전에 경고 배너로 알려주고 실행을 막을 수 있다(향후 강화 포인트).
- 사용자에게 보이는 에러/툴팁 카피는 기본적으로 English로 유지하고, 국제화를 고려해 별도 리소스 파일에서 관리한다.

---

### 4. 모델 선택 정책 (간단 버전)

- **Detected vs Override**
  - Detected: 노드가 실제로 쓰던 모델을 그대로 사용.
  - Override: Release Gate용 후보 모델을 지정(플랫폼 제공 모델 포함).

- **Provider별 모델 리스트**
  - OpenAI, Anthropic, Google 각각 “권장 모델” 위주 짧은 화이트리스트.
  - **Anthropic은 pinned(버전 고정) 모델 ID만 기본 노출**한다. (재현성 목적)
    - pinned 판정: 모델 ID가 `YYYYMMDD`로 끝남 (예: `claude-sonnet-4-20250514`)
    - `...-latest` 같은 alias/최신 라인은 Gate 비교를 흔들 수 있어 기본 목록에서 제외.
  - 초고가 모델은 Advanced 섹션에서만 노출 + 비용 경고(향후 강화 포인트).

- **Custom model ID (Advanced)**
  - Custom 입력은 “긴급 디버깅/신규 모델 검증”을 위한 escape hatch로 유지할 수 있다.
  - 단, Release Gate 결과/히스토리에는 **Pinned vs Custom** 여부를 반드시 표시해 “비교 가능성”을 명확히 한다.
  - **Enforcement (current implementation)**:
    - production Gate에서는 Anthropic override에 대해 **pinned-only(YYYYMMDD) 강제**.
    - 예외: superuser 또는 `RELEASE_GATE_ALLOW_CUSTOM_MODELS=true`.

---

### 6. 설정 버전 / 재현성 (향후)

- Release Gate history에는 모델, threshold, repeat_runs와 함께 핵심 JSON 설정 스냅샷을 같이 저장해, 나중에 같은 설정으로 재실행/비교할 수 있게 한다.
- 각 Gate run에는 실행자(사용자 ID)와 실행 시각을 함께 기록해, 팀 단위에서 “누가 어떤 설정으로 돌렸는지”를 추적할 수 있게 한다.

---

### 5. 디자인 철학 한 줄

- **“없으면 없는 그대로 보여주되, 항상 지금 이 노드를 어떻게 돌릴지 한눈에 이해되게.”**

