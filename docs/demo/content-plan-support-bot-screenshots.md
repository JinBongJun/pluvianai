# Support Bot Regression Gate — Content Plan (Screenshots & Copy)

업계 수준 마케터 관점으로 정리한 스크린샷 기획 + 각 장면별 설명/카피. 레딧·HN 포스트용.

---

## 1. 포스트 톤·목표

- **타깃**: 프롬프트/에이전트 바꿨을 때 "조용히 망가졌다"를 겪은 개발자, 소규모 팀.
- **메시지**: "캡처한 트래픽으로 리플레이해서, 배포 전에 회귀를 잡는다."
- **결말**: "한 번 설정해두면, 프롬프트/모델 바꿀 때마다 이렇게 검증할 수 있다."

**전체 플로우 한 줄**:  
"로컬에서 스크립트 한 번 돌리면 → PluvianAI에 트래픽이 쌓이고 → Live View에서 보다가 → Release Gate에서 같은 입력으로 다시 돌려서 회귀를 잡는다."

---

## 2. 스크린샷 리스트 (총 7장)

| # | 장면 | 찍을 화면 | 용도 |
|---|------|-----------|------|
| 1 | 훅 | 문제 상황 한 줄 | "프롬프트 바꿨더니 지원봇이 이상해졌다" 등 |
| 2a | 코드 실행 | 터미널: `python run_demo.py` + 로그 (`Sending 24 questions...` / `[q1] status=200...`) | "스크립트 한 번으로 질문이 LLM·PluvianAI로 전송된다" |
| 2b | 캡처 | Live View에 노드/트래픽 보이는 화면 | "실제 트래픽이 이 서비스에 쌓인다" |
| 3 | 평가 | 노드 클릭 → pass/fail 보이는 Clinical Log | "기본 eval로 어떤 건 실패로 찍힌다" |
| 4 | 게이트 진입 | Release Gate에서 해당 노드 선택된 화면 | "이 트래픽으로 게이트를 돌린다" |
| 5 | 설정·실행 | 모델/프롬프트 오버라이드 + Run 직전 | "바꾼 설정으로 리플레이한다" |
| 6 | 결과(회귀) | Run 결과: 실패 1~2건 + diff/증거 | "회귀를 잡았다" / "배포 전에 막았다" |

### 2.1 사용자 플로우 (내가 한 일 → 보이는 것 → 의미)

| 순서 | 내가 한 일 | 화면에 보여줄 것 | 이 단계에서 독자가 알게 되는 것 |
|------|------------|------------------|----------------------------------|
| 1 | (선택) `pip install -r requirements.txt` | 터미널 스크린샷 | SDK/데모 한 번 설치하면 됨 |
| 2 | `python run_demo.py` 실행 | 터미널: `Sending 24 questions...` / `[q1] status=200...` | 우리 스크립트가 질문 24개를 LLM에 보냄 → 동시에 PluvianAI로 전송됨 |
| 3 | 브라우저에서 Live View 열기 | 프로젝트 → Live View → support-bot 노드 + run 수 | 방금 보낸 트래픽이 이 서비스에 그대로 쌓인구나 |
| 4 | 노드 클릭 | Clinical Log / pass·fail 요약 | 각 run이 자동으로 평가까지 된다 |
| 5 | Release Gate 탭 → 해당 노드(에이전트) 선택 | Release Gate 화면 + 스냅샷 소스(Recommended / Recent 등) | 쌓인 스냅샷으로 테스트를 돌리는구나 |
| 6 | 새 프롬프트 입력 + Run | 오버라이드 입력란 + Run 버튼 | 같은 입력, 다른 설정으로 다시 돌려보는구나 |
| 7 | 결과 확인 | X passed, Y failed + 실패 1건 diff | 회귀를 여기서 잡고, 배포 전에 고칠 수 있구나 |

---

## 3. 장면별 찍을 것 + 설명(카피) 초안

### Shot 1 — 훅 (문제 공감)

**찍을 것**
- 코드 에디터 한 조각이든, 노트 한 줄이든 "시스템 프롬프트 수정함" 같은 걸 보여주는 정적인 이미지.
- 또는 텍스트만: "We shortened the support bot's system prompt. Shipped. Then tickets spiked."

**설명(카피)**
- "Changed the prompt to be more concise. Shipped. Then we got reports that the bot was refusing valid refund requests."
- "Sound familiar? Here's how we now catch that **before** deploy."

**이 단계에서 독자가 알게 되는 것**: 문제 공감 — "프롬프트 바꿨더니 뭔가 깨졌다"가 우리 타깃의 페인이다.

---

### Shot 2a — 터미널에서 코드 실행

**찍을 것**
- 터미널에서 `python run_demo.py` 실행한 화면.
- 출력에 `Sending 24 questions (captured by PluvianAI SDK)` 및 `[q1][worst] status=200, preview=...` 같은 로그가 보이면 좋음.

**설명(카피)**
- "We run a small script that replays our support Q&A set. One command — same inputs every time."
- "Each request goes to our LLM and is **also sent to PluvianAI** via the SDK. No extra infra."

**이 단계에서 독자가 알게 되는 것**: 스크립트 한 번 돌리면 질문이 LLM으로 가고, 동시에 PluvianAI로 전송된다.

---

### Shot 2b — Live View, 노드/트래픽

**찍을 것**
- 프로젝트 Live View에서 **support-bot(또는 해당 에이전트) 노드**가 보이고,
- "24 runs" 같은 숫자 또는 최근 트래픽이 보이는 상태.
- Shot 2a 직후에 찍으면 "방금 돌린 게 여기 쌓였다"가 명확함.

**설명(카피)**
- "Open PluvianAI → Live View. The runs we just sent **show up as this node**."
- "No extra server. Just `pluvianai.init()` and your existing OpenAI calls. Traffic is captured automatically."

**이 단계에서 독자가 알게 되는 것**: 방금 보낸 트래픽이 이 서비스에 그대로 쌓인다. 별도 인프라 없이 SDK만으로 된다.

---

### Shot 3 — 노드 클릭 → Pass/Fail (Eval)

**찍을 것**
- 같은 노드 클릭해서 **Clinical Log / Eval 요약**이 보이는 화면.
- 일부는 pass, 일부는 fail(또는 경고)로 보이게.

**설명(카피)**
- "Click the node: each run is evaluated (empty response, latency, refusal, etc.). Red = needs attention."
- "This is the baseline: we see which inputs already fail with the **current** prompt."

**이 단계에서 독자가 알게 되는 것**: 각 run이 자동으로 평가까지 된다. 어떤 입력이 이미 실패인지 한눈에 보인다.

---

### Shot 4 — Release Gate, 노드 선택

**찍을 것**
- Release Gate 페이지에서 **같은 에이전트(노드)**가 선택되어 있는 화면.
- "Recommended" 또는 "Recent snapshots"로 스냅샷 소스가 보이면 더 좋음.

**설명(카피)**
- "When we're about to change the prompt (or model), we open Release Gate and pick this agent."
- "It uses the same snapshots we just saw in Live View — no new test suite to maintain."

**이 단계에서 독자가 알게 되는 것**: 쌓인 스냅샷으로 테스트를 돌리는 구나. Live View에 보인 그 트래픽이 곧 테스트 케이스다.

---

### Shot 5 — 오버라이드 + Run

**찍을 것**
- Release Gate 폼에서
  - **System prompt override**에 짧은 새 프롬프트(예: "You are a brief support bot. One sentence only."),
  - **Model**은 그대로 또는 바꾼 것,
  - **Run** / **Validate** 버튼이 보이는 상태.

**설명(카피)**
- "We paste the **new** system prompt and hit Run. Same inputs, new config."
- "The gate replays each snapshot with this prompt and compares to the baseline."

**이 단계에서 독자가 알게 되는 것**: 같은 입력, 다른 설정(프롬프트/모델)으로 다시 돌려보는 구나.

---

### Shot 6 — 결과: 회귀 잡힌 화면

**찍을 것**
- Run 결과 요약: **X passed, Y failed** (실패 1~2개 있음).
- 실패한 스냅샷 하나 클릭해서 **원본 vs 리플레이 출력(diff)** 또는 실패 이유가 보이는 패널.

**설명(카피)**
- "This run: 22 passed, 2 failed. We open one failure: the new prompt caused a valid refund request to be rejected."
- "We fix the prompt and re-run the gate until it's green. **Only then** do we deploy."
- "No more 'ship and pray'."

**이 단계에서 독자가 알게 되는 것**: 회귀를 여기서 잡고, 배포 전에 고칠 수 있다. diff로 원인까지 확인 가능하다.

---

## 4. 포스트 구조 제안 (스토리 플로우)

독자가 "이 서비스는 이런 식으로 해서 라이브뷰에 뜨고, 이런 걸 할 수 있구나"를 한 번에 이해하도록, **인과(내가 한 일 → 보이는 것)** 순서로 구성한다.

1. **도입 (1~2문장)**
   - "We shortened our support bot's prompt and shipped. Then we got complaints. So we added a regression gate that **replays real traffic** before every deploy."

2. **Step 1–2: 트래픽 생성**
   - 스크린샷: **Shot 2a** (터미널 `python run_demo.py` + 로그).
   - 카피: "We run a small script that replays our support Q&A set. **Each request goes to our LLM and to PluvianAI** — one command."

3. **Step 3: Live View에 '쌓인다'**
   - 스크린샷: **Shot 2b** (Live View, support-bot 노드 + run 수).
   - 카피: "Open the dashboard → Live View. The runs we just sent **show up as this node**. No extra server — SDK (or proxy) only."

4. **Step 4: 자동 평가**
   - 스크린샷: **Shot 3** (노드 클릭 → pass/fail).
   - 카피: "Click the node: **each run is evaluated** (empty, latency, refusal, etc.). We see which inputs already fail with the current prompt."

5. **Step 5–6: Release Gate로 '다시 돌리기'**
   - 스크린샷: **Shot 4 + 5** (노드 선택 → 프롬프트 오버라이드 + Run).
   - 카피: "When we change the prompt, we use **Release Gate**: same snapshots, new config, one click. **No new test cases to write** — the traffic we captured is the test."

6. **Step 7: 회귀 잡기**
   - 스크린샷: **Shot 6** (실패 1~2건 + diff).
   - 카피: "This run: 2 failed. We open one: the **new prompt rejected a valid refund request**. We fix it, re-run the gate until green, then deploy."

7. **마무리 + CTA**
   - "So: (1) run the script → traffic shows up in PluvianAI, (2) see it in Live View, (3) replay the same inputs in Release Gate to catch regressions. [Demo repo / sign up]."

---

## 5. 제목 후보 (스토리 톤)

- "We changed one prompt and broke refunds. Now we replay 24 real conversations before every deploy."
- "How we catch support bot regressions before they hit production."
- "Our support bot regressed in production. Here's the gate we added so it doesn't happen again."

---

## 6. 실전 팁

- **스크린샷**
  - 개인/내부 정보는 전부 가리기.
  - 프로젝트명·노드명은 "Support Bot"처럼 일반화해도 됨.

- **회귀 장면**
  - 의도적으로 "나쁜" 프롬프트로 한 번 돌려서 실패 1~2개 나오게 한 뒤 그걸로 Shot 6 찍으면 스토리가 선명해짐.

- **데모 링크**
  - `support-bot-regression-demo` README 링크 + "pip install pluvianai" 한 줄 넣으면 신뢰도와 이식성 모두 올라감.

---

## 관련 문서

- [demo-support-bot-a1-plan.md](./demo-support-bot-a1-plan.md) — 데모 구조/기술 계획
- [content-and-demo-execution-plan.md](./content-and-demo-execution-plan.md) — 콘텐츠·데모 실행 계획 전체
