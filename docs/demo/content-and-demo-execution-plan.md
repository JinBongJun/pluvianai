# 콘텐츠 및 간이 데모 실행 계획

**목적**: 주 고객층의 실제 문제를 우리 제품으로 해결하는 사례를 정리하고, 재현 가능한 간이 프로젝트와 스크린샷 기반 콘텐츠로 홍보하는 실행 계획을 정의한다.  
**관련 문서**: [mvp-content-playbook-pain-driven-toys.md](../mvp-content-playbook-pain-driven-toys.md), [BUSINESS_PLAN.md](../BUSINESS_PLAN.md), [PRD_AGENT_BEHAVIOR_VALIDATION.md](../PRD_AGENT_BEHAVIOR_VALIDATION.md)

---

## 1. 주 고객층 및 핵심 가치

### 1.1 타겟 세그먼트 (BUSINESS_PLAN 기준)

| 세그먼트 | 설명 | 채널 |
|----------|------|------|
| **1차: Indie Hackers / 빌드 인 퍼블릭** | 1인 개발자, AI 앱·SaaS 빠르게 빌드·검증, "성적표"로 증명하고 싶은 개발자 | X, Indie Hackers, Product Hunt |
| **2차: 오픈소스 기여자** | LangChain, LlamaIndex 등 에이전트 프레임워크 기여·성능 증명 | GitHub, Discord |
| **기타** | Prompt Engineers, 소규모 AI 팀(2~20명), 모델/프롬프트 변경에 대한 회귀 불안 | Reddit, 블로그 |

### 1.2 우리가 해결하는 것 (한 줄)

- **"같은 입력으로 다시 돌려서, 행동(툴 호출/순서/인자)이 바뀌었는지 비교하고, 배포 전에 통과/실패를 판정한다."**
- Release Gate(재생 + 규칙 검증) + Live View(실시간 로그/스냅샷) + Behavior 규칙(금지 도구, 툴 순서 등).
- **재현 가능한 문제**를 중심에 두는 것은 DevTool에서 가장 중요한 요소 중 하나다. 이 계획의 데모는 모두 "같은 입력으로 다시 돌리면 재현된다"는 전제 위에 설계되어 있다.

---

## 2. 주 고객층에서 생기는 문제 → 우리 해결 가능 여부

조사 및 [mvp-content-playbook-pain-driven-toys.md](../mvp-content-playbook-pain-driven-toys.md) 기반 정리.

### 2.1 Indie / 소규모 팀

| 문제 | 우리 해결 | 간이 재현 |
|------|-----------|-----------|
| 프롬프트/모델 바꿨는데 어디서 깨졌는지 모름 (Regression Fear) | ✅ Release Gate 동일 입력 재생 → diff 비교 | ✅ 고객지원 봇 + 질문 20개 스냅샷, 모델/프롬프트만 변경 후 재생 |
| 리드/라우팅이 잘못된 큐로 감 (실제 사례: 톤 수정 후 300건 오라우팅) | ✅ 재생 후 tool call/출력 비교 | ✅ 간단 라우팅 봇(도구 2~3개) + 스냅샷 재생 |
| 유저가 "요즘 답변 이상해요"만 하고 재현 케이스 없음 | ✅ Live View + 스냅샷 보관 → "그때 요청" 재생 | ✅ "이상했다" 입력을 스냅샷으로 남기고 재생 플로우 |

### 2.2 LangChain / 에이전트 프레임워크

| 문제 | 우리 해결 | 간이 재현 |
|------|-----------|-----------|
| 툴 체이닝 1단계 오류가 2·3단계로 전파 (cascading failure) | ✅ Replay로 "어느 스텝에서" 실패/다른지 확인, Behavior rule로 툴 순서/인자 검증 | ✅ 3단계 툴 체인(검색→요약→포맷), 2단계 입력 일부러 깨뜨려 재생 |
| invalid_tool_calls / JSON 파싱 실패 시 에이전트 조기 종료 | ✅ 재생 시 툴 호출 payload 확인, 규칙으로 스키마 위반 표시 | ✅ 의도적 잘못된 JSON 툴 호출 시나리오 재생 |
| LangGraph 등 버전 업 후 동작 깨짐 | ✅ "이전 성공 스냅샷"을 새 버전으로 재생 → 회귀 확인 | ✅ 동일 스냅샷을 구/신 버전에서 각각 재생 비교 |

### 2.3 n8n / 워크플로우 빌더

| 문제 | 우리 해결 | 간이 재현 |
|------|-----------|-----------|
| 같은 입력으로 툴 여러 번 호출 (n8n #12647 유사) | ✅ Behavior rule로 중복/시퀀스 검증, 재생으로 재현 | ✅ n8n AI Agent + 툴 1개, 동일 입력 두 번 호출 스냅샷 재생 |
| 도구 안 부름 / 잘못된 도구만 반복 | ✅ 재생 + Behavior 리포트로 "기대 툴 vs 실제 호출" 비교 | ✅ 프롬프트 변경으로 "도구 미호출" vs "특정 도구만 반복" 재생 |
| "같은 입력으로 다시 돌려보기" 부재 | ✅ Replay + Release Gate가 바로 그 니즈 | ✅ n8n 워크플로우 → 우리 프록시/SDK 캡처 → 스냅샷 → 재생 데모 |

### 2.4 Prompt / 튜토리얼 크리에이터

| 문제 | 우리 해결 | 간이 재현 |
|------|-----------|-----------|
| 튜토리얼 따라했는데 "요즘은 안 되네요" | ✅ 캡처해둔 입력을 지금 모델로 재생해 차이 확인 | △ 공개 프롬프트 1개 + 스냅샷 저장 → 이후 같은 스냅샷 재생 데모 |

---

## 3. 간이 프로젝트 계획 (재현용 데모)

우선순위는 "주 고객층 공감 + 우리 USP 노출 + 구현 난이도" 기준.

### Phase A: 1순위 데모 (Regression + Tool Diff)

| # | 데모명 | 대상 페인 | 구성 | 재현 방법 | 산출물 |
|---|--------|-----------|------|-----------|--------|
| A1 | **Support GPT Regression Gate** | P1: 릴리즈할 때마다 품질 깎이는 느낌 | 고객지원 봇(프롬프트/모델 변경) + Worst/정상 질문 20개씩 | Live View로 스냅샷 수집 → Release Gate에서 baseline vs candidate 재생 → PASS/FAIL + Behavior Diff | 스크린샷 3장: 문제 시나리오 / Release Gate 화면 / 결과 |
| A2 | **Tool Sequence Diff** | P4: 에이전트가 가끔 툴 순서 이상 | multi-tool agent(검색→요약→번역), 일부 입력에서 search 2회/순서 뒤집기 등 엣지 케이스 | Behavior Diff로 Baseline vs Run 도구 시퀀스 표시, Stable/Minor/Major band | 스크린샷: Tool Diff 패널, "이상한" 시퀀스 vs "정상" 시퀀스 |

**구현 형태**:  
- A1: n8n 워크플로우 또는 단순 API 서버(OpenAI/Anthropic 호출) + 우리 프록시 연동 → 스냅샷 → Release Gate.  
- A2: LangChain/LangGraph 또는 우리 테스트용 에이전트 코드 + 동일 플로우.

### Phase B: 2순위 데모 (비용·유저 불만)

| # | 데모명 | 대상 페인 | 구성 | 산출물 |
|---|--------|-----------|------|--------|
| B1 | **Cheap vs Expensive 모델 랩** | P2: 비용 폭탄 | 동일 입력 세트를 cheap/expensive 모델로 재생 → 품질(규칙 기반) + 비용 비교 | Release Gate 결과 + Cost Chart 스크린샷 |
| B2 | **Complaint Replay** | P3: 유저 불만 재현 | "이상했다"는 trace를 Live View에서 선택 → Release Gate로 N회 재생 | "Send to Release Gate" → repeat_runs 스크린샷 |

### Phase C: 3순위 (n8n·튜토리얼)

| # | 데모명 | 대상 페인 | 산출물 |
|---|--------|-----------|--------|
| C1 | **n8n 동일 입력 중복 호출** | n8n 툴 중복 호출 | n8n AI Agent + 툴 1개, 같은 입력 두 번 호출 캡처 → 재생 + Behavior rule 위반 스크린샷 |
| C2 | **튜토리얼 Gold Set** | P6: 튜토리얼 깨짐 | 튜토리얼용 워크플로우 Gold set(스냅샷) → Release Gate PASS/FAIL 체크리스트 스크린샷 |

---

## 4. 콘텐츠 계획 (스크린샷 중심, 영상 없음)

### 4.1 원칙

- **영상 없음.** 스크린샷 3~5장 + 짧은 문단으로 설명.
- **한 편당**: 문제 상황(1장) → 우리 화면(Live View / Release Gate)(1~2장) → 결과(패스/실패·차이)(1장) → 한 줄 요약.
- **고객층별 톤**: Indie는 "나도 그래서 이렇게 했더니" 스토리, LangChain/n8n은 "이런 버그/이슈 있을 때 이렇게 확인했다" 식.
- **제목**: 개발자 커뮤니티(Reddit, HN)에서는 설명형보다 **스토리형** 제목이 반응이 좋다. 예: "I broke my AI support bot by changing one prompt." / "I tested 40 prompts before shipping an AI support bot."

### 4.2 포스트별 계획

| 포스트 | 타깃 | 제목 후보 (설명형 / **스토리형**) | 스크린샷 | 채널 |
|--------|------|-----------------------------------|----------|------|
| **1 (기함)** | Indie / 전반 | 설명형: "프롬프트/모델 바꿀 때마다 불안하다면: Support GPT를 40개 케이스로 지키는 방법" · **스토리형**: "I broke my AI support bot by changing one prompt." / "I tested 40 prompts before shipping an AI support bot." | A1 데모 3장 | **Reddit + Hacker News 둘 다 이 포스트로 시도.** r/SideProject, r/IndieHackers, 블로그 |
| 2 | LangChain / 에이전트 | "에이전트가 왜 갑자기 이상하게 도는지 한눈에 보는 Tool Diff" / **"My agent called the wrong tool. Here's how I caught it."** | A2 데모 2~3장 | Reddit (r/LangChain, r/LocalLLaMA), Dev.to |
| 3 | Indie / 비용 | "gpt-4.1만 쓰다 파산하지 않는 법: 모델 A/B 테스트 랩" / **"I cut my LLM bill by testing 40 prompts first."** | B1 데모 2~3장 | Indie Hackers, X |
| 4 | 소규모 팀 | "유저 불만 뜨면 'Re-run 5번'부터: Complaint Replay 버튼" / **"When users said 'it broke,' we re-ran the same input 5 times."** | B2 데모 2장 | Reddit, 블로그 |
| 5 | n8n | "n8n AI Agent가 같은 입력으로 툴 두 번 부르는 걸 잡는 법" / **"Our n8n agent called the same tool twice. Replay caught it."** | C1 데모 2장 | n8n 커뮤니티, Reddit |
| **0 (전략)** | AI 커뮤니티 전반 | **"3 ways AI agents break in production"** — 마지막에 "그래서 replay + behavior rules로 잡았다" 구조. 리스트형 + 스토리 엔딩으로 공유·검색 유입용. | 실사례 스크린샷 또는 A1/A2 요약 | Reddit, HN, 블로그 (AI/LLM 서브레딧·커뮤니티) |

### 4.3 실사례 인용 (선택)

- **Replit AI / Amazon Kiro**: "에이전트가 권한 밖 행동" 사고 요약 → "우리는 Release Gate로 금지 도구 호출·행동 검증으로 막을 수 있다" + 스크린샷.
- **LangChain 툴 체이닝 실패**: "1단계 오류가 2·3단계로 전파" → "재생으로 어느 스텝에서 깨지는지 확인" + 스크린샷.
- **n8n #12647**: "같은 입력으로 툴 여러 번 호출" → "Behavior rule + 재생으로 재현·검증" + 스크린샷.

---

## 5. 실행 순서 (타임라인 권장)

| 단계 | 내용 | 예상 |
|------|------|------|
| 1 | **A1 데모 구축** (Support GPT + 스냅샷 20~40개, Release Gate 재생) | 1~2주 |
| 2 | **포스트 1 작성** (스크린샷 3장 + 레딧/블로그 초안) | 2~3일 |
| 3 | **A2 데모 구축** (Tool Sequence Diff 시각화 활용) | 약 1주 |
| 4 | **포스트 2 작성** | 2~3일 |
| 5 | **B1/B2 중 하나 선택** 후 데모 + 포스트 3 또는 4 | 1주 |
| 6 | **C1 (n8n)** 필요 시 데모 + 포스트 5 | 선택 |
| 0 (선택) | **포스트 0** "3 ways AI agents break in production" 작성 — 포스트 1 전후 또는 병렬로 배포하면 AI 커뮤니티 검색·공유에 유리 | 2~3일 |

---

## 6. 문서·한계 정리

- **Release Gate 한계**: 재생 시 **텍스트 입력만** 동일하게 넣음. 이미지 등 멀티모달 입력은 현재 재생되지 않음. 콘텐츠/데모는 "텍스트 기반 시나리오" 위주로 구성.
- **기존 플레이북**: 세부 스토리·템플릿·콘텐츠 제목은 [mvp-content-playbook-pain-driven-toys.md](../mvp-content-playbook-pain-driven-toys.md)와 동기화하여 사용.

---

## 7. 현실적인 기대치

- **DevTool 초기 트래픽**: Reddit/HN 포스트 1편 → 보통 **2k~20k views** → **10~100 users** 유입. 그중 일부가 GitHub star 또는 signup으로 이어짐.
- **목표**: **바이럴이 아니라 개발자 50~200명 초기 사용자** 확보. 포스트 1(Support GPT Regression Gate)을 Reddit + Hacker News 둘 다에 올려 최대한 노출하고, 포스트 0(3 ways AI agents break)으로 검색·공유를 보완하는 전략이 현실적이다.

---

## 8. 체크리스트 (실행 시)

- [ ] A1 데모용 고객지원 봇(또는 n8n 플로우) + 프록시 연동
- [ ] 스냅샷 20~40개 수집(Worst + 정상)
- [ ] Release Gate 재생 스크린샷 3장 확보
- [ ] 포스트 1 초안 작성 및 레딧/블로그 게시
- [ ] A2 Tool Diff 데모 및 포스트 2
- [ ] B1 또는 B2 중 하나 데모 + 포스트
- [ ] (선택) n8n C1 데모 + 포스트 5
- [ ] 실사례(Replit/Amazon/LangChain/n8n) 인용 시 출처 링크 명시
- [ ] 포스트 0(3 ways AI agents break in production) 초안 작성 및 배포

---

**문서 버전**: 1.1  
**최종 업데이트**: 2026-03 (GPT 피드백 반영: 스토리형 제목, 포스트 1 기함·HN, 전략 콘텐츠, 현실적 기대치, 재현 가능한 문제 강조)
