# 2026.04 Week 1 (기함) — Average looks fine, but edge cases fail quietly

## 목표(포지셔닝 고정)
- 메인 메시지: `Nothing changed. That was the problem.`
- 핵심 증거: `Before vs After` 케이스 1개(또는 소수) + `FAIL 이유` 1~2개 항목
- 질문: 여러분은 배포 전에 롱테일/에지 회귀를 어떻게 잡나요?

## 가정(시나리오)
- 변경: 모델 업데이트(또는 모델이 암묵적으로 바뀐 상황) + 시스템 프롬프트를 더 간결하게/정확하게 다듬음
- 관측: 평균 지표/대부분 케이스는 괜찮아 보이지만, 특정 의도(intent)에서만 조용한 회귀가 발생
- 결과: 같은 요청이 baseline에서는 통과했는데, candidate에서는 `FAIL`로 잡힘

## Before / After에 쓸 케이스(1개만 고정)
- Before(기준 run): `성공(또는 통과)한 케이스 타입`
- After(후보 run): `동일 케이스 타입의 FAIL`
- FAIL 이유(게이트/결과 화면에서 실제로 잡힌 항목 1~2개를 그대로 채우기)
  - 예시 라벨(실제 UI 라벨에 맞춰 교체): `refusal / format / json / required / leakage / tool`

## 스크린샷 구성(Shot 우선)
- Reddit: `Shot 1(훅) + Shot 3(평가 결과)` 최소
- IH: `Shot 2b(재료가 쌓임) + Shot 6(FAIL 케이스 결과)` 중심(가능하면 Shot 3 1장 추가)
- 캡션 원칙: “설정법”이 아니라 “배포 전에 막은 결과” 중심

---

## Reddit (질문형) — 게시 초안

**Title (EN):**  
Model updates can look fine on average… then specific edge cases fail quietly — how do you catch this before deploy?

**Body (초안):**
I just shipped a model + system-prompt update for a small production support bot.

For the first day, everything looked “fine” on aggregate metrics. No outage, no obvious quality collapse.
But then we noticed a recurring pattern: only a couple of specific intents started failing, quietly—something that manual spot checks didn’t surface reliably.

The tricky part is that this can look like “nothing changed” until you look at the exact requests that actually matter.

In our case, here’s the simplest Before/After evidence:
- **Before (baseline):** the refund-related request followed our expected behavior (handled as intended).
- **After (candidate):** the *same request type* failed with **FAIL reason(s): [refusal / format / json / required / leakage / tool — fill 1~2 items]**.

How do you handle this in practice?
- Do you keep a test set that’s closer to real traffic (and updates it as you learn)?
- If you replay production-like cases before every deploy, how do you keep it lightweight enough to run routinely?
- When behavior varies run-to-run, how do you avoid mistaking flakiness for a real regression?

**What’s your minimal routine to catch long-tail regressions (the “nothing changed… that was the problem” cases) before they reach users?**

---

## Indie Hackers (상황/회고형) — 게시 초안

**Title (EN):**  
We changed a model + tightened the system prompt. Average metrics looked fine. Edge-case failures still slipped through.

**Post (초안):**
We made a routine LLM update for a small production support bot: model update + tighter system prompt.

At first glance, everything was reassuring. Average behavior stayed stable, latency didn’t spike, and most conversations looked normal.

Then we saw a small set of edge-case failures that didn’t show up in our “usual” checks. It wasn’t loud (no outage), and it wasn’t wide (most requests stayed fine). It was the classic long-tail regression: only specific intents went sideways.

**Before/After (one concrete case):**
- **Before:** the baseline configuration handled this request type as expected.
- **After:** the candidate configuration produced a **FAIL** in the same case with **[FAIL reason 1]** and **[FAIL reason 2]**.

Our core realization: output reviews aren’t enough when regressions appear as *behavior changes* in specific signals/steps. Even small prompt tightening can shift refusals, formatting constraints, required safety handling, or other policy-like behaviors—without moving the average much.

So we changed our workflow:
- Instead of treating validation like a one-off exercise, we re-run the same stored real requests as a baseline vs candidate comparison.
- We repeat where needed to separate “real deterministic regression” from “flaky variation”.
- If cases fail, we stop the release before shipping.

Trade-off: we don’t replay everything all the time. We keep a tight set of high-signal stored cases that reflect what we actually learned from production.

If you ship LLM changes regularly: **what do you use as the “before deploy” evidence when average looks fine but edge cases can still bite?**

