# Reddit 커뮤니티 포스트 및 스레드 기록

PluvianAI 관련 레딧 발행 내용과 댓글 요약을 정리한 문서입니다.

**참여 현황 (스냅샷):** 조회 약 9,000회, 댓글 10개.

---

## 1. 첫 번째 포스트: r/LocalLLaMA

**제목:** How do you test LLM model changes before deployment?  
**플레어:** Question | Help  
**작성:** 약 1개월 전 (u/Fluffy_Salary_5984)

### 원글 본문

Currently running a production LLM app and considering switching models (e.g., Claude → GPT-4o, or trying Gemini).

**Current workflow:**
- Manually testing 10-20 prompts
- Deploying and monitoring
- Fixing issues as they come up in production

Looked into AWS SageMaker shadow testing, but it seems overly complex for API-based LLM apps.

**Questions for the community:**
1. How do you validate model changes before deploying?
2. Is there a tool that replays production traffic against a new model?
3. Or is manual testing sufficient for most use cases?

Considering building a simple tool for this, but wanted to check if others have solved this already. Thanks in advance.

---

### 댓글 및 답글 요약

#### Gaussianperson (6일 전)
- 수동 테스트만으로는 부족하다는 입장.
- **테스트:** Golden dataset(가장 흔하고 중요한 프롬프트) 구축 → 새/기존 모델 side-by-side 평가 → 더 강한 모델로 judge해 정확도·톤 등 기준으로 점수화.
- **트래픽 리플레이:** 실시간 풀 섀도우보다 LangSmith, Braintrust 같은 프로덕션 로그 기반 리플레이/회귀 테스트가 비용 대비 효율적.
- 뉴스레터: machinelearningatscale.substack.com (인프라/스케일링 관점).

**OP 답글 (5일 전):**  
"Solid advice. We do something along these lines (dataset + replay + policy gates). Thanks for sharing!!"

---

#### Distinct-Expression2 (1개월 전)
- Worst prompts로 돌려보고, 이전보다 hallucinate가 심해지는지 보는 게 테스트 스위트 전체라고 봄.

**OP 답글 (1개월 전):**  
"Yea!! fair enough. That's basically what I do too. The hallucination check is a good point though - would be nice to automate that comparison somehow instead of eyeballing it."

---

#### FullOf_Bad_Ideas (1개월 전)
- 약 5000 요청 규모의 eval을 돌려 성능 검증. 트레이닝과 배포 모두에 사용.
- 나중에: 스크래치로 구축, 특수 use case와 아키텍처 유연성 때문에. 비-LLM·앙상블·arxiv 직행 아키텍처도 지원, Python이 glue. Sonnet 3.5, Qwen 2.5 32B Coder로 vibe coding하며 15개월 동안 모델 R&D와 함께 co-develop.

**OP 질문:** 그 eval 시스템을 스크래치로 만든 건지, 기존 도구/프레임워크를 썼는지, 셋업에 얼마나 걸렸는지.

**OP 후속 답글 (1개월 전):**  
"wow!! 15 months is serious dedication - thanks for sharing the details. Out of curiosity, if something like this existed as a ready-made tool when you started, would it have been worth paying for? Or is the customization aspect too important for your workflow? Either way, really appreciate the insight. Good luck with your evals!!!"

**FullOf_Bad_Ideas:**  
무한히 커스터마이즈 가능하고 니치에 맞으면 돈 내고 쓸 수 있음. 단, unhealthy vendor lock-in이 없어야 함. 충분한 커스터마이징을 위해선 agentic system이어야 하고, "lovable for evals" 같은 게 필요. 없으면 dev와의 협업 없이는 솔루션 공간을 다루기 어렵다.

**OP 답글:**  
"really insightful" — "lovable for evals" 표현이 좋다. customization vs. out-of-the-box 트레이드오프가 바로 그 도전이라고 함.

---

#### Outrageous_Hat_9852 (7일 전)
- "Lovable for evals"와 vendor lock-in 우려에 동의.
- **Rhesis** (github.com/rhesis-ai/rhesis) 추천: MIT 라이선스, agentic test case 생성 + 도메인 전문가가 코드 없이 참여하는 리뷰 UI. lock-in·커스터마이징 우려 때문에 이렇게 설계했다고 함.

---

#### sn2006gy (1개월 전)
- "What are you testing?"

**OP 답글:**  
새 모델(또는 프롬프트 변경)이 현재 모델만큼 잘하는지 배포 전에 테스트. 요지: 좋은 응답 캡처 → 새 모델에 리플레이 → 품질 비교.

**sn2006gy:**  
품질을 어떻게 측정하는지가 핵심. 프롬프트 변경은 확률을 바꾸고, 모델 변경은 확률이 없고, 파라미터 변경이 있으면 결국 "looks good to me"가 되는 기준이 불명확. 일부 model auditing/review harness는 특수 utility와 re-sample이 없으면 infinite regression에 빠진다고 봄. 확률 vs recall·stored memory의 차이가 어렵다.

**OP 답글:**  
품질이 inherently fuzzy하다고 함.  
자주 논의되는 접근: (1) Golden dataset (human-verified) as baseline, (2) Rouge + semantic similarity + LLM-as-judge 등 복합 메트릭, (3) 절대 점수보다 threshold 기반 pass/fail. 완벽한 건 없어서 대부분은 그냥 배포해 본다고 함. "Curious what you've found works (or doesn't)??"

**sn2006gy:**  
Golden dataset은 eval 모델이 golden constraint를 보장할 수 있으면 동작하지만 그게 LLM에서 나오고 LLM으로만 프레임할 수도 있음. LLM-as-judge는 entropy가 불어나며 복잡해지고 자기만족 경향. Threshold는 어렵지만 human-in-the-loop에서 human을 신뢰할 수 있으면 "good enough".

---

#### commanderdgr8 (1개월 전)
- 프로덕션에서 사용자가 좋아하거나 좋은 피드백 준 request/response 샘플 로깅 → baseline response test data.
- 모델/시스템 프롬프트 변경 시, 로깅된 request로 새 모델/프롬프트 테스트.
- Rouge 등으로 baseline과 정성 비교. threshold 아래면 revert 또는 개선, 아니면 배포.

**OP 답글:**  
"The baseline + Rouge metrics approach makes a lot of sense. Do you automate the whole pipeline or run it manually when needed???"

---

#### Previous_Ladder9278 (1개월 전) — LangWatch
- 프로덕션 트래픽(트레이스)이 있으면 LangWatch scenario에 넣어 새 모델로 시뮬레이션/리플레이 가능. 새 모델이 더 나은지 나쁜지 바로 확인, 에이전트 테스트 자동화.
- 링크: https://github.com/langwatch/scenario

**OP (28일 전):**  
LangWatch Scenario 참고했다고 감사. "Have you used it in production? Curious about the setup experience - does it take long to define scenarios and judge criteria, or is it fairly quick to get running?"

**Previous_Ladder9278 (26일 전):**  
프로덕션 전 테스트에는 LangWatch, 나머지는 프로덕션 모니터링. 프레임워크 셋업 자체는 꽤 빠름. 가장 어려운 건 "scenario"와 "what good means vs edge cases"를 정하는 것. MCP 문서: https://langwatch.ai/docs/integration/mcp#write-agent-tests-with-scenario

**OP (26일 전):**  
"Thank you for the good information!!"

---

#### pballll (1개월 전)
- temp=0, 고정 시드여도 배치마다 variance가 나는 프로바이더 있음 → 프로바이더가 조용히 모델 업데이트해 drift 발생.
- 50-prompt 테스트는 기능 회귀에는 유효하지만, 스케일에서 드러나는 behavioral shift(미묘한 톤 변화, 추론 숏컷, 정해진 프롬프트가 닿지 않는 엣지 케이스)는 놓침.
- 프로덕션 트래픽 로깅·리플레이는 API 비용을 일시적으로 두 배로 만들고, 새 출력에 대한 실제 사용자 선호를 확인해 주지도 않음.
- 제안: offline evals + staged rollouts with real user signals.

**OP (28일 전):**  
프로바이더가 조용히 업데이트해 drift 생기는 점에 동의. API 비용 두 배도 현실적 문제. "Curious if you've found a good balance between coverage (more test cases) vs cost?" "Seems like the staged rollout + real user signals is the only way to catch those subtle behavioral shifts that predetermined prompts miss??"

**pballll (26일 전):**  
- 회귀 테스트: 작은 golden set(30–50 케이스), 알려진 실패 모드·크리티컬 경로에 집중해 obvious break 잡기.  
- Behavioral drift: 정해진 프롬프트보다 staged rollout + real signals 선호. 트래픽 5–10% A/B, 두 응답 로깅 후 diff 샘플 리뷰로 미묘한 변화 포착, 100% shadow보다 비용 부담 적음.  
- LLM-as-judge: 대량 eval에서 human review보다 훨씬 저렴, 프로덕션 로그에 비동기 적용 가능.

**FragrantBox4293 (1개월 전):**  
수동 테스트는 obvious break만 잡고 미묘한 회귀는 놓침. ~50–100 실제 사용자 쿼리와 기대 출력으로 golden dataset 유지, 전환 전 새 모델로 돌려보기. 완벽하진 않지만 vibes 기반 배포보다는 훨씬 나음.

---

#### ThanosDidBadMaths (1개월 전)
- Azure OpenAI → Gemini 전환 경험. 꽤 rough했음.
- Tool-heavy 에이전트, 프롬프트 리스트. 도구 호출 순서, tool args(가끔 optional), outputs 검증. LLM judge로 최종 응답 평가.
- 약 50개 프롬프트, 각각 다른 버전, broad agent feature로 태깅해 어떤 영역이 pass/fail인지 추적.
- 전환 초기엔 chaos였고, 그 과정에서 테스트 시스템을 완전히 재구성. 지금은 model-agnostic. 새 모델/버전은 LLM 클라이언트만 바꾸면 됨.

---

#### code_vlogger2003 (27일 전)
- 에이전트 평가 시 확인할 것: 어떤 도구를 호출했는지, 인자, 토큰/비용, LLM 최종 응답과 ground truth의 overlap %.
- 에이전트가 "crazy"하게 동작할 수 있어서, 최종 출력만 보지 말고 모니터링 도구로 trajectory(스텝·도구 호출 순서)를 보는 게 인사이트가 많음.
- GPT-5x에서는 agentic 시스템이 "very worst", GPT-4x에서는 도구 사용 결과가 좋았다고 함. 결과물은 텍스트·이미지·테이블 등이 있는 구조화된 PDF, 도구 7개. 언급: unstructured time series data.

---

#### SmoothRolla (1개월 전)
- 정해진 질문과 기대 결과로 테스트 스위트 운영.
- 메트릭: 답변 품질(핵심 포인트 커버), 토큰 사용, 도구 사용, 비용.
- 기대 결과 vs 실제 결과를 LLM으로 judge.
- 배포 전에 프롬프트 변경을 시험하는 자체 playground 기능 사용.

---

#### attn-transformer (27일 전)
- 비슷한 테스트 스위트 구축. 기대 결과(expectations)를 JSON에 저장.
- Claude로 테스트 스크립트 실행, 출력 검사 및 수정. 첫 버전은 몇 시간 만에 구축.

---

## 2. 두 번째 포스트 (동시 발행)

### 2.1 r/LocalLLaMA 버전 (Discussion)

**제목:** Building agents is fun. Evaluating them is not.

A few weeks ago I posted here about experimenting with autonomous agents.

Back then I was just excited that I got them to work.

Now I'm stuck on something I didn't expect to be this hard:

**Figuring out whether they're actually reliable.**

Building the agent was fun.  
Evaluating it is… much less clear.

Once you let an agent:

- call tools  
- retry on failure  
- branch into different paths  
- reflect and revise  

everything becomes fuzzy.

Two runs with the exact same prompt can behave differently.

Sometimes it finishes in 4 steps.  
Sometimes it takes 12.  
Sometimes the final answer looks correct — but if you inspect the trajectory, something clearly broke in the middle and just happened to recover.

That's the part I can't ignore.

If the final output looks fine, did it really "work"?  
Or did it just get lucky?

I tried digging through raw logs.

That quickly turned into staring at walls of JSON trying to mentally replay what happened.

Then I tried summarizing runs.

But summaries hide the messy parts — and the messy parts are usually where most failures live.

What surprised me most:

A lot of failures don't feel like model intelligence problems.  
They feel like **orchestration problems**.

- Retry logic that's slightly off.  
- Tool outputs that don't perfectly match assumptions.  
- State drifting step by step until something subtle breaks.

Small issues, but they compound over multi-step execution.

So I ended up building a small internal tool to help with this.

Nothing polished — mostly something we use for our own experiments.

It snapshots full trajectories, compares repeated runs, and highlights where behavior starts diverging across executions.

Not benchmarking accuracy.

More like trying to observe **behavioral stability**.

Even that small shift — from "did it answer correctly?" to "does it behave consistently?" — changed how I think about agent quality.

I'm genuinely curious how others here approach this.

If you're running local models with tools:

- Are you only measuring final output?  
- Do you inspect trajectories?  
- Do you test stability across multiple runs?  
- How do you detect silent failures?  

Right now, evaluating agents feels harder than building them.

Would love to hear how you're thinking about it.

---

### 2.2 LangChain 커뮤니티 버전 (Question)

**제목:** How are you evaluating multi-step reliability in LangChain agents?

I've been running a lot of experiments with agents built on LangChain recently.

Getting them to work wasn't the hardest part.

Getting them to **behave consistently** is.

Once you combine:

- tool calling  
- retries  
- multi-step reasoning  
- branching logic  
- memory/state  

the system becomes less "a prompt" and more "a distributed workflow".

And evaluating that workflow is surprisingly tricky.

Two runs with the same input can:

- take different tool paths  
- retry at different steps  
- recover from errors differently  
- reach the same final answer via completely different trajectories  

If the final answer is correct, is that enough?

Or should we care about **how it got there**?

What I've noticed is that many failures aren't LLM failures.

They're **orchestration failures**.

- retry policies that amplify small errors  
- tool outputs that slightly mismatch expected schemas  
- state drifting over multiple steps  
- subtle branching differences that compound  

From the outside, the agent "works".

Internally, it's unstable.

I've started treating agent evaluation more like **system observability**:

- snapshotting full execution traces  
- comparing repeated runs  
- looking at divergence points  
- tracking stability across multiple executions  

Not just "did it answer correctly?"  
But "does it behave consistently under repetition?"

For those building with LangChain (or LangGraph):

- Are you evaluating trajectories, or just outputs?  
- Do you test multi-run stability?  
- How do you detect silent orchestration failures?  
- Are you using built-in tracing only, or something beyond that?  

How are you evaluating agent reliability in your LangChain workflows?

---

### 두 번째 포스트 댓글 (LangChain 버전)

#### BeerBatteredHemroids (48분 전)
- LLM은 **본질적으로 랜덤**이라서, 프롬프트·temp·top-k·오케스트레이션을 아무리 조정해도 run마다 deviation(어긋남)은 항상 있다는 입장.
- “결과를 완전히 반복 가능하게 만드는 건 소용없다(in vain)”.
- **워크플로에 대한 엄격한 준수(rigid adherence to a workflow)**가 필요하다면 “LLMs ain’t it” — 그건 LLM이 할 일이 아니라는 결론.
- 요지: 일관된 행동·behavioral stability를 LLM에 기대하는 것에 대한 반론/경계.

**BeerBatteredHemroids → OP 답글에 대한 재답 (9시간 전):**
- "If you're just trying to observe, mlflow and langgraph implemented with a postgres store and checkpoints is what you want. Each node will register a checkpoint into the store where you can observe state and see how it changes from node to node. With Mlflow providing traceability during development."
- 관찰만 할 거면 **mlflow + langgraph + postgres store + checkpoints** 추천. 노드마다 체크포인트가 스토어에 등록되고, 노드 간 상태 변화를 볼 수 있으며, Mlflow가 개발 중 traceability를 제공한다는 설명.

**답글 초안 (BeerBatteredHemroids 재답용):**
> Thanks for the pointer — mlflow + langgraph + checkpoints makes sense for observing state during dev. We're more focused on the moment right before deploy: replay stored snapshots (prod worst/golden) against a candidate config, run the same inputs a few times, get pass/fail/flaky and a gate verdict. So dev-time observability vs pre-deploy gate; we'll keep the mlflow/langgraph stack in mind for the former.

**한글 해석:** 추천 감사해요. mlflow + langgraph + checkpoints는 개발 중 상태 관찰에 잘 맞는 것 같아요. 우리는 배포 직전 시점에 더 초점을 두고 있어요. 스냅샷(프로덕션 worst/golden)을 후보 설정으로 리플레이하고, 같은 입력을 여러 번 돌려서 pass/fail/flaky와 게이트 판정을 보는 식이에요. 개발 시점 관찰 vs 배포 전 게이트라서, 전자 쪽은 mlflow/langgraph 스택 참고할게요.

#### gmoney86 (2일 전)
- MLflow 접근에 공감(“Love MLflow”).  
- **LLM judge + RLHF**를 통해 “robust dataset”을 만들고, 그 데이터를 기반으로 작은 언어모델로 **quantization**해서 “golden path”로 편향(bias)시키는 아이디어 제안.  
- 그 작은 모델을 **subagent**로 두고 오케스트레이터에서 drift를 줄이도록 활용 가능하다고 언급.  
- 병렬로 LLM judge 기반 RL을 추가해 target path로 더 강하게 유도할 수 있다는 주장.  
- 완전한 결정론은 어렵지만, “golden path만 수행”하도록 **강하게 제약**하고, 못 하면 덜 게이트된 workflow/model로 **fallback** 시키는 방식 제안.  

**답글 초안 (gmoney86용, MVP 범위 기준):**
> Love this framing — constraining to a “golden path” + having a fallback lane feels very practical. For our MVP we’re staying policy/replay based (no LLM-as-judge / RLHF yet), but this is exactly the kind of v2 direction we’ve been thinking about: learning which trajectories are “safe” and biasing toward them. Curious: have you actually shipped something like the judge/RL loop in prod, and if so what was the biggest gotcha (label drift, cost, or judge reliability)?

#### noip1979 (47분 전)
- `RemindMe! 7 days` 라고만 작성.
- **RemindMe:** 레딧 봇(RemindMeBot)을 호출하는 댓글. “7일 뒤에 이 글/스레드를 다시 알려달라”는 의미. 7일 후(2026-03-07 13:31:13 UTC)에 봇이 noip1979에게 이 링크를 PM으로 보내서 다시 보게 해 줌. 논의가 더 쌓인 뒤 돌아와서 읽으려는 용도.

#### RemindMeBot (46분 전)
- 자동 응답: “I will be messaging you in 7 days on 2026-03-07 13:31:13 UTC to remind you of this link.” + 링크/설명.

#### motorsportlife (5분 전)
- 질문: **"How do you follow along with the langchain agent to evaluate?"** — LangChain 에이전트를 어떻게 따라가면서(추적하면서) 평가하는지 묻는 댓글.

**답글 초안 (motorsportlife용, 스펙 기준·노드 언급 없음):**
> We don't follow along in real time — we do it offline, one agent at a time. We capture production traffic as snapshots (full request/response per call), and for each agent we keep a small set: worst cases (recent failures) and golden cases (recent passes) from the last 7 days. When we want to evaluate a change — new model, new system prompt, etc. — we replay that agent's snapshot set against the candidate config. We can run the same input multiple times (e.g. 3 or 5 runs), which gives us PASS / FAIL / FLAKY per case (FLAKY = some runs pass, some fail, so we see stability). Evaluation is policy-based: we check things like tool usage rules and schema, plus replay errors — no LLM-as-judge in our MVP. So "following along" for us is: one agent, its stored snapshots, replay against the candidate, repeat runs to see consistency, then a gate verdict (fail rate, flaky rate) so we know if we're good to ship.

**한글 해석:** 실시간으로 따라가는 게 아니라, 에이전트 하나씩 오프라인으로 한다. 프로덕션 트래픽을 스냅샷(호출당 요청/응답)으로 모으고, 에이전트마다 최근 7일 기준 worst(실패)·golden(성공) 소량 세트를 둔다. 변경(모델·시스템 프롬프트 등)을 평가할 때는 그 에이전트의 스냅샷 세트를 후보 설정으로 리플레이한다. 같은 입력을 여러 번(3회·5회 등) 돌리면 케이스별 PASS/FAIL/FLAKY(일부만 성공 → 불안정)가 나와서 안정성을 본다. 평가는 정책(도구 사용 규칙·스키마 등) + 리플레이 오류로 하고, LLM-as-judge는 MVP에서 쓰지 않는다. "따라간다"는 건 한 에이전트, 그 스냅샷, 후보로 리플레이, 반복 실행으로 일관성 확인, fail rate·flaky rate로 게이트 판정해서 배포 여부를 보는 것.

**참고:** 답글에서는 "노드" 용어를 쓰지 않음. 스펙 기준은 `docs/mvp-node-gate-spec.md` 참고.

#### ar_tyom2000 (1분 전)
- **LangGraphics** 소개: 에이전트 워크플로를 **실시간 시각화**해서 최종 출력뿐 아니라 에이전트가 그 결정에 **어떻게 도달했는지** 보여 준다고 함.
- 기존 설정과 통합이 쉽고, 그래프를 한 줄로 감싸면 된다는 식의 설명.

#### Toucanz17 (1분 전)
- 워크플로에서 **더 많은 결정론(determinism)** 을 원할 때의 옵션 제안.
- LLM만으로는 결정론이 어렵고, "they aren't made for that."
- **시맨틱 캐싱 레이어** 제안: 에이전트가 행동하기 **전에** 먼저 hit → 그 쿼리가 이전에 실행된 적 있는지 확인하고, DB에 저장된 **지난 출력**을 가져와서 모델을 타지 않음. → 결정론 향상 + **비용 절감**.
- 어려운 점: DB에는 **"좋은" 결과만** 남기도록 하는 것, 시간이 지나면서 **stale 출력**을 꺼내지 않도록 로직을 다듬는 것.

#### AsianHodlerGuy (12분 전)
- **"Would creating agent skills for each workflow? I'm running into this issue too"** — 워크플로마다 에이전트 스킬을 만드는 게 도움이 될지 묻고, 같은 고민을 겪고 있다고 공감.

**답글 초안 (AsianHodlerGuy용, 공감 톤):**
> Same boat — it's rough. We didn't go the "skills per workflow" route; we ended up capturing runs as snapshots (worst/golden from prod), then replaying against a candidate (new model, prompt) and running the same inputs a few times to get pass/fail/flaky. So we know *before* we ship whether the change is stable. If you try the skills-per-workflow approach, curious how it goes; if you want to try the replay/gate angle, happy to share more.

**한글 해석:** 같은 고민이에요. 우리는 워크플로별 스킬보다는, 런을 스냅샷으로 모아서(worst/golden) 후보 설정으로 리플레이하고 같은 입력을 여러 번 돌려 pass/fail/flaky를 보는 쪽으로 갔어요. 그래서 배포 전에 변경이 안정적인지 압니다. 워크플로별 스킬 시도해 보시면 어떻게 되는지 궁금하고, 리플레이/게이트 쪽 해보고 싶으시면 더 나눌게요.

#### thecanonicalmg (5시간 전)
- **"This is exactly the gap I keep running into too."** — 같은 문제에 강하게 공감.
- 두 런 다 정답을 내지만, 한 쪽은 깔끔한 경로고 다른 쪽은 세 번 재시도하고 도구를 이상한 순서로 호출하는 경우가 있고, 프로덕션에서 어떤 패턴이 터질지 모른다는 식의 설명.
- **오케스트레이션 실패**가 가장 잡기 어렵다 — 성공처럼 보이다가 어느 순간 아니다.
- **Moltwire** 추천: 런타임에 실제 **도구 호출 시퀀스·행동 패턴**을 보고, 워크플로마다 커스텀 eval harness 없이 **trajectory 이상**을 찾을 수 있다고 함.

**답글 초안 (thecanonicalmg용):**
> Yes — "looks like success until it does not" is exactly the pain. We ended up doing snapshot + replay + repeat runs (pass/fail/flaky) so we see *before* deploy which changes are stable; orchestration failures show up as policy violations or flaky runs when we replay. Will check out Moltwire for the runtime side; thanks for the pointer.

**한글 해석:** 맞아요. "성공처럼 보이다가 어느 순간 아니다"가 바로 그 고민이에요. 우리는 스냅샷 + 리플레이 + 반복 실행(pass/fail/flaky)으로 배포 전에 어떤 변경이 안정적인지 보려고 해요. 오케스트레이션 실패는 리플레이할 때 정책 위반이나 flaky 런으로 드러나요. 런타임 쪽은 Moltwire 찾아볼게요, 추천 감사해요.

*(답글 완료)*

---

### 두 번째 포스트 댓글 (r/LocalLLaMA 버전)

*원글: "Building agents is fun. Evaluating them is not."*

#### Total-Context64 (49분 전)
- 로컬 모델, 특히 **4bit 양자화**일 때 도구 사용이 어렵고, Qwen/Hermes/OpenAI 등 **포맷 차이**가 많아서 스키마 어긋남·실패를 전제로 설계해야 한다는 얘기.
- 자기들이 쓰는 **SAM and CLIO**가 에이전트를 작은 trajectory 보정 등으로 가이드한다고 함.
- 결론: **8bit 미만 양자화 모델은 쓰지 말라**는 추천.

**Total-Context64 → OP 답글에 대한 재답 (7분 전):**
- "My tools can be found here: https://github.com/SyntheticAutonomicMind :)"
- SAM/CLIO 링크 공유.

**답글 초안 (Total-Context64용):**
> This is super helpful context — we're mostly on API models so far, but the format/schema drift piece (Qwen vs Hermes vs OpenAI, etc.) is exactly the kind of thing we're trying to surface. When we snapshot trajectories and compare runs, a lot of the divergence shows up as "tool call shape changed" or "output didn't match what the next step expected," so even without going full local/quantized, that same class of failure is real. The 8bit floor is a good rule of thumb to keep in mind if we experiment with local. Thanks for the pointer to SAM/CLIO too — will look that up.

**한글 해석:** API 모델 위주라 로컬/양자화는 아직이지만, 포맷·스키마 드리프트(Qwen vs Hermes vs OpenAI 등)는 우리가 보려는 게 맞다. trajectory 스냅샷·런 비교할 때 divergence가 "도구 호출 형태가 바뀜"이나 "다음 스텝이 기대한 출력과 안 맞음"으로 많이 나와서, 로컬이 아니어도 같은 종류의 실패가 있다. 8bit 기준은 로컬 실험할 때 참고할게. SAM/CLIO도 찾아볼게, 감사해.

---

#### hurdurdur7 (35분 전)
- **사용자도 예측 불가능**이라서, 그래서 단계마다 테스트를 두고 실제로 켜기 전에 dry run을 한다는 일반론.

**답글 초안 (hurdurdur7용):**
> Yeah, totally — users + model + tool outputs all add variability. That's why we ended up focusing on "where does it diverge?" rather than "did it match the one right answer." Dry runs and step-by-step tests are the baseline; we're trying to add snapshot/replay so we can see *which* step started to drift when we run the same prompt a few times. Makes the "test every step" part a bit more actionable.

**한글 해석:** 맞아, 사용자·모델·도구 출력 다 변동이 있으니까. 그래서 "정답 하나에 맞췄나"보다 "어디서 갈라지나"에 초점을 둔 거고. dry run이랑 단계별 테스트는 기본이고, 같은 프롬프트로 여러 번 돌려서 **몇 번째 스텝부터** drift가 나는지 스냅샷/리플레이로 보려고 해. "매 스텝 테스트"를 좀 더 실행 가능하게 만드는 느낌.

---

## 참고: 스레드에서 언급된 도구·리소스

| 이름 | 용도 | 링크/메모 |
|------|------|-----------|
| LangSmith | 트래픽 리플레이, 회귀 테스트 | — |
| Braintrust | 트래픽 리플레이, 회귀 테스트 | — |
| LangWatch Scenario | 프로덕션 트레이스 리플레이, 에이전트 테스트 | https://github.com/langwatch/scenario |
| Rhesis | Agentic test case 생성, 도메인 전문가 리뷰 UI, MIT | https://github.com/rhesis-ai/rhesis |
| machinelearningatscale | 뉴스레터 (eval/인프라) | machinelearningatscale.substack.com |
| SAM and CLIO | 에이전트 trajectory 보정 등 (Total-Context64 툴) | https://github.com/SyntheticAutonomicMind |
| Moltwire | 런타임 도구 호출 시퀀스·행동 패턴 관찰, trajectory 이상 탐지 (thecanonicalmg 추천) | — |
| mlflow + langgraph + postgres | 체크포인트/스토어로 노드 간 상태 관찰, 개발 중 traceability (BeerBatteredHemroids 추천) | — |

---

*문서 작성: 레딧 스크린샷 및 사용자 제공 텍스트 기준.*
