## MVP Content Playbook — Pain-Driven Toy Projects

### 0. 원칙

- **항상 “사람들이 진짜 고통받는 지점”에서 출발한다.**
  - 단순 “멋있는 데모”가 아니라, 이미 Reddit / Indie Hackers / Discord 에서 **매일 올라오는 짜증나는 문제**를 잡는다.
- 각 콘텐츠의 구조:
  1. **고통 상황 스토리** (문제)
  2. **토이 프로젝트/워크플로우** (해결 시나리오)
  3. **이 워크플로우를 어떻게 Release Gate + Live View로 지키는지** (솔루션)
  4. **템플릿/레포/프롬프트 공개** (바로 써볼 수 있게)

---

### 1. 타깃별 대표 고통 포인트

#### 1.1 Indie Hacker / SaaS 1인 개발자

- **P1: 릴리즈할 때마다 품질이 깎이는 느낌 (Regression Fear)**
  - “프롬프트/모델 살짝 바꿨는데, 어떤 유저 케이스에서 망가졌는지 모른다.”
- **P2: 모델 비용 폭탄 / 예측 불가한 청구**
  - “갑자기 OpenAI 청구서가 3배로 나왔다. 어느 기능에서 터졌는지 모른다.”
- **P3: 유저 불만 피드백이 뭉뚱그려져 들어옴**
  - “유저가 ‘요즘 답변 수준 떨어졌다’고만 말하는데, 재현 케이스가 없다.”

#### 1.2 워크플로우/에이전트 빌더 (n8n, LangChain, MCP 등)

- **P4: 에이전트가 가끔 이상하게 돌아가는 “엣지 케이스”**
  - “어제까진 잘 되던 툴 호출 시퀀스가, 특정 입력에서 갑자기 다른 툴만 무한 호출.”
- **P5: multi-step workflow 중간에 랜덤하게 실패**
  - “5단계 중 3단계에서 가끔 API 타임아웃 / rate limit / 툴 오류로 멈춤.”

#### 1.3 Prompt / Automation 크리에이터 (컨텐츠 제작자)

- **P6: 튜토리얼은 멋있는데, 팔로워가 따라하면 깨지는 경우**
  - “영상/블로그 보고 그대로 따라했는데, ‘요즘은 잘 안 되네요’ 댓글 폭탄.”

---

### 2. Pain → Toy Project 매핑 (초안)

각 항목은 “한 편의 글/영상” 단위로 만들 수 있는 토이 프로젝트 아이디어다.

#### 2.1 P1: Regression Fear — “Release Gate로 지키는 Support GPT”

- **스토리**
  - 작은 SaaS의 고객지원 봇이 있음.
  - 새로 `gpt-4o-mini`로 바꿨더니, 특정 “환불/취소” 관련 문의에서 답이 이상해짐.
- **토이 프로젝트**
  - 간단한 “고객지원 봇” 프롬프트/워크플로우 (n8n 혹은 단순 API 서버).
  - Worst-case 질문 20개 + 정상 질문 20개로 **Recommended set** 구성.
- **PluvianAI 활용**
  - Live View로 스냅샷 수집.
  - Release Gate에서:
    - baseline: 기존 모델/프롬프트
    - candidate: 새 모델 또는 수정 프롬프트
    - PASS/FAIL/FLAKY + Behavior Diff로 “tool call 패턴이 얼마나 바뀌었는지” 시각화.
- **콘텐츠 제목 후보**
  - “모델 바꿀 때마다 불안하다면: 40개 케이스로 Support GPT를 지키는 방법”

#### 2.2 P2: 비용 폭탄 — “Cheap vs Expensive 모델 자동 실험 랩”

- **스토리**
  - Indie Hacker가 `gpt-4.1`만 쓰다가, 청구서 보고 놀람.
  - 어떤 부분은 `4.1-nano` / `4o-mini`로 충분했을 수도 있는데 모르고 있음.
- **토이 프로젝트**
  - 동일 입력 세트를 `cheap model` vs `expensive model` 로 돌려서:
    - 품질(간단한 규칙 기반 스코어) + 비용 추정치를 비교하는 워크플로우.
- **PluvianAI 활용**
  - Test/Release Gate에서:
    - 동일 Recommended set으로 cheap / expensive 모델 두 번 replay.
    - Cost Chart + PASS/FAIL/Behavior Diff를 같이 보여주기.
  - “이 정도 품질 차이면 cheap 모델로 충분하다”는 시나리오 강조.
- **콘텐츠 제목 후보**
  - “gpt‑4.1만 쓰다 파산하지 않는 법: 모델 A/B 테스트 랩 만들기”

#### 2.3 P3: 유저 불만 재현 — “Complaint Replay Button”

- **스토리**
  - 유저가 “이번에 이 기능 이상했어요”라고 말하지만, 로그 / 프롬프트가 흩어져 있음.
- **토이 프로젝트**
  - 유저가 남긴 피드백에서 관련 trace를 찾고,  
    그 케이스를 바로 Release Gate로 보내 **N번 replay** 해보는 “Complaint Replay” 버튼.
- **PluvianAI 활용**
  - Live View에서 특정 trace 선택 → “Send to Release Gate” CTA.
  - Release Gate에서 repeat_runs=3/5로 안정성 측정.
- **콘텐츠 제목 후보**
  - “유저 불만이 뜨면 ‘Re-run 5번’부터: Complaint Replay 버튼 만들기”

#### 2.4 P4: 이상한 에이전트 행동 — “Tool Sequence Diff 시각화”

- **스토리**
  - LangChain/MCP 기반 에이전트가 가끔 툴 콜 순서를 이상하게 바꿈.
  - 왜 그런지 log만 봐서는 감이 안 옴.
- **토이 프로젝트**
  - 간단한 multi-tool agent (예: 검색→요약→번역).
  - 일부 입력에서 search를 두 번 호출한다든지, 순서를 뒤집는 엣지 케이스 의도적으로 심기.
- **PluvianAI 활용**
  - Behavior Diff:
    - Baseline vs Run 도구 시퀀스 그래프 표시.
    - Stable / Minor / Major change band로 사람 눈에 확 띄게.
- **콘텐츠 제목 후보**
  - “에이전트가 왜 갑자기 이상하게 도는지 한눈에 보는 Tool Diff 패널 만들기”

#### 2.5 P5: 워크플로우 중간 실패 — “Step-by-step Gate for n8n Flow”

- **스토리**
  - n8n / Zapier / LangGraph 플로우에서 3/5단계에서 가끔 타임아웃.
  - 어디서 얼마나 자주 깨지는지 알기 어렵다.
- **토이 프로젝트**
  - n8n 플로우 예시(입력 → LLM → 툴 → 저장).
  - 일부 노드에서 실패를 랜덤 주입.
- **PluvianAI 활용**
  - 각 노드를 “node (agent)”로 간주하고:
    - 노드별 Release Gate를 돌려 failure rate, flaky rate를 시각화.
  - Live View에서 노드별 Clinical Log 보여주기.
- **콘텐츠 제목 후보**
  - “n8n 플로우 어디서 자꾸 깨지는지 한 번에 보는 노드 게이트 만들기”

#### 2.6 P6: 튜토리얼 깨짐 — “Content Creator’s Safety Net”

- **스토리**
  - YouTube/블로그 튜토리얼을 만들었는데, 몇 달 뒤에 모델/프롬프트 바뀌면서  
    “영상대로 했는데 안 돼요” 댓글 폭탄.
- **토이 프로젝트**
  - 튜토리얼용 샘플 워크플로우에 대한 “Gold set”을 만들어 두고,
  - 튜토리얼 올리기 전에 Release Gate로 한 번 돌려 보는 “Creator Checklist”.
- **PluvianAI 활용**
  - Gold set = snapshot dataset.
  - Release Gate로 PASS/FAIL + Behavior Diff 확인 → 결과를 튜토리얼에 첨부.
- **콘텐츠 제목 후보**
  - “AI 튜토리얼 올리기 전에 꼭 눌러야 하는 ‘Regression Gate’ 체크리스트”

---

### 3. 채널별 전략 (간단 메모)

- **Reddit**
  - r/LanguageTechnology, r/LocalLLaMA, r/SideProject, r/Entrepreneur, r/IndieHackers
  - 포맷:
    - “I broke my support bot 3 times last week. Here’s how I stopped shipping regressions.”
    - 핵심 스토리 + 코드/레포 링크 + Pluvian 스크린샷.

- **Indie Hackers**
  - 카테고리: Product, Marketing, Help  
  - 포맷:
    - “Launch #N: Regression Gate for AI side projects (here’s how it saved my SaaS from a dumb bug).”

- **X / Twitter**
  - 짧은 스레드:
    - 1/ “Most common AI app pain: you ship a prompt tweak and silently break some users.”
    - 2/ 그 사례 스크린샷
    - 3/ “I built a mini regression gate using PluvianAI + n8n, code here.”

---

### 4. 우선순위 추천 (Top 3)

**1순위: P1 + P4 결합**

- “Support GPT Regression Gate” + “Tool Sequence Diff 시각화”  
- 이유:
  - 대부분 바로 공감하는 문제(릴리즈 공포 + 이상한 툴 호출).
  - PluvianAI의 핵심 USP(Release Gate + Behavior Diff)를 한 번에 보여줄 수 있음.

**2순위: P2 (비용 폭탄 방지)**

- Cheap vs Expensive 모델 비교 랩.
- 이유:
  - 지금 모두가 비용에 민감하고, “이 조합이 가성비 좋다” 콘텐츠는 저장/공유 가치가 큼.

**3순위: P3 (Complaint Replay 버튼)**

- 실제 SaaS나 챗봇에 바로 붙일 수 있는 “작은 기능”이라 구현 난이도 대비 임팩트가 크다.

이 3개만 잘 만들어도:

- “품질 회귀 공포 / 이상한 에이전트 행동 / 비용 폭탄 / 유저 불만 재현”  
  → 사람들이 실제로 고통받는 80%를 거의 다 커버하게 된다.

