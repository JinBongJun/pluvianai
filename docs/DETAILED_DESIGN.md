# Synpira 상세 설계 문서

> **Updated: 2026-02-02** (테스트 실행 제한 §2.10, 플랜별 한도 반영)
> 
> **핵심 포지셔닝**: **Synpira — the test lab for agents.** (LLM/Agent 테스트 전용 서비스)

---

## 목차

1. [시스템 아키텍처](#1-시스템-아키텍처)
2. [핵심 기능 설계](#2-핵심-기능-설계)
   - [2.1 Live View (실제 섹션)](#21-live-view-실제-섹션)
   - [2.2 Test Lab (테스트 섹션)](#22-test-lab-테스트-섹션)
   - [2.3 모델 변경 테스트 (Test Lab)](#23-모델-변경-테스트-test-lab)
   - [2.4 프롬프트 변경 테스트 (Test Lab)](#24-프롬프트-변경-테스트-test-lab)
   - [2.5 Chain Testing](#25-chain-testing-체인-테스트)
   - [2.6 Signal Detection](#26-signal-detection-규칙-기반-평가)
   - [2.7 Worst Prompt Set](#27-worst-prompt-set-자동-수집)
   - [2.8 Human-in-the-loop](#28-human-in-the-loop-사람-검토)
   - [2.10 테스트 실행 제한 및 최적화](#210-테스트-실행-제한-및-최적화)
3. [데이터베이스 설계](#3-데이터베이스-설계)
4. [API 설계](#4-api-설계)
5. [프론트엔드 설계](#5-프론트엔드-설계)
6. [보안 설계](#6-보안-설계)
7. [구현 현황](#7-구현-현황)
8. [테스트 시나리오 (프론트/UX 검증용)](#8-테스트-시나리오-프론트ux-검증용)

---

## 1. 시스템 아키텍처

### 1.1 전체 구조

```
┌─────────────────────────────────────────────────────────────────┐
│                        사용자 서비스                              │
│  ┌─────────────┐                                                │
│  │ Agent Code  │ ← agentguard.init()                            │
│  └──────┬──────┘                                                │
└─────────┼───────────────────────────────────────────────────────┘
          │ LLM API 호출
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AgentGuard Proxy                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Capture    │→ │   Forward    │→ │   Store      │          │
│  │   Request    │  │   to LLM     │  │   Snapshot   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AgentGuard Backend                          │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐   │
│  │   Agent    │ │   Replay   │ │   Signal   │ │   Worst    │   │
│  │  Detector  │ │   Replay   │ │   Engine   │ │   Prompt   │   │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘   │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AgentGuard Frontend                         │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐   │
│  │ Live View  │ │  Test Lab  │ │   Review   │ │   Alerts   │   │
│  │  (읽기전용) │ │  (실험용)  │ │   Queue    │ │   Panel    │   │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 기술 스택

| 레이어 | 기술 |
|--------|------|
| Frontend | Next.js 14+, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | FastAPI, Python 3.11+ |
| Database | PostgreSQL + JSONB |
| Cache | Redis |
| Visualization | React Flow |

### 1.3 계층 구조

```
Controller (API Layer)
    ↓
Service (Business Logic)
    ↓
Repository (Data Access)
    ↓
Database
```

---

## 2. 핵심 기능 설계

### 2.1 Live View (실제 섹션)

#### 개요
SDK에서 수집된 트래픽을 기반으로 에이전트 박스를 자동 감지하여 표시합니다.
**Railway Style: Auto-detect boxes only, user can draw arrows for visualization**

#### Core Principles

| Item | Description |
|------|-------------|
| **Auto-detect** | Boxes (agents) only |
| **Arrows** | User-drawn for visualization (NOT for testing) |
| **Warning** | "Arrows are user-drawn. May differ from actual flow." with [✕] dismiss |
| **Editing** | Read-only (cannot modify box content) |
| **Purpose** | Real-time traffic monitoring |

**Important: Live View arrows are for visual understanding only. To run chain tests, use Test Lab.**

#### 박스 감지 로직

```python
class AgentDetectorService:
    def detect_agents(self, project_id: str) -> List[AgentBox]:
        """트래픽에서 에이전트 박스 감지 (화살표 없음)"""
        snapshots = self.snapshot_repo.get_recent(project_id, limit=1000)
        
        agents = {}
        for snapshot in snapshots:
            # System Prompt에서 에이전트 역할 추론
            agent_name = self.infer_agent_name(snapshot)
            
            if agent_name not in agents:
                agents[agent_name] = AgentBox(
                    id=generate_id(),
                    name=agent_name,
                    model=snapshot.model,
                    system_prompt_preview=snapshot.system_prompt[:100],
                    stats=AgentStats()
                )
            
            # 통계 업데이트
            agents[agent_name].stats.total_calls += 1
            agents[agent_name].stats.total_latency_ms += snapshot.latency_ms
        
        return list(agents.values())
    
    def infer_agent_name(self, snapshot: Snapshot) -> str:
        """System Prompt에서 에이전트 이름 추론"""
        # 1. 헤더에 명시된 경우
        if snapshot.agent_name:
            return snapshot.agent_name
        
        # 2. System Prompt 분석으로 추론
        prompt = snapshot.system_prompt.lower()
        if "classifier" in prompt or "classify" in prompt:
            return "Classifier"
        elif "summarize" in prompt or "summary" in prompt:
            return "Summarizer"
        elif "write" in prompt or "writer" in prompt:
            return "Writer"
        elif "analyze" in prompt or "analyst" in prompt:
            return "Analyzer"
        else:
            return f"Agent_{snapshot.id[:8]}"
```

#### 시각화 데이터 형식

```typescript
interface AgentBox {
  id: string;
  name: string;
  model: string;
  system_prompt_preview: string;
  stats: {
    total_calls: number;
    success_rate: number;
    avg_latency_ms: number;
  };
  position: { x: number; y: number };  // 캔버스 위치
}

// 화살표는 사용자가 직접 추가
interface UserConnection {
  id: string;
  source_agent_id: string;
  target_agent_id: string;
  created_by: string;  // user_id
}
```

#### Box Limit Policy (Too Many Boxes)

Live View 및 Test Lab 캔버스는 **최대 30개 에이전트 박스**를 기준으로 설계된다.

**정책:**

| Condition            | Behavior                                                                 |
|----------------------|--------------------------------------------------------------------------|
| Boxes < 30           | 새 에이전트가 감지되면 자동으로 박스를 생성하여 캔버스에 그린다.        |
| Boxes = 30           | 더 이상 새 박스를 생성하지 않는다. 추가 트래픽은 `snapshots`/logs에만 저장. |
| Boxes > 30 (실제 값) | 화면에는 여전히 **최대 30개 박스만** 렌더링하고, 초과분은 시각화하지 않는다.  |
| No data              | Empty State 화면을 보여준다.                                            |

※ **중요**: SDK로 들어오는 호출은 개수와 상관없이 **항상 `snapshots` 테이블에 기록**된다.  
박스가 보이지 않는 에이전트도 logs/API를 통해 스냅샷을 조회할 수 있고,  
Live View는 “어떤 에이전트를 박스로 시각화할지”만 30개 이하로 제한한다.

```
Too Many Boxes UI (Live View):

┌─────────────────────────────────────────────────────────────┐
│  📡 Live View                                               │
│                                                             │
│  ⚠️ Too many agents detected (47 unique prompts)            │
│                                                             │
│  This view renders up to 30 agents for clarity.             │
│  Additional traffic is still recorded in snapshots/logs.    │
│                                                             │
│  [View Snapshots ▸]                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

```
Empty State UI:

┌─────────────────────────────────────────────────────────────┐
│  📡 Live View                                               │
│                                                             │
│                         📡                                  │
│                                                             │
│                   No data yet                               │
│                                                             │
│       Connect your SDK to see agents here                   │
│                                                             │
│              [📖 View SDK Integration Guide]                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### 2.2 Test Lab

#### Overview
Experimentation space where users can freely create agent boxes, draw arrows to define chain flow, and run tests.

#### Core Principles

| Item | Description |
|------|-------------|
| **Boxes** | Copy from Live View or create new |
| **Arrows** | Define actual test chain flow |
| **Group Box** | Auto-created when arrows connect boxes |
| **[▶ Test]** | Runs chain test following arrow direction |
| **Editing** | Full modification allowed |
| **Purpose** | Experimentation, testing, validation |

**Key Difference from Live View**: Arrows here define the actual test execution flow, not just visualization.

#### Getting Started

**Test Lab 탭 클릭 시 "Choose how to start" 화면 없이 바로 빈 캔버스로 진입한다.**

- 상단: `[Add Box]` `[Arrow Mode]`, 좌측 툴바(□ 박스 생성, 줌, Undo/Redo).
- Input Data는 박스마다 우측 패널 또는 "Load Test Data" 버튼으로 추가 (Live View Snapshot / CSV / Manual 등).
- Live View에서 가져오기는 Live View 화면의 `[Copy All to Test Lab]` 또는 박스별 `[Copy to Test Lab]` 로 처리.

#### Canvas UI

```
┌─────────────────────────────────────────────────────────────┐
│  🧪 Test Lab                       [Add Box] [Arrow Mode]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│     ┌───────────┐         ┌───────────┐                     │
│     │ Classifier│ ───────→│  Writer   │                     │
│     │  gpt-4o   │         │  gpt-4o   │                     │
│     │  [Edit]   │         │  [Edit]   │                     │
│     └───────────┘         └───────────┘                     │
│                                 │                           │
│                                 ▼                           │
│                          ┌───────────┐                      │
│                          │ Summarizer│                      │
│                          │  gpt-4o   │                      │
│                          │  [Edit]   │                      │
│                          └───────────┘                      │
│                                                             │
│  ※ 그룹 박스 없음. 개별 박스 + 화살표만 표시.                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘

※ Test Lab 캔버스 상단 헤더에 **[Add Box]** 와 [Arrow Mode]가 반드시 표시됨. (좌측 툴바는 줌/센터/Undo 공용.)

Chain Test Flow (when [▶ Test] clicked):
1. Input → Classifier
2. Classifier output → Writer input  
3. Writer output → Summarizer input
4. Final output from Summarizer
```

#### Box Edit Modal

```
┌─────────────────────────────────────┐
│  📦 Edit Agent                      │
├─────────────────────────────────────┤
│                                     │
│  Name: [Classifier          ]       │
│                                     │
│  Model: [gpt-4o            ▼]       │
│                                     │
│  System Prompt:                     │
│  ┌─────────────────────────────┐   │
│  │ You are a classifier that   │   │
│  │ categorizes customer...     │   │
│  │                             │   │
│  └─────────────────────────────┘   │
│                                     │
│  [Cancel]  [Save]                   │
│                                     │
└─────────────────────────────────────┘
```

#### Test Lab 데이터 구조

```python
class TestLabCanvas(Base):
    __tablename__ = "test_lab_canvases"
    
    id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id"))
    name = Column(String)
    
    # 캔버스 상태
    boxes = Column(JSONB)        # List[AgentBox]
    connections = Column(JSONB)  # List[Connection]
    
    created_at = Column(DateTime)
    updated_at = Column(DateTime)


class TestLabBox:
    id: str
    name: str
    model: str
    system_prompt: str
    position: Position
    
    # Live View에서 가져온 경우
    source_snapshot_ids: List[str]  # 테스트에 사용할 Snapshot들


class TestLabConnection:
    id: str
    source_box_id: str
    target_box_id: str
```

---

### 2.3 모델 변경 테스트 (Test Lab)

#### 개요
Snapshot을 새 모델로 재실행하여 결과를 비교합니다.

**핵심 원칙**: 프롬프트(System + User)는 그대로, 모델만 변경

#### Snapshot 구조

```python
class Snapshot(Base):
    __tablename__ = "snapshots"
    
    id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id"))
    
    # 핵심 데이터
    system_prompt = Column(Text)           # 튜닝 프롬프트
    user_message = Column(Text)            # 실제 사용자 입력
    model = Column(String)                 # 사용된 모델
    model_settings = Column(JSONB)         # temperature, max_tokens 등
    
    # 원본 응답
    original_response = Column(Text)
    original_latency_ms = Column(Integer)
    original_cost = Column(Float)
    
    # 메타데이터
    agent_name = Column(String)
    created_at = Column(DateTime)
```

#### Replay 실행 로직

```python
class ReplayService:
    async def run_replay(
        self,
        project_id: str,
        snapshot_ids: List[str],
        target_model: str,
        repeat_count: int = 100,
        signal_config: SignalConfig = None
    ) -> ReplayResult:
        """모델만 바꿔서 재실행"""
        
        results = []
        for snapshot_id in snapshot_ids:
            snapshot = await self.snapshot_repo.get(snapshot_id)
            
            for i in range(repeat_count):
                # 새 모델로 재실행
                response = await self.llm_client.call(
                    model=target_model,
                    system_prompt=snapshot.system_prompt,
                    user_message=snapshot.user_message,
                    settings=snapshot.model_settings
                )
                
                # Signal 평가
                evaluation = await self.signal_engine.evaluate(
                    original=snapshot.original_response,
                    new=response.content,
                    config=signal_config
                )
                
                results.append(ReplayRun(
                    snapshot_id=snapshot_id,
                    iteration=i,
                    response=response.content,
                    latency_ms=response.latency_ms,
                    evaluation=evaluation
                ))
        
        return self.aggregate_results(results)
```

#### 결과 집계

```python
class ReplayResult:
    total_runs: int
    safe_count: int           # Signal 모두 통과
    needs_review_count: int   # 일부 Signal 실패
    critical_count: int       # 중요 Signal 실패
    
    success_rate: float       # safe_count / total_runs
    avg_latency_ms: float
    cost_estimate: float
    
    failed_cases: List[FailedCase]  # Worst Set에 추가될 후보
```

---

### 2.4 프롬프트 변경 테스트 (Test Lab)

#### 개요
System Prompt(튜닝 프롬프트)를 변경하고 실제 사용자 입력으로 실행합니다.

**핵심 원칙**: 모델은 그대로, 튜닝 프롬프트만 변경

#### 실행 로직

```python
class PromptTestService:
    async def run_prompt_test(
        self,
        project_id: str,
        new_system_prompt: str,
        snapshot_ids: List[str],
        sample_percentage: float = 0.5,
        signal_config: SignalConfig = None
    ) -> PromptTestResult:
        """프롬프트만 바꿔서 실행"""
        
        sampled_ids = random.sample(
            snapshot_ids, 
            int(len(snapshot_ids) * sample_percentage)
        )
        
        results = []
        for snapshot_id in sampled_ids:
            snapshot = await self.snapshot_repo.get(snapshot_id)
            
            response = await self.llm_client.call(
                model=snapshot.model,
                system_prompt=new_system_prompt,
                user_message=snapshot.user_message,
                settings=snapshot.model_settings
            )
            
            evaluation = await self.signal_engine.evaluate(
                original=snapshot.original_response,
                new=response.content,
                config=signal_config
            )
            
            results.append(PromptTestRun(
                snapshot_id=snapshot_id,
                original_prompt=snapshot.system_prompt,
                new_prompt=new_system_prompt,
                response=response.content,
                evaluation=evaluation
            ))
        
        return self.aggregate_results(results)
```

---

### 2.5 Chain Testing (체인 테스트)

#### 개요
Test Lab에서 화살표로 연결된 여러 에이전트를 순서대로 실행하여 전체 체인을 테스트합니다.

#### 체인 실행 로직

```python
class ChainTestService:
    async def run_chain_test(
        self,
        canvas_id: str,
        input_message: str,
        signal_config: SignalConfig = None
    ) -> ChainTestResult:
        """체인 테스트 실행 - 연결된 박스들을 순서대로 실행"""
        
        canvas = await self.canvas_repo.get(canvas_id)
        
        # 연결 순서대로 박스 정렬 (토폴로지 정렬)
        ordered_boxes = self.topological_sort(
            canvas.boxes, 
            canvas.connections
        )
        
        chain_results = []
        current_input = input_message
        
        for box in ordered_boxes:
            # 각 에이전트 실행
            response = await self.llm_client.call(
                model=box.model,
                system_prompt=box.system_prompt,
                user_message=current_input
            )
            
            chain_results.append(ChainStep(
                box_id=box.id,
                box_name=box.name,
                input=current_input,
                output=response.content,
                latency_ms=response.latency_ms
            ))
            
            # 다음 에이전트의 입력으로 사용
            current_input = response.content
        
        # 최종 결과 Signal 평가
        final_evaluation = await self.signal_engine.evaluate(
            original=None,  # 체인 테스트는 원본 없음
            new=current_input,
            config=signal_config
        )
        
        return ChainTestResult(
            steps=chain_results,
            final_output=current_input,
            evaluation=final_evaluation,
            total_latency_ms=sum(s.latency_ms for s in chain_results)
        )
```

#### 체인 테스트 UI

```
체인 테스트 결과:

┌─────────────────────────────────────────────────────────────┐
│  🔗 Chain Test Result                                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Input: "고객님, 환불 요청드립니다"                           │
│                                                             │
│  Step 1: Classifier (0.3s)                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Output: "category: refund_request"                  │   │
│  └─────────────────────────────────────────────────────┘   │
│           │                                                 │
│           ▼                                                 │
│  Step 2: Writer (1.2s)                                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Output: "안녕하세요, 환불 요청을 접수했습니다..."     │   │
│  └─────────────────────────────────────────────────────┘   │
│           │                                                 │
│           ▼                                                 │
│  Step 3: Summarizer (0.5s)                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Output: "[요약] 환불 요청 접수 완료"                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Total: 2.0s | Status: ✅ SAFE                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### 2.6 Signal Detection (Evaluation Engine)

#### Overview
Rule-based, metric-based, and LLM-as-Judge evaluators to detect problematic responses.

#### Signal Categories (Total: 13)

```python
class SignalType(Enum):
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 📏 Rule-based (Free, Fast)
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    LENGTH_CHANGE = "length_change"       # Response length deviation from baseline
    KEYWORD_CHECK = "keyword_check"       # Required/forbidden keywords
    JSON_SCHEMA = "json_schema"           # JSON validity + required fields
    REGEX_PATTERN = "regex_pattern"       # Pattern matching (with presets)
    
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 📐 Metric-based (Free~Low cost)
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    ROUGE_SCORE = "rouge_score"           # Text overlap with expected output
    SEMANTIC_SIMILARITY = "semantic_similarity"  # Meaning similarity (~$0.0001)
    TOKEN_LIMIT = "token_limit"           # Max output tokens
    COST_LIMIT = "cost_limit"             # Max cost per call
    LATENCY_LIMIT = "latency_limit"       # Max response time
    
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 🤖 LLM-as-Judge (Higher cost)
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    CUSTOM_RUBRIC = "custom_rubric"       # Custom evaluation rubric (~$0.005)
    FACTUAL_ACCURACY = "factual_accuracy" # RAG hallucination check (~$0.01)
    SAFETY_CHECK = "safety_check"         # Toxicity, PII detection (~$0.003)
    
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 💻 Custom Code (Free, requires dev)
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    WEBHOOK = "webhook"                   # External API evaluation
```

#### Signal Details

| Category | Signal | Cost | Description |
|----------|--------|------|-------------|
| Rule-based | Length Change | Free | Alerts if response length differs from baseline by ±N% |
| Rule-based | Keyword Check | Free | Checks for required/forbidden words (tag-style UI) |
| Rule-based | JSON Schema | Free | Validates JSON format + required fields |
| Rule-based | Regex Pattern | Free | Pattern matching with presets (Yes/No, numbers, etc.) |
| Metric-based | ROUGE Score | Free | Measures text overlap with expected output |
| Metric-based | Semantic Similarity | ~$0.0001 | Embedding-based meaning comparison |
| Metric-based | Token Limit | Free | Enforces max output token count |
| Metric-based | Cost Limit | Free | Enforces max cost per API call |
| Metric-based | Latency Limit | Free | Enforces max response time |
| LLM-as-Judge | Custom Rubric | ~$0.005 | LLM scores response 1-5 based on custom criteria |
| LLM-as-Judge | Factual Accuracy | ~$0.01 | Checks if response matches provided context (RAG) |
| LLM-as-Judge | Safety Check | ~$0.003 | Detects toxicity, PII, bias |
| Custom Code | Webhook | Free | Calls external API for custom evaluation |

#### Default Signals (Zero-config)

설정이 없을 때 아래 **5개**가 기본으로 활성화된다. (다른 서비스에서 가장 많이 쓰는 항목 기준.)

| # | Signal | 기본값 | 비고 |
|---|--------|--------|------|
| 1 | **Length Change** | ±50% threshold | 응답 길이 변화 |
| 2 | **Latency Limit** | 30 seconds max | 응답 시간 상한 |
| 3 | **Token Limit** | 4096 max output tokens | 호출당 토큰 상한 |
| 4 | **Cost Limit** | $0.10 per call | 호출당 비용 상한 |
| 5 | **JSON Schema** | (빈 스키마 또는 통과) | JSON 유효성·필수 필드. 기본값은 “검사 안 함” 또는 통과 처리. |

When no signals are configured, the above five are enabled by default. These defaults provide basic monitoring without any API costs (rule/metric only).

**정도(임계값·한도) 설정**  
기본 5개를 포함해 **모든 시그널**은 각각 정도(임계값, 한도, 스키마 등)를 사용자가 설정할 수 있다. 아무것도 만지지 않으면 위 표의 **기본값**을 사용한다. (예: Length Change ±50% → 사용자가 30%로 변경 가능, Token Limit 4096 → 2048로 변경 가능.)

#### 기본 5개 시그널 적용 방식

- **Zero-config 기본값**  
  - 프로젝트/에이전트에 별도의 Signal 설정이 없는 경우, 위 표의 **기본 5개 시그널**(Length Change, Latency Limit, Token Limit, Cost Limit, JSON Schema)을 **런타임 기본값으로 자동 적용**한다.
  - 이때 설정 레코드가 DB에 없어도, SignalEngine은 내부적으로 기본 5개 구성을 사용한다.

- **명시적 설정이 있는 경우**  
  - 사용자가 Test Lab / Settings에서 Signal 구성을 저장하면, 해당 구성(config row)이 **기본 5개 + 추가 시그널을 모두 포함한 단일 소스**가 된다.
  - 이후부터는 SignalEngine은 DB에 저장된 구성만을 사용하며, Zero-config 기본값은 사용하지 않는다.

- **UI 표기 (Signals: N/M Pass)**  
  - “Signals: N/M Pass”에서 **M은 현재 적용 중인 시그널 개수**(기본 5개 + 사용자가 추가한 개수)를 의미한다.
  - Zero-config 상태에서는 M = 5, 사용자가 시그널을 추가/삭제하면 그에 따라 M이 변한다.

#### Signal Engine 구현

```python
class SignalEngine:
    async def evaluate(
        self,
        original: str,
        new: str,
        config: SignalConfig
    ) -> SignalResult:
        results = []
        
        for signal_type, params in config.signals.items():
            signal = self.signals[signal_type]
            result = await signal.check(original, new, params)
            results.append(result)
        
        # 최종 상태 결정
        if any(r.severity == "critical" and not r.passed for r in results):
            status = "CRITICAL"
        elif any(not r.passed for r in results):
            status = "NEEDS_REVIEW"
        else:
            status = "SAFE"
        
        return SignalResult(status=status, details=results)
```

---

### 2.7 Worst Prompt Set (자동 수집)

#### 개요
Signal에서 CRITICAL/NEEDS_REVIEW 판정된 케이스를 자동으로 수집합니다.

#### 수집 로직

```python
class WorstPromptService:
    async def collect_from_replay(
        self,
        replay_result: ReplayResult
    ) -> List[WorstPrompt]:
        """Replay 결과에서 Worst Prompt 수집"""
        
        worst_prompts = []
        for failed_case in replay_result.failed_cases:
            existing = await self.repo.find_similar(
                project_id=failed_case.project_id,
                user_message=failed_case.user_message,
                similarity_threshold=0.9
            )
            
            if not existing:
                worst_prompt = WorstPrompt(
                    project_id=failed_case.project_id,
                    snapshot_id=failed_case.snapshot_id,
                    system_prompt=failed_case.system_prompt,
                    user_message=failed_case.user_message,
                    original_response=failed_case.original_response,
                    failed_response=failed_case.failed_response,
                    failure_reason=failed_case.signal_result.status,
                    failure_signals=failed_case.signal_result.details,
                    source="model_change",  # Test Lab에서 모델만 변경 후 실행한 결과
                    created_at=datetime.utcnow()
                )
                worst_prompts.append(worst_prompt)
        
        await self.repo.bulk_create(worst_prompts)
        return worst_prompts
```

> **구현 노트**  
> 위 `WorstPromptService` 예제는 개념 설명용이며, 실제 구현에서는 별도의 `worst_prompts` 테이블을 두지 않고,  
> `snapshots` / `test_results` 테이블의 **`is_worst` 플래그**만으로 Worst Set을 관리한다.  
> 예: `UPDATE test_results SET is_worst = true WHERE id = ?`.

---

### 2.8 Human-in-the-loop (사람 검토)

#### 개요
NEEDS_REVIEW 상태인 케이스에 대해 사람이 최종 판정합니다.

#### Review 워크플로우

```
Signal 평가
    │
    ├─ SAFE ───────────────→ 자동 통과
    │
    ├─ CRITICAL ───────────→ Worst Set에 자동 추가
    │
    └─ NEEDS_REVIEW ───────→ Review Queue
                                  │
                                  ▼
                            사람 검토
                                  │
                            ┌─────┴─────┐
                            ▼           ▼
                           OK         FAIL
                            │           │
                            ▼           ▼
                         무시      Worst Set 추가
```

#### Worst / Review 상태 관리 원칙 (Source of Truth)

- **Worst 목록 필터**  
  - Worst 목록(탭/뷰)은 **`is_worst = true`** 레코드만을 기준으로 한다.
  - Live View Worst: `snapshots WHERE is_worst = true AND agent_id = ?`
  - Test Lab Worst: `test_results WHERE is_worst = true AND agent_id = ?`

- **Review Queue 필터**  
  - Review Queue(NEEDS_REVIEW 리스트)는 **`status = "NEEDS_REVIEW"`** 인 레코드만을 보여준다.
  - 사람이 최종 결정을 내리면 `status`는 `RESOLVED_OK` 또는 `RESOLVED_WORST` 등으로 변경되고, Review Queue에서는 사라진다.

- **사람 결정 이후**  
  - `OK`: `status = RESOLVED_OK`, `is_worst = false` 유지. Worst 목록에는 포함되지 않는다.
  - `Mark as Worst`: `status = RESOLVED_WORST`, `is_worst = true`로 설정하여 Worst 목록에 포함된다.
  - `Ignore`: 기록은 남기되, Review Queue 필터에서 제외되도록 별도 상태(`IGNORED` 등)로 변경할 수 있다.

- **자동 판정과의 관계**  
  - SignalEngine의 자동 판정(SAFE / NEEDS_REVIEW / CRITICAL)은 **초기 상태**를 결정할 뿐이고,
  - 최종 Worst 여부에 대한 **단일 소스 오브 트루스**는 `is_worst` 플래그이다.

---

### 2.9 Agent Trajectory (자동 화살표)

#### 개요
SDK에서 `trace()`를 사용하면 연결된 LLM 호출을 자동으로 그룹핑하고, Live View에서 화살표를 자동 생성합니다.

#### SDK 사용법

```python
import agentguard

client = agentguard.wrap(openai)

# 방법 1: 기본 trace (순차 실행)
with agentguard.trace("user-request-123"):
    r1 = client.chat.completions.create(...)  # Main Agent
    r2 = client.chat.completions.create(...)  # Weather Agent
    r3 = client.chat.completions.create(...)  # Main Agent 최종

# 방법 2: 병렬 실행 명시
with agentguard.trace("user-request-456") as t:
    r1 = client.chat.completions.create(...)  # Main Agent
    
    with t.parallel():  # 병렬 블록
        r2 = client.chat.completions.create(...)  # Weather 서울
        r3 = client.chat.completions.create(...)  # Weather 부산
    
    r4 = client.chat.completions.create(...)  # Main Agent 최종
```

#### Live View 자동 화살표

```
trace() 사용 시:
         ┌───────────┐
         │Main Agent │
         └─────┬─────┘
               │
        ┌──────┴──────┐       ← 병렬 자동 감지!
        ▼             ▼
  ┌───────────┐ ┌───────────┐
  │Weather 서울│ │Weather 부산│
  └─────┬─────┘ └─────┬─────┘
        └──────┬──────┘
               ▼
         ┌───────────┐
         │Main 최종  │
         └───────────┘

※ trace_id와 parent_span_id 기반으로 자동 생성
```

#### Graceful Degradation

| SDK 사용 | 결과 |
|----------|------|
| `trace()` 사용 | 자동 화살표 + 병렬 표시 |
| `trace()` 미사용 | 개별 Snapshot만 (수동 화살표 가능) |
| `wrap()` 미사용 | 캡처 안 됨 |

```
trace() 없는 경우 UI 안내:

┌──────────────────────────────────────────────────────────────┐
│  ⓘ 화살표가 없나요?                                          │
│    SDK에서 trace()를 사용하면 자동으로 연결됩니다.           │
│    [사용법 보기]                                             │
└──────────────────────────────────────────────────────────────┘
```

---

### 2.10 테스트 실행 제한 및 최적화

#### 개요
서비스 부담 방지 및 공정 사용을 위한 테스트 실행 제한 정책. 플랜별 한도는 `subscription_limits.py`의 `PLAN_LIMITS`에 정의한다.

#### 총 호출 수 계산식
테스트 1회 총 LLM 호출 수는 다음 식으로 계산한다.

```
총 호출 수 = 인풋 개수 × 체인 스텝 수 × repeat_count
```

**예시**:
- 인풋 10개, 체인 스텝 3, repeat 2 → **60 calls**
- 인풋 100개, 체인 스텝 1, repeat 5 → **500 calls**

#### 플랜별 제한 표

| 제한 항목 | Free | Indie | Startup | Pro | Enterprise |
|-----------|------|-------|---------|-----|------------|
| `input_prompts_per_test` | 50 | 200 | 500 | 1,000 | 5,000 (협의 가능) |
| `repeat_count_per_test` | 10 | 50 | 100 | 300 | 1,000 (협의 가능) |
| `data_retention_days` | 7 | 30 | 90 | 180 | 365 |
| `csv_import_row_limit` | 200 | 500 | 1,000 | 2,000 | 10,000 (협의 가능) |
| `total_calls_per_single_test` | 1,000 | 5,000 | 50,000 | 200,000 | 1,000,000 (협의 가능) |
| `concurrent_tests_per_project` | 1 | 1 | 1 | 1 | 1 (협의 시 확장 가능) |

**한 번에 하나만 실행**: 전 플랜 1로 통일. 적용 단위는 **사용자당** (다른 프로젝트에서 동시 실행 불가). 과부하 방지 목적. 테스트는 하나 끝난 뒤 다음 실행하면 됨.

#### 한도 노출 (API)
테스트 관련 한도 5개는 프론트에서 한도 표시·검증(T38–T42)을 위해 API로 노출한다.

- **노출 경로**: `GET /api/v1/subscription`(현재 구독), `GET /api/v1/subscription/plans`(전체 플랜)의 응답 필드 `limits`.
- **추가 키** (모두 `limits` 객체에 포함, snake_case 유지):
  - `input_prompts_per_test`
  - `repeat_count_per_test`
  - `csv_import_row_limit`
  - `total_calls_per_single_test`
  - `concurrent_tests_per_project`
- **구현 위치**: `SubscriptionService.get_user_plan()` 의 `limits` 구성, `GET /subscription/plans` 응답의 `limits` 구성.

#### 한도 검증 (백엔드)
Replay·Regression(및 추후 Chain run) 실행 전에 플랜 한도를 검사한다.

- **검사 위치**: `POST /replay/{project_id}/run`, `POST /projects/{project_id}/regression/test` (및 추후 Chain run API).
- **검사 항목**: `input_prompts_per_test`(인풋/스냅샷/테스트 케이스 수), `total_calls_per_single_test`(예상 총 호출 수). `concurrent_tests_per_project` = 1(사용자당 한 번에 하나) — 실행 중이면 새 실행 거절 또는 UI에서 비활성화.
- **한도 소스**: `SubscriptionService.get_user_plan(current_user.id)` → `plan_type` 기준으로 `PLAN_LIMITS`에서 `limits` 조회.
- **실패 시**: **HTTP 403 Forbidden**, 응답 본문에 **사용자용 설명** 반드시 포함. `error.message`에 왜 오류가 났는지 문장으로 넣고(예: `"Input limit exceeded. Your plan allows up to {limit} inputs per test (requested: {count}). Upgrade to run larger tests."`), `error.code`/`error.details`(limit, requested 등)는 UI에서 업그레이드 유도 등에 활용. **모든 한도·검증 오류는 403/402 등 코드만 보여주지 말고 이유 설명을 노출**하여 사용자 혼란을 줄인다.
- **자동 테스트** (구현 반영):
  - **Unit** `tests/unit/test_test_limits.py`: `check_test_run_limits` — 한도 이하 시 예외 없음, 인풋 초과 시 403 + `LIMIT_INPUTS_PER_TEST`, 호출 수 초과 시 403 + `LIMIT_TOTAL_CALLS_PER_TEST`.
  - **Integration** `tests/integration/test_api_test_limits.py`: Replay `POST /replay/{project_id}/run`에 플랜 한도 초과 `snapshot_ids` 개수로 요청 시 403 및 `code`/`limit`/`requested` 검증. Regression `POST /projects/{project_id}/regression/test`에 플랜 한도 초과 `test_cases` 개수로 요청 시 403 및 동일 검증.

#### UI/UX 대응
- **테스트 실행 전**: 예상 호출 수 표시 (예: `~N calls`)
- **한도 초과 시**: 즉시 경고 또는 실행 불가 메시지. **오류 시 사용자용 설명**: 한도·검증 등 규격 외 행동으로 403/400 등이 나올 때 **코드만 보여주지 말고, 왜 오류가 났는지 설명 문구를 반드시 노출**. 백엔드는 `error.message`에 이유 문자열을 넣고, 프론트는 해당 메시지를 사용자에게 표시한다. 모든 경우 동일 원칙 적용.
- **한 번에 하나만 실행**: 테스트가 **실행 중일 때** 다른 테스트 시작 불가 — **다른 박스/ [▶ Test] 전부 비활성화**. 하나 끝난 뒤 다음 실행.
- **향후**: 대량 테스트는 예약/배치 실행 안내

---

## 3. 데이터베이스 설계

### 3.1 핵심 테이블

```sql
-- 스냅샷 (Live View - 모든 LLM 호출 기록)
CREATE TABLE snapshots (
    id VARCHAR PRIMARY KEY,
    project_id VARCHAR REFERENCES projects(id),
    agent_id VARCHAR(100),              -- 어떤 박스(에이전트)인지
    
    -- Agent Trajectory (자동 화살표용)
    trace_id VARCHAR(100),              -- 같은 trace = 연결된 호출
    parent_span_id VARCHAR,             -- 부모 span (병렬/계층 구조)
    span_order INTEGER,                 -- trace 내 순서
    is_parallel BOOLEAN DEFAULT FALSE,  -- 병렬 호출 여부
    
    system_prompt TEXT,
    user_message TEXT,
    model VARCHAR(100),
    model_settings JSONB,
    
    response TEXT,
    latency_ms INTEGER,
    tokens_used INTEGER,
    cost DECIMAL(10, 6),
    
    signal_result JSONB,                -- Signal 평가 결과
    is_worst BOOLEAN DEFAULT FALSE,     -- Worst 여부
    worst_status VARCHAR(20),           -- null/unreviewed/fixed/golden
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- 테스트 결과 (Test Lab - 실험 기록)
CREATE TABLE test_results (
    id VARCHAR PRIMARY KEY,
    project_id VARCHAR REFERENCES projects(id),
    agent_id VARCHAR(100),              -- 어떤 박스(에이전트)인지
    test_run_id VARCHAR,                -- 테스트 세션 ID
    
    -- Chain/Parallel 테스트용
    step_order INTEGER,                 -- 체인 내 순서
    parent_step_id VARCHAR,             -- 부모 step (병렬 구조)
    is_parallel BOOLEAN DEFAULT FALSE,  -- 병렬 실행 여부
    
    input TEXT,
    system_prompt TEXT,
    model VARCHAR(100),
    
    response TEXT,
    latency_ms INTEGER,
    tokens_used INTEGER,
    cost DECIMAL(10, 6),
    
    signal_result JSONB,                -- Signal 평가 결과
    is_worst BOOLEAN DEFAULT FALSE,     -- Worst 여부
    worst_status VARCHAR(20),           -- null/unreviewed/fixed/golden
    
    -- 비교용 (Live View 원본 참조)
    baseline_snapshot_id VARCHAR REFERENCES snapshots(id),
    baseline_response TEXT,
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- 테스트 실행 세션
CREATE TABLE test_runs (
    id VARCHAR PRIMARY KEY,
    project_id VARCHAR REFERENCES projects(id),
    
    name VARCHAR(200),
    test_type VARCHAR(50),              -- single/chain
    agent_config JSONB,                 -- model, system_prompt 등
    signal_config JSONB,                -- 사용된 Signal 설정
    
    total_count INTEGER,
    pass_count INTEGER,
    fail_count INTEGER,
    
    created_at TIMESTAMP DEFAULT NOW()
);

#### Live View vs Test Results 저장 원칙

- **Live View = snapshots**  
  - SDK를 통해 들어온 **실시간/프로덕션 트래픽**은 모두 `snapshots` 테이블에 저장한다.
  - Live View UI에서 보이는 것은 `snapshots` 기반이며, **편집/설정 변경은 불가능**하고 모니터링 전용이다.

- **실험/테스트 = test_results**  
  - Replay, Regression(Test Run), Test Lab, Chain Testing 등의 **실험·검증 결과**는 모두 `test_results` (및 `test_runs`, `test_lab_canvases`) 계열 테이블에 저장한다.
  - Test Results / Worst / Review UI는 `test_results` 기반으로 동작한다.

- **source 필드**  
  - `test_results.source` (또는 동등한 필드)를 사용하여 결과의 출처를 구분한다. 예:
    - `replay`, `regression`, `test_lab`, `chain_test` 등
  - 화면·API에서는 `source`로 필터링하여 각 기능별 결과를 나눠 보여준다.

-- Test Lab 캔버스
CREATE TABLE test_lab_canvases (
    id VARCHAR PRIMARY KEY,
    project_id VARCHAR REFERENCES projects(id),
    name VARCHAR(200),
    
    -- boxes: JSONB 배열. 각 항목 구조는 아래 Box JSONB 스키마 참조.
    boxes JSONB,        -- List[TestLabBox], ADDITIONAL_DATA_SPEC.md의 additional_data 포함
    connections JSONB,  -- List[TestLabEdge] (id, source, target, order_number)
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Box JSONB 스키마 (boxes[] 한 요소): ADDITIONAL_DATA_SPEC.md 참조.
-- { "id", "label", "position", "system_prompt", "model", "input_data_ids", "additional_data": AdditionalDataItem[] }

-- Live View 사용자 연결 (선택적 화살표)
CREATE TABLE live_view_connections (
    id VARCHAR PRIMARY KEY,
    project_id VARCHAR REFERENCES projects(id),
    
    source_agent_name VARCHAR(100),
    target_agent_name VARCHAR(100),
    
    created_by VARCHAR REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Note: Worst Prompts are now stored within snapshots and test_results tables
-- using is_worst=true flag. No separate worst_prompts table needed.
-- 
-- To query Worst from Live View: 
--   SELECT * FROM snapshots WHERE is_worst = true AND agent_id = ?
-- To query Worst from Test Lab:
--   SELECT * FROM test_results WHERE is_worst = true AND agent_id = ?

-- Signal 설정
CREATE TABLE signal_configs (
    id VARCHAR PRIMARY KEY,
    project_id VARCHAR REFERENCES projects(id),
    
    name VARCHAR(100),
    signal_type VARCHAR(50),
    params JSONB,
    severity VARCHAR(20),
    enabled BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- Replay 결과
CREATE TABLE replay_runs (
    id VARCHAR PRIMARY KEY,
    project_id VARCHAR REFERENCES projects(id),
    
    run_type VARCHAR(20),  -- model_change, prompt_change, chain_test
    target_model VARCHAR(100),
    snapshot_count INTEGER,
    repeat_count INTEGER,
    
    safe_count INTEGER,
    needs_review_count INTEGER,
    critical_count INTEGER,
    
    total_latency_ms BIGINT,
    total_cost DECIMAL(10, 4),
    
    status VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

-- Review Queue
CREATE TABLE reviews (
    id VARCHAR PRIMARY KEY,
    project_id VARCHAR REFERENCES projects(id),
    replay_run_id VARCHAR REFERENCES replay_runs(id),
    
    original_response TEXT,
    new_response TEXT,
    signal_result JSONB,
    
    verdict VARCHAR(20),
    reviewer_id VARCHAR,
    reviewed_at TIMESTAMP,
    notes TEXT,
    
    created_at TIMESTAMP DEFAULT NOW()
);
```

-- Agent 표시 설정 (이름 변경)
CREATE TABLE agent_display_settings (
    id VARCHAR PRIMARY KEY,
    project_id VARCHAR REFERENCES projects(id),
    
    -- System Prompt 해시로 에이전트 식별
    system_prompt_hash VARCHAR(64) UNIQUE,
    
    -- 사용자 설정
    display_name VARCHAR(100),      -- 사용자가 지정한 이름 (null이면 System Prompt 앞 20자)
    is_deleted BOOLEAN DEFAULT FALSE, -- 삭제 상태 (true면 UI에서 안 보임, 새 호출 오면 자동 복구)
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### 3.2 데이터 저장 구조

```
┌─────────────────────────────────────────────────────────────────┐
│                        데이터 저장 구조                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  snapshots (Live View - 실제 트래픽)                             │
│  ├─ 모든 LLM 호출 기록                                           │
│  ├─ is_worst=true: Signal 실패 케이스                            │
│  └─ worst_status: unreviewed/fixed/golden                       │
│                                                                 │
│  test_results (Test Lab - 실험 기록)                             │
│  ├─ 테스트 실행 결과                                             │
│  ├─ is_worst=true: Signal 실패 케이스                            │
│  └─ baseline_response: 비교용 원본                               │
│                                                                 │
│  agent_display_settings (UI 설정)                                │
│  ├─ display_name: 사용자 지정 이름                               │
│  └─ is_deleted: 삭제 시 true (새 호출 오면 false로 복구)          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

※ Worst는 별도 테이블 없이 is_worst 플래그로 관리
※ Live View Worst: snapshots WHERE is_worst=true AND agent_id=?
※ Test Lab Worst: test_results WHERE is_worst=true AND agent_id=?
※ 박스 삭제 시 is_deleted=true, 같은 System Prompt 호출 시 자동 복구
```

### 3.3 인덱스

```sql
-- Snapshots (Live View)
CREATE INDEX idx_snapshots_project_created ON snapshots(project_id, created_at DESC);
CREATE INDEX idx_snapshots_agent ON snapshots(project_id, agent_id);
CREATE INDEX idx_snapshots_worst ON snapshots(project_id, agent_id, is_worst) WHERE is_worst = true;
CREATE INDEX idx_snapshots_system_prompt_hash ON snapshots(project_id, md5(system_prompt));
CREATE INDEX idx_snapshots_trace ON snapshots(project_id, trace_id);  -- Agent Trajectory

-- Test Results (Test Lab)
CREATE INDEX idx_test_results_project ON test_results(project_id, created_at DESC);
CREATE INDEX idx_test_results_agent ON test_results(project_id, agent_id);
CREATE INDEX idx_test_results_worst ON test_results(project_id, agent_id, is_worst) WHERE is_worst = true;
CREATE INDEX idx_test_results_run ON test_results(test_run_id);

-- Others
CREATE INDEX idx_test_runs_project ON test_runs(project_id, created_at DESC);
CREATE INDEX idx_reviews_pending ON reviews(project_id, verdict) WHERE verdict IS NULL;
CREATE INDEX idx_canvases_project ON test_lab_canvases(project_id);
CREATE INDEX idx_agent_settings_project ON agent_display_settings(project_id);
```

---

## 4. API 설계

**관련 문서**:
- [docs/API_SPEC.md](API_SPEC.md) - Request/Response 스키마
- [docs/ERROR_HANDLING_AND_EDGE_CASES.md](ERROR_HANDLING_AND_EDGE_CASES.md) - 에러 코드 및 엣지 케이스
- [docs/ADDITIONAL_DATA_SPEC.md](ADDITIONAL_DATA_SPEC.md) - Additional Data 형식

### 4.1 핵심 엔드포인트 요약

```yaml
# Live View
GET  /api/v1/projects/{id}/live-view/agents
GET  /api/v1/projects/{id}/live-view/agents/{agent_id}/settings
PATCH /api/v1/projects/{id}/live-view/agents/{agent_id}/settings
DELETE /api/v1/projects/{id}/live-view/agents/{agent_id}
GET  /api/v1/projects/{id}/live-view/connections
POST /api/v1/projects/{id}/live-view/connections
DELETE /api/v1/projects/{id}/live-view/connections/{conn_id}
GET  /api/v1/projects/{id}/snapshots  # agent_id, is_worst, period 등 쿼리

# Test Lab
GET  /api/v1/projects/{id}/test-lab/canvases
POST /api/v1/projects/{id}/test-lab/canvases
PUT  /api/v1/projects/{id}/test-lab/canvases/{canvas_id}
POST /api/v1/projects/{id}/test-lab/run          # chain/single test
GET  /api/v1/projects/{id}/test-lab/runs/{run_id}
GET  /api/v1/projects/{id}/test-lab/results
POST /api/v1/projects/{id}/test-lab/import-csv   # Load Test Data
POST /api/v1/projects/{id}/test-lab/results/save
POST /api/v1/projects/{id}/test-lab/results/mark-worst

# Signal
GET  /api/v1/projects/{id}/signal-config/default
GET  /api/v1/projects/{id}/live-view/agents/{agent_id}/signal-config
PUT  /api/v1/projects/{id}/live-view/agents/{agent_id}/signal-config
```

---

## 5. Frontend Design

### 5.1 Global Layout

#### 5.1.1 Top Navigation Bar (Already Implemented)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ AG  bongborobong Free ▼  / Organizations / bongborobong / Project  Q Search ⌘K  ⓘ Help  (B) 🔔 │
└──────────────────────────────────────────────────────────────────────────────────────┘

Components:
├── AG                        → AgentGuard logo (home link)
├── bongborobong Free ▼       → Account name + Plan badge + Dropdown menu
├── / Organizations / ...     → Breadcrumb navigation (Org / Project)
├── Q Search ⌘K               → Global search with keyboard shortcut
├── ⓘ Help                    → Help/Documentation
└── (B) 🔔                    → User avatar + Notification badge (Alerts). 클릭 시 Alerts 패널을 열고, 각 Alert 항목을 클릭하면 해당 Project의 Live View/Test Lab로 딥링크되어 관련 박스/Worst 케이스를 바로 보여준다.
```

#### 5.1.2 Overall Page Structure

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ AG  bongborobong Free ▼  / Organizations / org / Project   Q Search ⌘K  ⓘ Help  (B) 🔔 │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ ┌───┐                                                                           ┌────┤
│ │:::│                                         [Copy All to Test Lab]            │Live│◄─ Active
│ ├───┤                                                                           │View│   (protruding)
│ │ + │                                                                           ├────┤
│ │ - │                                                                           │Test│
│ │ ⛶ │                      (Canvas Area)                                        │Lab │
│ │ ↩ │                                                                           ├────┤
│ │ ↪ │                                                                           │Snap│
│ └───┘                                                                           │shots│
│                                                                                 └────┤
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

#### 5.1.3 Component Details

| Component | Location | Description |
|-----------|----------|-------------|
| **Top Nav Bar** | Top | AG logo, Account selector, Breadcrumbs, Search, Help, Profile, Alerts (🔔) |
| **Left Toolbar** | Left side | 9-dot menu (:::), Zoom (+/-), Center (⛶), Undo/Redo |
| **Copy Button** | Top right (below nav) | "Copy All to Test Lab" - copies all boxes |
| **Bookmark Tabs** | Right edge | Live View, Test Lab, Snapshots |
| **Canvas** | Center | Main content area |

#### 5.1.4 Bookmark Tab Navigation

```
Right Edge Bookmark Tabs:
                                                              
                                                         ┌─────────┐
  Active tab protrudes more →                            │  Live   │◄── Active (wider)
                                                         │  View   │
                                                      ┌──┴─────────┤
                                                      │  Test Lab  │
                                                      ├────────────┤
                                                      │ Snapshots  │
                                                      └────────────┘

Animation: 
- Tab slide-in effect on switch (200ms ease-out)
- Active tab expands horizontally
- Content cross-fade transition
```

**Behavior**:
- Active tab protrudes ~8px more than inactive tabs
- Click inactive tab → slide animation → content switches
- Active tab has highlight color/border

#### 5.1.4a Snapshots Tab (All Snapshots View)

- 위치: Project 화면 오른쪽 **Bookmark Tabs** 중 하나 (`Live View`, `Test Lab`, `Snapshots`).
- 역할: 해당 프로젝트의 **모든 `snapshots` 레코드**를 박스 제한 없이 테이블 형태로 보여주는 **로그 뷰**.
- 진입 경로:
  - Right edge에서 `Snapshots` 탭 클릭
  - Live View의 "Too Many Boxes" 배너 내 `[View Snapshots ▸]` 버튼
  - 박스 컨텍스트 메뉴의 "View snapshots for this agent" (필터 적용된 상태로 진입)

기본 레이아웃(예시):

```
┌─────────────────────────────────────────────────────────────────┐
│  📡 Snapshots (All traffic)                                    │
├─────────────────────────────────────────────────────────────────┤
│  Time Range: [Last 1h ▾]   Agent: [All ▾]   Status: [All ▾]    │
│  Search: [ user / prompt / response ...            🔍 ]        │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Time        │ Agent        │ Model   │ Input      │ ...  │ │
│  ├─────────────┼──────────────┼─────────┼────────────┼──────┤ │
│  │ 12:01:23    │ Classifier   │ gpt-4o  │ "환불..."  │ ...  │ │
│  │ 12:01:24    │ Writer       │ gpt-4o  │ "요약..."  │ ...  │ │
│  │ 12:01:25    │ Summarizer   │ gpt-4o  │ "..."      │ ...  │ │
│  │ ...         │ ...          │ ...     │ ...        │ ...  │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Page: [< 1 2 3 4 5 >]                                          │
└─────────────────────────────────────────────────────────────────┘
```

- Live View / Test Lab의 박스 수 제한(최대 30개)과 무관하게,  
  Snapshots 탭에서는 `snapshots` 테이블의 데이터를 **필터·검색·페이지네이션으로 전체 조회**할 수 있다.

#### 5.1.5 Project Creation - Usage Mode

```
┌─────────────────────────────────────────────────────────────┐
│  Create a new project                                       │
│                                                             │
│  Projects help you organize and monitor your LLM apps.      │
│                                                             │
│  Project Name *                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ My Project                                          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Description                                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Optional description of your project                │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Usage Mode                                                 │
│  ● Full Mode (Live View + Test Lab)                        │
│    └ Monitor real traffic and run tests                    │
│  ○ Test Only (Test Lab only, no SDK required)              │
│    └ Skip SDK setup, jump straight to testing              │
│                                                             │
│                              [Cancel]  [Create Project]     │
└─────────────────────────────────────────────────────────────┘
```

**Test Only Mode**:
- Live View tab is hidden
- No SDK integration guide shown
- Starts directly in Test Lab
- Can upgrade to Full Mode later in settings

#### 5.1.6 Copy All to Test Lab Button

| State | Action |
|-------|--------|
| Boxes exist | Click → Copy all boxes to Test Lab canvas |
| No boxes | Click → Toast: "No agents to copy. Connect SDK first." |
| Test Only mode | Button hidden (no Live View boxes to copy) |

### 5.2 Page Routes

```
/dashboard/[projectId]/
├── live-view         # Real-time monitoring (read-only)
├── test-lab          # Testing section (experiments)
├── api-calls         # Snapshot list
├── signals           # Signal configuration
├── worst-prompts     # Worst Prompt Set management
├── reviews           # Human-in-the-loop reviews
├── alerts            # Alert settings
└── settings          # Project settings
```

### 5.3 Live View

Railway-style simple design. Auto-detect boxes based on System Prompt, user can draw arrows for visualization.

#### 5.3.1 Basic Layout

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ AG  user Free ▼  / Organizations / org / Project        Q Search ⌘K  ⓘ Help  (U) 🔔 │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ ┌───┐                                                                           ┌────┤
│ │:::│                                       [Copy All to Test Lab]              │Live│◄─ Active
│ ├───┤                                                                           │View│   (protruding)
│ │ + │   ┌──────────────────────────────────────────────────────┐ [✕]           ├────┤
│ │ - │   │ ⚠️ Arrows are user-drawn. May differ from actual      │               │Test│
│ │ ⛶ │   │    agent flow. Verify in Test Lab.                   │               │Lab │
│ │ ↩ │   └──────────────────────────────────────────────────────┘               ├────┤
│ │ ↪ │                                                                           │Snap│
│ └───┘                                                                           │shots│
│                                                                                 └────┤
│          ┌────────────────────┐         ┌────────────────────┐                       │
│          │ "You are a class.."│         │ "You are a writ.." │                       │
│          │ gpt-4o             │ ──────→ │ gpt-4o             │                       │
│          │ ● Online           │         │ ● Online           │                       │
│          │ 45 calls           │         │ 120 calls          │                       │
│          └────────────────────┘         └────────────────────┘                       │
│                                                                                      │
│          ┌────────────────────┐    ┌────────────────────┐                           │
│          │ "Analyze the..."   │    │ "Summarize..."     │                           │
│          │ gpt-4o             │    │ gpt-4o-mini        │                           │
│          │ ● Online           │    │ ● Online           │                           │
│          │ 67 calls           │    │ 30 calls           │                           │
│          └────────────────────┘    └────────────────────┘                           │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘

Box title = First 20 chars of System Prompt (can rename in Settings)
Warning banner: 
  - Appears on right side when user draws first arrow
  - Dismissible with [✕] button
  - Does not reappear after dismissed (stored in localStorage)
```

#### 5.3.2 Arrow Drawing in Live View

Arrows in Live View are **visualization only** - they do NOT trigger tests or create group boxes.

```
Purpose: Help users visually map their mental model of agent connections

Behavior:
  - draw.io style (click box → blue handles → drag to connect)
  - Warning banner appears on right side when first arrow is drawn
  - NO group boxes created (unlike Test Lab)
  - NO [▶ Test] button (unlike Test Lab)
  - To run chain tests → use "Copy All to Test Lab" or bookmark tabs

Warning Banner:
┌──────────────────────────────────────────────────────────┐ [✕]
│ ⚠️ Arrows are user-drawn. May differ from actual agent   │
│    flow. Verify in Test Lab.                             │
└──────────────────────────────────────────────────────────┘
  - Position: Right side of canvas (below Copy button)
  - Trigger: First arrow drawn
  - Dismiss: Click [✕] → doesn't reappear (localStorage)

┌────────────┐         ┌────────────┐
│ Classifier │ ──────→ │   Writer   │   ← User-drawn arrow (visualization only)
└────────────┘         └────────────┘
```

**Box Creation Rules**:
- Same System Prompt = Same box
- System Prompt changes = New box created
- Deleted box auto-recreates when same System Prompt is called

#### 5.3.3 Left Sidebar Toolbar

```
┌─────┐
│ ::: │  Menu (Show Connections, Auto Layout, Copy to Test Lab)
├─────┤
│  +  │  Zoom In
│  -  │  Zoom Out
│ ⛶  │  Center Canvas
├─────┤
│  ↩  │  Undo
│  ↪  │  Redo
└─────┘
```

#### 5.3.4 Box Click Panel (Railway-style Tabs)

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  🤖 "You are a classifier..."                          ✕    │
│                                                              │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  [Prompt]  [Metrics]  [Snapshots]  [⚠️ Worst (12)]  [⚖ Needs Review (3)]  [Settings]│
│  ─────────                                                   │
│                                                              │
│  (Tab content)                                               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

#### 5.3.5 Tab: Prompt

```
┌──────────────────────────────────────────────────────────────┐
│  [Prompt]  [Metrics]  [Snapshots]  [⚠️ Worst (12)]  [⚖ Needs Review (3)]  [Settings]│
│  ─────────                                                   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  📝 System Prompt                                            │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ You are a classifier that categorizes customer        │ │
│  │ inquiries into the following categories:              │ │
│  │                                                        │ │
│  │ - refund_request                                       │ │
│  │ - shipping_inquiry                                     │ │
│  │ - technical_issue                                      │ │
│  │ - general_inquiry                                      │ │
│  │                                                        │ │
│  │ Respond with only the category name.                   │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Model: gpt-4o                                               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

#### 5.3.6 Tab: Metrics

```
┌──────────────────────────────────────────────────────────────┐
│  [Prompt]  [Metrics]  [Snapshots]  [⚠️ Worst (12)]  [⚖ Needs Review (3)]  [Settings]│
│            ─────────                                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  📈 Statistics (Last 24h)                                    │
│                                                              │
│  Total Calls          120                                    │
│  Success Rate         90.0% (108/120)                        │
│  Worst Prompts        12                                     │
│  Avg Latency          240ms                                  │
│  Avg Tokens           156                                    │
│  Est. Cost            $0.42                                  │
│                                                              │
│  ──────────────────────────────────────────────────────────  │
│                                                              │
│  📊 Calls over time                                          │
│                                                              │
│  ▁▂▃▅▇█▆▄▃▂▁▂▃▄▅▆▇█▇▆▅▄▃▂                                   │
│  12am        6am        12pm        6pm        Now           │
│                                                              │
└──────────────────────────────────────────────────────────────┘

Success Rate Calculation:
- Success = Calls that passed all configured Signals
- Worst = Calls that failed any Signal → auto-added to Worst Prompts
- Success Rate = (Total Calls - Worst Prompts) / Total Calls × 100%
```

#### 5.3.7 Tab: Snapshots

```
┌──────────────────────────────────────────────────────────────┐
│  [Prompt]  [Metrics]  [Snapshots]  [⚠️ Worst (12)]  [⚖ Needs Review (3)]  [Settings]│
│                       ───────────                            │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  📸 127 Snapshots                     Period: [Last 7 days ▼]│
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ ✅ 2 min ago                                            │ │
│  │ In: "I want a refund please"                           │ │
│  │ Out: "category: refund_request"                        │ │
│  │ 230ms                                                  │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ ✅ 5 min ago                                            │ │
│  │ In: "When will my order arrive?"                       │ │
│  │ Out: "category: shipping_inquiry"                      │ │
│  │ 215ms                                                  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  [Load more...]                                              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

#### 5.3.8 Tab: Worst (Separate Storage)

```
┌──────────────────────────────────────────────────────────────┐
│  [Prompt]  [Metrics]  [Snapshots]  [⚠️ Worst (12)]  [⚖ Needs Review (3)]  [Settings]│
│                                    ───────────────           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ⚠️ 12 Worst Prompts                                         │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ ⚠️ 15 min ago                       Signal: LENGTH     │ │
│  │ In: "asdfasdf refund plz lol"                          │ │
│  │ Out: "category: general_inquiry"                       │ │
│  │ Expected: refund_request                               │ │
│  │ 180ms                                                  │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ ⚠️ 1 hour ago                       Signal: KEYWORD    │ │
│  │ In: "Product recall inquiry"                           │ │
│  │ Out: "category: general_inquiry"                       │ │
│  │ Expected: technical_issue                              │ │
│  │ 195ms                                                  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  [Load more...]                                              │
│                                                              │
└──────────────────────────────────────────────────────────────┘

※ Worst are stored in snapshots table with is_worst=true flag
※ Filter: snapshots WHERE agent_id=? AND is_worst=true
```

#### 5.3.8a Tab: Needs Review (Per-Agent Human Review)

Live View에서 Signal 평가 결과가 애매한 케이스(일부 Signal FAIL, 일부 PASS, 또는 임계값 근처 점수 등)는 `status = "NEEDS_REVIEW"`로 저장된다.  
해당 에이전트 박스의 **[⚖ Needs Review]** 탭에서는 이 케이스들만 한눈에 보고, 각 행에서 바로 사람 판정을 내릴 수 있다.

```
┌──────────────────────────────────────────────────────────────┐
│  [Prompt]  [Metrics]  [Snapshots]  [⚠️ Worst (12)]  [⚖ Needs Review (3)]  [Settings]│
│                                          ──────────────────  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ⚖ 3 Needs Review                                            │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ ⚖ 20 min ago                 Signals: LENGTH❌ SAFETY⚠ │ │
│  │ In: "asdfasdf refund plz lol"                          │ │
│  │ Out: "category: general_inquiry"                       │ │
│  │                                                        │ │
│  │ [OK]  [Mark as Worst]  [View details ▸]                │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ ⚖ 1 hour ago                 Signals: KEYWORD⚠        │ │
│  │ In: "Product recall inquiry"                           │ │
│  │ Out: "category: general_inquiry"                       │ │
│  │                                                        │ │
│  │ [OK]  [Mark as Worst]  [View details ▸]                │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  [Load more...]                                              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

Rules:

- **대상**: `snapshots` 중 `status="NEEDS_REVIEW"` 이면서 해당 `agent_id`에 속한 케이스만 표시한다.
- **[OK]**: 이 케이스를 통과로 간주하고 `status`를 `RESOLVED_OK` 등으로 업데이트, Needs Review 리스트에서 제거한다.
- **[Mark as Worst]**: `is_worst=true`로 설정하여 Worst Set에 포함시키고, `status`를 `RESOLVED_WORST` 등으로 변경한다.
- **[View details ▸]**: 전체 Input/Output, Signal 결과, Webhook raw 등을 보여주는 상세 패널/모달을 열어 추가 정보를 본 뒤 결정할 수 있게 한다.
```

#### 5.3.9 Tab: Settings

```
┌──────────────────────────────────────────────────────────────┐
│  [Prompt]  [Metrics]  [Snapshots]  [⚠️ Worst (12)]  [Settings]│
│                                                    ────────  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ⚙️ Agent Settings                                           │
│                                                              │
│  Display Name                                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Classifier                                             │ │
│  └────────────────────────────────────────────────────────┘ │
│  Default: First 20 chars of System Prompt                   │
│                                                              │
│  ──────────────────────────────────────────────────────────  │
│                                                              │
│  📊 Signal Configuration (Worst Detection Criteria)         │
│                                                              │
│  [+ Add Signal ▼]                                           │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 📏 Rule-based                                          │ │
│  │   • Length Change                                      │ │
│  │   • Keyword Check                                      │ │
│  │   • JSON Schema                                        │ │
│  │   • Regex Pattern                                      │ │
│  │ 📐 Metric-based                                        │ │
│  │   • ROUGE Score                                        │ │
│  │   • Semantic Similarity                                │ │
│  │   • Token Limit                                        │ │
│  │   • Cost Limit                                         │ │
│  │   • Latency Limit                                      │ │
│  │ 🤖 LLM-as-Judge                                        │ │
│  │   • Custom Rubric                                      │ │
│  │   • Factual Accuracy                                   │ │
│  │   • Safety Check                                       │ │
│  │ 💻 Custom Code                                         │ │
│  │   • Webhook                                            │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Active Signals:                                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ ☑ Length Change        ±50%                 [Edit][×] │ │
│  │ ☑ Latency Limit        30s max              [Edit][×] │ │
│  │ ☑ Token Limit          4096 max             [Edit][×] │ │
│  │ ☑ Cost Limit           $0.10/call           [Edit][×] │ │
│  │ ☑ JSON Schema          (optional)           [Edit][×] │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  [Reset to Project Default]                                  │
│                                                              │
│  ──────────────────────────────────────────────────────────  │
│                                                              │
│  Actions                                                     │
│                                                              │
│  [📋 Copy to Test Lab]                                       │
│    └─ Copies: System Prompt + Model + Signal Config         │
│                                                              │
│  [🔴 Delete this Agent]                                      │
│                                                              │
└──────────────────────────────────────────────────────────────┘

Signal Configuration:
- [+ Add Signal] dropdown shows all 13 signals in 4 categories
- Active signals: if ANY fails → marked as Worst
- **모든 시그널(기본 5개 포함)은 정도(임계값·한도 등)를 설정 가능.** 아무것도 안 만지면 §2.6 기본값 사용.
- [Reset to Project Default] restores project-level settings (또는 기본 5개·기본값으로 복원)
- Default signals (if not configured): §2.6의 기본 5개 — Length Change ±50%, Latency Limit 30s, Token Limit 4096, Cost Limit $0.10/call, JSON Schema(선택).

Copy to Test Lab includes:
- System Prompt
- Model selection
- All active Signal configurations (can be modified in Test Lab)

#### 5.3.10 Signal Configuration Modals

When clicking [Edit] or adding a new signal, the following modals appear:

**📏 Length Change**
```
┌──────────────────────────────────────────────────────────────┐
│  📏 Length Change                                       [×]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Baseline:                                                   │
│  ● Auto (average of recent responses)                        │
│    Data: 127 samples ✓                                       │
│  ○ Manual: [____] characters                                 │
│                                                              │
│  Threshold:                                                  │
│  [±50% ▼]  (±30%, ±50%, ±70%, Custom)                       │
│                                                              │
│  ⓘ Triggers Worst if response length differs by more than   │
│    the threshold from baseline.                              │
│                                                              │
│                                   [Cancel]  [Save]           │
└──────────────────────────────────────────────────────────────┘

Note: When samples < 10, signal is auto-disabled with warning.
```

**🔤 Keyword Check**
```
┌──────────────────────────────────────────────────────────────┐
│  🔤 Keyword Check                                       [×]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Must Include (Contains):                                    │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ [Thank you ×] [assistance ×] [+ Add]                  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Must Exclude (Forbidden):                                   │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ [I don't know ×] [cannot help ×] [+ Add]              │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ☐ Case sensitive                                           │
│                                                              │
│                                   [Cancel]  [Save]           │
└──────────────────────────────────────────────────────────────┘
```

**📋 JSON Schema**
```
┌──────────────────────────────────────────────────────────────┐
│  📋 JSON Schema                                         [×]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Validation Level:                                           │
│                                                              │
│  ● Basic: JSON format only                                   │
│    Example: {"a":1} ✅  |  "plain text" ❌                   │
│                                                              │
│  ○ Advanced: Required fields                                 │
│    Required fields (press Enter to add):                     │
│    ┌──────────────────────────────────────────────────────┐ │
│    │ [category ×] [confidence ×] [+ Add]                 │ │
│    └──────────────────────────────────────────────────────┘ │
│                                                              │
│    💡 Example:                                               │
│    Pass: {"category": "refund", "confidence": 0.9}          │
│    Fail: {"category": "refund"} ← missing confidence        │
│                                                              │
│                                   [Cancel]  [Save]           │
└──────────────────────────────────────────────────────────────┘
```

**🔣 Regex Pattern**
```
┌──────────────────────────────────────────────────────────────┐
│  🔣 Regex Pattern                                       [×]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Preset Patterns:                                            │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ [Yes/No only           ▼]                              │ │
│  │  ├─ Yes/No only                                        │ │
│  │  ├─ Numbers only                                       │ │
│  │  ├─ Email format                                       │ │
│  │  ├─ URL format                                         │ │
│  │  ├─ Multiple choice (A/B/C/D)                          │ │
│  │  └─ Custom pattern...                                  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Pattern: ^(yes|no|Yes|No|YES|NO)$                          │
│                                                              │
│  Test:                                                       │
│  Input: [yes________]                                        │
│  Result: ✅ Match                                            │
│                                                              │
│                                   [Cancel]  [Save]           │
└──────────────────────────────────────────────────────────────┘
```

**🤖 Custom Rubric (LLM-as-Judge)**
```
┌──────────────────────────────────────────────────────────────┐
│  🤖 Custom Rubric                                       [×]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ⚠️ Cost: ~$0.005 per evaluation                            │
│                                                              │
│  Evaluator Model:                                            │
│  [gpt-4o-mini ▼]                                            │
│                                                              │
│  Template:                                                   │
│  [Select template... ▼]                                      │
│   ├─ Blank (write your own)                                  │
│   ├─ Customer Service Quality                                │
│   ├─ Code Review Quality                                     │
│   ├─ Writing Quality                                         │
│   └─ Import from file...                                     │
│                                                              │
│  Evaluation Rubric:                                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Rate the response 1-5:                                 │ │
│  │                                                        │ │
│  │ 5: Perfect answer with additional helpful info         │ │
│  │ 4: Accurate and complete answer                        │ │
│  │ 3: Mostly correct but missing details                  │ │
│  │ 2: Partially correct                                   │ │
│  │ 1: Wrong or irrelevant answer                          │ │
│  │                                                        │ │
│  │ Output only the score number.                          │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  [📁 Import from file]                                       │
│                                                              │
│  Pass threshold: [3 ▼] or higher                            │
│                                                              │
│                                   [Cancel]  [Save]           │
└──────────────────────────────────────────────────────────────┘
```

**🌐 Webhook**
```
┌──────────────────────────────────────────────────────────────┐
│  🌐 Webhook                                             [×]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Endpoint URL:                                               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ https://my-server.com/api/evaluate                     │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Headers (optional):                                         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Authorization: Bearer xxxxxx                           │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Timeout: [5000] ms                                          │
│                                                              │
│  Fail 판정 조건:                                             │
│  ● pass 또는 passed = false                                  │
│  ○ result 또는 status = "fail" / "FAIL"                     │
│  ○ score < [0.5    ]                                        │
│  ○ HTTP status != 200                                        │
│                                                              │
│  [▶ Test Connection]                                        │
│                                                              │
│  💡 응답은 그대로 표시됩니다 (변환 없음)                     │
│                                                              │
│                                   [Cancel]  [Save]           │
└──────────────────────────────────────────────────────────────┘

Webhook 결과 표시 (Snapshot/Worst 목록에서):
┌─────────────────────────────────────────────────────────────┐
│ ⚠️ 15 min ago                                               │
│ In: "asdfasdf refund plz lol"                               │
│ Out: "category: general_inquiry"                            │
│ 180ms                                                       │
│                                                             │
│ Signal: LENGTH ❌                                           │
│ Webhook: { "result": "FAIL", "reason": "톤앤매너 위반"... } │  ← 앞부분만 잘라서 표시
│          [View raw ▸]                                       │
└─────────────────────────────────────────────────────────────┘

※ Webhook 응답은 **변환 없이(raw) 저장**되며, 목록에서는 **앞부분만 잘라서** 보여준다.  
※ `View raw ▸`를 클릭하면 우측 패널/모달에서 **전체 JSON을 pretty-print**로 표시하고, `[Copy JSON]` 버튼을 제공한다.  
※ Fail 판정은 위 조건으로만 계산하여 Worst 포함 여부를 결정하고, Webhook raw는 디버깅/근거 확인 용도로만 사용한다.
```

**Other Signal Modals (simplified)**

| Signal | Key Settings |
|--------|--------------|
| ROUGE Score | ROUGE type (1/2/L), threshold (0.5-1.0), requires expected output |
| Semantic Similarity | Embedding model, threshold (0.7-0.95), requires expected output |
| Token Limit | Max tokens (output only / input+output) |
| Cost Limit | Max cost per call ($) |
| Latency Limit | Max response time (ms) |
| Factual Accuracy | Evaluator model, context source (request context / upload) |
| Safety Check | Check items (toxicity, PII, bias, copyright) |

#### 5.3.11 Delete Handling

Delete confirmation modal:

```
┌──────────────────────────────────────────────────────────────┐
│  🔴 Delete Agent                                             │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Delete "Classifier" box?                                    │
│                                                              │
│  • Box will be removed from Live View                        │
│  • Box will auto-recreate if same System Prompt is called    │
│                                                              │
│  Snapshot Data:                                              │
│  ○ Keep (still visible in Snapshots tab)                    │
│  ○ Delete together                                           │
│                                                              │
│                              [Cancel]  [Delete]              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

After deletion:
- Box is removed from UI
- Box auto-recreates when same System Prompt is called again
- Snapshot data is kept or deleted based on user choice

### 5.4 Test Lab

Railway + draw.io style. Click box to show blue handles, drag to connect with arrows.

**Key: Arrows define the actual test chain flow. Connected boxes form a group with [▶ Test] button.**

#### 5.4.0 지원 모델 목록 및 모델 선택 UI

**적용 범위**: Test Lab에서 **박스를 선택했을 때 나오는 우측 설정 패널**에서만 사용. (Replay 등 별도 페이지가 아니라, 박스 클릭 시 나오는 설정 전부 여기 기준.)

**최종 모델 목록 (권장)** — 박스 설정에서 Provider 선택 후 Model 드롭다운에 아래 표시 이름으로 노출.

**OpenAI**

| 모델 ID | 표시 이름 (UI용) |
|--------|------------------|
| gpt-4o | GPT-4o |
| gpt-4o-mini | GPT-4o Mini |
| gpt-4-turbo | GPT-4 Turbo |
| gpt-4 | GPT-4 |
| gpt-3.5-turbo | GPT-3.5 Turbo |
| o1-preview | o1 (Preview) |
| o1-mini | o1 Mini |

**Anthropic**

| 모델 ID | 표시 이름 (UI용) |
|--------|------------------|
| claude-3-5-sonnet | Claude 3.5 Sonnet |
| claude-3-5-haiku | Claude 3.5 Haiku |
| claude-3-opus | Claude 3 Opus |
| claude-3-sonnet | Claude 3 Sonnet |
| claude-3-haiku | Claude 3 Haiku |

**Google**

| 모델 ID | 표시 이름 (UI용) |
|--------|------------------|
| gemini-1.5-pro | Gemini 1.5 Pro |
| gemini-1.5-flash | Gemini 1.5 Flash |
| gemini-1.0-pro | Gemini 1.0 Pro |
| gemini-pro | Gemini Pro |

**Custom (목록에 없는 모델 / 다른 Provider)**  
위 목록에 없는 모델(예: 새 OpenAI 모델)이나 **OpenAI·Anthropic·Google이 아닌 Provider**(예: Mistral, Cohere)를 쓰고 싶을 때 사용.

- 사용자가 **Custom** 선택 시 **API Key** (필수) + **모델 ID** (필수) + **Base URL** (선택, 다른 Provider/셀프호스팅용) 입력·등록.
- 테스트 실행 시 **그 API Key**로 요청을 보내고, 사용자가 넣은 **튜닝 프롬프트(시스템 프롬프트)**, **인풋 프롬프트**, **중간 데이터** 등으로 호출해 결과를 냄.
- Custom으로 등록한 키는 해당 박스(또는 해당 테스트 실행)에서만 사용. (저장 정책은 구현 시 결정.)

**잘못 입력 시 (실행 시 오류)**  
Custom으로 넣은 **API Key** 또는 **Model ID**가 잘못되었을 때(인증 실패, 모델 없음, Base URL 오류 등) **테스트 실행 시** API 응답을 받아 **오류로 처리**하고, 사용자에게 명확한 메시지로 표시한다. (예: "API key is invalid", "Model not found", "Connection failed" 등. Provider/백엔드 응답을 그대로 노출하지 않고, 사용자 친화 문구로 정리.)

---

**프론트에서 보이는 방식 (Test Lab 박스 선택 시 우측 패널)**

1. **Provider 선택** (OpenAI / Anthropic / Google) → **Model** 드롭다운에 위 표의 **표시 이름**으로 노출.
2. **Test Lab 박스 설정 패널** (박스 클릭 시 나오는 우측 패널):

```
┌──────────────────────────────────────┐
│ 📦 Classifier                        │
│ ────────────────────────────────────│
│ Model                                │
│ [GPT-4o              ▼]   ✅        │
│   ├─ GPT-4o                          │
│   ├─ GPT-4o Mini                     │
│   ├─ GPT-4 Turbo                     │
│   ├─ ...                             │
│   └─ Custom (API Key 등록)            │
│                                      │
│ (Custom 선택 시)                     │
│ API Key:  [••••••••••••••••••••]     │
│ Model ID: [mistral-large         ]   │
│ Base URL: [https://... (선택)    ]   │
│                                      │
│ → 테스트 시 이 키로 호출              │
└──────────────────────────────────────┘
```

3. 모델 선택·Custom·API Key 입력은 **Test Lab에서 박스 선택했을 때 나오는 설정뿐**이며, Replay 등 별도 화면이 아님.
4. **Live View 박스** 클릭 시 Prompt 탭 등에서는 **모델은 읽기 전용**으로 표시 (예: `Model: gpt-4o`).

---

#### 5.4.1 Empty State (No "Choose how to start")

박스가 없을 때도 **같은 캔버스 화면**을 보여준다. "Choose how to start" 카드나 Import/Scratch/CSV 선택 UI는 사용하지 않는다.

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ AG  user Free ▼  / Organizations / org / Project        Q Search ⌘K  ⓘ Help  (U) 🔔 │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ ┌───┐                                                                           ┌────┤
│ │:::│  🧪 Test Lab                                                              │Live│
│ ├───┤                                                                           │View│
│ │ □ │                                                                           ├────┤
│ │ + │                         (빈 캔버스)                                         │Test│◄─ Active
│ │ - │                                                                           │Lab │
│ │ ⛶ │                                                                           ├────┤
│ │ ↩ │   □ 클릭하면 뷰포트 중앙에 박스 생성                                           │Snap│
│ │ ↪ │                                                                           │shots│
│ └───┘                                                                           └────┤
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- Input Data·CSV·Live View 복사는 박스 추가 후 해당 박스의 "Load Test Data" 또는 우측 패널에서 처리.

#### 5.4.2 CSV Upload with Column Mapping

When user selects "Upload CSV":

```
┌─────────────────────────────────────────────────────────────────┐
│  📄 Upload CSV                                             [×]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [📥 Download Template]                                         │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  [📁 Choose File...]  test_data.csv                             │
│                                                                 │
│  ✓ 127 rows detected                                            │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Column Mapping:                                                │
│                                                                 │
│  Your Column              →    Our Field                        │
│  ┌───────────────────┐        ┌───────────────────┐            │
│  │ question       ▼  │   →    │ Input (required)  │            │
│  └───────────────────┘        └───────────────────┘            │
│  Available: [question, answer, category, id]                    │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Preview:                                                       │
│  ✓ 127 valid rows  (또는: ✓ 125 valid, 2 skipped (empty Input)) │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ #  │ Input (← question)                                   │ │
│  ├────┼──────────────────────────────────────────────────────┤ │
│  │ 1  │ "환불해주세요"                                       │ │
│  │ 2  │ "배송 언제 와요?"                                    │ │
│  │ 3  │ "로그인이 안 돼요"                                   │ │
│  │... │ ...                                                  │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                   [Cancel]  [Import 127 rows]   │
└─────────────────────────────────────────────────────────────────┘

Auto-detection:
- Common column names are auto-detected: input, prompt, question, 
  query, user_message, text, 입력, 질문, 프롬프트
- If single column, assumes it's input
- If no match found, user must manually select from dropdown

Template format:
- Download provides CSV with "input" column header
- Simple one-column format for easy use
```

#### 5.4.2a CSV Import 검증 및 에러 처리 (Notion/Airtable/Linear 스타일)

**플로우:** 컬럼 매핑 → 미리보기 → 유효하지 않은 행 건너뜀/에러 표시 → Import.

| 항목 | 규칙 |
|------|------|
| **Input 매핑** | "Our Field"에 **Input (required)** 매핑이 없으면 [Import] 비활성 + 메시지: "Input에 매핑할 컬럼을 선택하세요." |
| **템플릿** | [📥 Download Template]으로 `input` 컬럼만 있는 샘플 CSV 제공. |
| **미리보기** | 상단에 첫 N행(예: 10행) 미리보기. 매핑 후 "Input (← question)" 등으로 표시. |
| **검증 메시지** | Input이 비어 있는 행: "N개 행 제외됨 (empty Input)" 또는 해당 행에 경고 아이콘. |
| **부분 Import** | 유효한 행만 가져오기. Import 전/후 안내: "125개 행 가져옴, 2개 행 건너뜀 (비어 있음)." |
| **전부 실패** | Input으로 쓸 수 있는 컬럼이 없거나 유효 행 0개면 [Import] 막고, "Input 컬럼을 지정하거나 템플릿을 사용하세요." 표시. |

**UI 예시 (검증 후):**
```
│  Preview:                                                       │
│  ✓ 125 valid rows, 2 skipped (empty Input)                      │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ #  │ Input (← question)                                   │ │
│  ├────┼──────────────────────────────────────────────────────┤ │
│  │ 1  │ "환불해주세요"                                       │ │
│  │ 2  │ "배송 언제 와요?"                                    │ │
│  ...                                                            │
│  └───────────────────────────────────────────────────────────┘ │
│                                   [Cancel]  [Import 125 rows]   │
```

#### 5.4.3 Basic Layout (With Boxes)

**그룹 박스 없음** - 연결된 박스들을 감싸는 큰 박스 불필요. 테스트 버튼은 각 박스에 있음.

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ AG  user Free ▼  / Organizations / org / Project        Q Search ⌘K  ⓘ Help  (U) 🔔 │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ ┌───┐                                                                           ┌────┤
│ │:::│                                                                           │Live│
│ ├───┤                                                                           │View│
│ │ □ │   ┌─────────────────┐              ┌─────────────────┐                   ├────┤
│ ├───┤   │   Classifier    │              │     Writer      │                   │Test│◄
│ │ + │   │     gpt-4o      │─────────────→│     gpt-4o      │                   │Lab │
│ │ - │   │ 📊 48 inputs    │      ①       │ (체인 입력)     │                   ├────┤
│ │ ⛶ │   │ [▶ Test] ✅    │              │ [▶ Test] ⬜    │                   │Snap│
│ │ ↩ │   └─────────────────┘              └─────────────────┘                   │shots│
│ │ ↪ │          ↑                                ↑                               └────┤
│ └───┘    Input Data 있음               Input Data 없음                              │
│          = 활성화                       = 비활성화                                   │
│                                                                                      │
│         ┌─────────────────┐  (연결 없음 - 단독 테스트)                              │
│         │   Summarizer    │                                                          │
│         │   gpt-4o-mini   │                                                          │
│         │ 📊 20 inputs    │                                                          │
│         │ [▶ Test] ✅    │                                                          │
│         └─────────────────┘                                                          │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘

Left Sidebar Toolbar (:::):
┌───┐
│:::│  ← 메뉴
├───┤
│ □ │  ← 박스 생성
├───┤
│ + │  ← 줌 인
│ - │  ← 줌 아웃
│ ⛶ │  ← 캔버스 중앙
│ ↩ │  ← Undo
│ ↪ │  ← Redo
└───┘

Menu (:::) 내용:
┌─────────────────────────┐
│ ⊞ Auto Layout           │  Auto arrange
│ ↗ Show Connections      │  Toggle arrow visibility
├─────────────────────────┤
│ 🔴 Reset Canvas         │  (Danger Zone)
└─────────────────────────┘
```

#### 5.4.3a 박스 생성 (Box Creation)

**동작:** 사이드바 **[□]** 한 번 클릭 → 새 박스가 **현재 보이는 뷰포트 중앙**에 생성된다. 드래그로 영역을 잡지 않는다.

**규칙:**

1. **위치**
   - 생성 시점에 사용자가 보고 있는 **뷰포트(캔버스 보기 영역)의 중앙**에 박스 중심이 오도록 배치.
   - 줌/팬 상태와 무관하게 "지금 화면의 가운데"에 생성.

2. **기본 크기**
   - 초기 크기: **width 280px, height 160px** (또는 프로젝트에서 통일한 기본값).
   - 구현 시 상수로 두고, 필요 시 나중에 조정 가능하게 둠.

3. **크기 조정**
   - 박스 **선택 시** 모서리·가장자리에 **리사이즈 핸들** 표시 (draw.io 스타일).
   - 드래그로 width/height 자유 조정.
   - **최소 크기**: 예) 200×100. 그 이하면 잘리지 않도록 최소값에서 고정.

4. **연속 생성**
   - □를 연속 클릭하면 매번 **뷰포트 중앙**에 새 박스 생성.
   - 겹침 방지: 두 번째 박스부터는 **이동 오프셋** 적용 권장 (예: 이전 생성 위치에서 +24px x, +24px y). 또는 "항상 중앙"만 유지하고 사용자가 직접 끌어서 펼쳐도 됨.
   - 문서상 선택: "첫 박스는 정확히 중앙, 이후는 작은 오프셋으로 겹침 완화" 또는 "항상 중앙, 사용자 배치로 정리".

**요약:** □ 클릭 → 뷰포트 중앙에 기본 크기 박스 생성. 선택 시 핸들로 크기 자유 조정.

#### 5.4.4 draw.io Style Arrow Connection (React Flow 사용)

**화살표/선 그리기는 draw.io를 따른다.** 직각 라우팅, 시각적 분기/합류(Y자·T자) 허용. 데이터 모델은 엣지별 독립(source→target) + 순서 번호 유지.

**박스 핸들 (draw.io와 동일):**
- **모서리 4개** = 리사이즈 핸들 (크기 조정용)
- **좌·우·상·하 4개** = 연결 핸들 (▲▼◀▶). Hover 시에만 표시.

```
1. 기본 상태 (hover 안 함):
    ┌─●─────────────●─┐
    │                 │
    ●   Classifier    ●     ← 모서리 4개: 리사이즈만
    │                 │
    └─●─────────────●─┘

2. Hover 상태:
    ┌─●─────────────●─┐
    │       ▲         │
    ●  ◀  Classifier  ▶  ●  ← 4방향 연결 핸들(▲▼◀▶) 나타남
    │       ▼         │
    └─●─────────────●─┘

3. 드래그하여 연결 (draw.io처럼):
    ┌───────────┐               ┌───────────┐
    │ Classifier│ ▶─────────────│  Writer   │
    └───────────┘   (드래그 중)  └───────────┘

4. 연결 완료 → 순서 번호 입력 (아래 5.4.4a 참조)

5. 완료된 연결 (화살표 머리 위에 숫자):
                                ①
    ┌───────────┐              ↓───────────┐
    │ Classifier│ ────────────→│  Writer   │
    └───────────┘              └───────────┘
                               ↑
                         화살표 머리 위에 순서 번호!
```

**화살표 머리 위에 순서 번호:**
- 숫자가 화살표 머리(→) **위**에 표시
- 어느 박스가 몇 번째로 호출받는지 명확
- 양방향 화살표여도 순서 구분 가능

#### 5.4.4a 순서 번호 입력 UI

**트리거**: 박스 A에서 박스 B로 드래그하여 연결을 놓으면(드롭) 즉시 표시.

**표시 위치**: 연결선(엣지) 머리 근처 **팝오버** 또는 **작은 모달**. (캔버스 중앙 모달보다는 팝오버 권장.)

```
                    ┌─────────────────────────┐
                    │ Order number            │
                    │ [1        ▼]           │
                    │                         │
                    │ Same number = parallel  │
                    │         [Cancel] [OK]   │
                    └─────────────────────────┘
                                 ↓
    ┌───────────┐              ┌───────────┐
    │ Classifier│ ────────────→│  Writer   │
    └───────────┘              └───────────┘
```

**입력 방식:**
- **Order number**: 숫자 입력 또는 드롭다운 (1 ~ 10 또는 1 ~ N).
- **기본값**: 1 (첫 연결). 이미 같은 source에서 나가는 ①이 있으면 1(병렬) 또는 다음 번호(2) 제안 가능.
- **안내**: "Same number = parallel run" 또는 "같은 번호 = 병렬 실행".
- **[OK]**: 연결 확정, order_number 저장, 팝오버 닫기.
- **[Cancel]**: 연결 취소(엣지 제거).

**나중에 수정:**
- **방법 1**: 엣지(화살표) 클릭 → 오른쪽 패널에 "Order number: [2 ▼]" 표시, 여기서 변경.
- **방법 2**: 엣지 더블클릭 → 같은 팝오버 다시 표시, 번호 수정 후 저장.

**규칙 요약:**
- 같은 번호 = 병렬 실행.
- 다른 번호 = 순차 실행 (숫자 순서대로).

#### 5.4.5 Arrow Rules & Chain Execution

**그룹 박스 없음** - 연결된 박스들을 감싸는 큰 박스 불필요.
테스트 버튼은 **Input Data가 있는 박스**에서만 활성화됨.

**화살표 그리기:** draw.io를 따른다. 직각 라우팅, 시각적 Y자/T자(분기·합류) 허용. **데이터 모델**은 항상 **엣지별 독립**(source→target) + 순서 번호. "선이 가운데서 합쳐졌다가 갈라지는" 단일 합류선은 사용하지 않음 — 구현은 항상 독립 엣지 2개.

**순서 번호 규칙:**
- 화살표 머리(→) **위**에 숫자 표시
- **같은 숫자 = 병렬 실행**
- **다른 숫자 = 순차 실행** (숫자 순서대로)
- 각 화살표는 **논리적으로** 독립된 엣지 (시각적으로 draw.io 스타일 허용)

**양방향 화살표:** A→B, B→A 두 개의 별도 엣지를 둘 수 있음. 각자 독립된 순서 번호 (예: A ①→ B, B ②→ A). **순환 체인**은 백엔드/유효성 검사에서 에러로 막고 "순환 체인은 허용되지 않습니다" 안내.

**Sequential (순차 실행) - 번호가 다름:**
```
                                    ①
   ┌───────────────┐               ↓───────────────┐
   │  Classifier   │ ─────────────→│    Writer     │
   │ 📊 48 inputs  │               │ (체인 입력)   │
   │ [▶ Test] ✅  │               │ [▶ Test] ⬜  │
   └───────────────┘               └───────────────┘
                                          │
                                          │②
                                          ▼
                                   ┌───────────────┐
                                   │  Summarizer   │
                                   │ (체인 입력)   │
                                   │ [▶ Test] ⬜  │
                                   └───────────────┘

실행: Classifier(시작) → ①Writer → ②Summarizer
```

**Parallel (병렬 실행) - 번호가 같음:**
```
         ┌─────────────────┐
         │      Main       │
         │  📊 48 inputs   │  ← 시작점 (Input Data 있음)
         │  [▶ Test] ✅   │
         └─────────────────┘
           │             │
           │             └─────────────┐
           │①                          │①
           ▼                           ▼
   ┌─────────────┐             ┌─────────────┐
   │ Weather 서울│             │ Weather 부산│
   │ [▶ Test] ⬜│             │ [▶ Test] ⬜│
   └─────────────┘             └─────────────┘
           │                           │
           │             ┌─────────────┘
           │②            │②
           ▼             ▼
         ┌─────────────────┐
         │    Main 최종    │
         │  (체인 입력)    │
         │  [▶ Test] ⬜   │
         └─────────────────┘

실행: Main(시작) → (①서울, ①부산 동시) → ②Main최종
      ①번들 모두 완료 후 ②번 실행
```

**화살표 연결 방식 (각각 독립된 선):**
```
Main에서 A, B로 각각 드래그:

      ┌───────────┐
      │   Main    │
      └───────────┘
        │       │
        │       └─────────┐      ← 별도의 선 2개!
        │①                │①        (합쳐지지 않음)
        ▼                 ▼
   ┌─────────┐       ┌─────────┐
   │ Agent A │       │ Agent B │   ← 같은 번호 ① = 병렬
   └─────────┘       └─────────┘


A, B 둘 다 C로 연결:

   ┌─────────┐       ┌─────────┐
   │ Agent A │       │ Agent B │
   └─────────┘       └─────────┘
        │                 │
        │       ┌─────────┘      ← 별도의 선 2개!
        │②      │②                  (합쳐지지 않음)
        ▼       ▼
      ┌───────────┐
      │  Agent C  │   ← C로 들어오는 ②번 화살표 2개
      └───────────┘      = A, B 둘 다 끝나면 C 실행
```

#### 5.4.6 Box Click → Right Settings Panel

**테스트 버튼 활성화 조건:**
- ✅ Input Data + System Prompt + Model (필수 3개) → **활성화**
- ❌ Input Data 없음 → **비활성화** (Additional Data만 있어도 안 됨)
- System Prompt, Model은 반드시 설정 필요 (튜닝 프롬프트 포함)

**시작점 박스 (Input Data 있음):**
```
┌──────────────────────────────────────┬───────────────────────────────┐
│                                      │ 📦 Classifier                 │
│   (Canvas)                           │                               │
│                                      │ ─────────────────────────────-│
│                                      │                               │
│                                      │ 🔗 Connections                │
│                                      │ Input from: (없음 - 시작점)   │
│                                      │ Output to: → Writer (①)       │
│                                      │                               │
│                                      │ ─────────────────────────────-│
│                                      │                               │
│                                      │ 📌 Basic Settings (필수)      │
│                                      │                               │
│                                      │ Model                         │
│                                      │ [gpt-4o              ▼] ✅    │
│                                      │                               │
│                                      │ System Prompt                 │
│                                      │ ┌───────────────────────────┐ │
│                                      │ │You are a classifier...    │ │
│                                      │ └───────────────────────────┘ │
│                                      │ ✅ 입력됨                     │
│                                      │                               │
│                                      │ ─────────────────────────────-│
│                                      │                               │
│                                      │ 📊 Input Data (시작용)        │
│                                      │ [📁 Load Snapshots]           │
│                                      │ [📤 Upload CSV]               │
│                                      │ [✏️ Manual Input]             │
│                                      │                               │
│                                      │ Current: 48 inputs ✅         │
│                                      │ [View List ▼]                 │
│                                      │                               │
│                                      │ ─────────────────────────────-│
│                                      │                               │
│                                      │ 📎 Additional Data (선택)     │
│                                      │ ┌───────────────────────────┐ │
│                                      │ │ 📝 context     [Edit][×]  │ │
│                                      │ │ 💻 main.py     [Edit][×]  │ │
│                                      │ │ 🖼️ screenshot  [Edit][×]  │ │
│                                      │ └───────────────────────────┘ │
│                                      │ [+ Add]                       │
│                                      │ (최대 20개, ADDITIONAL_DATA)  │
│                                      │                               │
│                                      │ ─────────────────────────────-│
│                                      │                               │
│                                      │ [▶ Test] ✅                   │
│                                      │ Ready - 3 agents in chain     │
│                                      │                               │
└──────────────────────────────────────┴───────────────────────────────┘
```

**중간 박스 (Input Data 없음, 체인에서 받음):**
```
┌──────────────────────────────────────┬───────────────────────────────┐
│                                      │ 📦 Writer                     │
│   (Canvas)                           │                               │
│                                      │ ─────────────────────────────-│
│                                      │                               │
│                                      │ 🔗 Connections                │
│                                      │ Input from: ← Classifier (①)  │
│                                      │ Output to: → Summarizer (②)   │
│                                      │                               │
│                                      │ ─────────────────────────────-│
│                                      │                               │
│                                      │ 📌 Basic Settings (필수)      │
│                                      │ Model: [gpt-4o ▼] ✅          │
│                                      │ System Prompt: [...] ✅       │
│                                      │                               │
│                                      │ ─────────────────────────────-│
│                                      │                               │
│                                      │ 📊 Input Data                 │
│                                      │ (체인에서 받음)               │
│                                      │ ← Classifier의 출력이 입력됨  │
│                                      │                               │
│                                      │ ─────────────────────────────-│
│                                      │                               │
│                                      │ 📎 Additional Data (선택)     │
│                                      │ (추가된 항목 목록 + [Edit][×])│
│                                      │ [+ Add]                       │
│                                      │                               │
│                                      │ ─────────────────────────────-│
│                                      │                               │
│                                      │ [▶ Test] ⬜ Disabled          │
│                                      │ 💡 Run from the start box    │
│                                      │                               │
└──────────────────────────────────────┴───────────────────────────────┘
```

**단독 박스 (연결 없음, Input Data 없음):**
```
┌──────────────────────────────────────┬───────────────────────────────┐
│                                      │ 📦 Classifier                 │
│   (Canvas)                           │                               │
│                                      │ 🔗 Connections                │
│                                      │ (없음 - 단독 박스)            │
│                                      │                               │
│                                      │ 📌 Basic Settings (필수)      │
│                                      │ Model: [미선택 ▼]             │
│                                      │ System Prompt: [비어있음]     │
│                                      │                               │
│                                      │ 📊 Input Data (없음)          │
│                                      │                               │
│                                      │ [▶ Test] ⬜ Disabled          │
│                                      │ 💡 Add Input Data, System     │
│                                      │    Prompt, and Model          │
│                                      │                               │
└──────────────────────────────────────┴───────────────────────────────┘
```

**비활성화 시 문구 규칙 (static, 동적 조회 없음):**
| 케이스 | 문구 |
|--------|------|
| 중간 박스 (체인 일부) | `Run from the start box` |
| 단독 박스 | `Add Input Data, System Prompt, and Model` |

#### 5.4.6b View List (Input Data 드롭다운)

**위치**: 박스 패널 "📊 Input Data" 아래, `Current: N inputs` 옆 **[View List ▼]**.

**동작**: 클릭 시 **드롭다운**으로 로드된 입력 목록 표시.

```
Current: 48 inputs ✅
[View List ▼]
         │
         ▼
┌─────────────────────────────────────────┐
│ 1. I want a refund                      │
│ 2. When will my order arrive?           │
│ 3. asdfasdf                             │
│ 4. Price question                       │
│ 5. Want to cancel                       │
│ ...                                     │
│ 48. (스크롤)                            │
└─────────────────────────────────────────┘
```

**표시 규칙:**
- 한 줄에 하나의 input 텍스트 (길면 말줄임 …)
- 왼쪽에 번호 (1, 2, 3 …)
- 목록이 길면 드롭다운 내부 **스크롤**
- 읽기 전용 (여기서 삭제/수정 없음; Load Test Data 모달에서 관리)

**진입점**: 박스 패널 "📎 Additional Data" 섹션의 `[+ Add]` 클릭.

**타입 선택 (드롭다운)**:
```
┌──────────────────────────┐
│ [+ Add]               ▼  │
└──────────────────────────┘
         │
         ▼
┌──────────────────────────┐
│ 📝 Text                  │
│ 💻 Code                  │
│ 🖼️ Image                 │
│ 📎 File                  │
└──────────────────────────┘
```

**타입별 입력 모달:**

**Text:**
```
┌─────────────────────────────────────────────┐
│  Add Text                              [×]  │
├─────────────────────────────────────────────┤
│  Name (optional)  [context               ]  │
│  Content *        ┌─────────────────────┐   │
│                   │ This is a reference │   │
│                   │ paragraph...        │   │
│                   └─────────────────────┘   │
│                          [Cancel]  [Add]    │
└─────────────────────────────────────────────┘
```

**Code:**
```
┌─────────────────────────────────────────────┐
│  Add Code                              [×]  │
├─────────────────────────────────────────────┤
│  Name (optional)  [main.py               ]  │
│  Language         [Python             ▼]   │
│  Code *           ┌─────────────────────┐   │
│                   │ def hello():        │   │
│                   │     print("world")  │   │
│                   └─────────────────────┘   │
│                          [Cancel]  [Add]    │
└─────────────────────────────────────────────┘
```
Language: python, javascript, typescript, json, markdown, plaintext 등

**Image:**
```
┌─────────────────────────────────────────────┐
│  Add Image                             [×]  │
├─────────────────────────────────────────────┤
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐   │
│  │  📤 Drag & drop or click to upload    │   │
│  │     PNG, JPG, WebP (max 10MB)         │   │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘   │
│  또는 [Choose File...]                      │
│  (업로드 후: 썸네일 + 파일명 + 크기)       │
│                          [Cancel]  [Add]    │
└─────────────────────────────────────────────┘
```

**File:**
```
┌─────────────────────────────────────────────┐
│  Add File                              [×]  │
├─────────────────────────────────────────────┤
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐   │
│  │  📤 Drag & drop or click to upload    │   │
│  │     PDF, TXT, JSON (max 20MB)         │   │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘   │
│  또는 [Choose File...]                      │
│  Selected: doc.pdf (512 KB)                 │
│                          [Cancel]  [Add]    │
└─────────────────────────────────────────────┘
```

**추가된 항목 목록 (각 행)**:
```
│ 📝 context (Text)              [Edit][×]   │
│    "This is a reference paragraph..."      │
│ 💻 main.py (Python)            [Edit][×]   │
│    def hello(): print("world")             │
│ 🖼️ screenshot.png              [Edit][×]   │
│    102 KB                                  │
│ 📎 doc.pdf                     [Edit][×]   │
│    512 KB                                  │
```
- Edit: 해당 타입 모달 재오픈
- ×: 삭제
- 최대 20개 (ADDITIONAL_DATA_SPEC)

**흐름**: [+ Add] → 타입 선택 → 모달 입력 → [Add] → 목록에 추가. Image/File은 업로드 후 URL 저장.

#### 5.4.7 Load Test Data Modal

```
┌─────────────────────────────────────────────────────────────────┐
│  📁 Load Test Data                                         [✕]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  From: [Live View Snapshots ▼]      ← Default (most common)     │
│        ├─ Live View Snapshots                                   │
│        ├─ Previous Test Results                                 │
│        ├─ Upload CSV                                            │
│        └─ Manual Input                                          │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Agent: [Classifier ▼]              Period: [Last 7 days ▼]     │
│         ├─ All Agents                                           │
│         ├─ Classifier (328)                                     │
│         ├─ Writer (156)                                         │
│         └─ Summarizer (89)                                      │
│                                                                 │
│  Filter: [All ▼]                                                │
│          ├─ All                                                 │
│          └─ Worst Only                                          │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ☑ │ Input                    │ Status   │ Date          │   │
│  ├───┼──────────────────────────┼──────────┼───────────────┤   │
│  │ ✓ │ "I want a refund"        │ ✅ Pass  │ 2h ago        │   │
│  │ ✓ │ "When will it arrive?"   │ ✅ Pass  │ 3h ago        │   │
│  │ ✓ │ "asdfasdf"               │ ⚠️ Worst │ 3h ago        │   │
│  │   │ "Price question"         │ ✅ Pass  │ 5h ago        │   │
│  │ ✓ │ "Want to cancel"         │ ✅ Pass  │ 1d ago        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Selected: 48/127                   [Select All] [Clear All]    │
│                                                                 │
│  ☐ Include original responses (for visual comparison)          │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                         [Cancel]  [Import]      │
└─────────────────────────────────────────────────────────────────┘

Source Options:
- "Live View Snapshots": Real production traffic from SDK (most common)
- "Previous Test Results": Re-run previous experiments
- "Upload CSV": Import from file (input column required)
- "Manual Input": Type test inputs directly

Filter Options:
- "All": All snapshots from selected agent
- "Worst Only": Only is_worst=true records (failed Signal checks)

**Import 규칙:** Test Lab으로 가져오는 것은 **Input(입력 텍스트)만** 사용. 원본 응답(response)은 채점/체인 실행에 쓰지 않음.  
**☐ Include original responses (for visual comparison)**: 체크 시 UI에서 "Live vs Test" 비교용으로 원본 응답을 같이 보여줄 뿐, 실행 로직에는 영향 없음.
```

#### 5.4.7a Manual Input UI

Load Test Data Modal에서 **From: Manual Input** 선택 시 아래 UI로 전환.

```
┌─────────────────────────────────────────────────────────────────┐
│  📁 Load Test Data - Manual Input                         [✕]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  From: [Manual Input ▼]                                         │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Add test inputs (one per line or use [+ Add] for separate)     │
│                                                                 │
│  Option A: Multi-line text area                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ I want a refund                                         │   │
│  │ When will my order arrive?                              │   │
│  │ Log in is not working                                   │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│  💡 Each line = one test input                                  │
│                                                                 │
│  Option B: List with [+ Add] button                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 1. [I want a refund_____________________]        [×]    │   │
│  │ 2. [When will my order arrive?__________]        [×]    │   │
│  │ 3. [Log in is not working_______________]        [×]    │   │
│  └─────────────────────────────────────────────────────────┘   │
│  [+ Add Input]                                                  │
│                                                                 │
│  Current: 3 inputs                                              │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                         [Cancel]  [Import]      │
└─────────────────────────────────────────────────────────────────┘
```

**추천: Option A (Multi-line)**

- 한 텍스트 영역에 한 줄 = 한 입력
- 빈 줄은 무시
- 붙여넣기로 여러 줄 한 번에 추가 가능
- 직관적이고 빠름

**Option B (List)**

- 각 입력을 개별 행으로 관리
- [×]로 개별 삭제
- [+ Add Input]으로 행 추가
- 순서 변경(드래그) 가능 시 유용

**최소 입력 수**: 1건 이상 필요. 0건이면 [Import] 비활성화 또는 "Add at least one input" 경고.

**많은 인풋(100개 이상):** 여러 줄 붙여넣기 → 한 줄 = 1 input, 한 번에 N개 행 생성. CSV 업로드로도 몇 백 줄 한 번에 Import 가능.

**Import 후**: `input_data_ids`에 Manual Input으로 생성된 ID들이 저장됨. 박스의 "Current: N inputs"에 반영.

#### 5.4.7b 튜닝 vs 인풋 프롬프트 · Insert 규칙

| 구분 | 규칙 |
|------|------|
| **튜닝용 프롬프트** | 한 칸. 여러 문장이어도 **하나의 블록**(시스템/튜닝 프롬프트 1개)으로 입력. |
| **테스트할 인풋 프롬프트** | **적을 때**: `[+]`로 한 행씩 추가. **많을 때(100개 이상)**: Manual은 여러 줄 붙여넣기(한 줄 = 1 input), CSV는 매핑 후 Import로 bulk. Live View는 기존대로 bulk. |
| **Insert(실험마다 다른 문장)** | **한 실행(한 행) = 하나의 insert.** Input Data 행 구조: `input`(필수) + `insert`(선택). 한 칸에 여러 insert를 줄바꿈으로 넣지 않음. 여러 insert = 행 여러 개, 행마다 insert 한 개. |

#### 5.4.8 [▶ Test] Button → Test Configuration Modal

```
┌─────────────────────────────────────────────────────────────────┐
│  ▶ Chain Test Configuration                               [✕]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Target: Classifier → Writer → Summarizer (3 agents)            │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Test Type                                                      │
│  ● 모델만 변경 (프롬프트 유지)                                    │
│  ○ 프롬프트만 변경 (모델 유지)                                   │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Repeat Count: [100 ▼]                                          │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Signals: [Use Agent Settings ▼]                                │
│           ├─ Use Agent Settings (copied from Live View)         │
│           ├─ Project Default                                    │
│           └─ Custom...                                          │
│                                                                 │
│  Current: 2 signals active                                      │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ ☑ Length Change           ±50%                  [Edit][×]│ │
│  │ ☑ Latency Limit           30s max               [Edit][×]│ │
│  │                                                           │ │
│  │ [+ Add Signal ▼]                                         │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  Estimated Cost: ~$3.60 (100 runs × 3 agents)                   │
│  Signal Cost: $0.00 (rule-based only)                           │
│                                                                 │
│                                    [Cancel]  [▶ Run Test]       │
└─────────────────────────────────────────────────────────────────┘

Signal Options:
- "Use Agent Settings": Uses signal config copied from Live View agent
- "Project Default": Uses project-level default signals
- "Custom": Configure signals specifically for this test
```

#### 5.4.8.1 Run Test Loading State

After user clicks **[▶ Run Test]** in the Test Configuration Modal:

1. **Modal stays open** and switches to a loading state. **[Cancel]** and **[▶ Run Test]** are disabled.
2. **Progress** is shown inside the modal (e.g. current step or agent name, optional N/M counter).
3. **On success**: Modal closes and the Test Results screen is shown (list view for that run).
4. **On error**: Modal shows an error message and **[Cancel]** is re-enabled so the user can dismiss.

**Loading state mock (inside same modal):**

```
┌─────────────────────────────────────────────────────────────────┐
│  ▶ Chain Test Configuration                               [✕]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Target: Classifier → Writer → Summarizer                        │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│         ⟳  Running test...                                      │
│                                                                 │
│         Step 2 of 3: Writer                                      │
│         ████████████░░░░░░░░   (optional progress bar)          │
│                                                                 │
│  [Cancel] and [▶ Run Test] are disabled until finished or error  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Rules:**

- **Progress text**: Prefer "Step N of M: &lt;AgentName&gt;" or "Running: Classifier → Writer → …" so the user knows which part is running.
- **Optional**: Progress bar (determinate if backend sends progress; otherwise indeterminate spinner only).
- **Error in modal**: Show message (e.g. "Run failed: &lt;reason&gt;") and re-enable **[Cancel]** only; do not re-enable **[▶ Run Test]** until user cancels and can fix config.
- **Success**: Close modal and navigate to Test Results (same run). No need to keep modal open.

#### 5.4.9 Test Results Screen

**List View (Multiple Results)**
```
┌─────────────────────────────────────────────────────────────────┐
│  📊 Test Results - Classifier                                   │
│  Run: 48 inputs | ✅ 42 Pass | ⚠️ 6 Fail                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [All] [✅ Pass (42)] [⚠️ Fail (6)]              🔍 [Search...] │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ # │ Input              │ Status   │ Signals    │ Actions  │ │
│  ├───┼────────────────────┼──────────┼────────────┼──────────┤ │
│  │ 1 │ "환불해주세요"     │ ✅ Pass  │ 5/5 Pass   │ [View]   │ │
│  │ 2 │ "배송 언제?"       │ ✅ Pass  │ 5/5 Pass   │ [View]   │ │
│  │ 3 │ "asdfasdf"         │ ⚠️ Fail  │ 3/5 Pass   │ [View]   │ │
│  │ 4 │ "로그인 안돼"      │ ✅ Pass  │ 5/5 Pass   │ [View]   │ │
│  │...│ ...                │ ...      │ ...        │ ...      │ │
│  │48 │ "취소하고 싶어"    │ ✅ Pass  │ 5/5 Pass   │ [View]   │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Page: [< 1 2 3 4 5 >]                                          │
│                                                                 │
│  [💾 Save All] [Export CSV ▼] [⚠️ Mark Fails as Worst]          │
│                └─ Export All                                    │
│                └─ Export Worst Only                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

Button Actions:
- [💾 Save All]: Save all results to test_results table
- [Export CSV]: Export to file (All or Worst Only)
- [⚠️ Mark Fails as Worst]: Set is_worst=true for failed items
```

**Detail View (Single Result - Click [View])**
```
┌─────────────────────────────────────────────────────────────────┐
│  #3 - "asdfasdf"                                           [×]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────┬─────────────────────────┐         │
│  │ 🔵 Live View (참고)     │ 🟢 Test Lab (결과)      │         │
│  ├─────────────────────────┼─────────────────────────┤         │
│  │ System Prompt:          │ System Prompt:          │         │
│  │ "You are a..."          │ "You are a..."          │         │
│  ├─────────────────────────┼─────────────────────────┤         │
│  │ Response:               │ Response:               │         │
│  │ "I cannot understand"   │ "Sorry, invalid input"  │         │
│  │                         │                         │         │
│  │ (참고용 - 채점 안 함)   │ 📊 Signal Results:      │         │
│  │                         │ ✅ Length: 24자 (OK)    │         │
│  │                         │ ⚠️ Keyword: "cannot"    │         │
│  │                         │ ✅ Latency: 180ms       │         │
│  └─────────────────────────┴─────────────────────────┘         │
│                                                                 │
│  Status: [NEEDS_REVIEW ▾]                                      │
│  Decision:  ○ OK   ● Mark as Worst   ○ Ignore                  │
│  Comment:  [............................................]      │
│                                                                 │
│  [◀ Prev] [▶ Next]                    [Save decision]          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

Rules:

- Test Lab에서도 Signal 결과가 애매한 케이스는 `status="NEEDS_REVIEW"`로 저장할 수 있다.
- Detail View에서 바로 **Decision**을 선택하고 `[Save decision]`을 누르면:
  - `OK`: `status`를 `RESOLVED_OK` 등으로 변경하고 Worst에는 포함하지 않는다.
  - `Mark as Worst`: `is_worst=true`로 설정하여 Worst Set에 포함하고, `status`를 `RESOLVED_WORST` 등으로 변경한다.
  - `Ignore`: 기록은 남기되 Review Queue/필터에서 제외하는 등의 처리를 할 수 있다.

**Chain Test Results (Multi-Agent)**
```
┌─────────────────────────────────────────────────────────────────┐
│  📊 Chain Test Results                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Overall: ⚠️ NEEDS REVIEW                                       │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Step 1: Classifier                              ✅ SAFE │   │
│  │ Input: "I want a refund"                                │   │
│  │ Output: "category: refund_request"                      │   │
│  │ Latency: 240ms                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                          │                                      │
│                          ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Step 2: Writer                            ⚠️ REVIEW    │   │
│  │ Input: "category: refund_request"                       │   │
│  │ Output: "Hello, your refund request has been..."        │   │
│  │ Latency: 1.2s                                           │   │
│  │ ⚠️ Length change detected: +45% from baseline           │   │
│  │ [OK] [Mark as Worst]  ← REVIEW = 사람 판정 필요, 통과 가능 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                          │                                      │
│                          ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Step 3: Summarizer                              ✅ SAFE │   │
│  │ Input: "Hello, your refund request..."                  │   │
│  │ Output: "[Summary] Refund request received"             │   │
│  │ Latency: 450ms                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Total: 1.89s | SAFE: 2 | REVIEW: 1 | CRITICAL: 0              │
│                                                                 │
│  [💾 Save All] [Export CSV ▼] [⚠️ Mark Fails as Worst]          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Security Design

### 6.1 인증/인가 (Authentication/Authorization)

#### 6.1.1 JWT 기반 인증 ✅ 구현완료

| 항목 | 설정값 |
|------|--------|
| 알고리즘 | HS256 |
| Access Token 만료 | 60분 |
| Refresh Token 만료 | 30일 |
| 저장 방식 | Access: 메모리, Refresh: HttpOnly Cookie |

```python
# backend/app/core/security.py
def create_access_token(user_id: int, email: str) -> str:
    payload = {
        "user_id": user_id,
        "email": email,
        "exp": datetime.utcnow() + timedelta(minutes=60),
        "iat": datetime.utcnow()
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm="HS256")
```

#### 6.1.2 Password Hashing ✅ 구현완료

- **알고리즘**: bcrypt
- **Rounds**: 12 (보안과 성능의 균형)

#### 6.1.3 RBAC (Role-Based Access Control) ✅ 구현완료

| 역할 | 권한 |
|------|------|
| Owner | 모든 권한 (생성, 읽기, 수정, 삭제, 방화벽 관리) |
| Admin | 읽기, 수정, 방화벽 관리 |
| Member | 읽기 전용 |

#### 6.1.4 2FA/MFA (Two-Factor Authentication) 🔜 예정

**구현 예정 사항**:
- TOTP 기반 인증 (Google Authenticator, Authy 호환)
- SMS 백업 코드 (선택적)
- 복구 코드 10개 생성

**예정 구현**:
```python
# backend/app/services/mfa_service.py (예정)
class MFAService:
    def generate_totp_secret(self, user_id: int) -> str:
        """TOTP 시크릿 생성 (QR 코드용)"""
        secret = pyotp.random_base32()
        # DB에 암호화 저장
        return secret
    
    def verify_totp(self, user_id: int, code: str) -> bool:
        """6자리 TOTP 코드 검증"""
        totp = pyotp.TOTP(user_secret)
        return totp.verify(code, valid_window=1)  # ±30초 허용
```

**UI 플로우**:
```
Settings → Security → Enable 2FA
    ↓
QR Code 표시 + 수동 입력 키
    ↓
6자리 코드 입력 확인
    ↓
복구 코드 10개 표시 (다운로드 권장)
    ↓
2FA 활성화 완료
```

---

### 6.2 Rate Limiting & Abuse Protection ✅ 구현완료

#### 6.2.1 Rate Limiting

| 설정 | 값 |
|------|-----|
| 제한 | 분당 60 요청 |
| 기준 | IP 주소 |
| 저장소 | Redis |
| 제외 경로 | `/health`, `/`, OPTIONS 요청 |

```python
# backend/app/middleware/rate_limit.py
class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, requests_per_minute: int = 60):
        self.requests_per_minute = requests_per_minute
    
    def _check_rate_limit(self, client_id: str) -> bool:
        current_count = cache_service.get(client_id)
        if current_count >= self.requests_per_minute:
            return False  # 429 Too Many Requests
        return True
```

#### 6.2.2 Brute Force Protection

**지수적 백오프 정책**:

| 실패 횟수 | 대기 시간 |
|-----------|-----------|
| 3회 | 1분 |
| 5회 | 5분 |
| 10회 | 15분 |
| 15회 | 1시간 |
| 20회+ | CAPTCHA 요구 + 1시간 |

```python
# backend/app/services/brute_force_protection.py
class BruteForceProtectionService:
    thresholds = (
        (3, 60),    # 3 failures → 1 min
        (5, 300),   # 5 failures → 5 min
        (10, 900),  # 10 failures → 15 min
        (15, 3600), # 15 failures → 1 hour
    )
    captcha_threshold = 20
```

---

### 6.3 Security Headers ✅ 구현완료

```python
# backend/app/middleware/security_middleware.py
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        
        # HSTS (HTTPS 강제)
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        
        # Clickjacking 방지
        response.headers["X-Frame-Options"] = "DENY"
        
        # MIME Sniffing 방지
        response.headers["X-Content-Type-Options"] = "nosniff"
        
        # XSS 필터
        response.headers["X-XSS-Protection"] = "1; mode=block"
        
        # Referrer 정책
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        
        # CSP
        response.headers["Content-Security-Policy"] = "default-src 'self' https:; ..."
        
        # 브라우저 기능 제한
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        
        return response
```

---

### 6.4 데이터 암호화

#### 6.4.1 전송 암호화 (In-Transit) ✅ 구현완료

- **TLS 버전**: 최소 1.2, 권장 1.3
- **HTTPS 강제**: 프로덕션 환경에서 HTTP → HTTPS 리다이렉트

#### 6.4.2 저장 암호화 (At-Rest) ✅ 구현완료

- **알고리즘**: AES-256-GCM
- **대상**: API Keys, 민감 설정값

```python
# backend/app/core/encryption.py
class EncryptionService:
    def __init__(self, key: bytes):
        self.aesgcm = AESGCM(key)
    
    def encrypt(self, plaintext: str) -> bytes:
        nonce = os.urandom(12)  # 96-bit nonce
        ciphertext = self.aesgcm.encrypt(nonce, plaintext.encode(), None)
        return nonce + ciphertext
```

---

### 6.5 Data Ownership & Privacy

- All Snapshot data is user-owned
- Query/delete anytime
- Export functionality (JSON/CSV)
- GDPR compliant (삭제 권리, 이전 권리 지원)

---

### 6.6 API Key Management

#### 6.6.1 AgentGuard API Key (SDK 인증용) ✅ 구현완료

**용도**: 사용자 앱에서 SDK로 AgentGuard에 연결할 때 인증. 코드에 `agentguard.init(api_key="ag_xxx")` 넣고 실행하면, 이후 LLM 호출이 AgentGuard를 경유해 캡처되고 프론트(Live View, API Calls)에 표시됨.

| 항목 | 내용 |
|------|------|
| **백엔드** | `GET/POST/DELETE/PATCH /api/v1/settings/api-keys` (backend/app/api/v1/endpoints/settings.py) |
| **프론트** | Settings → API Keys (`/settings/api-keys`, frontend/app/settings/api-keys/page.tsx) |
| **기능** | 목록 조회, 생성(이때만 전체 키 반환), 삭제(비활성화), 이름 수정 |
| **저장** | 키는 해시(SHA256)로 저장, 원본은 생성 시 한 번만 반환 |

```python
# backend: API Key 생성 시 원본은 한 번만 반환, DB에는 해시만 저장
api_key_value = f"{key_prefix}{random_part}"
key_hash = hashlib.sha256(api_key_value.encode()).hexdigest()
# DB에 key_hash 저장, api_key_value 반환 (재조회 불가)
```

#### 6.6.2 LLM Provider API Key (BYOK) — 구현 완료

**용도**: Test Lab에서 박스 선택 시 나오는 설정에서 실제 LLM 호출(OpenAI, Anthropic, Google) 시 사용할 키. 프로젝트별로 등록.

| 항목 | 내용 |
|------|------|
| **백엔드** | `GET/POST /api/v1/projects/{project_id}/user-api-keys`, `DELETE /api/v1/projects/{project_id}/user-api-keys/{key_id}` (user_api_keys.py). provider: openai \| anthropic \| google, api_key 암호화 저장. |
| **프론트** | ✅ 구현. 프로젝트 **Settings** 탭 → **API Keys** 페이지에서 등록/삭제. (`/organizations/{orgId}/projects/{projectId}/settings`, `settings/api-keys`) |
| **등록할 키** | 쓰는 Provider만: **OpenAI API Key**, **(선택) Anthropic API Key**, **(선택) Google API Key**. Custom(model_id, base_url)은 스키마 확장 후 동일 페이지에서 등록 예정. |

Provider당 키 하나면 해당 Provider의 모든 모델 호출 가능. 모델은 요청 시점에 선택.

**Custom 키 정책 (6번 결정)**  
- **저장 단위**: 프로젝트. Custom 설정(API Key + Model ID + Base URL)을 프로젝트에 미리 등록.  
- **Test Lab**: 박스에서 모델 선택 시 **Custom** 선택 → 미리 등록된 Custom 목록에서 선택. (박스마다 입력하지 않음.)  
- **스키마 확장 예정**: provider=`custom`, `model_id`, `base_url` 필드 추가 후 동일 API/UI로 등록.

#### Custom Model 저장 및 재사용 정책

- **프로젝트 단위 등록 (Settings → API Keys)**  
  - 프로젝트 설정의 **API Keys** 페이지에서 OpenAI / Anthropic / Google 키 외에 **Custom Models**를 등록할 수 있다.
  - Custom Model 항목은 다음 정보를 포함한다:
    - display_name (예: "Mistral Large (Prod)")
    - provider_name (예: "mistral")
    - model_id (예: "mistral-large")
    - base_url (선택, 셀프호스팅/타 Provider용)
    - api_key (암호화 저장)
  - 등록된 Custom Models는 **프로젝트 내 모든 Test Lab 박스에서 재사용** 가능하다.

- **Test Lab 박스 설정 패널에서 사용**  
  - Test Lab에서 박스를 클릭하면 우측에 **박스 설정 패널**이 열린다.
  - Model 드롭다운에는:
    - Provider별 기본 모델(OpenAI, Anthropic, Google)과 함께,
    - **Custom Models** 섹션에 프로젝트에 등록된 Custom Model 목록이 표시된다.
  - 사용자는:
    - 1) 드롭다운에서 기존 Custom Model을 선택하거나,
    - 2) “+ New Custom…”을 선택해 박스 설정 패널 안에서 바로 새 Custom Model을 추가할 수 있다.  
       이 경우 새 Custom Model은 Settings → API Keys 페이지에도 함께 저장된다.

- **Live View와의 관계**  
  - Live View는 **현재 사용 중인 모델/키를 모니터링**하는 용도이며,  
    - Live View 박스에서는 모델 정보가 읽기 전용으로만 표시된다. (`Model: gpt-4o` 등)
  - BYOK Custom Model의 등록·수정·선택은 **반드시 Test Lab 및 Settings → API Keys**에서만 수행한다.

#### 6.6.3 프로젝트 설정 표시

**진입점**: 프로젝트 상단 탭 중 **Settings** (owner/admin만 노출, `canManage`).

**랜딩 페이지** (`/organizations/{orgId}/projects/{projectId}/settings`):  
- **General**: 프로젝트 이름·설명 편집. (`settings/general`)  
- **Notifications**: 알림 설정. (`settings/notifications`)  
- **API Keys**: LLM API 키(OpenAI, Anthropic, Google) 등록·삭제. Custom 모델은 스키마 확장 후 동일 페이지에서 추가. (`settings/api-keys`)

캔버스(:::) 메뉴에는 넣지 않음. 프로젝트 이름 변경·API 키 입력은 **프로젝트 설정**에서만 수행.

---

### 6.7 테넌트 격리 (Multi-Tenancy)

- 모든 쿼리에 `project_id` 필수
- Row-level security 적용
- Organization 단위 데이터 분리

---

### 6.8 입력 검증 & 방어 ✅ 구현완료

| 공격 유형 | 방어 방식 |
|-----------|-----------|
| SQL Injection | SQLAlchemy ORM 사용 (파라미터 바인딩) |
| XSS | CSP 헤더 + 출력 이스케이프 |
| CSRF | SameSite Cookie (Strict) |
| SSRF | 허용 호스트 화이트리스트 (OpenAI, Anthropic 등) |

---

### 6.9 규정 준수 로드맵

| 인증/규정 | 상태 | 목표 시점 |
|-----------|------|-----------|
| GDPR | ✅ 준수 | 현재 |
| CCPA | ✅ 준수 | 현재 |
| SOC2 Type 1 | 🔜 준비 중 | 6개월 내 |
| SOC2 Type 2 | 📅 계획 | 18개월 내 |

---

### 6.10 보안 모니터링

#### Audit Log ✅ 구현완료

로깅 대상:
- 로그인 시도 (성공/실패)
- 권한 변경
- API Key 생성/삭제
- 중요 설정 변경

#### 향후 추가 예정 🔜

- 실시간 침입 탐지 알림
- 비정상 트래픽 자동 차단
- 보안 대시보드 UI

---

## 7. 구현 현황

### 7.1 완료

**핵심 기능**:
- [x] 기본 Proxy 및 Snapshot 저장
- [x] Project/Organization 관리
- [x] 인증/인가 시스템
- [x] 기본 Replay 기능
- [x] 플랜별 제한 정의 (`subscription_limits.py`: `input_prompts_per_test`, `repeat_count_per_test`, `csv_import_row_limit`, `total_calls_per_single_test`, `concurrent_tests_per_project`, `data_retention_days`) — 백엔드 검증 적용 예정
- [x] **Organization plan_type 5단계 통일**: Subscription과 동일하게 `free`, `indie`, `startup`, `pro`, `enterprise` 허용. 모델 주석, API 스키마(OrgCreate), GET org 응답 plan_limits, 프론트 스키마·PlanType 반영.
- [x] **한도 검증 (Replay/Regression)**: 실행 전 `input_prompts_per_test`, `total_calls_per_single_test` 검사. 초과 시 403 + detail/code. §2.10 "한도 검증 (백엔드)" 반영.

**보안**:
- [x] JWT 기반 인증 (HS256, Access/Refresh Token)
- [x] bcrypt 패스워드 해싱 (12 rounds)
- [x] RBAC (Owner/Admin/Member)
- [x] Rate Limiting (분당 60 요청)
- [x] Brute Force Protection (지수적 백오프 + CAPTCHA)
- [x] Security Headers (HSTS, CSP, X-Frame-Options 등)
- [x] AES-256-GCM 데이터 암호화
- [x] AgentGuard API Key 생성/목록/삭제 (백엔드 + 프론트 `/settings/api-keys`)
- [x] API Key 해시 저장 및 로테이션
- [x] LLM Provider 키(BYOK) 백엔드 (프로젝트별 openai/anthropic/google, 암호화 저장)
- [x] **프로젝트 설정 랜딩 및 LLM API Keys 프론트**: Settings 탭 → 랜딩(General, Notifications, API Keys) → General(이름/설명), API Keys(등록/삭제). 백엔드 경로: `GET/POST /projects/{project_id}/user-api-keys`, `DELETE /projects/{project_id}/user-api-keys/{key_id}`.
- [x] Audit Log (로그인, 권한 변경 등)

### 7.2 진행 중

- [ ] Live View (박스 자동 감지)
- [ ] Test Lab (캔버스 UI)
- [ ] Signal Engine (기본 5개)
- [ ] Worst Prompt Set 자동 수집

### 7.3 예정

**핵심 기능**:
- [ ] Chain Testing
- [ ] Human-in-the-loop UI
- [ ] 커스텀 Signal 추가 UI
- [ ] CI/CD 연동
- [ ] 데이터 보관 TTL/삭제 스케줄러 (`data_retention_days` 기준)
- [ ] **한도 API 노출**: `GET /subscription`, `GET /subscription/plans` 응답 `limits`에 테스트 관련 한도 5개 포함 (`SubscriptionService.get_user_plan()` 및 GET /plans 수정).
- [ ] UI에서 예상 호출 수 및 한도 초과 경고 표시
- [ ] **한 번에 하나만 실행** 적용: 사용자당 동시 1개, 실행 중이면 새 실행 거절(백엔드) 및 UI에서 다른 박스/ [▶ Test] 비활성화

**보안**:
- [ ] 2FA/MFA (TOTP 기반, Google Authenticator 호환)
- [ ] SOC2 Type 1 인증 (6개월 내)
- [ ] 실시간 보안 대시보드
- [ ] IP Whitelist (엔터프라이즈)

---

## 8. 테스트 시나리오 (프론트/UX 검증용)

설계에서 논의한 예외·엣지 케이스를 나중에 프론트엔드에서 하나씩 검증할 수 있도록 시나리오를 정리한 목록이다. 체크리스트 형태로 실행하거나, E2E/수동 테스트 케이스로 활용 가능.

### 8.1 Test Lab 진입 · Empty State

| # | 시나리오 | 예상 결과 |
|---|----------|-----------|
| T1 | 프로젝트에서 **Test Lab** 탭 클릭 | "Choose how to start" 없이 **바로 빈 캔버스** 표시. 상단에 [Add Box] [Arrow Mode], 좌측 툴바(□, +, -, ⛶, ↩, ↪). |
| T2 | 박스가 하나도 없는 상태에서 화면 확인 | 세 개 선택 카드(Import/Scratch/CSV) 없음. 빈 캔버스만 보이고, "□ 클릭하면 뷰포트 중앙에 박스 생성" 안내 등. |
| T3 | 좌측 **[□]** 한 번 클릭 | 뷰포트 **중앙**에 기본 크기(280×160) 박스 1개 생성. |
| T4 | 박스 선택 후 모서리 드래그 | **모서리 4개** 리사이즈, **좌우상하 4개** 연결 핸들(▲▼◀▶) Hover 시 표시. (draw.io 스타일) |
| T5 | **[Add Box]** (캔버스 상단) 존재 여부 | Test Lab 캔버스일 때 상단에 [Add Box] 버튼 노출. |

### 8.2 북마크 탭 · Snapshots

| # | 시나리오 | 예상 결과 |
|---|----------|-----------|
| T6 | Live View / Test Lab / 빈 캔버스 모든 화면에서 오른쪽 확인 | **Live View | Test Lab | Snapshots** 세 탭 모두 표시. |
| T7 | **Snapshots** 탭 클릭 | 해당 프로젝트의 전체 `snapshots` 테이블 뷰(필터·검색·페이지네이션). 박스 30개 제한과 무관. |

### 8.3 박스 수 제한 (30개)

| # | 시나리오 | 예상 결과 |
|---|----------|-----------|
| T8 | Live View에서 감지된 에이전트가 30개일 때 31번째 트래픽 발생 | 새 박스 생성 안 함. 상단 배너: "Too many agents (30). Additional traffic recorded in snapshots only." + [View Snapshots ▸]. |
| T9 | Test Lab에서 박스 30개 만든 뒤 [□] 또는 [Add Box]로 추가 시도 | 31번째 박스 생성 차단. 메시지: "이 캔버스는 최대 30개 에이전트까지 지원합니다." |

### 8.4 Load Test Data · CSV Import

| # | 시나리오 | 예상 결과 |
|---|----------|-----------|
| T10 | Load Test Data 모달에서 **From: Upload CSV** 선택 후 파일 선택만 하고 **Input 매핑 안 함** | [Import] **비활성**. "Input에 매핑할 컬럼을 선택하세요." 표시. |
| T11 | Input 컬럼 매핑 후, 일부 행만 Input 비어 있는 CSV Import | 유효 행만 Import. "✓ N valid rows, M skipped (empty Input)" 또는 동일 의미 메시지. [Import N rows] 활성. |
| T12 | [📥 Download Template] 클릭 | `input` 컬럼만 있는 샘플 CSV 다운로드. |
| T13 | CSV 100행 이상 Import 후 박스 "Current: N inputs" | N = 실제 가져온 행 수(예: 100). 몇 백 줄도 한 번에 반영. |

### 8.5 Load Test Data · Manual Input

| # | 시나리오 | 예상 결과 |
|---|----------|-----------|
| T14 | Manual Input에서 **0줄** 입력 후 [Import] | [Import] 비활성 또는 "Add at least one input" 경고. |
| T15 | 여러 줄 붙여넣기(예: 50줄) 후 [Import] | 한 줄 = 1 input, 50개 행으로 저장. "Current: 50 inputs". |
| T16 | **[+ Add Input]** (또는 [+]) 로 소량 추가 | 한 행씩 추가. 적을 때는 이 방식 사용. |

### 8.6 튜닝 vs 인풋 · Insert

| # | 시나리오 | 예상 결과 |
|---|----------|-----------|
| T17 | 박스 설정에서 **시스템/튜닝 프롬프트** 한 칸에 여러 문장 입력 | 여러 문장이어도 **하나의 블록**으로 저장·전달. |
| T18 | Input Data에 **insert** 컬럼(또는 필드) 사용 시 | 한 행 = 하나의 `input` + 하나의 `insert`(선택). 한 칸에 여러 insert 줄바꿈으로 넣지 않음. |

### 8.7 Alerts (🔔)

| # | 시나리오 | 예상 결과 |
|---|----------|-----------|
| T19 | **Live View**에서 새로운 Worst 스냅샷 발생 | 상단 🔔 배지 증가. 알림 목록에 "Live Worst" 항목. |
| T20 | 🔔 클릭 후 **Live Worst** 항목 클릭 | 해당 **프로젝트 → Live View**로 이동, 해당 박스 포커스, Worst 섹션 강조. |
| T21 | **Test Lab**에서 Worst 발생 (테스트 실패) | 🔔 알림 **안** 뜸. Test Results 화면 안에서만 확인. |

### 8.8 Review (NEEDS_REVIEW)

| # | 시나리오 | 예상 결과 |
|---|----------|-----------|
| T22 | Live View 박스 **Needs Review** 탭에서 항목에 [OK] 클릭 | 해당 케이스 NEEDS_REVIEW 해제, 리스트에서 제거. Worst에 포함 안 됨. |
| T23 | [Mark as Worst] 클릭 | `is_worst=true` 설정, Worst 탭에 표시. |
| T24 | Test Lab 결과 디테일에서 **REVIEW** 상태인 항목 → Decision **OK** + [Save decision] | 통과 처리, Worst 아님. |
| T25 | Chain Test 결과에서 Step이 **REVIEW**일 때 [OK] / [Mark as Worst] 버튼 | 각각 통과 / Worst로 반영. |

### 8.9 Webhook · Raw 표시

| # | 시나리오 | 예상 결과 |
|---|----------|-----------|
| T26 | Snapshot/Worst 카드에 Webhook 결과 한 줄 요약 + **View raw ▸** | 클릭 시 우측 패널 또는 모달에서 **전체 JSON** pretty-print, [Copy JSON] 버튼. |
| T27 | Webhook 응답이 매우 긴 경우 | 목록에서는 앞부분만 잘라서 표시. Raw 뷰어에서는 전체 표시. |

### 8.10 화살표 · draw.io · 순환

| # | 시나리오 | 예상 결과 |
|---|----------|-----------|
| T28 | 박스 A → B, B → A 양방향 엣지 연결 | 두 개의 **독립 엣지**. 각각 순서 번호 부여 가능. |
| T29 | 순환 체인(예: A→B→C→A) 구성 후 테스트 시도 | 백엔드/유효성 검사에서 **에러**. "순환 체인은 허용되지 않습니다." 안내. |
| T30 | 분기(한 박스에서 두 개로) 연결 | 시각적으로 draw.io 스타일(Y자 등) 허용. 데이터는 **별도 선 2개**. 합쳐졌다 갈라지는 단일 선 아님. |

### 8.11 Custom (API Key · Model ID) · 실행 시 오류

| # | 시나리오 | 예상 결과 |
|---|----------|-----------|
| T33 | Test Lab 박스에서 **Custom** 선택 후 **잘못된 API Key** (또는 빈 키) 넣고 [▶ Test] 실행 | 실행 시 **오류**. "API key is invalid" 또는 동일 의미 메시지 표시. (Provider 응답을 사용자 친화 문구로 정리.) |
| T34 | Custom 선택 후 **올바른 API Key** + **존재하지 않는 Model ID** 넣고 실행 | 실행 시 **오류**. "Model not found" 또는 동일 의미 메시지 표시. |
| T35 | Custom 선택 후 **API Key / Model ID 중 하나라도 비어 있는 상태**에서 [▶ Test] 클릭 | 실행 전 **유효성 검사**에서 막거나, 실행 시 오류. "API Key and Model ID are required for Custom." 등 안내. |

### 8.12 플랜 한도 초과 · 프론트 경고

플랜별 한도(§2.10, `subscription_limits.py`) 초과 시 프론트에서 **즉시 경고** 또는 **실행 불가** 메시지를 표시하는지 검증.

| # | 시나리오 | 예상 결과 |
|---|----------|-----------|
| T38 | **인풋 개수**가 플랜 한도(`input_prompts_per_test`) 초과인 상태에서 [▶ Test] 클릭 | 실행 전/클릭 시 **경고** 또는 **실행 불가**. "Input limit exceeded (max N for your plan)." 등 메시지. |
| T39 | **Repeat count**를 플랜 한도(`repeat_count_per_test`) 초과로 설정한 뒤 [▶ Test] 클릭 | 설정 시 또는 실행 시 **경고/불가**. "Repeat count limit exceeded (max N)." 등. |
| T40 | **CSV Import** 시 행 수가 플랜 한도(`csv_import_row_limit`) 초과인 파일 업로드 | Import 시 **경고** 또는 초과분 잘림 안내. "Your plan allows up to N rows. First N rows imported." 또는 "File has M rows (limit N). Upgrade or reduce rows." 등. |
| T41 | 테스트 실행 전 **예상 호출 수**가 플랜 한도(`total_calls_per_single_test`) 초과인 경우 (예: 인풋×스텝×repeat > 한도) | 실행 전 **예상 호출 수** 표시(예: `~1,200 calls`) + 한도 초과 시 **실행 불가** 및 "Estimated calls (1,200) exceed your plan limit (1,000)." 등 경고. |
| T42 | **테스트가 이미 실행 중인데** 다른 박스에서 [▶ Test] 또는 추가 실행 시도 | **실행 불가**. 한 번에 하나만 실행이므로 실행 중이면 **다른 박스/ [▶ Test] 전부 비활성화**. "A test is already running. Wait for it to finish." 등 안내. |

### 8.13 기타

| # | 시나리오 | 예상 결과 |
|---|----------|-----------|
| T36 | Load Test Data에서 **Include original responses** 체크 후 Import | 테스트 실행 시 LLM 다시 호출. 원본 응답은 **비교용 UI**에만 사용, 채점/실행 로직에는 미사용. |
| T37 | Live View에서 **[Copy All to Test Lab]** | 현재 Live View 박스들이 Test Lab 캔버스로 복사. (Test Lab 진입은 별도.) |

### 8.14 프로젝트 설정 · API Keys

프로젝트 설정 랜딩, General, API Keys 페이지 및 user-api-keys API 동작 검증.

| # | 시나리오 | 예상 결과 |
|---|----------|-----------|
| T43 | 프로젝트에서 **Settings** 탭 클릭 (owner/admin) | **설정 랜딩** 표시. 카드 3개: General, Notifications, API Keys. 각 카드 클릭 시 해당 하위 페이지로 이동. |
| T44 | Settings 랜딩에서 **General** 클릭 | **General** 페이지. 프로젝트 이름·설명 입력 필드 및 [Save]. 저장 시 `PATCH /projects/{id}` 호출 후 토스트 "Project updated". |
| T45 | Settings 랜딩에서 **API Keys** 클릭 | **API Keys** 페이지. "Add API Key" 폼(Provider, API Key, Name) 및 "Registered keys" 목록. |
| T46 | API Keys 페이지에서 Provider 선택 후 API Key 입력·[Add key] | `POST /projects/{project_id}/user-api-keys` 호출. 성공 시 목록에 새 키 표시(provider, name, created_at). API Key 값은 재표시 안 함. |
| T47 | API Keys 페이지에서 등록된 키 옆 삭제(휴지통) 클릭·확인 | `DELETE /projects/{project_id}/user-api-keys/{key_id}` 호출. 성공 시 목록에서 해당 키 제거. |
| T48 | 프로젝트 멤버(owner/admin 아님)로 같은 프로젝트 진입 | **Settings** 탭 비노출. (또는 노출 시 General/API Keys는 읽기 전용/접근 거부.) |

**API 검증 (통합 테스트)**  
- `GET /api/v1/projects/{project_id}/user-api-keys`: 200, 배열. project 접근 권한 없으면 403.  
- `POST /api/v1/projects/{project_id}/user-api-keys`: body `provider`, `api_key`, `name`(선택). 200, 생성된 키 메타 반환. provider가 openai/anthropic/google 외면 400.  
- `DELETE /api/v1/projects/{project_id}/user-api-keys/{key_id}`: 200. 해당 키가 해당 프로젝트 소유가 아니면 404.

---

## Related Documents

- [BLUEPRINT.md](./BLUEPRINT.md) - 마스터 블루프린트
- [SCHEMA_SPEC.md](../SCHEMA_SPEC.md) - API 스키마 명세
- [guides/API_REFERENCE.md](./guides/API_REFERENCE.md) - API 문서
- [guides/DATABASE_SCHEMA.md](./guides/DATABASE_SCHEMA.md) - DB 스키마

---

*Last Updated: 2026-02-02* (§5.4.0 Custom 실행 시 오류; §8.11 Custom API Key·Model ID 테스트 T33–T35 추가; §6.6.2·§6.6.3 프로젝트 설정·LLM API Keys 구현 및 Custom 키 정책; §8.14 프로젝트 설정·API Keys 테스트 T43–T48 추가)
